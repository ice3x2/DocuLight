import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { simulate } from '../../../src/app/acl/simulation-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * *"왜 저 사람이 저 문서를 못 보는가"* 를 답하는 화면 (`FR-ACL-004`).
 *
 * 완전 숨김 때문에 관리자도 자기 권한 밖 노드를 트리에서 볼 수 없다. 이
 * 화면이 없으면 그 물음을 추적할 수단이 **하나도 없다** — 선택 기능이
 * 아니라 상방 게이트가 있어야만 성립하는 진단 도구다.
 */

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';
const OTHER = 'ws-2';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-simulate-'));
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

/** 경로 → 그 주체의 유효 권한. 못 보면 `null`. */
const levelsByPath = (actor: Actor, subjectId: string): Record<string, unknown> =>
  Object.fromEntries(
    (simulate(stores, actor, subjectId)?.nodes ?? []).map((row) => [row.path, row.level]),
  );

describe('FR-ACL-004 — 특정 주체 관점의 유효 권한을 되짚는다', () => {
  it('AC-1: 관리 보유자가 주체 하나를 골라 그 주체의 유효 권한을 본다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const doc = mk('회의록.md', 본부);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'edit' });

    expect(levelsByPath(root, 한범.id)).toEqual({ 본부: null, '본부/회의록.md': 'edit' });
  });

  it('AC-6: 볼 수 없는 노드도 행으로 나온다 — 그것이 이 화면의 답이다', () => {
    // 못 보는 노드를 목록에서 빼면 「왜 못 보는가」의 답이 목록의 **부재**가
    // 되어, 그 노드가 존재하지 않는 경우와 구별되지 않는다.
    const root = superuser();
    mk('급여.md');
    const 한범 = user('한범');

    expect(levelsByPath(root, 한범.id)).toEqual({ '급여.md': null });
  });

  it('AC-2: 관리자 자신의 ACL 로는 볼 수 없는 노드도 결과에 든다', () => {
    // 워크스페이스 관리자는 자기 ACL 항목이 하나도 없어도 상방 게이트로
    // 그 워크스페이스 전체에 닿는다. 결과를 요청자의 **항목**으로 거르면
    // 이 화면이 정확히 필요한 자리에서 비어 버린다.
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    const 격리 = mk('격리문서.md');
    breakInheritance(stores, root, 격리);
    const 한범 = user('한범');

    expect(Object.keys(levelsByPath(관리자, 한범.id))).toContain('격리문서.md');
  });

  it('AC-3: 저장된 스냅샷이 아니라 조회 시점의 항목으로 계산한다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 한범 = user('한범');

    expect(levelsByPath(root, 한범.id)).toEqual({ '회의록.md': null });

    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    // 갱신할 색인도 무효화할 캐시도 없다 — 다음 조회가 곧 새 답이다.
    expect(levelsByPath(root, 한범.id)).toEqual({ '회의록.md': 'view' });
  });

  it('AC-5: 직접 부여와 상속을 구별해 보여준다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    mk('물려받은문서.md', 본부);
    const 직접 = mk('직접받은문서.md', 본부);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 본부, principalId: 한범.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 직접, principalId: 한범.id, level: 'edit' });

    const sources = Object.fromEntries(
      (simulate(stores, root, 한범.id)?.nodes ?? []).map((row) => [row.path, row.source]),
    );

    expect(sources).toEqual({
      본부: 'direct',
      '본부/물려받은문서.md': 'inherited',
      '본부/직접받은문서.md': 'direct',
    });
  });

  it('AC-5: 못 보는 노드의 출처는 비어 있다', () => {
    const root = superuser();
    mk('급여.md');
    const 한범 = user('한범');

    expect(simulate(stores, root, 한범.id)?.nodes[0]?.source).toBeNull();
  });

  it('AC-4: 관리하지 않는 워크스페이스는 결과에 들지 않는다', () => {
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    mk('회의록.md');
    mk('남의급여.md', null, 'file', OTHER);
    const 한범 = user('한범');

    expect(Object.keys(levelsByPath(관리자, 한범.id))).toEqual(['회의록.md']);
  });

  it('AC-4: 관리 레벨이 없는 사람에게는 열리지 않는다', () => {
    const root = superuser();
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: WS, principalId: 편집자.id, level: 'edit' });
    const 한범 = user('한범');

    expect(simulate(stores, 편집자, 한범.id)).toBeNull();
  });

  it('정지된 계정을 시뮬레이션하면 어디에도 닿지 못하는 것으로 나온다', () => {
    // 항목은 남아 있어도 계정 게이트가 앞서 막는다. 항목만 보고 답하면
    // 「왜 못 보는가」의 진짜 이유를 이 화면이 놓친다.
    const root = superuser();
    const doc = mk('회의록.md');
    const 정지됨 = stores.principals.createUser('정지됨');
    grantPermission(stores, root, { nodeId: doc, principalId: 정지됨.id, level: 'edit' });
    stores.principals.setStatus(정지됨.id, 'suspended');

    expect(levelsByPath(root, 정지됨.id)).toEqual({ '회의록.md': null });
  });
});
