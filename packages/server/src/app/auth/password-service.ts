import type { PrincipalId } from '../../domain/principal/principal.js';
import type { AuthStores } from './login-service.js';
import { revokeToken, type TokenStores } from './token-service.js';

export type PasswordRule = 'self-only' | 'wrong-password' | 'empty-password' | 'unknown-account';

export type PasswordOutcome = { ok: true } | { ok: false; rule: PasswordRule };

/**
 * 자기 비밀번호를 바꾼다 (`SEC-AUTH-018`).
 *
 * **본인만이다** (AC-4). 슈퍼유저 예외를 두지 않는 이유는 그것이 곧 계정
 * 탈취 경로이기 때문이다 — 관리자가 남의 비밀번호를 바꿀 수 있으면 그
 * 계정으로 한 일이 누구의 일인지 갈린다. 계정을 못 쓰게 만드는 수단은
 * 이미 있다(`suspended` 전환).
 *
 * **현재 비밀번호를 요구한다.** 요구가 명시하지 않았지만, 없으면 탈취된
 * 세션 하나로 계정을 영구히 빼앗을 수 있다 — 세션은 12시간 뒤 만료되지만
 * 바뀐 비밀번호는 그렇지 않다.
 *
 * 성공하면 그 계정의 **모든 세션을 끊는다.** 비밀번호를 바꾸는 이유가
 * 대개 「누가 내 계정에 들어와 있다」이고, 세션을 남기면 그 사람이 그대로
 * 남는다.
 *
 * **살아 있던 PAT 도 함께 폐기한다** (원장 `G33` ①). 세션만 끊고 PAT 를
 * 남기는 것은 일관된 선택이 아니라 구멍이다 — PAT 발급은 현재 비밀번호를
 * 묻지 않으므로, 탈취된 세션 하나가 세션 일괄 종료를 그대로 살아 넘기는
 * 장기 자격으로 승격한다. 그 대가로 정상적인 비밀번호 교체가 MCP 자동화를
 * 함께 끊지만, 끊긴 사실이 즉시 드러나는 쪽을 침입자가 조용히 남는 쪽보다
 * 앞세운다.
 */
export async function changePassword(
  stores: AuthStores & TokenStores,
  target: PrincipalId,
  input: { actor: PrincipalId; current: string; next: string },
): Promise<PasswordOutcome> {
  if (input.actor !== target) return { ok: false, rule: 'self-only' };
  if (input.next.length === 0) return { ok: false, rule: 'empty-password' };

  const stored = stores.principals.passwordHashOf(target);
  if (stored === null) return { ok: false, rule: 'unknown-account' };

  if (!(await stores.passwords.verify(input.current, stored))) {
    return { ok: false, rule: 'wrong-password' };
  }

  stores.principals.setPasswordHash(target, await stores.passwords.hash(input.next));
  stores.sessions.removeAllFor(target);

  // 폐기를 여기서 새로 쓰지 않는다 — `revokeToken` 이 폐기 시각 기록과
  // `pat.revoke` 감사 1행을 이미 갖고 있고, 행위자와 소유자가 같아
  // `self-only` 관문을 그대로 지난다.
  //
  // **이미 폐기된 것은 거른다.** `listFor` 가 폐기된 것도 함께 돌려주므로,
  // 거르지 않으면 같은 토큰의 폐기 행이 감사에 겹쳐 쌓인다.
  for (const token of stores.tokens.listFor(target)) {
    if (token.revokedAt === null) revokeToken(stores, target, token.id);
  }

  return { ok: true };
}
