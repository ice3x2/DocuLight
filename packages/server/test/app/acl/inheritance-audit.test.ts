import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { brokenInheritanceOf } from '../../../src/app/acl/inheritance-audit-service.js';
import {
  breakInheritance,
  grantPermission,
  restoreInheritance,
} from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 상속을 끊은 노드가 쌓이면 **부모 정책의 적용 범위를 아무도 예측할 수
 * 없게 된다** (`FR-ACL-005`). 상위 디렉토리에 부여해도 어디까지 내려가는지
 * 모르는 상태가 되고, 이 목록이 그 누적을 관측하고 되돌리는 유일한 수단이다.
 *
 * 이 목록이 **`ACL 접근자`** 지표를 쓰는 이유가 여기 있다 — 목적이
 * 「권한으로 닿는 사람이 아무도 없는 노드」를 찾는 것이라, 어느 노드에나
 * 닿는 상방 게이트를 빼야 지표가 의미를 갖는다.
 */

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';
const OTHER = 'ws-2';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-inherit-audit-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [WS, '기획팀']);
  db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [OTHER, '인사팀']);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const mk = (
  name: string,
  parentId: string | null = null,
  kind: 'file' | 'directory' = 'file',
  workspaceId = WS,
) => stores.nodes.create({ workspaceId, parentId, kind, name });

let seq = 0;

const superuser = (): Actor => {
  const account = stores.principals.createUser(`설치자-${(seq += 1)}`);
  stores.principals.addMember(SUPERUSER_GROUP_ID, account.id);
  return actorFor(stores.principals, account.id);
};

const user = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

const workspaceAdmin = (name: string, workspaceId: string, by: Actor): Actor => {
  const account = stores.principals.createUser(name);
  grantPermission(stores, by, { nodeId: workspaceId, principalId: account.id, level: 'admin' });
  return actorFor(stores.principals, account.id);
};

const paths = (actor: Actor): string[] =>
  (brokenInheritanceOf(stores, actor)?.rows ?? []).map((row) => row.path);

describe('FR-ACL-005 — 상속 끊김 노드를 모아 보고 되돌린다', () => {
  it('AC-1: 상속이 끊긴 노드만 목록에 선다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const 끊김 = mk('격리문서.md', 본부);
    mk('보통문서.md', 본부);
    breakInheritance(stores, root, 끊김);

    expect(paths(root)).toEqual(['본부/격리문서.md']);
  });

  it('AC-2 · AC-3: 되돌리면 다시 조상의 항목을 받는다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const 끊김 = mk('격리문서.md', 본부);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 본부, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, 끊김);

    expect(permissionOf(stores, 한범, 끊김)).toBeNull();

    expect(restoreInheritance(stores, root, 끊김).ok).toBe(true);

    expect(permissionOf(stores, 한범, 끊김)).toBe('view');
    expect(paths(root)).toEqual([]);
  });

  it('AC-2: 되돌리기는 부모 항목을 복사해 오지 않는다', () => {
    // 상속으로 되돌리는 것과 부모 항목을 자기 것으로 굳히는 것은 다른
    // 조작이다. 한 버튼 뒤에 둘을 묶으면 되돌린 뒤 부모에서 회수해도
    // 사본이 남아 권한이 조용히 유지된다.
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const 끊김 = mk('격리문서.md', 본부);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 본부, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, 끊김);
    restoreInheritance(stores, root, 끊김);

    expect(stores.acl.entriesOn(끊김)).toEqual([]);
  });

  it('AC-4: 행이 ACL 접근자 수를 갖는다 — 상방 게이트는 빠진다', () => {
    const root = superuser();
    const 끊김 = mk('격리문서.md');
    const 한범 = user('한범');
    breakInheritance(stores, root, 끊김);
    grantPermission(stores, root, { nodeId: 끊김, principalId: 한범.id, level: 'view' });

    // 슈퍼유저도 닿지만 그것은 ACL 경유가 아니다.
    expect(brokenInheritanceOf(stores, root)?.rows[0]?.aclAccessors).toBe(1);
  });

  it('AC-5 재료: 아무도 권한으로 닿지 못하는 행은 수치가 0 이다', () => {
    const root = superuser();
    const 고립 = mk('고립문서.md');
    breakInheritance(stores, root, 고립);

    expect(brokenInheritanceOf(stores, root)?.rows[0]?.aclAccessors).toBe(0);
  });

  it('AC-6: 요청한 관리자 자신의 ACL 로는 볼 수 없는 노드도 목록에 든다', () => {
    // 상속이 끊긴 노드는 정의상 관리자 자신의 항목으로도 안 보일 수 있다.
    // 요청자의 항목으로 거르면 이 목록이 정확히 필요한 자리에서 비어 버린다.
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    const 끊김 = mk('격리문서.md');
    breakInheritance(stores, root, 끊김);

    expect(paths(관리자)).toEqual(['격리문서.md']);
  });

  it('AC-7: 관리 레벨이 없는 사람에게는 열리지 않는다', () => {
    const root = superuser();
    const 끊김 = mk('격리문서.md');
    breakInheritance(stores, root, 끊김);
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: WS, principalId: 편집자.id, level: 'edit' });

    expect(brokenInheritanceOf(stores, 편집자)).toBeNull();
    expect(restoreInheritance(stores, 편집자, 끊김).ok).toBe(false);
  });

  it('관리하지 않는 워크스페이스의 끊긴 노드는 목록에 들지 않는다', () => {
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    const 내것 = mk('격리문서.md');
    const 남의것 = mk('남의격리문서.md', null, 'file', OTHER);
    breakInheritance(stores, root, 내것);
    breakInheritance(stores, root, 남의것);

    expect(paths(관리자)).toEqual(['격리문서.md']);
  });
});
