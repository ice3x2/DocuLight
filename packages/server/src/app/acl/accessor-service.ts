import type { AclEntry } from '../../domain/acl/acl-entry.js';
import { effectivePermission, type Ancestry } from '../../domain/acl/effective-permission.js';
import { permits } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import { isSuperuser, subjectIdsOf } from '../../domain/principal/subject.js';
import { isServable } from '../../domain/serving/servable.js';
import { judgementScope, type AclStores, type Actor } from './permission-service.js';

/**
 * 한 노드의 접근자 인원 — **둘로 나뉜다** (`IR-ACL-001`).
 *
 * 하나로 두면 고립 노드를 식별할 수 없다. 슈퍼유저와 워크스페이스 관리
 * 보유자는 어느 노드에나 닿으므로 합계는 **결코 0 이 되지 않고**, 그래서
 * 「권한으로 닿는 사람이 아무도 없다」를 묻는 화면은 그 둘을 뺀 수치를
 * 봐야만 의미를 갖는다 (AC-4 · AC-5).
 *
 * 두 칸을 따로 두는 것이 AC-7 의 이행이다 — 합쳐 놓고 화면이 나누게 하면
 * 어느 화면 하나가 반드시 틀린 쪽을 쓴다.
 */
export interface AccessorMetrics {
  /** `접근 가능` — ACL·상속으로 닿는 사람과 상방 게이트로 닿는 사람의 합 (AC-1). */
  readonly reachable: number;
  /** `ACL 접근자` — 상방 게이트로만 닿는 사람을 뺀 수 (AC-2). */
  readonly viaAcl: number;
}

/**
 * 지표와 명단. **문턱이 서로 다르다** (`SEC-ACL-015`).
 *
 * 명단은 `관리`, 지표는 `편집` 이다. 명단을 못 주는 요청자에게는 `roster`
 * 가 `null` 로 온다 — 이니셜도 아바타도 앞 몇 명도 주지 않는다(AC-6).
 * 값을 줄여서 주는 자리를 두면 그 자리가 곧 우회 경로가 된다.
 */
export interface AccessorReport {
  readonly metrics: AccessorMetrics;
  readonly roster: readonly PrincipalId[] | null;
}

/**
 * 이 노드의 접근자. 지표를 볼 자격이 없으면 `null`.
 *
 * 볼 수 없는 노드와 지표 권한이 없는 노드가 **같은 값**으로 돌아온다
 * (`SEC-ACL-006`) — 사유를 실을 자리가 없어야 그 차이가 존재를 알리지
 * 않는다.
 *
 * 진입점을 하나로 두는 이유는 지표와 명단이 **같은 계산**에서 나오기
 * 때문이다. 둘로 나누면 한쪽만 문턱을 갖게 되고, 그 비대칭은 화면이 둘을
 * 따로 부르는 순간 드러난다.
 */
