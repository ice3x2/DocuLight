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
    // 가상화 부품(`react-arborist` · `@tanstack/react-virtual`)이 창을
    // 잴 수 있게 한다. happy-dom 은 레이아웃을 하지 않아 크기가 전부 0 이고,
    // 그러면 두 부품이 아무 줄도 그리지 않아 시험이 제품을 관측하지 못한다.
    setupFiles: ['./test/setup.ts'],
    /**
     * 항 하나의 제한 시간. vitest 기본값은 5초다.
     *
     * **부하가 실패를 만드는 것을 막는다.** 이 패키지의 무거운 항들은
     * `userEvent` 로 모달을 열고 닫는데 단독 실행에서 이미 초 단위이고,
     * 기본 5초 경계에 붙어 있어 시험 파일이 하나 늘자 병렬 경합이 그것을
     * 넘겼다(2026-08-28 실측: 세 항이 단독 통과·전체 실패, 재실행에도 같은
     * 항이 재현). 게다가 타임아웃은 그 항 하나로 끝나지 않는다 — `cleanup`
     * 이 돌지 못해 남은 DOM 이 다음 항의 조회를 「여럿 찾음」으로 깨뜨려
     * 연쇄한다. 그 연쇄가 실제로 관측된 실패의 절반이었다.
     *
     * 재는 것을 바꾸지 않고 창만 넓힌다 — 이 시험들이 재는 것은 화면이
     * 무엇을 담는가이지 그것이 몇 초 안에 그려지는가가 아니다.
     */
    testTimeout: 20_000,
  },
  };
});
