/**
 * 이름 충돌 안내 (`SEC-SHELL-002` AC-3).
 *
 * **문구가 하나뿐이다.** 조건에 따라 갈리면 그 갈림 자체가 「여기 감춰진
 * 것이 있다」는 신호가 되고, 감추기로 한 것이 문구로 새어 나온다.
 *
 * 그래서 이 모듈은 요청자도 대상도 받지 않는다 — 받을 수 있으면 언젠가
 * 그 값으로 문구를 가르는 코드가 붙는다.
 */
export const COLLISION_NOTICE = '같은 이름이 있어 {name} 으로 만들었습니다.';

/** 확정된 이름을 문구에 끼운다. */
export function noticeFor(resolvedName: string): string {
  return COLLISION_NOTICE.replace('{name}', resolvedName);
}
