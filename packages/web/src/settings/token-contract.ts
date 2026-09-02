/**
 * 개인 액세스 토큰 화면의 **고정 열거들** (`SEC-AUTH-006` · `SEC-AUTH-008`).
 *
 * 서버의 `domain/auth/token-expiry.ts` · `domain/auth/token-scope.ts` 와 같은
 * 값을 든다. 두 패키지는 서로를 import 하지 못하므로(`CON-ARCH-003`) 값이
 * 두 벌 존재하는 것이 불가피하고, 그래서 **갈리는 것을 시험이 잡는다**
 * (`test/token-panel.test.tsx`) — 갈리면 화면이 서버가 거절할 값을 내밀고,
 * 사용자에게는 「발급을 눌렀는데 400」으로만 보인다.
 */

/** PAT 스코프 (`SEC-AUTH-008` AC-1). 둘뿐이다. */
export type TokenScope = 'read-only' | 'read-write';

/**
 * 고르지 않았을 때의 스코프 (`04` §2.3 — 설계자 판단, fail-closed).
 *
 * `SEC-AUTH-008` 은 스코프가 **상한만 낮춘다**고 규정한다. 그러면 고르지
 * 않은 사람에게 돌아가야 하는 것은 가장 낮은 상한이다 — 넓은 쪽이 기본이면
 * 아무 생각 없이 발급한 토큰이 쓰기 상한을 갖는다.
 *
 * **값을 여기 한 자리에만 둔다.** 발급 폼은 이 기본값을 두 번 쓴다(첫 렌더와
 * 폼을 다시 열 때). 두 자리에 각각 적으면 한쪽만 고쳐지고, 그러면 「처음
 * 열었을 때는 좁은데 다시 열면 넓은」 화면이 된다.
 */
export const DEFAULT_TOKEN_SCOPE: TokenScope = 'read-only';

/**
 * 스코프의 표시 이름.
 *
 * 목록과 발급 폼이 **같은 표를 읽는다** — 따로 적으면 한 화면은 `읽기+쓰기`
 * 를, 다른 화면은 `읽기 + 쓰기` 를 써서 같은 값이 둘로 보인다.
 */
export const SCOPE_LABELS: Readonly<Record<TokenScope, string>> = {
  'read-only': '읽기 전용',
  'read-write': '읽기+쓰기',
};

/** 고를 수 있는 만료 기간. 서버가 이 밖의 값을 400 으로 거절한다. */
export const TOKEN_EXPIRY_CHOICES: readonly number[] = [30, 90, 180, 365];

export const DEFAULT_TOKEN_EXPIRY_DAYS = 90;

/**
 * 목록 한 행. **평문 칸이 없다** (`SEC-AUTH-006` AC-2).
 *
 * 서버의 `TokenRecord` 를 그대로 받되 `userId` 는 빼 둔다 — 이 목록은 본인
 * 것만 오므로 그 값이 화면에서 아무것도 가르지 않는다.
 */
export interface TokenRowView {
  id: string;
  name: string;
  scope: TokenScope;
  expiresAt: string;
  /** 아직 쓴 적 없으면 `null` — 화면은 `사용 안 함` 으로 그린다. */
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** 발급 요청. **`owner` 가 없다** — 대상은 언제나 세션의 주인이다. */
export interface TokenIssueInput {
  name: string;
  scope: TokenScope;
  expiresInDays: number;
}
