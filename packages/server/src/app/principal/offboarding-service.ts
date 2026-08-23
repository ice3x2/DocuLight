import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { TokenRepository } from '../../domain/ports/token-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID, isSystemGroup } from '../../domain/principal/system-groups.js';

/**
 * 오프보딩 카드가 아는 것 (`FR-PRINCIPAL-003` · `CON-PRINCIPAL-004`).
 *
 * **진행 상태를 저장하지 않는다** (`CON-PRINCIPAL-004` AC-3 · AC-4). 저장하면
 * 중단된 오프보딩이 유령 레코드로 남고, 4단계를 다른 화면에서 처리했을 때
 * 카드의 표시가 어긋난다. 매번 계정 상태·멤버십·`acl_entry` 를 조회해
 * 파생하므로 어디서 무엇을 하든 표시가 자동으로 맞는다.
 */
export interface OffboardingStep {
  readonly id: 'suspend' | 'tokens' | 'memberships' | 'acl';
  readonly done: boolean;
  /** ACL 단계에만 있는 값 — 남은 항목 수. 나머지 단계에는 없다. */
  readonly remaining?: number;
  /**
   * 멤버십 단계에만 있는 값 — **제거될 그룹의 이름 전부** (`FR-CONFIRM-009`
   * AC-2).
   *
   * 개수가 아니라 이름인 이유는, 이 카드가 진행 상태를 저장하지 않아
   * (`R101-d`) 실행취소 토스트가 사라지면 그 사용자가 어느 그룹에 속했는지
   * 복원할 정보가 남지 않기 때문이다 — 실행 전에 보여주는 것이 유일한
   * 기회다. 나머지 단계에는 이 칸이 없다: 있으면 화면이 아무 단계에나
   * 이름을 그린다.
   */
  readonly groups?: readonly string[];
}

export interface OffboardingCard {
  readonly principalId: PrincipalId;
  readonly principalName: string;
  readonly steps: readonly OffboardingStep[];
}

export interface OffboardingStores {
  readonly principals: PrincipalRepository;
  readonly acl: AclRepository;
  readonly tokens?: TokenRepository;
}

/**
 * 그 계정의 오프보딩 카드. 계정이 없으면 `null`.
 *
 * 네 단계의 순서가 고정이다 — ①계정 정지 ②PAT 무효화 ③그룹 멤버십 제거
 * ④ACL 일괄 회수. 각각 따로 하면 담당자가 하나를 빠뜨리고, 빠뜨린 자리에
 * 잔존 권한이 남는다.
 *
 * **②는 별도 조작이 아니다** (AC-2). 계정이 `active` 가 아니게 되면 그
 * 계정의 모든 PAT 가 요청 시점 계정 조회에서 닫히므로(`SEC-AUTH-009`),
 * 여기서 세는 것은 「토큰을 하나씩 폐기했는가」가 아니라 「그 결과가 이미
 * 성립하는가」다. 하나씩 폐기하는 단계를 두면 그것이 두 번째 무효화
 * 경로가 되고, 두 경로는 곧 갈린다.
 *
 * **④는 이 카드가 실행하지 않는다** (AC-5 · AC-6). 영향 범위 표와 타이핑
 * 확인이 주체 일괄 회수 화면에 이미 있으므로 여기서 다시 그리면 중복
 * 구현이 된다. 그래서 이 단계가 싣는 것은 남은 항목 수 하나뿐이다.
 */
export function offboardingCard(
  stores: OffboardingStores,
  principalId: PrincipalId,
): OffboardingCard | null {
  const account = stores.principals.findById(principalId);
  if (account === undefined || account.kind !== 'user') return null;

  const suspended = account.status !== 'active';
  const remaining = stores.acl.entriesOfPrincipal(principalId).length;

  return {
    principalId,
    principalName: account.name,
    steps: [
      { id: 'suspend', done: suspended },
      // 계정이 닫히면 그 계정의 토큰도 함께 닫힌다 — 같은 사실이다.
      { id: 'tokens', done: suspended },
      {
        id: 'memberships',
        done: nonSystemGroupsOf(stores, principalId).length === 0,
        groups: nonSystemGroupsOf(stores, principalId).flatMap((id) => {
          const group = stores.principals.findById(id);
          return group === undefined ? [] : [group.name];
        }),
      },
      { id: 'acl', done: remaining === 0, remaining },
    ],
  };
}

/**
 * 오프보딩이 걷는 그룹들 — **시스템 그룹은 빼고** 센다.
 *
 * 모든 계정이 `default` 에 속하므로(`R8`) 그것을 세면 이 단계가 영영
 * 완료되지 않는다. 슈퍼유저 그룹은 그 자체가 별도 가드의 대상이라 여기서
 * 세지 않는다 — 마지막 한 명이면 그 가드가 따로 거절한다.
 */
const nonSystemGroupsOf = (stores: OffboardingStores, userId: PrincipalId): PrincipalId[] =>
  stores.principals.groupsOf(userId).filter((id) => !isSystemGroup(id));

/**
 * 주체 일괄 회수 화면이 그 주체를 두고 알려야 하는 것 (`FR-PRINCIPAL-011`).
 *
 * 문구가 아니라 **사유 코드**를 준다 — 문구를 여기서 만들면 화면마다 같은
 * 상황에 다른 말이 나간다.
 */
export type RevocationNote = 'superuser-revocation-ineffective' | 'default-group-wide-effect';

export function revocationNotes(principalId: PrincipalId): RevocationNote[] {
  // 슈퍼유저는 ACL 이 아니라 상방 게이트로 닿는다 (`SEC-ACL-008` AC-1) —
  // 그 그룹 앞으로 부여된 항목을 전부 걷어도 접근이 줄지 않는다. 그
  // 사실을 알리지 않으면 실행자가 회수했다고 믿는다 (AC-2 · AC-3).
  if (principalId === SUPERUSER_GROUP_ID) return ['superuser-revocation-ineffective'];

  // 전원이 속한 그룹이라 한 번의 회수가 인스턴스 전역에 걸린다 (AC-1).
  if (principalId === DEFAULT_GROUP_ID) return ['default-group-wide-effect'];

  return [];
}
