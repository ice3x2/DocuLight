/**
 * PAT 만료 기간의 선택지 (`SEC-AUTH-006` AC-3).
 *
 * **원장이 이 값을 정하지 않았다.** `SEC-AUTH-006` 의 Implementation Notes 가
 * *「구현 단계에서 값을 정하되 정한 값을 기록하라」* 고 위임했고, 여기가 그
 * 값이다.
 *
 * **자유 정수를 받지 않고 열거로 받는다.** 받으면 `36500` 같은 값이 「만료
 * 없음」의 우회로가 되고, 그러면 AC-4(만료된 PAT 로는 인증이 성립하지
 * 않는다)가 사실상 사라진다. 이 저장소에서 만료는 **유일한 자동 무효화
 * 경로**다 — 폐기·계정 정지·비밀번호 변경(원장 `G33` ①)은 전부 사람이
 * 일으키는 것이라, 아무도 손대지 않은 토큰을 끊는 것은 만료뿐이다.
 *
 * `04` §2.3 의 발급 폼에 있는 `[ ] 만료 없음` 은 **구현하지 않는다.**
 * AC-3 이 「각 PAT 에 만료일이 기록된다」를 요구하므로 만료 없는 PAT 는 그
 * 조항과 부딪친다. 설계서와 요구가 어긋나는 자리이며, 요구를 따랐다.
 */
export const TOKEN_EXPIRY_CHOICES = [30, 90, 180, 365] as const;

export type TokenExpiryDays = (typeof TOKEN_EXPIRY_CHOICES)[number];

/**
 * 고르지 않았을 때의 기간.
 *
 * 30 이 아니라 90 인 이유는 이 토큰의 주 소비자가 MCP 자동화이기 때문이다
 * (`IR-AUTH-002`). 기본이 짧으면 재발급이 잦아지고, 그러면 사용자가 매번
 * 최댓값을 고르는 습관이 든다 — 기본값이 오히려 노출 창을 넓히는 쪽으로
 * 작동한다. 상한 365 는 그 습관이 들어도 1년을 넘지 않게 막는다.
 */
export const DEFAULT_TOKEN_EXPIRY_DAYS: TokenExpiryDays = 90;

/** 고를 수 있는 값인가. 아니면 라우트가 400 으로 거절한다. */
export function isTokenExpiryChoice(value: unknown): value is TokenExpiryDays {
  return TOKEN_EXPIRY_CHOICES.some((choice) => choice === value);
}
