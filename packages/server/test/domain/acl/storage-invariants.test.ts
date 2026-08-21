import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { breakInheritance, grantPermission, inheritFromParent } from '../../../src/app/acl/grant-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: NodeStores;
let root: Actor;

const WS = 'ws-1';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-invariant-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mkNode = (name: string, parentId: string | null = null, kind: 'file' | 'directory' = 'file') =>
  stores.nodes.create({ workspaceId: WS, parentId, kind, name });

describe('CON-ACL-002 — 거부 항목을 저장할 수 없다', () => {
  it('AC-2: 스키마가 거부를 뜻하는 레벨을 받지 않는다', () => {
    const doc = mkNode('회의록.md');
    const me = stores.principals.createUser('한범');

    // 앱 계층을 우회해 직접 밀어 넣어도 저장소가 거부한다 — 「지금은 아무도
    // 안 쓴다」와 「담을 칸이 없다」는 다르다.
    for (const level of ['deny', 'none', 'block', 'revoke']) {
      expect(
        () =>
          db.run("INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES (?, ?, ?, ?)", [
            `e-${level}`,
            doc,
            me.id,
            level,
          ]),
        `acl_entry.level 이 ${level} 을 받는다`,
      ).toThrow();
    }

    // 허용 축 셋은 그대로 들어간다 — 거부가 전체로 번지지 않는다.
    for (const level of ['view', 'edit', 'admin']) {
      expect(() =>
        db.run("INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES (?, ?, ?, ?)", [
          `ok-${level}`,
          doc,
          me.id,
          level,
        ]),
      ).not.toThrow();
    }
  });
});

describe('CON-ACL-004 — pass-through 여부가 저장되지 않는다', () => {
  it('AC-1: 노드에도 ACL 저장소에도 그 값을 담는 칸이 없다', () => {
    const columnsOf = (table: string) =>
      db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name.toLowerCase());

    for (const table of ['node', 'acl_entry']) {
      for (const column of columnsOf(table)) {
        expect(column, `${table}.${column} 이 pass-through 를 담는 것으로 보인다`).not.toMatch(
          /pass_?through|passthru|traverse|transit/,
        );
      }
    }
  });

  it('AC-3: 권한 레벨 열거에 통과 가 신설되지 않았다', () => {
    const schema = db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'acl_entry'",
    );

    // CHECK 제약이 레벨 열거의 정본이다. 「통과」가 신설됐다면 여기 나타난다.
    expect(schema?.sql).toContain("level IN ('view', 'edit', 'admin')");
  });
});

describe('SEC-ACL-009 — 부여자가 항목에 기록되고 남는다', () => {
  it('AC-6: 부여한 뒤 되읽으면 부여자가 그대로 있다', () => {
    const doc = mkNode('회의록.md');
    const you = stores.principals.createUser('받는이');

    const granted = grantPermission(stores, root, {
      nodeId: doc,
      principalId: you.id,
      level: 'view',
    });
    expect(granted.ok).toBe(true);

    // 손으로 만든 픽스처가 아니라 **저장소가 돌려준** 값을 본다.
    const stored = stores.acl.entriesOn(doc);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.grantedBy).toBe(root.id);
  });

  it('AC-6: 다른 주체가 부여하면 그 주체가 기록된다 — 상수를 상수와 비교하지 않는다', () => {
    const doc = mkNode('회의록.md');
    const editorUser = stores.principals.createUser('편집자');
    stores.acl.grant({ nodeId: doc, principalId: editorUser.id, level: 'edit', grantedBy: null });
    const editor = actorFor(stores.principals, editorUser.id);
    const third = stores.principals.createUser('세번째');

    grantPermission(stores, editor, { nodeId: doc, principalId: third.id, level: 'view' });

    const forThird = stores.acl.entriesOn(doc).find((e) => e.principalId === third.id);
    expect(forThird?.grantedBy).toBe(editorUser.id);
    expect(forThird?.grantedBy).not.toBe(root.id);
  });
});

