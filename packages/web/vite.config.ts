import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev 서버 포트는 3399 다 (C-09).
//
// dev 에서만 `/api` 를 Express 로 프록시한다. 운영에서는 한 Node 프로세스가
// 정적 산출물과 API 를 **같은 오리진**에 올리므로(`OPS-ARCH-001`) 이 프록시가
// 사라진다 — 그래서 CORS 설정이 어느 쪽에도 필요하지 않다.

/**
 * 개발용 API 포트의 **정의 지점은 `packages/server/.env.development` 하나**다.
 *
 * 여기에 번호를 다시 적으면 서버 쪽을 바꿨을 때 프록시가 엉뚱한 자리를
 * 가리킨다. 그래서 적지 않고 그 파일에서 읽는다.
 */
function devApiPort(): string {
  const envFile = fileURLToPath(new URL('../server/.env.development', import.meta.url));
  const port = /^\s*PORT\s*=\s*(\d+)/m.exec(readFileSync(envFile, 'utf8'))?.[1];
  if (port === undefined) {
    throw new Error(`PORT is not defined in ${envFile}`);
  }
  return port;
}

const API_DEV_ORIGIN = process.env.DOCULIGHT_API_ORIGIN ?? `http://localhost:${devApiPort()}`;

export default defineConfig(({ mode }) => {
  // **테스트 결과가 셸의 환경변수에 좌우되면 안 된다.**
  //
  // vitest 는 `NODE_ENV` 가 비어 있을 때만 `test` 로 채운다. 이 저장소가
  // 도는 셸에는 `production` 이 박혀 있고, 그대로 두면 react 가 production
  // 조건으로 해석돼 `act` 가 `undefined` 가 된다 — `packages/editor` 가
  // 같은 이유로 같은 덮기를 갖는다.
  if (mode === 'test') {
    process.env.NODE_ENV = 'test';
  }

  return {
  plugins: [react()],
  server: {
    port: 3399,
    open: false,
    proxy: {
      '/api': {
        target: API_DEV_ORIGIN,
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
  };
});
