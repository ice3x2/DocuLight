import type { PrincipalId } from './principal.js';

/**
 * 슈퍼유저 그룹. 인스턴스 전역 권한을 표현하는 **유일한** 자리다
 * (`CON-PRINCIPAL-001` AC-1).
 */
export const SUPERUSER_GROUP_ID: PrincipalId = 'system-superuser';

/**
 * 모든 사용자가 속하는 기본 그룹.
 *
 * 멤버십 행을 만들지 않는다 — 소속이 데이터면 빠질 수 있고, 빠진 사용자는
 * 설치 마법사가 default 에 준 권한을 받지 못한 채 조용히 남는다. 「모든
 * 사용자」는 데이터가 아니라 불변식이므로 `subjectIdsOf` 가 상수로 얹는다.
 */
export const DEFAULT_GROUP_ID: PrincipalId = 'system-default';

const SYSTEM_GROUP_IDS: ReadonlySet<PrincipalId> = new Set([
  SUPERUSER_GROUP_ID,
  DEFAULT_GROUP_ID,
]);

/** 시스템 그룹은 삭제·개명할 수 없다 (`CON-PRINCIPAL-002`). */
export function isSystemGroup(id: PrincipalId): boolean {
  return SYSTEM_GROUP_IDS.has(id);
}
