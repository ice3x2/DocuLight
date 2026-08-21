import { join } from 'node:path';

import express, { type Express, type RequestHandler } from 'express';

/**
 * SPA 정적 산출물 서빙 (`OPS-ARCH-001` AC-1).
 *
 * `packages/web` 의 빌드 결과를 같은 프로세스가 올린다. 별도의 프론트엔드
 * 서버를 두지 않으므로 프론트와 API 가 같은 오리진이 되고, 그래서 CORS
 * 설정이 어느 쪽에도 필요하지 않다(`AC-3`).
 */

/** API 라우트의 접두 경로. SPA fallback 이 이 아래를 건드리지 않는다. */
export const API_PREFIX = '/api';

/** 클라이언트 라우터가 처리해야 하는 경로인가. */
function isClientRoute(path: string): boolean {
  // ① API 는 클라이언트 라우트가 아니다. 되돌리면 없는 API 호출이 HTML 을
  //    받아 클라이언트가 JSON 파싱에서 터진다.
  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) {
    return false;
  }
  // ② 확장자가 붙은 경로는 자산 요청이다. 없는 자산을 셸로 되돌리면
  //    깨진 스크립트 태그가 HTML 을 받아 원인이 감춰진다.
  const last = path.slice(path.lastIndexOf('/') + 1);
  return !last.includes('.');
}

/**
 * 정적 파일과 SPA fallback 을 붙인다.
 *
 * **API 라우트보다 뒤에 붙여야 한다** — fallback 이 먼저 서면 API 요청이
 * 라우트에 닿기 전에 셸을 받는다.
 */
export function mountStaticSpa(app: Express, webRoot: string): void {
  app.use(express.static(webRoot, { index: 'index.html' }));

  const shell: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' || !isClientRoute(req.path)) {
      next();
      return;
    }
    res.sendFile(join(webRoot, 'index.html'));
  };

  app.use(shell);
}
