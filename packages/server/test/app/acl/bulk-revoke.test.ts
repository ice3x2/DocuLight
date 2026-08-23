import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { previewRevocation, revokeAllFor } from '../../../src/app/acl/bulk-revoke-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { setAccountStatus } from '../../../src/app/principal/principal-service.js';
import type { PrincipalId } from '../../../src/domain/principal/principal.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 주체 축으로 훑어 걷는다 (`FR-ACL-003`) — 그리고 **어디까지 걷는지는
 * 요청자가 정하지 않는다** (`FR-PRINCIPAL-004`).
 *
 * 상속을 끊은 노드는 부모 정책을 고쳐도 정리되지 않으므로, 오프보딩
 * 대상자의 부여가 거기 잔존한다. 주체 축 회수가 그 자리를 담당한다.
 */

let dir: string;
let db: Database;
let stores: NodeStores;
const WS = 'ws-1';
const OTHER = 'ws-2';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-bulkrevoke-'));
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

/** 그 워크스페이스의 관리자. */
const workspaceAdmin = (name: string, workspaceId: string, by: Actor): Actor => {
  const account = stores.principals.createUser(name);
  grantPermission(stores, by, { nodeId: workspaceId, principalId: account.id, level: 'admin' });
  return actorFor(stores.principals, account.id);
};

const entryCountOf = (principalId: PrincipalId): number =>
  db.all<{ n: number }>('SELECT COUNT(*) AS n FROM acl_entry WHERE principal_id = ?', [
    principalId,
  ])[0]!.n;

