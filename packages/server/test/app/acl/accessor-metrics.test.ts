import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accessorsOf } from '../../../src/app/acl/accessor-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { setAccountStatus } from '../../../src/app/principal/principal-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import type { PrincipalId } from '../../../src/domain/principal/principal.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 접근자 지표는 **둘**이다 (`IR-ACL-001`) — 그리고 명단은 지표와 다른
 * 문턱을 갖는다 (`SEC-ACL-015`).
 *
 * 지표가 하나면 고립 노드를 찾을 수 없다. 슈퍼유저와 워크스페이스 관리자가
 * 어느 노드에나 닿으므로 합계는 **0 이 되지 않고**, 그래서 「권한으로 닿는
 * 사람이 아무도 없는 노드」를 찾는 화면은 그 둘을 뺀 수치를 봐야 한다.
 */

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-accessor-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mk = (name: string, parentId: string | null = null, kind: 'file' | 'directory' = 'file') =>
  stores.nodes.create({ workspaceId: WS, parentId, kind, name });

let seq = 0;

/** 상방 게이트 하나 — 슈퍼유저. */
const superuser = (): Actor => {
  const user = stores.principals.createUser(`설치자-${(seq += 1)}`);
  stores.principals.addMember(SUPERUSER_GROUP_ID, user.id);
  return actorFor(stores.principals, user.id);
};

const user = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

const report = (actor: Actor, nodeId: string) => accessorsOf(stores, actor, nodeId);

const rosterOf = (actor: Actor, nodeId: string): PrincipalId[] =>
  [...(report(actor, nodeId)?.roster ?? [])].sort();

describe('IR-ACL-001 — 접근 가능 과 ACL 접근자 는 서로 다른 수치다', () => {
  it('AC-1 · AC-2: 상방 게이트로만 닿는 사람은 접근 가능에만 들고 ACL 접근자에서는 빠진다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    const seen = report(root, doc);

    // 슈퍼유저는 부여 없이 닿으므로 합계에는 들지만 ACL 경유가 아니다.
    expect(seen?.metrics.reachable).toBe(2);
    expect(seen?.metrics.viaAcl).toBe(1);
  });

  it('AC-2: 워크스페이스 관리 항목으로만 닿는 사람도 ACL 접근자에서 빠진다', () => {
    // 이것이 두 번째 상방 게이트다 — 워크스페이스의 `관리` 항목은 아래에서
    // 상속을 끊어도 닿으므로 상속 경유로 셀 수 없다.
    const root = superuser();
    const doc = mk('회의록.md');
    const 팀장 = user('팀장');
    grantPermission(stores, root, { nodeId: WS, principalId: 팀장.id, level: 'admin' });

    const seen = report(root, doc);

    expect(seen?.metrics.reachable).toBe(2);
    expect(seen?.metrics.viaAcl).toBe(0);
  });

  it('AC-2: 워크스페이스의 보기 항목은 상속이므로 ACL 접근자에 든다', () => {
    // 관리 항목만 게이트다. 워크스페이스가 상속 사슬의 루트라는 사실까지
    // 게이트로 읽으면 정상적인 상속 부여가 전부 지표에서 사라진다.
    const root = superuser();
    const doc = mk('회의록.md');
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: WS, principalId: 한범.id, level: 'view' });

    expect(report(root, doc)?.metrics.viaAcl).toBe(1);
  });

  it('AC-5: 아무 부여도 없는 노드에서 접근 가능 수치가 0 이 아니다', () => {
    const root = superuser();
    const doc = mk('고립문서.md');

    const seen = report(root, doc);

    expect(seen?.metrics.reachable).toBeGreaterThan(0);
    expect(seen?.metrics.viaAcl).toBe(0);
  });

  it('AC-4 재료: 상속을 끊으면 위쪽 부여가 ACL 접근자에서 빠진다', () => {
    // 상속 끊김 감사 목록이 이 수치를 쓴다 — 끊긴 뒤에도 위쪽 부여가
    // 세어지면 그 목록이 고립을 놓친다.
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const doc = mk('회의록.md', 본부);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 본부, principalId: 한범.id, level: 'view' });

    expect(report(root, doc)?.metrics.viaAcl).toBe(1);

    breakInheritance(stores, root, doc);

    expect(report(root, doc)?.metrics.viaAcl).toBe(0);
  });

  it('그룹을 경유해 닿는 사람도 ACL 접근자로 센다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 한범 = user('한범');
    const 지은 = user('지은');
    const 팀 = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(팀.id, 한범.id);
    stores.principals.addMember(팀.id, 지은.id);
    grantPermission(stores, root, { nodeId: doc, principalId: 팀.id, level: 'view' });

    // 세는 것은 **사람**이지 항목이 아니다 — 항목 하나가 둘을 닿게 한다.
    expect(report(root, doc)?.metrics.viaAcl).toBe(2);
  });

  it('정지된 계정은 항목이 남아 있어도 세지 않는다', () => {
    // 회수가 아니라 계정 게이트로 막힌 상태다. 항목은 그대로 남지만
    // 지금 닿지는 못하므로, 세면 관리자가 실제보다 넓게 읽는다.
    const root = superuser();
    const doc = mk('회의록.md');
    const 퇴사예정 = user('퇴사예정');
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사예정.id, level: 'view' });

    expect(report(root, doc)?.metrics.viaAcl).toBe(1);

    setAccountStatus(
      { principals: stores.principals, sessions: new SqliteSessionRepository(db) },
      퇴사예정.id,
      'suspended',
      { audit: stores.audit, actor: root.id },
    );

    expect(report(root, doc)?.metrics.viaAcl).toBe(0);
  });
});

