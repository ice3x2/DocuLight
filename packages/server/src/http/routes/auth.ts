import express, { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import {
  authenticateSession,
  logIn,
  logOut,
  type AuthStores,
} from '../../app/auth/login-service.js';

/** 세션 쿠키의 이름. 두 곳에 적으면 한쪽 오타가 조용히 로그아웃을 무력화한다. */
export const SESSION_COOKIE = 'doculight_session';

/**
 * 한 창(window) 동안 허용하는 로그인 시도 수 (`SEC-AUTH-001` AC-3).
 *
 * 요구가 임계값을 정하지 않았으므로 선택의 근거를 적는다 — 사람이 오타를
 * 내는 횟수보다 넉넉하고 무차별 대입에는 턱없이 모자란 값이다.
 */
export const LOGIN_ATTEMPTS_PER_WINDOW = 10;

const WINDOW_MS = 15 * 60 * 1000;

/**
 * 인증 라우트.
 *
 * 세션 토큰은 **쿠키로만** 나간다. 응답 본문에 실으면 `HttpOnly` 가
 * 무의미해진다 — 스크립트가 읽지 못하게 하려고 그 속성을 붙이는데,
 * 본문에 있으면 그냥 읽힌다.
 */
export function authRouter(stores: AuthStores): Router {
  const router = Router();
  router.use(express.json());

  // rate limit 은 **소스 IP 별**이다 (`SEC-AUTH-001` AC-4 · AC-5).
  // 전역 단일 카운터를 쓰면 한 사람의 오타가 전 사용자를 잠근다 — 그것은
  // 방어가 아니라 서비스 거부다.
  const limiter = rateLimit({
    windowMs: WINDOW_MS,
    limit: LOGIN_ATTEMPTS_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // 프록시 뒤를 전제한다. `x-forwarded-for` 가 없으면 소켓 주소를 쓴다.
      const forwarded = req.headers['x-forwarded-for'];
      const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
      return loginRateKey(first ?? req.ip ?? req.socket.remoteAddress);
    },
    // 이 검사는 keyGenerator **본문**에서 `ipKeyGenerator` 호출을 찾는다.
    // 우리 것은 `loginRateKey` 안에서 부르므로 그 눈에 안 잡힐 뿐, IPv6 는
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
/**
 * 로그인 제한의 열쇠 (`SEC-AUTH-013`).
 *
 * IPv6 는 **`/64` 단위로 묶는다.** 한 사용자에게 그 블록이 통째로 배정되는
 * 것이 보통이라, 주소마다 열쇠를 나누면 그 안에서 주소를 돌리는 것만으로
 * 제한이 무력화된다. 반대로 전부 묶으면 한 사람이 같은 대역의 모두를
 * 잠글 수 있으므로 `/64` 보다 넓히지 않는다.
 *
 * 주소를 못 읽으면 **하나로 묶는다** — 못 읽는 것을 무제한으로 두면
 * 그것이 곧 우회로가 된다.
 */
export function loginRateKey(address: string | undefined): string {
  const trimmed = address?.trim();
  if (trimmed === undefined || trimmed === '') return 'unknown';

  // IPv4 는 주소 그대로다 — 한 주소가 대개 한 사용자다.
  if (!trimmed.includes(':')) return trimmed;

  // IPv6 는 라이브러리가 주는 `/64` 정규화를 쓴다. 직접 자르면 압축
  // 표기(`::`)와 IPv4 사상 주소(`::ffff:…`)에서 같은 주소가 두 열쇠로
  // 갈리고, 그 갈림이 곧 우회로가 된다.
  return ipKeyGenerator(trimmed);
}

export function sessionTokenOf(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}
