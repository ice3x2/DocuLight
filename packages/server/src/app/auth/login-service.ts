import { blockedReason, canAuthenticate } from '../../domain/auth/account-gate.js';
import { hashSecretToken, newSecretToken } from '../../domain/auth/secret-token.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { SessionRepository } from '../../domain/ports/session-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/**
 * 지금 시각을 주는 함수. **저장소 옆에 둔다.**
 *
 * `new Date()` 를 코드 안에서 부르면 만료를 재는 시험이 실제 시각을
 * 기다려야 하고, 그러면 그 시험은 느리거나 불안정하거나 둘 다가 된다
 * (§10.3 — 테스트가 시계를 필요로 하면 경계가 잘못 그어진 것이다).
 */
export type Clock = () => Date;

export interface AuthStores {
  principals: PrincipalRepository;
  sessions: SessionRepository;
  passwords: PasswordHasher;
  clock: Clock;
}

/**
 * 세션 수명. 요구가 이 값을 정하지 않았으므로 선택의 근거를 적는다 —
 * 만료가 없으면 브라우저에 남은 쿠키가 영구 자격증명이 되고, 너무 짧으면
 * 작업 도중 로그아웃된다.
 */
const SESSION_HOURS = 12;

export type LoginOutcome =
  | { ok: true; sessionToken: string; userId: PrincipalId }
  | { ok: false; reason: string };

/**
 * 자격증명이 맞지 않을 때의 답.
 *
 * 없는 계정과 틀린 비밀번호가 **같은 값**을 받는다 — 사유가 갈리면 그
 * 차이가 계정 존재 여부를 알려주는 오라클이 된다. 상태 차단(`FR-AUTH-001`)
 * 은 다르다: 그 세 문구는 자기 계정을 만든 본인에게 자기 처지를 알려주는
 * 것이라 숨길 이유가 없다.
 */
const WRONG_CREDENTIALS = {
  ok: false,
  reason: '이름 또는 비밀번호가 올바르지 않습니다',
} as const satisfies LoginOutcome;

export async function logIn(
  stores: AuthStores,
  input: { name: string; password: string },
): Promise<LoginOutcome> {
  const account = stores.principals.list('user').find((p) => p.name === input.name);
  const stored = account === undefined ? undefined : stores.principals.passwordHashOf(account.id);

  // 계정이 없어도 **해시 대조를 건너뛰지 않는다.** 건너뛰면 없는 계정의
  // 응답이 bcrypt 한 번만큼 빨라져 그 차이가 존재 여부를 알려준다.
  const verified = await stores.passwords.verify(input.password, stored ?? '');
  if (account === undefined || stored === null || stored === undefined || !verified) {
    return WRONG_CREDENTIALS;
  }

  // 상태 게이트는 비밀번호 **뒤에** 온다 — 앞에 두면 비밀번호를 모르는
  // 사람이 그 계정의 상태를 알아낼 수 있다.
  if (!canAuthenticate(account.status)) {
    return { ok: false, reason: blockedReason(account.status) ?? WRONG_CREDENTIALS.reason };
  }

  const token = newSecretToken();
  const now = stores.clock();
  stores.sessions.create(hashSecretToken(token), {
    userId: account.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString(),
  });

  return { ok: true, sessionToken: token, userId: account.id };
}

/**
 * 세션 토큰으로 주체를 세운다. 없거나 만료됐거나 계정이 닫혔으면
 * `undefined`.
 *
 * **상태를 매번 다시 본다** (`SEC-AUTH-002` AC-3, `SEC-AUTH-009` AC-4).
 * 세션에 그 값을 담아 두면 계정을 정지시켜도 이미 발급된 세션이 살아
 * 남는다 — 무효화가 토큰에 담긴 값이 아니라 요청 시점 조회로 판정되는
 * 것이 그 요구의 내용이다.
 */
export function authenticateSession(
  stores: AuthStores,
  token: string,
): { userId: PrincipalId } | undefined {
  const session = stores.sessions.find(hashSecretToken(token));
  if (session === undefined) return undefined;

  if (new Date(session.expiresAt).getTime() <= stores.clock().getTime()) return undefined;

  const account = stores.principals.findById(session.userId);
  if (account === undefined || !canAuthenticate(account.status)) return undefined;

  return { userId: session.userId };
}

/**
 * 이 세션 하나를 끊는다 (`SEC-AUTH-019`).
 *
 * 그 사용자의 다른 세션은 건드리지 않는다(AC-4) — 로그아웃은 「이
 * 브라우저에서 나간다」는 뜻이지 「모든 기기에서 나간다」가 아니다.
 */
export function logOut(stores: AuthStores, token: string): { ok: true } {
  stores.sessions.remove(hashSecretToken(token));
  return { ok: true };
}
