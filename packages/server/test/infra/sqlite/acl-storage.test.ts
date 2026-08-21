import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAclRepository } from '../../../src/infra/sqlite/acl-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';

let dir: string;
let db: Database;
let acl: SqliteAclRepository;
let nodes: SqliteNodeRepository;
let principals: SqlitePrincipalRepository;
let me: string;
let team: string;

const WS = 'ws-1';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-acl-'));
  db = openDatabase(join(dir, 'doculight.db'));
  acl = new SqliteAclRepository(db);
  nodes = new SqliteNodeRepository(db);
  principals = new SqlitePrincipalRepository(db);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
  me = principals.createUser('한범').id;
  team = principals.createGroup('기획팀원').id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mkNode = (kind: 'directory' | 'file', name: string, parentId: string | null) =>
  nodes.create({ workspaceId: WS, parentId, kind, name });

describe('SEC-ACL-001 — ACL 대상은 문서와 디렉토리 둘 다이다', () => {
  it('AC-1 · AC-2: 문서에도 디렉토리에도 부여할 수 있고 둘 다 판정에 반영된다', () => {
    const folder = mkNode('directory', '기획', null);
    const doc = mkNode('file', '회의록.md', folder);

    acl.grant({ nodeId: folder, principalId: me, level: 'view', grantedBy: null });
    acl.grant({ nodeId: doc, principalId: me, level: 'edit', grantedBy: null });

    expect(acl.entriesFor([folder, doc], [me]).map((e) => e.level).sort()).toEqual([
      'edit',
      'view',
    ]);
  });

  it('AC-3: 상위에 부여하지 않고 개별 문서에만 부여하는 경로가 있다', () => {
    const folder = mkNode('directory', '기획', null);
    const doc = mkNode('file', '회의록.md', folder);

    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });

    expect(acl.entriesOn(folder)).toEqual([]);
    expect(acl.entriesOn(doc)).toHaveLength(1);
  });
});

describe('DR-ACL-001 — 노드마다 지정할 수 있는 부여는 네 종류다', () => {
  it('AC-1: 한 노드에 네 종류를 모두 지정할 수 있다', () => {
    const doc = mkNode('file', '회의록.md', null);
    const other = principals.createUser('다른이').id;
    const otherGroup = principals.createGroup('인사팀원').id;

    acl.grant({ nodeId: doc, principalId: me, level: 'edit', grantedBy: null });
    acl.grant({ nodeId: doc, principalId: other, level: 'view', grantedBy: null });
    acl.grant({ nodeId: doc, principalId: team, level: 'edit', grantedBy: null });
    acl.grant({ nodeId: doc, principalId: otherGroup, level: 'view', grantedBy: null });

    const kinds = acl.entriesOn(doc).map((e) => `${principals.findById(e.principalId)?.kind}:${e.level}`);
    expect([...new Set(kinds)].sort()).toEqual([
      'group:edit',
      'group:view',
      'user:edit',
      'user:view',
    ]);
  });

  it('AC-2 · AC-3: 항목 하나는 주체 하나와 레벨 하나이며 둘이 같은 구조로 기록된다', () => {
    const doc = mkNode('file', '회의록.md', null);
    const userEntry = acl.grant({ nodeId: doc, principalId: me, level: 'edit', grantedBy: null });
    const groupEntry = acl.grant({ nodeId: doc, principalId: team, level: 'view', grantedBy: me });

    expect(Object.keys(userEntry).sort()).toEqual(Object.keys(groupEntry).sort());
    expect(typeof userEntry.principalId).toBe('string');
    expect(typeof userEntry.level).toBe('string');
  });

  it('같은 주체·같은 노드에 같은 레벨을 두 번 부여해도 항목이 늘지 않는다', () => {
    const doc = mkNode('file', '회의록.md', null);
    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });
    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });

    expect(acl.entriesOn(doc)).toHaveLength(1);
  });
});