export function accessorsOf(
  stores: AclStores,
  actor: Actor,
  nodeId: NodeId,
): AccessorReport | null {
  // 관문이 권한보다 앞선다 — 휴지통·아카이브·점 이름 아래의 노드는
  // 관리자에게도 지표를 내지 않는다.
  //
  // 사슬은 **한 번만** 읽고 그것으로 관문과 상속 사슬을 함께 세운다.
  // `chainOf` 를 관문·판정·사슬에서 각각 부르면 한 호출이 같은 질의를
  // 세 번 낸다.
  const chain = stores.nodes.chainOf(nodeId);
  if (chain.length === 0 || !isServable(chain)) return null;

  const ancestry: Ancestry = {
    links: chain.map((node) => ({ id: node.id, inheritsAcl: node.inheritsAcl })),
    workspaceId: chain[0]!.workspaceId,
  };

  // 주체를 가리지 않고 사슬 위의 항목을 **한 번에** 받는다. 사람마다
  // 질의하면 인원 수만큼 질의가 붙는다.
  const entries = stores.acl.entriesOnAny(judgementScope(ancestry));

  // 요청자 판정도 같은 항목 집합에서 나온다 — `permissionOf` 를 부르면
  // 사슬과 항목을 둘 다 다시 읽는다.
  const level = effectivePermission(ancestry, entries, actor.requester);
  if (level === null || !permits(level, 'edit')) return null;

  const withoutGate = entries.filter((entry) => !isUpwardGate(entry, ancestry));
  const roster: PrincipalId[] = [];
  let viaAcl = 0;

  for (const candidate of activeUsers(stores.principals)) {
    // 판정 규칙을 여기서 다시 쓰지 않는다 — `effectivePermission` 하나가
    // 정본이고 이쪽은 요청자만 바꿔 가며 그것을 부른다. 규칙을 옮겨 적으면
    // 상속 끊김·워크스페이스 루트 같은 가지가 두 곳에서 갈린다.
    if (effectivePermission(ancestry, entries, candidate.requester) !== null) {
      roster.push(candidate.id);
    }
    // 상방 게이트를 **양쪽 다** 끈 판정이다 — 슈퍼유저 플래그를 내리고
    // 워크스페이스 관리 항목을 뺀다. 둘 중 하나만 끄면 나머지 한쪽으로
    // 닿는 사람이 ACL 접근자로 잘못 센다.
    const grounded = { subjectIds: candidate.requester.subjectIds, superuser: false };
    if (effectivePermission(ancestry, withoutGate, grounded) !== null) viaAcl += 1;
  }

  return {
    metrics: { reachable: roster.length, viaAcl },
    roster: permits(level, 'admin') ? roster : null,
  };
}

/**
 * 워크스페이스 계층의 `관리` 항목 — 두 번째 상방 게이트다
 * (`SEC-ACL-008` AC-2 · AC-3).
 *
 * 워크스페이스 항목 **전부**를 게이트로 읽으면 안 된다. 워크스페이스는
 * 상속 사슬의 루트이기도 해서 거기 걸린 `보기`·`편집` 은 평범한 상속이고,
 * 그것까지 빼면 정상 부여가 지표에서 사라진다.
 */
const isUpwardGate = (entry: AclEntry, ancestry: Ancestry): boolean =>
  entry.nodeId === ancestry.workspaceId && entry.level === 'admin';

interface Candidate {
  readonly id: PrincipalId;
  readonly requester: { readonly subjectIds: readonly PrincipalId[]; readonly superuser: boolean };
}

/**
 * 셀 대상이 되는 사람들 — **지금 닿을 수 있는** 계정만이다.
 *
 * 정지·대기 계정은 항목이 그대로 남아 있어도 주체 게이트에서 막히므로
 * (`actorFor` 와 같은 판정) 세지 않는다. 세면 관리자가 실제보다 넓게 읽고,
 * 그 오차는 오프보딩 직후에 가장 커진다.
 *
 * 멤버십은 **그룹 쪽에서** 모은다 — 사람마다 `groupsOf` 를 부르면 질의가
 * 인원 수만큼 붙는다. 그룹 수는 인원 수보다 훨씬 느리게 는다.
 */
function activeUsers(principals: PrincipalRepository): Candidate[] {
  const groupsOf = new Map<PrincipalId, PrincipalId[]>();
  for (const group of principals.list('group')) {
    for (const member of principals.membersOf(group.id)) {
      const mine = groupsOf.get(member);
      if (mine === undefined) groupsOf.set(member, [group.id]);
      else mine.push(group.id);
    }
  }

  return principals
    .list('user')
    .filter((account) => account.status === 'active')
    .map((account) => {
      const groups = groupsOf.get(account.id) ?? [];
      return {
        id: account.id,
        requester: {
          subjectIds: subjectIdsOf(account.id, groups),
          superuser: isSuperuser(groups),
        },
      };
    });
}
