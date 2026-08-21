/**
 * 권한자를 가리키는 말의 **정본** (`CON-PRINCIPAL-007`).
 *
 * `관리자` 를 단독으로 쓰지 않는 이유는 이 제품에 관리 경계가 둘이기
 * 때문이다 — 인스턴스 전역(슈퍼유저)과 워크스페이스 단위. 범위 없이 쓰면
 * 읽는 사람이 어느 쪽인지 고르게 되고, 그 선택은 대개 틀린다.
 */
export const WORKSPACE_ADMIN_TERM = '워크스페이스 관리자';
export const SUPERUSER_TERM = '슈퍼유저';

/**
 * 유일한 예외 (`CON-PRINCIPAL-007` AC-4).
 *
 * 이 배지는 「이 워크스페이스에 관리자가 한 명도 없다」는 사실을 알리는
 * 자리라, 범위를 붙이면 오히려 특정 관리자를 가리키는 말로 읽힌다.
 */
export const NO_ADMIN_BADGE = '관리자 없음';

/** `관리자` 앞에 올 수 있는 범위 수식어. */
const SCOPED = ['워크스페이스 ', '전 워크스페이스 ', '해당 워크스페이스 '];

/**
 * 범위 수식어 없는 `관리자` 가 들어 있는가.
 *
 * 화면 문구를 내보내는 쪽이 이 함수를 지나게 해서 규칙을 지킨다 — 눈으로
 * 훑는 검사는 문구가 늘어나는 만큼 놓친다.
 *
 * 예외 배지는 **그 문구만큼만** 면제된다. 배지를 품었다고 해서 같은
 * 문자열 안의 다른 단독 사용까지 통과시키지 않는다.
 */
export function hasUnscopedAdminTerm(text: string): boolean {
  // 예외 배지를 먼저 걷어낸다 — 남은 자리에 `관리자` 가 또 있으면 그것은
  // 배지가 아니다.
  const withoutBadge = text.split(NO_ADMIN_BADGE).join('');

  let index = withoutBadge.indexOf('관리자');
  while (index !== -1) {
    const before = withoutBadge.slice(0, index);
    if (!SCOPED.some((prefix) => before.endsWith(prefix))) return true;
    index = withoutBadge.indexOf('관리자', index + 1);
  }
  return false;
}