describe('CON-ACL-001 — 유효 권한을 비정규화하지 않고 요청마다 계산한다', () => {
  it('AC-1: 사용자×노드 유효 권한 테이블이 저장소에 존재하지 않는다', () => {
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((t) => t.name.toLowerCase());

    for (const t of tables) {
      expect(t, `비정규화 테이블로 보이는 ${t} 가 있다`).not.toMatch(
        /effective|permission_cache|user_node|resolved_acl/,
      );
    }
  });

  it('AC-3: 무효화해야 하는 캐시가 없다 — 같은 질의가 매번 저장소를 본다', () => {
    const doc = mkNode('file', '회의록.md', null);
    expect(acl.entriesFor([doc], [me])).toEqual([]);

    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });
    // 사이에 무효화 호출이 없다.
    expect(acl.entriesFor([doc], [me])).toHaveLength(1);
  });

  it('AC-2: 그룹 멤버를 더하면 재계산 작업 없이 다음 조회부터 반영된다', () => {
    const doc = mkNode('file', '회의록.md', null);
    acl.grant({ nodeId: doc, principalId: team, level: 'edit', grantedBy: null });

    // 아직 그룹 멤버가 아니므로 이 주체 집합에는 걸리지 않는다.
    expect(acl.entriesFor([doc], [me])).toEqual([]);

    principals.addMember(team, me);
    const subjects = [me, ...principals.groupsOf(me)];

    expect(acl.entriesFor([doc], subjects)).toHaveLength(1);
  });
});

describe('CON-PRINCIPAL-005 — ACL 항목에 만료일을 두지 않는다', () => {
  it('AC-2: acl_entry 스키마에 만료 시각 칸이 없다', () => {
    const columns = db
      .all<{ name: string }>('PRAGMA table_info(acl_entry)')
      .map((c) => c.name.toLowerCase());

    for (const c of columns) {
      expect(c, `만료로 읽히는 칸 ${c} 가 있다`).not.toMatch(/expire|expiry|valid_until|until|ttl/);
    }
  });

  it('AC-3: 시간 경과만으로 항목이 사라지는 경로가 없다', () => {
    const doc = mkNode('file', '회의록.md', null);
    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });

    // 만료를 실행할 수 있는 표면이 저장소 경계에 하나도 없다.
    const surface: string[] = [];
    for (
      let proto = Object.getPrototypeOf(acl);
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      surface.push(...Object.getOwnPropertyNames(proto));
    }
    const sweepers = surface.filter((m) => /expire|prune|evict|sweep|gc|purgeExpired/i.test(m));
    expect(sweepers, `시간 기반 회수 경로가 열려 있다: ${sweepers.join(', ')}`).toEqual([]);

    expect(acl.entriesOn(doc)).toHaveLength(1);
  });
});

describe('SEC-ACL-003 — 상속 플래그의 기본값과 전환', () => {
  it('AC-1: 새로 만든 노드의 상속 플래그 기본값은 상속 유지다', () => {
    const doc = mkNode('file', '회의록.md', null);
    expect(nodes.findById(doc)?.inheritsAcl).toBe(true);
  });

  it('AC-5: 상속 끊기 전환이 부모의 항목을 그 노드로 복사하지 않는다', () => {
    const folder = mkNode('directory', '기획', null);
    const doc = mkNode('file', '회의록.md', folder);
    acl.grant({ nodeId: folder, principalId: me, level: 'edit', grantedBy: null });

    nodes.setInheritance(doc, false);

    expect(nodes.findById(doc)?.inheritsAcl).toBe(false);
    // 복사가 일어났다면 여기 1건이 생긴다.
    expect(acl.entriesOn(doc)).toEqual([]);
  });
});

describe('grantedNodeIds — pass-through 판정의 입력', () => {
  it('주체들이 부여받은 노드만 돌려준다', () => {
    const folder = mkNode('directory', '기획', null);
    const doc = mkNode('file', '회의록.md', folder);
    const other = mkNode('file', '인사.md', null);

    acl.grant({ nodeId: doc, principalId: me, level: 'view', grantedBy: null });
    acl.grant({ nodeId: other, principalId: principals.createUser('남').id, level: 'view', grantedBy: null });

    // 부여받은 것만, 그리고 **내 것만** 돌아온다. 조상(folder)도 남의
    // 부여(other)도 섞이지 않는다.
    expect(acl.grantedNodeIds([me])).toEqual([doc]);
    expect(acl.grantedNodeIds([me])).not.toContain(folder);
    expect(acl.grantedNodeIds([me])).not.toContain(other);
  });
});
