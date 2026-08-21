import type { PrincipalId } from './principal.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from './system-groups.js';

/**
 * 한 사용자의 ACL 판정에 걸리는 주체 전부 — 자기 자신과 **직접** 소속한
 * 그룹들, 그리고 모든 사용자가 속하는 default 그룹.
 *
 * 그룹에서 그룹으로 이어지는 참조를 따라가지 않는다 (`DR-PRINCIPAL-002`
 * AC-3). 순회할 참조가 애초에 없으므로 깊이도 순환도 생기지 않는다.
 */
export function subjectIdsOf(
  userId: PrincipalId,
  directGroupIds: readonly PrincipalId[],
): PrincipalId[] {
  return [...new Set([userId, DEFAULT_GROUP_ID, ...directGroupIds])];
}

/**
 * 슈퍼유저 판정. **멤버십 조회 하나로 끝난다** (`DR-PRINCIPAL-001` AC-1).
 *
 * 계정 쪽 플래그를 보지 않으므로 멤버십을 빼는 즉시 판정이 바뀐다
 * (AC-3) — 함께 갱신해야 하는 두 번째 값이 없다.
 */
export function isSuperuser(directGroupIds: readonly PrincipalId[]): boolean {
  return directGroupIds.includes(SUPERUSER_GROUP_ID);
}
