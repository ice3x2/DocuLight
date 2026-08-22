import express, { type Express, type RequestHandler, type Router } from 'express';

import { API_PREFIX, mountStaticSpa } from './static-spa.js';

export { API_PREFIX };

/**
 * HTTP 계층의 조립 지점 (`OPS-ARCH-001`).
 *
 * **CORS 미들웨어를 두지 않는다.** 프론트와 API 가 같은 오리진이므로
 * 붙일 이유가 없고, 붙이면 다른 오리진을 전제한 설정이 조용히 들어온다.
 *
 * 리스너를 열지 않는다 — 여는 일은 진입점이 한다. 나눠 두어야 라우트를
 * 포트 없이 시험할 수 있다.
 */
export interface HttpDeps {
  /** `packages/web` 빌드 산출물이 있는 디렉토리. */
  /** 정적 산출물의 자리. 생략하면 빌드 배치가 정한 곳이다. */
  webRoot?: string;
  /** `/api` 아래에 붙일 라우트. 없으면 API 는 전부 404 다. */
  api?: Router;

  /**
   * 모든 라우트보다 **앞에** 서는 관문. 설치 게이트가 여기 꽂힌다
   * (`SEC-AUTH-011`).
   *
   * `api` 안이 아니라 여기 두는 이유는 그 게이트가 정적 자산과 SPA
   * fallback 까지 덮어야 하기 때문이다 — API 만 막으면 설치 전에 앱 셸이
   * 그대로 뜬다.
   */
  gate?: RequestHandler;
}

export function createHttpServer(deps: HttpDeps): Express {
  const app = express();

  // 관문이 가장 앞이다. 뒤에 두면 그 사이에 낀 라우트가 열린 채 남는다.
  if (deps.gate !== undefined) {
    app.use(deps.gate);
  }

  // 순서가 규칙이다 — ① API 라우트 ② API 미매칭 404 ③ SPA fallback.
  //
  // ②가 없으면 없는 API 호출이 ③으로 흘러 앱 셸(HTML)을 받고, 클라이언트가
  // JSON 파싱에서 터진다. ③이 ①보다 앞서면 API 요청이 라우트에 닿지도
  // 못한다.
  if (deps.api !== undefined) {
    app.use(API_PREFIX, deps.api);
  }
  app.use(API_PREFIX, (_req, res) => {
    // 본문을 만들지 않는다 — 거부 응답의 형태는 `R94` 가 소유한다.
    res.sendStatus(404);
  });

  mountStaticSpa(app, deps.webRoot);
  return app;
}