describe('FR-ACL-003 — 주체 앞 항목을 한 번에 걷는다', () => {
  it('AC-1: 그 주체 앞으로 부여된 항목이 전부 사라진다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const doc = mk('회의록.md', 본부);
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: 본부, principalId: 퇴사자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사자.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: WS, principalId: 퇴사자.id, level: 'view' });

    expect(entryCountOf(퇴사자.id)).toBe(3);

    const removed = revokeAllFor(stores, root, 퇴사자.id);

    expect(removed?.rows).toHaveLength(3);
    expect(entryCountOf(퇴사자.id)).toBe(0);
  });

  it('AC-2: 그룹 멤버십과 계정 상태는 그대로다', () => {
    // 이 조작은 ACL 만 만진다. 함께 처리하면 「권한만 걷고 계정은 두겠다」가
    // 표현 불가능해지고, 오프보딩 흐름이 단계를 나눈 이유가 사라진다.
    const root = superuser();
    const doc = mk('회의록.md');
    const 퇴사자 = user('퇴사자');
    const 팀 = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(팀.id, 퇴사자.id);
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사자.id, level: 'view' });

    revokeAllFor(stores, root, 퇴사자.id);

    expect(stores.principals.groupsOf(퇴사자.id)).toContain(팀.id);
    expect(stores.principals.findById(퇴사자.id)?.status).toBe('active');
  });

  it('AC-3: 상속이 끊긴 노드에 남은 항목도 걷힌다', () => {
    // 이것이 이 기능이 존재하는 이유다 — 끊긴 노드는 부모 정책을 고쳐도
    // 정리되지 않으므로 주체 축으로 훑지 않으면 영영 남는다.
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const 격리 = mk('격리문서.md', 본부);
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: 격리, principalId: 퇴사자.id, level: 'edit' });
    breakInheritance(stores, root, 격리);

    revokeAllFor(stores, root, 퇴사자.id);

    expect(entryCountOf(퇴사자.id)).toBe(0);
  });

  it('AC-4: 미리보기 행이 워크스페이스·경로·레벨·부여자·부여 시각을 갖는다', () => {
    const root = superuser();
    const 본부 = mk('본부', null, 'directory');
    const doc = mk('회의록.md', 본부);
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사자.id, level: 'edit' });

    const row = previewRevocation(stores, root, 퇴사자.id)?.rows[0];

    expect(row?.workspaceId).toBe(WS);
    expect(row?.workspaceName).toBe('기획팀');
    expect(row?.path).toBe('본부/회의록.md');
    expect(row?.level).toBe('edit');
    expect(row?.grantedBy).toBe(root.id);
    expect(row?.grantedAt).toMatch(/\d{4}-\d{2}-\d{2}/u);
  });

  it('AC-4: 워크스페이스 자체에 걸린 항목은 경로가 비어 온다', () => {
    // 워크스페이스는 트리 노드가 아니라 상속 사슬의 루트다. 이름을 경로로
    // 적으면 같은 이름의 최상위 디렉토리와 구별되지 않는다.
    const root = superuser();
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: WS, principalId: 퇴사자.id, level: 'view' });

    expect(previewRevocation(stores, root, 퇴사자.id)?.rows[0]?.path).toBeNull();
  });

  it('AC-5: 회수 직후의 판정부터 반영된다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사자.id, level: 'view' });

    expect(permissionOf(stores, 퇴사자, doc)).toBe('view');

    revokeAllFor(stores, root, 퇴사자.id);

    // 무효화할 캐시가 없다 — 판정이 매 요청 계산이기 때문이다.
    expect(permissionOf(stores, 퇴사자, doc)).toBeNull();
  });

  it('다른 주체의 항목은 건드리지 않는다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 퇴사자 = user('퇴사자');
    const 잔류자 = user('잔류자');
    grantPermission(stores, root, { nodeId: doc, principalId: 퇴사자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: doc, principalId: 잔류자.id, level: 'view' });

    revokeAllFor(stores, root, 퇴사자.id);

    expect(entryCountOf(잔류자.id)).toBe(1);
  });

  it('미리보기가 보인 행과 실제로 걷힌 행이 같다 — 순서까지', () => {
    // 갈리면 사용자가 확인한 것과 실행된 것이 달라진다 — 되돌리려면
    // 재부여가 필요한 조작이라 그 차이를 사후에 알아차리기 어렵다.
    //
    // 관리자 범위 안에 행을 **셋** 둔다. 하나뿐이면 순서가 뒤집혀도
    // 같은 배열이라 이 시험이 아무것도 재지 못한다. 비어 있지 않다는
    // 것도 함께 단언한다 — 양쪽이 다 빈 배열이어도 같기 때문이다.
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    const 본부 = mk('본부', null, 'directory');
    const 첫째 = mk('가.md', 본부);
    const 둘째 = mk('나.md', 본부);
    const 남의문서 = mk('급여.md', null, 'file', OTHER);
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: 본부, principalId: 퇴사자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 첫째, principalId: 퇴사자.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: 둘째, principalId: 퇴사자.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: 남의문서, principalId: 퇴사자.id, level: 'view' });

    const planned = previewRevocation(stores, 관리자, 퇴사자.id)?.rows.map((r) => r.path);
    const actual = revokeAllFor(stores, 관리자, 퇴사자.id)?.rows.map((r) => r.path);

    expect(planned).toEqual(['본부', '본부/가.md', '본부/나.md']);
    expect(actual).toEqual(planned);
  });

  it('회수마다 감사 행이 하나씩 남는다', () => {
    // 한 번의 조작이 여러 항목을 걷는다고 기록이 묶이지 않는다 — 묶으면
    // 어느 노드의 무엇이 사라졌는지 되짚을 수 없다.
    const root = superuser();
    const first = mk('가.md');
    const second = mk('나.md');
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: first, principalId: 퇴사자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: second, principalId: 퇴사자.id, level: 'view' });

    revokeAllFor(stores, root, 퇴사자.id);

    const rows = db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_log WHERE operation = 'acl.revoke'",
    );
    expect(rows[0]!.n).toBe(2);
  });
});

