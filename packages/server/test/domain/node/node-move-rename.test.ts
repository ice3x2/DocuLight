import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { moveNode } from '../../../src/app/node/node-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

const WORKSPACE = 'ws-0000';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;
let stores: { nodes: SqliteNodeRepository; workspaces: SqliteWorkspaceRepository };
let audit: SqliteAuditLog;

/**
 * 노드를 가리키는 레코드에 ACL 한 줄을 심는다. `acl_entry.node_id` 가
 * wave-1 스키마에서 노드를 가리키는 두 자리 중 하나다(다른 하나는
 * `audit_log.node_id`).
 */
function grant(nodeId: string, principalId: string): void {
  db.run("INSERT OR IGNORE INTO principal (id, kind, name, status) VALUES (?, 'user', ?, 'active')", [
    principalId,
    principalId,
  ]);
  db.run("INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES (?, ?, ?, 'edit')", [
    `acl-${nodeId}-${principalId}`,
    nodeId,
    principalId,
  ]);
}

const aclNodeIds = (nodeId: string) =>
  db.all<{ node_id: string }>('SELECT node_id FROM acl_entry WHERE node_id = ?', [nodeId]);

const auditNodeIds = (nodeId: string) =>
  db.all<{ id: string }>('SELECT id FROM audit_log WHERE node_id = ?', [nodeId]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-move-'));
  db = openDatabase(join(dir, 'doculight.db'));
  nodes = new SqliteNodeRepository(db);
  stores = { nodes, workspaces: new SqliteWorkspaceRepository(db) };
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WORKSPACE, '기획팀']);
  audit = new SqliteAuditLog(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-STORAGE-003 — 이동·개명은 ID 를 유지하고 삭제는 ID 를 소멸시킨다', () => {
  it('DR-STORAGE-003 AC-2 — ACL·버전 인덱스·휴지통 인덱스·첨부 소유 레코드의 키는 경로가 아니라 노드 ID 다.', () => {
    // 한계 — wave-1 스키마에 실재하는 노드 참조 레코드는 `acl_entry` 와
    // `audit_log` 둘뿐이다. 버전 인덱스·휴지통 인덱스·첨부 소유 테이블은
    // 아직 없으므로 여기서 판정하지 않고, 각 테이블을 세우는 wave 가
    // 자기 자리에서 같은 축을 다시 판정한다.
    const referencing = ['acl_entry', 'audit_log'];

    for (const table of referencing) {
      const columns = db
        .all<{ name: string }>(`PRAGMA table_info(${table})`)
        .map((r) => r.name);

      // 노드를 가리키는 칸은 `node_id` 다.
      expect(columns, `${table} 가 노드를 ID 로 가리키지 않는다`).toContain('node_id');

      // 경로로 가리키는 칸이 함께 있으면 정본이 둘이 되고, 이동·개명 때
      // 한쪽만 갱신되어 조용히 어긋난다.
      const byPath = columns.filter((c) => /path|node_name|full_name/.test(c));
      expect(byPath, `${table} 가 노드를 경로로도 가리킨다: ${byPath.join(', ')}`).toEqual([]);
    }
  });

  it('DR-STORAGE-003 AC-3 — UI/API 로 노드를 이동·개명해도 노드 ID 가 바뀌지 않고 ACL·버전 이력·휴지통 인덱스·첨부 소유가 그대로 승계된다.', () => {
    const from = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '기획',
    });
    const to = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '보관',
    });
    const doc = nodes.create({
      workspaceId: WORKSPACE,
      parentId: from,
      kind: 'file',
      name: '회의록.md',
    });

    grant(doc, 'u1');
    audit.append({ operation: 'create', actor: 'u1', nodeId: doc });
    expect(nodes.pathOf(doc)).toBe('기획/회의록.md');

    nodes.relocate(doc, { parentId: from, name: '주간회의.md' });
    expect(nodes.findById(doc)?.name).toBe('주간회의.md');
    expect(nodes.pathOf(doc)).toBe('기획/주간회의.md');

    nodes.relocate(doc, { parentId: to, name: '주간회의.md' });
    expect(nodes.pathOf(doc)).toBe('보관/주간회의.md');

    // ID 가 그대로이므로 승계는 따로 옮기는 일이 아니라 아무것도 하지
    // 않는 것이다 — 참조가 ID 를 키로 삼기 때문이다(AC-2).
    expect(nodes.findById(doc)?.id).toBe(doc);
    expect(aclNodeIds(doc)).toHaveLength(1);
    expect(auditNodeIds(doc)).toHaveLength(1);
  });

  it('DR-STORAGE-003 AC-4 — 이동·개명은 하나의 트랜잭션으로 처리되어 경로만 바뀌고 ID 매핑이 갱신되지 않은 중간 상태가 남지 않는다.', () => {
    const root = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '기획',
    });
    const sub = nodes.create({
      workspaceId: WORKSPACE,
      parentId: root,
      kind: 'directory',
      name: '2026',
    });
    const leaf = nodes.create({
      workspaceId: WORKSPACE,
      parentId: sub,
      kind: 'file',
      name: '회의록.md',
    });
    const shelf = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '보관',
    });

    expect(nodes.pathOf(leaf)).toBe('기획/2026/회의록.md');

    // 디렉토리를 통째로 옮긴다. 하위 노드의 행은 하나도 건드리지 않지만
    // 파생 경로는 전부 함께 바뀐다.
    nodes.relocate(sub, { parentId: shelf, name: '2026' });
    expect(nodes.pathOf(leaf)).toBe('보관/2026/회의록.md');
    expect(nodes.findById(leaf)?.id).toBe(leaf);
    expect(nodes.findById(leaf)?.parentId).toBe(sub);

    // 실패한 이동은 아무것도 남기지 않는다 — 이름만 바뀌고 부모는
    // 그대로인 절반 적용 상태가 없어야 한다.
    const before = nodes.findById(leaf);
    expect(() => nodes.relocate(leaf, { parentId: 'no-such-parent', name: '옮긴이름.md' })).toThrow();
    expect(nodes.findById(leaf)).toEqual(before);
    expect(nodes.pathOf(leaf)).toBe('보관/2026/회의록.md');
  });

  it('DR-STORAGE-003 AC-5 — 노드를 삭제한 뒤 같은 경로에 같은 이름으로 새 노드를 만들면 새 노드 ID 가 부여되고 이전 노드의 ACL·버전 이력이 승계되지 않는다.', () => {
    const parent = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '기획',
    });
    const first = nodes.create({
      workspaceId: WORKSPACE,
      parentId: parent,
      kind: 'file',
      name: '회의록.md',
    });

    grant(first, 'u1');
    audit.append({ operation: 'create', actor: 'u1', nodeId: first });

    nodes.remove(first);
    expect(nodes.findById(first)).toBeUndefined();

    const second = nodes.create({
      workspaceId: WORKSPACE,
      parentId: parent,
      kind: 'file',
      name: '회의록.md',
    });

    // 경로는 같고 ID 는 다르다. 경로를 정본으로 두었다면 이 둘이 같은
    // 노드로 읽혔을 것이고, 아래 두 단언이 무너졌을 것이다.
    expect(nodes.pathOf(second)).toBe('기획/회의록.md');
    expect(second).not.toBe(first);
    expect(aclNodeIds(second)).toEqual([]);
    expect(auditNodeIds(second)).toEqual([]);
  });

  it('DR-STORAGE-003 AC-5 — 디렉토리를 지우면 그 아래 노드도 함께 사라진다.', () => {
    const parent = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '기획',
    });
    const child = nodes.create({
      workspaceId: WORKSPACE,
      parentId: parent,
      kind: 'file',
      name: '회의록.md',
    });

    nodes.remove(parent);

    // 남으면 어느 워크스페이스에도 닿지 않는 노드가 되고, 그 ID 를 아는
    // 사람에게는 계속 도달 가능한 상태로 남는다.
    expect(nodes.findById(child)).toBeUndefined();
  });

  it('DR-STORAGE-003 AC-4 — 자리와 이름을 한 문장으로 옮긴다 — 절반만 적용된 상태가 없다.', () => {
    // 자리 갱신과 이름 갱신이 별개 문장이면 그 사이에서 프로세스가 죽었을 때
    // 노드가 **새 부모 아래에 옛 이름으로** 남는다 — 충돌 접미사가 막으려던
    // 바로 그 상태다. 문장을 하나로 두면 그 틈이 성립하지 않는다.
    const record = nodes as unknown as Record<string, unknown>;
    expect(typeof record.relocate).toBe('function');
    expect(record.move, '자리만 옮기는 별도 경로가 남아 있다').toBeUndefined();
    expect(record.rename, '이름만 바꾸는 별도 경로가 남아 있다').toBeUndefined();
  });

  it('DR-STORAGE-003 AC-4 — 노드를 자기 자손 아래로 옮길 수 없다.', () => {
    const a = nodes.create({ workspaceId: WORKSPACE, parentId: null, kind: 'directory', name: 'A' });
    const b = nodes.create({ workspaceId: WORKSPACE, parentId: a, kind: 'directory', name: 'B' });
    const c = nodes.create({ workspaceId: WORKSPACE, parentId: b, kind: 'directory', name: 'C' });

    // 허용하면 A 와 B 가 서로의 부모가 되어 루트에서 도달할 수 없는 고리가
    // 남고, 경로를 파생하는 모든 호출이 그 고리를 영원히 돈다.
    for (const target of [b, c, a]) {
      const moved = moveNode(stores, a, target);
      expect(moved.ok, `A 를 ${target} 아래로 옮기는 것이 통과했다`).toBe(false);
    }

    expect(nodes.findById(a)?.parentId).toBeNull();
    expect(nodes.pathOf(c)).toBe('A/B/C');
  });

  it('FR-WORKSPACE-004 AC-6 — 서브트리를 옮길 때 자손의 결과 경로도 상한 안이어야 한다.', () => {
    const segment = 'a'.repeat(200);

    // 얕은 자리에 깊은 서브트리를 만든다.
    const top = nodes.create({ workspaceId: WORKSPACE, parentId: null, kind: 'directory', name: 'D' });
    const mid = nodes.create({ workspaceId: WORKSPACE, parentId: top, kind: 'directory', name: segment });
    nodes.create({ workspaceId: WORKSPACE, parentId: mid, kind: 'file', name: segment });

    // 깊은 자리를 만든다.
    const deep1 = nodes.create({ workspaceId: WORKSPACE, parentId: null, kind: 'directory', name: segment });
    const deep2 = nodes.create({ workspaceId: WORKSPACE, parentId: deep1, kind: 'directory', name: segment });

    // `D` 자신의 경로는 상한 안이지만 자손은 넘는다. 자기 이름만 재면
    // 사용자가 만들지도 않은 규칙 위반이 디스크에 남는다.
    const moved = moveNode(stores, top, deep2);
    expect(moved.ok).toBe(false);

    expect(nodes.findById(top)?.parentId).toBeNull();
  });
});
