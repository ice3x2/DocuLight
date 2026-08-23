import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  breakInheritance,
  grantPermission,
  inheritFromParent,
  revokePermission,
} from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof nodeStores>;
let root: Actor;
let ws: string;
let 방: string;
let 한범: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-inherit-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);

  const installer = stores.principals.createUser('설치자');
  stores.principals.addMember(SUPERUSER_GROUP_ID, installer.id);
  root = actorFor(stores.principals, installer.id);

  ws = stores.workspaces.create('기획팀').id;
  방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '설계' }));
  한범 = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-CONFIRM-001 — 가져온 항목의 부여자는 실행자다', () => {
  it('AC-1 · AC-2: 대상 노드의 직접 항목이 되고 부여자가 실행자다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    const 관리자 = actorFor(stores.principals, stores.principals.createUser('관리자').id);
    grantPermission(stores, root, { nodeId: ws, principalId: 관리자.id, level: 'admin' });
    breakInheritance(stores, 관리자, 방);

    expect(inheritFromParent(stores, 관리자, 방).ok).toBe(true);

    const 직접 = stores.acl.entriesOnAny([방]).filter((e) => e.principalId === 한범.id);
    expect(직접).toHaveLength(1);
    // 실행자가 아니라 원래 부여자를 그대로 옮기면, 자기 부여분만 회수한다는
    // 규칙과 감사 로그가 이 항목에서만 어긋난다.
    expect(직접[0]!.grantedBy).toBe(관리자.id);
    expect(직접[0]!.nodeId).toBe(방);
  });

  it('AC-3: 상위에서 같은 주체를 회수해도 이 직접 항목은 남는다', () => {
    const 위항목 = grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, 방);
    inheritFromParent(stores, root, 방);

    revokePermission(stores, root, (위항목 as { ok: true; entryId: string }).entryId);

    // 상위 회수가 하위에 닿지 않는 상태가 **의도된 것**임을 여기서 고정한다.
    expect(permissionOf(stores, 한범, 방)).toBe('view');
    expect(permissionOf(stores, 한범, ws)).toBeNull();
  });
});

describe('SEC-CONFIRM-007 — 부모 권한 가져오기는 관리 레벨 전용이다', () => {
  it('AC-3: 편집 레벨이 직접 호출하면 거부된다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'edit' });
    breakInheritance(stores, root, 방);
    const 전 = stores.acl.entriesOnAny([방]).length;

    const outcome = inheritFromParent(stores, 한범, 방);

    expect(outcome.ok).toBe(false);
    // 거부가 실제로 아무것도 만들지 않았는지 함께 잰다 — 결과 값만 보면
    // 만들고 나서 실패를 돌려주는 구현도 통과한다.
    expect(stores.acl.entriesOnAny([방])).toHaveLength(전);
  });

  it('관리 레벨은 통과한다 — 거부 시험만 두면 아무도 못 쓰는 구현이 통과한다', () => {
    const 관리자 = actorFor(stores.principals, stores.principals.createUser('관리자').id);
    grantPermission(stores, root, { nodeId: ws, principalId: 관리자.id, level: 'admin' });
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, 관리자, 방);

    expect(inheritFromParent(stores, 관리자, 방).ok).toBe(true);
    expect(permissionOf(stores, 한범, 방)).toBe('view');
  });
});
