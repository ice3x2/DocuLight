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

  /**
   * 앞에 선 프록시의 홉 수 (`R57` · `R72-i`).
   *
   * **서버가 선언한다.** 선언하지 않으면 `req.ip` 는 소켓 주소이고
   * `x-forwarded-for` 는 무시된다 — 그 헤더는 클라이언트가 정하는 값이라,
   * 신뢰 없이 읽으면 요청마다 다른 값을 붙여 요청 제한이 사라진다.
   *
   * 기본이 **끔**인 이유가 그것이다: 프록시가 없는 배포에서 켜져 있으면
   * 제한이 무력화되고, 그 사실은 아무 데도 드러나지 않는다.
   */
  trustProxy?: number | string | boolean;
}

export function createHttpServer(deps: HttpDeps): Express {
  const app = express();

  // 프록시 신뢰는 **선언이 있을 때만** 선다. 없으면 Express 기본값
  // (`false`) 이 유지되어 `req.ip` 가 소켓 주소를 준다.
  if (deps.trustProxy !== undefined) app.set('trust proxy', deps.trustProxy);

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
