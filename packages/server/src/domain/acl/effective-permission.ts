import type { PrincipalId } from '../principal/principal.js';
import type { AclEntry } from './acl-entry.js';
import { strongest, type PermissionLevel } from './level.js';

/** 사슬 위의 노드 하나. */
export interface AncestorLink {
  id: string;

  /**
   * 상속 유지 여부. 기본값은 유지다 (`SEC-ACL-003` AC-1).
   *
   * 이 값을 노드에 두는 이유는 항목마다 두는 방식(Windows ACL 의 상속
   * 플래그)과 다른 선택이며, 그래서 「이 폴더에만 적용」을 **구조적으로**
   * 표현할 수 없다 (`CON-ACL-003`).
   */
  inheritsAcl: boolean;
}

/**
 * 대상 노드에서 워크스페이스까지의 사슬.
 *
 * 워크스페이스를 `links` 안에 섞지 않고 따로 두는 이유는 그것이 다른 것들과
 * 성질이 다르기 때문이다 — 상속 체인의 **루트**이고(`SEC-WORKSPACE-001`),
 * 관리 레벨을 부여받을 수 있는 **유일한** 계층이며(`SEC-WORKSPACE-002`),
 * 그 관리 항목은 아래에서 상속을 끊어도 여전히 닿는다(`SEC-ACL-008` AC-3).
 * 한 배열에 섞으면 이 셋을 인덱스로 판정하게 되고, 그 판정은 조용히 어긋난다.
 */
export interface Ancestry {
  /** 대상 자신부터 위로. 대상이 워크스페이스 자체면 비어 있다. */
  readonly links: readonly AncestorLink[];
  readonly workspaceId: string;
}

/** 판정을 요청하는 주체. */
export interface Requester {
  /** 자기 자신과 소속 그룹 전부 — `subjectIdsOf` 가 만든다. */
  readonly subjectIds: readonly PrincipalId[];
  /** 슈퍼유저 그룹 소속 — `isSuperuser` 가 판정한다. */
  readonly superuser: boolean;
}

/**
 * 한 주체의 한 노드에 대한 유효 권한. 없으면 `null`.
 *
 * **순수 함수다** — 저장하지도 캐시하지도 않는다 (`CON-ACL-001`). 그래서
 * 무효화할 캐시가 존재하지 않고(AC-3), 그룹 멤버 하나를 더한 다음 요청부터
 * 곧바로 새 결과가 나온다(AC-2). 인자를 고치지도 않으므로 판정이 ACL 항목을
 * 만들거나 남기지 않는다(`SEC-ACL-008` AC-5).
 *
 * @param entries 사슬 위 노드들에 걸린, **이 주체에 해당하는** 항목 전부.
 *   호출자가 질의 한 번으로 모아 온다 — 사슬 조회 1회와 합쳐 요청당 2쿼리다
 *   (`CON-ACL-001` AC-4). 다른 주체의 항목이 섞여 있어도 여기서 걸러내므로
 *   결과는 같다.
 */
export function effectivePermission(
  ancestry: Ancestry,
  entries: readonly AclEntry[],
  requester: Requester,
): PermissionLevel | null {
  // 상방 게이트 하나 — 슈퍼유저 (`SEC-ACL-008` AC-1).
  if (requester.superuser) return 'admin';

  const subjects = new Set(requester.subjectIds);
  const mine = entries.filter((e) => subjects.has(e.principalId));

  // 상방 게이트 둘 — 워크스페이스 관리 (`SEC-ACL-008` AC-2).
  //
  // 아래의 사슬 순회보다 먼저 보는 이유가 AC-3 이다. 관리 항목은 아래에서
  // 상속을 끊어도 닿아야 하는데, 순회 안에 두면 끊긴 지점에서 함께 잘린다.
  const workspaceLevels = mine.filter((e) => e.nodeId === ancestry.workspaceId);
  if (workspaceLevels.some((e) => e.level === 'admin')) return 'admin';

  // 사슬 순회 — 자기 자신부터 위로, 상속을 끊은 노드에서 멈춘다
  // (`SEC-ACL-003` AC-2 · AC-4).
  const applicable: PermissionLevel[] = [];
  let inherited = true;

  for (const link of ancestry.links) {
    for (const e of mine) {
      // 워크스페이스가 아닌 계층의 `admin` 행은 올려주지 않는다
      // (`SEC-WORKSPACE-002` AC-5). 부여 경계가 이미 막지만, 다른 경로로
      // 들어온 행이 있어도 판정이 그것을 관리로 읽지 않게 한다.
      if (e.nodeId === link.id) applicable.push(e.level === 'admin' ? 'edit' : e.level);
    }
    if (!link.inheritsAcl) {
      inherited = false;
      break;
    }
  }

  // 워크스페이스는 사슬의 루트이므로 끊기지 않은 경우에만 닿는다.
  if (inherited) applicable.push(...workspaceLevels.map((e) => e.level));

  return strongest(applicable);
}
