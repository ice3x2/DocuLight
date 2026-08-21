import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

import {
  FORBIDDEN_CHARACTERS,
  MAX_NAME_BYTES,
  MAX_RELATIVE_PATH_BYTES,
  RESERVED_DEVICE_NAMES,
} from '../../../src/domain/naming/naming-policy.js';
import { validateNodeName } from '../../../src/domain/naming/name-validator.js';
import { createNode, renameNode, validateUploadedName } from '../../../src/app/node/node-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

const WORKSPACE = 'ws-0000';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let stores: NodeStores;
let actor: Actor;

/** 워크스페이스 루트에 디렉토리 하나를 두고 그 아래에서 시험한다. */
let root: string;

const rulesOf = (result: { ok: boolean; violations?: { rule: string }[] }) =>
  (result.violations ?? []).map((v) => v.rule).sort();

const childNames = (parentId: string) =>
  db.all<{ name: string }>('SELECT name FROM node WHERE parent_id = ?', [parentId]).map((r) => r.name);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-naming-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  nodes = stores.nodes as SqliteNodeRepository;
  actor = superuserActor(stores);
  // 노드는 실재하는 워크스페이스에만 만들 수 있다(`FR-WORKSPACE-001` AC-1).
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WORKSPACE, '기획팀']);
  root = nodes.create({ workspaceId: WORKSPACE, parentId: null, kind: 'directory', name: '기획' });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-WORKSPACE-004 — 이름 검증은 도메인 단일 지점에서 걸린다', () => {
  it('FR-WORKSPACE-004 AC-1 — 이름이 Windows 예약어(`CON`·`PRN`·`AUX`·`NUL` 등)와 일치하면 노드 생성 요청이 거부된다.', () => {
    // 목록은 정책 모듈이 소유한다. 여기에 다시 적으면 값이 갈린다.
    expect(RESERVED_DEVICE_NAMES.length).toBeGreaterThan(0);

    for (const reserved of RESERVED_DEVICE_NAMES) {
      const created = createNode(stores, actor, {
        workspaceId: WORKSPACE,
        parentId: root,
        kind: 'file',
        name: `${reserved}.md`,
      });
      expect(created.ok, `예약어 ${reserved} 가 통과했다`).toBe(false);
    }

    // 확장자를 떼고 대소문자를 무시해 판정한다 — `CON.md` 도 `con.txt` 도
    // 장치로 해석되므로 확장자를 붙였다고 통과시키면 검증이 무의미해진다.
    for (const name of ['CON', 'con.txt', 'Con.MD', 'nul', 'LPT³.md', 'com¹']) {
      expect(validateNodeName(name, '기획').ok, `${name} 이 통과했다`).toBe(false);
    }

    // Win32 는 경로 요소의 말단 공백과 마침표를 잘라낸다 — `CON .md` 도
    // 콘솔 장치가 된다. 떼고 보지 않으면 공백 하나로 이 검사가 우회된다.
    for (const name of ['CON .md', 'con  .txt', 'AUX .png', 'CON. .md', 'nul .']) {
      expect(validateNodeName(name, '기획').ok, `${name} 이 통과했다`).toBe(false);
    }

    // 예약어를 포함하기만 한 이름은 장치가 아니다. 여기까지 막으면
    // 정상 이름이 대량으로 거부된다.
    for (const name of ['CONSOLE.md', 'CON1.md', '회의록-CON.md', 'NULL.md']) {
      expect(validateNodeName(name, '기획').ok, `${name} 이 거부됐다`).toBe(true);
    }
  });

  it('FR-WORKSPACE-004 AC-2 — 같은 검사가 개명 요청에도 적용된다.', () => {
    const doc = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '회의록.md',
    });
    expect(doc.ok).toBe(true);
    const id = (doc as { ok: true; id: string }).id;

    const renamed = renameNode(stores, actor, id, 'AUX.md');
    expect(renamed.ok).toBe(false);

    // 거부된 개명은 아무것도 바꾸지 않는다.
    expect(nodes.findById(id)?.name).toBe('회의록.md');

    expect(renameNode(stores, actor, id, '주간회의.md').ok).toBe(true);
    expect(nodes.findById(id)?.name).toBe('주간회의.md');
  });

  it('FR-WORKSPACE-004 AC-3 — 같은 검사가 업로드된 파일 이름에도 적용된다.', () => {
    // 업로드 HTTP 라우트는 ATTACH scope 의 뒤 wave 가 소유한다. 여기서
    // 고정하는 것은 그 라우트가 **이 검증기를 경유해야 한다**는 계약이다.
    expect(validateUploadedName(stores, root, 'PRN.png').ok).toBe(false);
    expect(validateUploadedName(stores, root, '스크린샷.png').ok).toBe(true);

    // 세 진입점이 같은 이름에 같은 판정을 낸다 — 검증기가 하나라는 말의
    // 관측 가능한 뜻이다. 한 곳만 고쳐지면 여기서 갈린다.
    const offender = 'NUL.md';
    const create = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: offender,
    });
    const seed = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'seed.md',
    });
    const rename = renameNode(stores, actor, (seed as { ok: true; id: string }).id, offender);
    const upload = validateUploadedName(stores, root, offender);

    expect([create.ok, rename.ok, upload.ok]).toEqual([false, false, false]);
    expect(rulesOf(create)).toEqual(rulesOf(rename));
    expect(rulesOf(rename)).toEqual(rulesOf(upload));
  });

  it('FR-WORKSPACE-004 AC-4 — 금지 문자를 포함한 이름은 거부된다.', () => {
    for (const ch of FORBIDDEN_CHARACTERS) {
      const result = validateNodeName(`회의${ch}록.md`, '기획');
      expect(result.ok, `금지 문자 ${JSON.stringify(ch)} 가 통과했다`).toBe(false);
    }

    // 제어문자 — 이름에 넣으면 로그와 UI 가 서로 다르게 읽는다.
    for (const code of [0x00, 0x07, 0x0a, 0x0d, 0x1f]) {
      const name = `회의${String.fromCharCode(code)}록.md`;
      expect(validateNodeName(name, '기획').ok, `U+${code.toString(16)} 가 통과했다`).toBe(false);
    }

    // 말단의 공백과 마침표 — Windows 가 조용히 잘라내 저장한 이름과
    // 읽는 이름이 갈린다.
    expect(validateNodeName('회의록.md ', '기획').ok).toBe(false);
    expect(validateNodeName('회의록.', '기획').ok).toBe(false);
    expect(validateNodeName('..', '기획').ok).toBe(false);

    // 선두의 마침표는 **말단 마침표 규칙의 대상이 아니다** — 이 규칙은
    // 이름 끝만 본다. 다만 점으로 시작하는 이름은 예약 네임스페이스
    // 침범이라 별도 규칙이 따로 거부한다(`SEC-STORAGE-005`).
    expect(rulesOf(validateNodeName('.gitignore', '기획'))).not.toContain('trailing-space-or-dot');

    // 빈 이름도 이름이 아니다.
    expect(validateNodeName('', '기획').ok).toBe(false);
  });

  it('FR-WORKSPACE-004 AC-5 — 최대 이름 길이를 초과한 이름은 거부된다.', () => {
    const atLimit = 'a'.repeat(MAX_NAME_BYTES);
    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(MAX_NAME_BYTES);
    expect(validateNodeName(atLimit, '').ok).toBe(true);

    expect(validateNodeName('a'.repeat(MAX_NAME_BYTES + 1), '').ok).toBe(false);

    // 상한은 문자 수가 아니라 **바이트**다. 한글은 UTF-8 로 3바이트라
    // 문자 수로 재면 여기서 갈린다.
    const korean = '가'.repeat(Math.floor(MAX_NAME_BYTES / 3) + 1);
    expect(korean.length).toBeLessThan(MAX_NAME_BYTES);
    expect(Buffer.byteLength(korean, 'utf8')).toBeGreaterThan(MAX_NAME_BYTES);
    expect(validateNodeName(korean, '').ok).toBe(false);
  });

  it('FR-WORKSPACE-004 AC-6 — 결과 경로의 총길이가 상한을 초과하면 거부된다.', () => {
    // 상한은 이름 상한의 두 배를 넘는다 — 못 넘으면 AC-5 가 허용하는
    // 이름을 AC-6 이 거부하는 자기모순이 생긴다.
    expect(MAX_RELATIVE_PATH_BYTES).toBeGreaterThanOrEqual(MAX_NAME_BYTES * 2 + 1);

    const segment = 'a'.repeat(MAX_NAME_BYTES);
    const parentPath = `${segment}/${segment}`; // 511 바이트
    expect(Buffer.byteLength(parentPath, 'utf8')).toBeLessThanOrEqual(MAX_RELATIVE_PATH_BYTES);

    // 경계를 양쪽에서 잰다 — 초과만 재면 상한 자체가 하나 어긋나 있어도
    // 통과한다.
    const atLimit = 'c'.repeat(MAX_RELATIVE_PATH_BYTES);
    expect(validateNodeName(atLimit.slice(0, MAX_NAME_BYTES), atLimit.slice(MAX_NAME_BYTES + 1)).ok)
      .toBe(true);
    expect(rulesOf(validateNodeName('x', 'y'.repeat(MAX_RELATIVE_PATH_BYTES - 1)))).toContain(
      'path-too-long',
    );
    expect(rulesOf(validateNodeName('x', 'y'.repeat(MAX_RELATIVE_PATH_BYTES - 2)))).not.toContain(
      'path-too-long',
    );

    // 이름 자체는 상한 안이지만 결과 경로가 상한을 넘는다.
    const result = validateNodeName('b.md', parentPath);
    expect(result.ok).toBe(false);
    expect(rulesOf(result)).toContain('path-too-long');

    // 실제 계층 위에서도 같은 판정이 나온다.
    const deep = nodes.create({
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'directory',
      name: segment,
    });
    const deeper = nodes.create({
      workspaceId: WORKSPACE,
      parentId: deep,
      kind: 'directory',
      name: segment,
    });
    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: deeper,
      kind: 'file',
      name: 'c.md',
    });
    expect(created.ok).toBe(false);
  });

  it('FR-WORKSPACE-004 AC-7 — 거부 응답은 위반한 규칙을 사용자에게 알려 다시 입력할 수 있게 한다.', () => {
    const tooLong = validateNodeName('a'.repeat(MAX_NAME_BYTES + 1), '');
    expect(tooLong.ok).toBe(false);
    const [violation] = (tooLong as { violations: { rule: string; message: string; limitBytes?: number; actualBytes?: number }[] }).violations;

    expect(violation?.rule).toBe('name-too-long');
    // 어느 규칙을 어긴 것인지가 식별자로 온다 — 문구를 파싱해야 알 수
    // 있으면 클라이언트가 문구에 묶인다.
    expect(violation?.message).toBeTruthy();
    // 한계가 **바이트**임이 드러나야 한다. 문자 수로 읽으면 한글 이름을
    // 쓰는 사용자가 왜 거부됐는지 알 수 없다.
    expect(violation?.limitBytes).toBe(MAX_NAME_BYTES);
    expect(violation?.actualBytes).toBe(MAX_NAME_BYTES + 1);
    expect(violation?.message).toMatch(/바이트|byte/i);

    // 한 이름이 여러 규칙을 어기면 전부 알린다 — 하나씩 고쳐 다시 내는
    // 왕복을 규칙 수만큼 반복하게 두지 않는다.
    const many = validateNodeName(`CON${'a'.repeat(MAX_NAME_BYTES)}?.md `, '');
    expect(many.ok).toBe(false);
    expect(rulesOf(many).length).toBeGreaterThan(1);
  });

  it('FR-WORKSPACE-004 AC-8 — 검증 실패는 자동 접미사로 우회되지 않는다 — 이름 충돌 처리와는 별개 경로다.', () => {
    const before = childNames(root);

    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'CON.md',
    });
    expect(created.ok).toBe(false);

    // 접미사를 붙인 `CON (2).md` 같은 것이 대신 만들어지지 않는다.
    // 붙이면 사용자가 요청하지 않은 이름이 디스크에 남는다.
    expect(childNames(root)).toEqual(before);

    const renamedSeed = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'ok.md',
    });
    const id = (renamedSeed as { ok: true; id: string }).id;
    expect(renameNode(stores, actor, id, 'AUX').ok).toBe(false);
    expect(nodes.findById(id)?.name).toBe('ok.md');
  });
});
