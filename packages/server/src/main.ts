import express, { type Express } from 'express';

/**
 * Express 앱을 만든다. 리스너를 열지 않는다.
 *
 * 프로세스를 띄우는 일과 앱을 만드는 일을 나눠 두는 이유는, 뒤 Task 가
 * 서버를 실제로 띄우지 않고도 라우트를 시험할 수 있어야 하기 때문이다.
 * 이 분리를 나중에 하려면 진입점을 쓰는 자리를 전부 고쳐야 한다.
 */
export function createApp(): Express {
  return express();
}

/**
 * 운영 진입점. 정적 산출물과 API 를 **한 프로세스**가 같은 오리진에 올린다
 * (`OPS-ARCH-001`). 별도의 프론트엔드 서버를 두지 않는다.
 */
export function startServer(port: number): ReturnType<Express['listen']> {
  return createApp().listen(port);
}

// `node main.js` 로 직접 실행될 때만 리스너를 연다 — import 시에는 열지 않는다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = Number(process.env.PORT ?? 3400);
  startServer(port);
}
