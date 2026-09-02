import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { rateKeyOf, LOGIN_ATTEMPTS_PER_WINDOW, RATE_WINDOW_MS } from '../rate-key.js';

import {
  authenticateSession,
  logIn,
  logOut,
  type AuthStores,
} from '../../app/auth/login-service.js';
import { changePassword } from '../../app/auth/password-service.js';
import type { TokenStores } from '../../app/auth/token-service.js';

/** 세션 쿠키의 이름. 두 곳에 적으면 한쪽 오타가 조용히 로그아웃을 무력화한다. */
export const SESSION_COOKIE = 'doculight_session';

/**
 * 인증 라우트.
 *
 * 세션 토큰은 **쿠키로만** 나간다. 응답 본문에 실으면 `HttpOnly` 가
 * 무의미해진다 — 스크립트가 읽지 못하게 하려고 그 속성을 붙이는데,
 * 본문에 있으면 그냥 읽힌다.
 *
 * **토큰 저장소까지 받는다.** 비밀번호 변경이 그 계정의 PAT 를 함께
 * 폐기하므로(원장 `G33` ①), 이 경계가 좁으면 그 조작이 닿을 자리 자체가
 * 없다.
 */
export function authRouter(stores: AuthStores & TokenStores): Router {
  const router = Router();

  // rate limit 은 **소스 IP 별**이다 (`SEC-AUTH-001` AC-4 · AC-5).
  // 전역 단일 카운터를 쓰면 한 사람의 오타가 전 사용자를 잠근다 — 그것은
  // 방어가 아니라 서비스 거부다.
  const limiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    limit: LOGIN_ATTEMPTS_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateKeyOf,
    // 이 검사는 keyGenerator **본문**에서 `ipKeyGenerator` 호출을 찾는다.
    // 우리 것은 `clientRateKey` 안에서 부르므로 그 눈에 안 잡힐 뿐, IPv6 는
    // 실제로 `/64` 로 묶인다 — 그 사실을 `composition.test.ts` 가 값으로
    // 확인한다. 로직을 여기 인라인하면 그 확인이 불가능해진다.
    validate: { keyGeneratorIpFallback: false },
  });

  router.post('/auth/login', limiter, async (req, res) => {
    const { name, password } = req.body as { name?: unknown; password?: unknown };
    if (typeof name !== 'string' || typeof password !== 'string') {
      res.sendStatus(400);
      return;
    }

    const outcome = await logIn(stores, { name, password });
    if (!outcome.ok) {
      // 사유는 본문에 담는다 — 상태별 안내(`FR-AUTH-001`)가 화면에 뜨려면
      // 그 값이 클라이언트에 닿아야 한다.
      res.status(401).json({ reason: outcome.reason });
      return;
    }

    res
      .cookie(SESSION_COOKIE, outcome.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        // `secure` 는 배포에서 켠다. 여기서 켜면 http 로 도는 개발·시험이
        // 쿠키를 받지 못해 로그인 자체를 확인할 수 없다.
        path: '/',
      })
      // 토큰을 본문에 싣지 않는다.
      .status(200)
      .json({ ok: true });
  });

  router.post('/auth/logout', (req, res) => {
    const token = sessionTokenOf(req.headers.cookie);
    if (token !== undefined) logOut(stores, token);

    res.clearCookie(SESSION_COOKIE, { path: '/' }).sendStatus(204);
  });

  /**
   * 자기 비밀번호를 바꾼다 (`SEC-AUTH-018`).
   *
   * **대상을 본문으로 받지 않는다.** 대상은 언제나 지금 로그인한 사람이며,
   * 그것이 「본인만」(AC-4)을 라우트 수준에서 성립시키는 방법이다 — 대상을
   * 받으면 서비스의 `self-only` 판정 하나에 전부를 걸게 된다.
   */
  router.post('/auth/password', async (req, res) => {
    const token = sessionTokenOf(req.headers.cookie);
    const session = token === undefined ? undefined : authenticateSession(stores, token);
    if (session === undefined) {
      res.sendStatus(401);
      return;
    }

    const { current, next } = req.body as { current?: unknown; next?: unknown };
    if (typeof current !== 'string' || typeof next !== 'string') {
      res.sendStatus(400);
      return;
    }

    const outcome = await changePassword(stores, session.userId, {
      actor: session.userId,
      current,
      next,
    });
    if (!outcome.ok) {
      // 사유를 담는다 — 화면이 「현재 비밀번호가 틀렸다」와 「빈 값이다」를
      // 갈라 안내해야 사용자가 무엇을 고칠지 안다. 필드 이름이 `rule` 인
      // 것은 이 값이 **코드**이기 때문이다 — 로그인의 `reason` 은 사람이
      // 읽는 문장이라, 한 이름에 두 종류를 실으면 화면이 그것을 가릴 수 없다.
      res.status(400).json({ rule: outcome.rule });
      return;
    }

    // 이 요청을 보낸 세션도 함께 끊겼다. 쿠키를 남겨 두면 브라우저가 죽은
    // 토큰을 계속 보내고, 사용자는 로그인 화면과 앱 화면 사이를 오간다.
    res.clearCookie(SESSION_COOKIE, { path: '/' }).sendStatus(204);
  });

  router.get('/auth/me', (req, res) => {
    const token = sessionTokenOf(req.headers.cookie);
    const session = token === undefined ? undefined : authenticateSession(stores, token);

    if (session === undefined) {
      res.sendStatus(401);
      return;
    }
    res.status(200).json({ userId: session.userId });
  });

  return router;
}

/**
 * 쿠키 헤더에서 세션 토큰을 꺼낸다.
 *
 * 직접 파싱하는 이유는 이 라우터가 읽는 쿠키가 하나뿐이기 때문이다 —
 * 파서를 들이면 그것이 앱 전역에 붙고, 다른 라우트가 쿠키를 읽기 시작한다.
 */
export function sessionTokenOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