describe('FR-PRINCIPAL-004 — 적용 범위는 요청자 레벨이 정한다', () => {
  it('AC-1: 워크스페이스 관리자는 자기 워크스페이스 범위다', () => {
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);

    expect(previewRevocation(stores, 관리자, root.id)?.scope).toBe('managed-workspaces');
  });

  it('AC-2 · AC-3: 슈퍼유저는 전 인스턴스 범위이며 같은 값을 쓰지 않는다', () => {
    const root = superuser();

    expect(previewRevocation(stores, root, root.id)?.scope).toBe('instance');
  });

  it('워크스페이스 관리자의 회수는 자기 워크스페이스 밖에 닿지 않는다', () => {
    // 문구가 갈리는 이유가 실제 거동이 갈리기 때문이다. 거동이 같은데
    // 문구만 다르면 그 문구가 곧 거짓말이 된다.
    const root = superuser();
    const 관리자 = workspaceAdmin('기획팀장', WS, root);
    const 내문서 = mk('회의록.md');
    const 남의문서 = mk('급여.md', null, 'file', OTHER);
    const 퇴사자 = user('퇴사자');
    grantPermission(stores, root, { nodeId: 내문서, principalId: 퇴사자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 남의문서, principalId: 퇴사자.id, level: 'view' });

    revokeAllFor(stores, 관리자, 퇴사자.id);

    expect(permissionOf(stores, 퇴사자, 내문서)).toBeNull();
    expect(permissionOf(stores, 퇴사자, 남의문서)).toBe('view');
  });

  it('어느 워크스페이스도 관리하지 않는 사람에게는 화면이 열리지 않는다', () => {
    const root = superuser();
    const doc = mk('회의록.md');
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: doc, principalId: 편집자.id, level: 'edit' });

    expect(previewRevocation(stores, 편집자, root.id)).toBeNull();
    expect(revokeAllFor(stores, 편집자, root.id)).toBeNull();
  });

  it('워크스페이스에 편집을 가진 사람에게도 열리지 않는다 — 관리 전용이다', () => {
    // 앞 시험은 이 문턱을 재지 못한다. 거기서는 부여 대상이 **문서**라
    // 워크스페이스에서의 레벨이 애초에 `null` 이고, 그래서 문턱이 `관리`
    // 든 「권한 있음」이든 똑같이 통과한다. 여기서는 워크스페이스에
    // 편집을 주므로 문턱을 낮추는 순간 통과해 버린다.
    //
    // 통과하면 이 사람이 그 워크스페이스의 **모든 부여**를 주체·경로·
    // 레벨·부여자까지 읽는다 — 미리보기 행 집합이 사실상 접근자 명단이라
    // `SEC-ACL-015` 가 관리 전용으로 못박은 것을 우회하는 두 번째 문이 된다.
    const root = superuser();
    const 편집자 = user('편집자');
    grantPermission(stores, root, { nodeId: WS, principalId: 편집자.id, level: 'edit' });

    expect(previewRevocation(stores, 편집자, root.id)).toBeNull();
    expect(revokeAllFor(stores, 편집자, root.id)).toBeNull();
  });

  it('워크스페이스에 보기만 가진 사람에게도 열리지 않는다', () => {
    const root = superuser();
    const 열람자 = user('열람자');
    grantPermission(stores, root, { nodeId: WS, principalId: 열람자.id, level: 'view' });

    expect(previewRevocation(stores, 열람자, root.id)).toBeNull();
  });
});

describe('FR-PRINCIPAL-010 — 시스템 그룹도 대상이다', () => {
  it('AC-2: default 그룹 앞으로 부여된 항목도 걷힌다', () => {
    // 제외하면 「모든 사용자에게 열린 워크스페이스」를 되돌릴 수단이 없다.
    const root = superuser();
    const doc = mk('회의록.md');
    grantPermission(stores, root, { nodeId: doc, principalId: DEFAULT_GROUP_ID, level: 'view' });

    const removed = revokeAllFor(stores, root, DEFAULT_GROUP_ID);

    expect(removed?.rows).toHaveLength(1);
    expect(entryCountOf(DEFAULT_GROUP_ID)).toBe(0);
  });

  it('AC-3: 새 사용자가 들어오거나 계정이 활성화돼도 걷힌 항목이 돌아오지 않는다', () => {
    // 가입 시 자동 소속과 활성화 시점 소속은 **멤버십** 규정이지 ACL
    // 재생성 규정이 아니다. 둘이 얽혀 있으면 이 회수는 다음 가입자 한
    // 명으로 조용히 무효가 된다.
    const root = superuser();
    const doc = mk('회의록.md');
    grantPermission(stores, root, { nodeId: doc, principalId: DEFAULT_GROUP_ID, level: 'view' });
    revokeAllFor(stores, root, DEFAULT_GROUP_ID);

    const 신입 = stores.principals.createUser('신입');
    stores.principals.addMember(DEFAULT_GROUP_ID, 신입.id);
    setAccountStatus(
      { principals: stores.principals, sessions: new SqliteSessionRepository(db) },
      신입.id,
      'active',
      { audit: stores.audit, actor: root.id },
    );

    expect(entryCountOf(DEFAULT_GROUP_ID)).toBe(0);
    expect(permissionOf(stores, actorFor(stores.principals, 신입.id), doc)).toBeNull();
  });

  it('슈퍼유저 그룹도 대상에서 빠지지 않는다', () => {
    // `R119` 는 둘을 함께 지목한다. `default` 만 재고 넘어가면 나머지
    // 절반은 아무도 확인하지 않은 채 남는다.
    const root = superuser();
    const doc = mk('회의록.md');
    grantPermission(stores, root, {
      nodeId: doc,
      principalId: SUPERUSER_GROUP_ID,
      level: 'view',
    });

    const removed = revokeAllFor(stores, root, SUPERUSER_GROUP_ID);

    expect(removed?.rows).toHaveLength(1);
    expect(entryCountOf(SUPERUSER_GROUP_ID)).toBe(0);
  });
});