describe('SEC-ACL-015 — 명단은 관리 전용, 수치는 편집까지', () => {
  it('관리 보유자는 명단을 받는다 — AC-1~AC-4 의 표면 축은 화면이 선 뒤에 잰다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    expect(rosterOf(root, doc)).toEqual([root.id, 한범.id].sort());
  });

  it('AC-5 · AC-6: 편집 보유자는 수치만 받고 명단 자리는 비어 온다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: doc, principalId: 편집자.id, level: 'edit' });

    const seen = report(편집자, doc);

    expect(seen?.metrics.reachable).toBe(2);
    // 이니셜·아바타·부분 목록도 주지 않는다 — 자리 자체가 비어야 한다.
    expect(seen?.roster).toBeNull();
  });

  it('보기만 가진 사람에게는 수치도 주지 않는다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 열람자 = user('열람자');
    grantPermission(stores, root, { nodeId: doc, principalId: 열람자.id, level: 'view' });

    expect(report(열람자, doc)).toBeNull();
  });

  it('볼 수 없는 노드는 없는 노드와 같은 답이다', () => {
    const root = superuser();
    const doc = mk('급여.md');
    const 남 = user('남');

    // 권한이 없어서 못 보는 것과 애초에 없는 것이 **같은 값**이다.
    expect(report(남, doc)).toBeNull();
    expect(report(root, '없는-노드')).toBeNull();
  });

  it('관문에 걸린 노드는 슈퍼유저에게도 지표를 내지 않는다', () => {
    // 관문은 권한 축이 아니라 이름·상태 축이라 관리 권한으로 뚫리지
    // 않는다. 이 관문이 빠지면 실체가 사라진 노드와 예약 자리 아래의
    // 문서가 접근자 지표로 존재를 드러낸다.
    const root = superuser();
    const 유실 = mk('유실문서.md');

    expect(report(root, 유실)?.metrics.reachable).toBeGreaterThan(0);

    stores.nodes.markOrphaned(유실, new Date().toISOString());

    expect(report(root, 유실)).toBeNull();
  });
});
