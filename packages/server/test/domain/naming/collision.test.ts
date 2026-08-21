import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

import { foldCase } from '../../../src/domain/naming/case-folding.js';
import { resolveNameCollision } from '../../../src/domain/naming/collision.js';
import { MAX_NAME_BYTES } from '../../../src/domain/naming/naming-policy.js';
import * as nodeService from '../../../src/app/node/node-service.js';
import { createNode, moveNode, renameNode } from '../../../src/app/node/node-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

const WORKSPACE = 'ws-0000';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let stores: NodeStores;
let actor: Actor;
let root: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const nameOf = (r: unknown) => (r as { ok: true; name: string }).name;

const childNames = (parentId: string) =>
  db
    .all<{ name: string }>('SELECT name FROM node WHERE parent_id = ? ORDER BY rowid', [parentId])
    .map((r) => r.name);

function seed(name: string): string {
  const created = createNode(stores, actor, {
    workspaceId: WORKSPACE,
    parentId: root,
    kind: 'file',
    name,
  });
  expect(created.ok, `준비용 노드 ${name} 생성이 거부됐다`).toBe(true);
  return idOf(created);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-collision-'));
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

describe('FR-WORKSPACE-005 — 대소문자만 다른 동명은 거부가 아니라 접미사다', () => {
  it('FR-WORKSPACE-005 AC-1 — 같은 디렉토리에 `Report.md` 가 있을 때 `report.md` 를 만드는 요청은 거부되지 않는다.', () => {
    seed('Report.md');

    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'report.md',
    });

    // 거부로 두면 「보이는 동명은 거부 / 안 보이는 동명은 접미사」라는
    // 흐름 차이가 생겨 R102 가 없앤 존재 오라클이 되살아난다.
    expect(created.ok).toBe(true);
    expect(childNames(root)).toHaveLength(2);
  });

  it('FR-WORKSPACE-005 AC-2 — 그 요청은 자동 접미사가 붙은 이름으로 생성된다.', () => {
    seed('Report.md');

    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'report.md',
    });

    const name = nameOf(created);
    expect(name).not.toBe('report.md');
    // 확장자는 살아 있어야 한다 — 접미사가 확장자 뒤에 붙으면 md 가
    // md 로 읽히지 않는다.
    expect(name.endsWith('.md')).toBe(true);
    // 접미사를 붙인 결과가 다시 어떤 형제와도 겹치지 않는다.
    const folded = childNames(root).map(foldCase);
    expect(new Set(folded).size).toBe(folded.length);

    // 형식은 한 곳에 고정한다 — 조용히 바뀌면 사용자가 보는 이름이 바뀐다.
    expect(resolveNameCollision('report.md', ['Report.md'])).toBe('report (2).md');
    expect(resolveNameCollision('report.md', ['Report.md', 'report (2).md'])).toBe('report (3).md');
    expect(resolveNameCollision('report.md', [])).toBe('report.md');
    // 확장자가 없는 이름도 같은 규칙을 받는다.
    expect(resolveNameCollision('기획', ['기획'])).toBe('기획 (2)');
  });

  it('FR-WORKSPACE-005 AC-5 — 확인 단계를 두지 않는다.', () => {
    seed('Report.md');

    // 한 번의 호출이 최종 결과를 돌려준다. 두 번째 왕복을 요구하는
    // 대기 상태가 없다.
    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: 'report.md',
    });
    expect(created.ok).toBe(true);
    expect(nodes.findById(idOf(created))?.name).toBe(nameOf(created));

    // 확인을 요구하는 진입점 자체를 두지 않는다 — 두면 그 유무가
    // 존재 오라클이 된다(R113).
    const confirmish = Object.keys(nodeService).filter((k) => /confirm|pending|approve/i.test(k));
    expect(confirmish).toEqual([]);
  });

  it('FR-WORKSPACE-005 AC-6 — 개명·이동·복사·업로드 등 새 이름을 만드는 모든 경로에서 동일하게 적용된다.', () => {
    // wave-1 에 실재하는 세 경로 — 생성·개명·이동. 복사와 업로드 라우트는
    // 각 소유 wave 가 이 판정을 경유해야 한다는 계약만 여기 남긴다.
    seed('Report.md');
    const other = seed('메모.md');

    const renamed = renameNode(stores, actor, other, 'REPORT.MD');
    expect(renamed.ok).toBe(true);
    expect(nodes.findById(other)?.name).not.toBe('REPORT.MD');
    expect(foldCase(nodes.findById(other)!.name)).not.toBe(foldCase('Report.md'));

    const shelf = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '보관',
    });
    const moving = nodes.create({
      workspaceId: WORKSPACE,
      parentId: shelf,
      kind: 'file',
      name: 'REPORT.md',
    });

    const moved = moveNode(stores, actor, moving, root);
    expect(moved.ok).toBe(true);
    // 옮겨 간 자리에서 겹치므로 이름이 바뀐 채로 자리를 옮긴다.
    expect(nodes.findById(moving)?.parentId).toBe(root);
    const foldedAfterMove = childNames(root).map(foldCase);
    expect(new Set(foldedAfterMove).size).toBe(foldedAfterMove.length);
  });

  it('FR-WORKSPACE-005 — 충돌 판정은 파일시스템이 아니라 케이스 폴딩이 한다.', () => {
    // NTFS 냐 ext4 냐에 따라 결과가 갈리면 파일시스템의 자기 거동이
    // 관측 가능해진다.
    expect(foldCase('Report.md')).toBe(foldCase('REPORT.MD'));
    expect(foldCase('straße')).toBe(foldCase('STRASSE'));

    // 유니코드 정규화도 여기서 함께 고정한다. macOS 가 만든 NFD 이름과
    // Windows 가 만든 NFC 이름은 바이트가 다르지만 같은 이름이다.
    const nfc = '회의록.md'.normalize('NFC');
    const nfd = '회의록.md'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    expect(foldCase(nfc)).toBe(foldCase(nfd));

    seed(nfc);
    const created = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: nfd,
    });
    expect(created.ok).toBe(true);
    expect(nameOf(created)).not.toBe(nfd);
  });

  it('FR-WORKSPACE-005 — 접미사를 붙인 이름도 이름 길이 상한 안에 있다.', () => {
    // 상한에 닿은 이름에 접미사를 그냥 붙이면 상한을 넘는 이름이 만들어져,
    // 사용자가 치지도 않은 이름이 규칙을 어긴 채 디스크에 남는다.
    const base = 'a'.repeat(MAX_NAME_BYTES - 3);
    const atLimit = `${base}.md`;
    expect(Buffer.byteLength(atLimit, 'utf8')).toBe(MAX_NAME_BYTES);

    const resolved = resolveNameCollision(atLimit, [atLimit]);
    expect(resolved).not.toBe(atLimit);
    expect(Buffer.byteLength(resolved, 'utf8')).toBeLessThanOrEqual(MAX_NAME_BYTES);
    expect(resolved.endsWith('.md')).toBe(true);

    // 확장자가 이름 대부분을 차지하면 접미사를 붙일 자리가 남지 않는다.
    // 확장자를 지키려다 상한을 넘기면 사용자가 치지도 않은 이름이 규칙을
    // 어긴 채 디스크에 남는다 — 그때는 확장자 쪽을 포기한다.
    const longExtension = `a.${'b'.repeat(MAX_NAME_BYTES - 2)}`;
    expect(Buffer.byteLength(longExtension, 'utf8')).toBe(MAX_NAME_BYTES);

    const squeezed = resolveNameCollision(longExtension, [longExtension]);
    expect(
      Buffer.byteLength(squeezed, 'utf8'),
      `접미사를 붙인 이름이 상한을 넘었다: ${squeezed}`,
    ).toBeLessThanOrEqual(MAX_NAME_BYTES);
    // 이름의 앞부분이 통째로 사라지면 어느 파일에서 온 것인지 알 수 없다.
    expect(squeezed.startsWith('a')).toBe(true);
  });
});
