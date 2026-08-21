import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

import { createNode, renameNode, validateUploadedName } from '../../../src/app/node/node-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

const WORKSPACE = 'ws-0000';

/** 예약 네임스페이스가 실제로 쓰는 이름들과 흔한 점 이름. */
const DOT_NAMES = ['.workspace.json', '.trash', '.env', '.git', '.gitignore', '.hidden.md', '.'];

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let stores: NodeStores;
let actor: Actor;
let root: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const rulesOf = (result: { ok: boolean }): string[] =>
  ('violations' in result ? (result.violations as { rule: string }[]) : []).map((v) => v.rule).sort();

const rowsUnder = (parentId: string) =>
  db
    .all<{ id: string; name: string }>('SELECT id, name FROM node WHERE parent_id = ? ORDER BY rowid', [
      parentId,
    ]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-dotname-'));
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

describe('SEC-STORAGE-005 — 점으로 시작하는 이름은 쓰기 쪽에서 거부된다', () => {
  it('SEC-STORAGE-005 AC-1 — 이름이 점으로 시작하는 문서·디렉토리 생성 요청은 거부된다.', () => {
    for (const name of DOT_NAMES) {
      for (const kind of ['file', 'directory'] as const) {
        const created = createNode(stores, actor, { workspaceId: WORKSPACE, parentId: root, kind, name });
        expect(created.ok, `${kind} ${name} 이 통과했다`).toBe(false);
        expect(rulesOf(created)).toContain('reserved-namespace');
      }
    }

    // 점이 선두가 아니면 정상이다. 여기까지 막으면 정상 이름이 대량으로
    // 거부된다.
    expect(createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '회의록.md',
    }).ok).toBe(true);
  });

  it('SEC-STORAGE-005 AC-2 — 이름이 점으로 시작하는 파일의 업로드는 거부된다.', () => {
    for (const name of DOT_NAMES) {
      const verdict = validateUploadedName(stores, root, name);
      expect(verdict.ok, `업로드 ${name} 이 통과했다`).toBe(false);
      expect(rulesOf(verdict)).toContain('reserved-namespace');
    }

    expect(validateUploadedName(stores, root, '스크린샷.png').ok).toBe(true);
  });

  it('SEC-STORAGE-005 AC-3 — 기존 항목을 점으로 시작하는 이름으로 개명하는 요청은 거부된다.', () => {
    const doc = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '회의록.md',
    });
    const id = idOf(doc);

    for (const name of DOT_NAMES) {
      const renamed = renameNode(stores, actor, id, name);
      expect(renamed.ok, `개명 ${name} 이 통과했다`).toBe(false);
      expect(nodes.findById(id)?.name).toBe('회의록.md');
    }
  });

  it('SEC-STORAGE-005 AC-4 — 거부된 요청은 파일시스템에 어떤 항목도 만들지 않고 기존 항목을 바꾸지도 않는다.', () => {
    const doc = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '회의록.md',
    });
    const before = rowsUnder(root);
    expect(before).toHaveLength(1);

    expect(createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '.env',
    }).ok).toBe(false);
    expect(renameNode(stores, actor, idOf(doc), '.env').ok).toBe(false);

    // 행이 늘지도, 기존 행의 이름이 바뀌지도 않는다. 접미사를 붙인
    // `.env (2)` 같은 것이 대신 만들어지지도 않는다 — 거부 판정이
    // 접미사 판정보다 앞선다.
    expect(rowsUnder(root)).toEqual(before);

    // 한계 — 여기서 재는 것은 메타데이터 저장소다. 디스크에 실제 파일을
    // 만드는 경로는 문서 저장소가 소유하며, 그 경로가 이 검증을 경유하는지는
    // 서빙 계층이 서는 자리에서 다시 판정한다.
  });

  it('SEC-STORAGE-005 AC-5 — 거부는 요청자의 권한 레벨과 무관하게 적용된다.', () => {
    // 예약 네임스페이스는 권한으로 여는 축이 아니다.
    //
    // 이 시험은 본래 `createNode` 의 인자 개수로 그것을 쟀다 — 요청자를
    // 받지 않으면 권한이 결과를 바꿀 수 없다는 논증이었고, 그때는 권한
    // 모델 자체가 없었다. 이제 조작마다 판정이 걸리므로(`SEC-ACL-012`)
    // 그 대리 지표는 성립하지 않는다. 대신 **레벨을 실제로 갈라** 잰다.
    const editorUser = stores.principals.createUser('편집자');
    const editor = actorFor(stores.principals, editorUser.id);
    stores.acl.grant({ nodeId: root, principalId: editorUser.id, level: 'edit', grantedBy: null });

    // 슈퍼유저는 ACL 을 우회하고(`SEC-ACL-008`) 편집자는 우회하지 않는다.
    // 그 둘이 같은 답을 받아야 「권한 레벨과 무관」이 성립한다.
    const asSuperuser = createNode(stores, actor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '.env',
    });
    const asEditor = createNode(stores, editor, {
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'file',
      name: '.env',
    });

    expect(asSuperuser.ok, '슈퍼유저에게 점 이름이 열렸다').toBe(false);
    expect(rulesOf(asSuperuser)).toEqual(rulesOf(asEditor));
    // 둘 다 이름 규칙으로 걸렸다 — 편집자 쪽이 권한 부족으로 걸린 것이
    // 아니어야 두 답이 같다는 사실이 의미를 갖는다.
    expect(rulesOf(asEditor)).not.toContain('forbidden');

    // 어느 쪽도 행을 남기지 않았다.
    expect(rowsUnder(root)).toEqual([]);

    // 같은 입력은 몇 번을 물어도 같은 답을 낸다.
    const first = validateUploadedName(stores, root, '.env');
    const again = validateUploadedName(stores, root, '.env');
    expect(first.ok).toBe(false);
    expect(rulesOf(first)).toEqual(rulesOf(again));
  });
});