describe('SEC-ACL-010 — 관리자가 준 편집과 편집자가 준 편집을 가르는 레벨이 없다', () => {
  it('AC-2: 부여 출처가 달라도 유효 권한이 같다', () => {
    const byAdmin = mkNode('관리자가준.md');
    const byEditor = mkNode('편집자가준.md');

    const editorUser = stores.principals.createUser('편집자');
    stores.acl.grant({ nodeId: byEditor, principalId: editorUser.id, level: 'edit', grantedBy: null });
    const editor = actorFor(stores.principals, editorUser.id);

    const me = stores.principals.createUser('한범');
    grantPermission(stores, root, { nodeId: byAdmin, principalId: me.id, level: 'edit' });
    grantPermission(stores, editor, { nodeId: byEditor, principalId: me.id, level: 'edit' });

    const meActor = actorFor(stores.principals, me.id);
    // 출처가 다른 두 부여의 결과가 같다. 「관리자가 준 편집」을 나타내는
    // 넷째 레벨이 있었다면 여기서 갈린다.
    expect(permissionOf(stores, meActor, byAdmin)).toBe('edit');
    expect(permissionOf(stores, meActor, byEditor)).toBe('edit');
  });

  it('AC-2: 저장된 레벨 값의 집합이 셋을 넘지 않는다', () => {
    const doc = mkNode('회의록.md');
    const a = stores.principals.createUser('갑');
    const editorUser = stores.principals.createUser('편집자');
    stores.acl.grant({ nodeId: doc, principalId: editorUser.id, level: 'edit', grantedBy: null });

    grantPermission(stores, root, { nodeId: doc, principalId: a.id, level: 'edit' });
    grantPermission(stores, actorFor(stores.principals, editorUser.id), {
      nodeId: doc,
      principalId: stores.principals.createUser('을').id,
      level: 'edit',
    });

    const levels = new Set(db.all<{ level: string }>('SELECT DISTINCT level FROM acl_entry').map((r) => r.level));
    for (const level of levels) {
      expect(['view', 'edit', 'admin'], `모르는 레벨 ${level} 이 저장됐다`).toContain(level);
    }
  });
});

describe('DR-ACL-001 — 노드 ACL 에는 관리 레벨 항목을 두지 않는다', () => {
  it('AC-4: 저장소가 노드에 관리 레벨을 받지 않는다', () => {
    const doc = mkNode('회의록.md');
    const me = stores.principals.createUser('한범');

    // 앱 계층의 `canGrant` 는 이미 막는다. 그러나 판정 쪽에 강등 로직이
    // **두 곳** 필요했다는 사실이 저장 불변식이 없다는 증거다 — 방어가
    // 둘이면 하나가 빠졌을 때 아무도 눈치채지 못한다.
    expect(
      () => stores.acl.grant({ nodeId: doc, principalId: me.id, level: 'admin', grantedBy: null }),
      '문서 노드에 관리 항목이 저장된다',
    ).toThrow();

    expect(stores.acl.entriesOn(doc)).toEqual([]);
  });

  it('AC-4: 워크스페이스에는 그대로 저장된다 — 금지가 전체로 번지지 않는다', () => {
    const me = stores.principals.createUser('한범');

    expect(() =>
      stores.acl.grant({ nodeId: WS, principalId: me.id, level: 'admin', grantedBy: null }),
    ).not.toThrow();
    expect(stores.acl.entriesOn(WS)).toHaveLength(1);
  });
});

describe('SEC-ACL-010 — 부모 권한 가져오기도 감사에 남는다', () => {
  it('AC-3: 조상에서 옮겨 온 항목마다 감사 행이 남는다', () => {
    const folder = mkNode('기획', null, 'directory');
    const doc = stores.nodes.create({ workspaceId: WS, parentId: folder, kind: 'file', name: '회의록.md' });
    const a = stores.principals.createUser('갑');
    const b = stores.principals.createUser('을');
    grantPermission(stores, root, { nodeId: folder, principalId: a.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: folder, principalId: b.id, level: 'view' });

    breakInheritance(stores, root, doc);
    inheritFromParent(stores, root, doc);

    const moved = stores.acl.entriesOn(doc);
    expect(moved.length).toBeGreaterThan(0);

    // 「전파를 막지 않는 대신 추적한다」는 거래의 한쪽만 남으면 안 된다.
    const audited = db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_log WHERE node_id = ? AND operation = 'acl.grant'",
      [doc],
    );
    expect(audited[0]?.n, '조상에서 옮겨 온 부여가 감사에 없다').toBe(moved.length);
  });
});
