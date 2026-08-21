import express, { type Express, type Router } from 'express';

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
  webRoot: string;
  /** `/api` 아래에 붙일 라우트. 없으면 API 는 전부 404 다. */
  api?: Router;
}

export function createHttpServer(deps: HttpDeps): Express {
  const app = express();

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
