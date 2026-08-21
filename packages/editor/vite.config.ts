import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 에디터 패키지는 독립 실행된다 — 백엔드 없이 `npm run dev` 만으로
// 브라우저에서 확인할 수 있어야 한다. 편집기 동작을 서버·DB 없이 재는 것이
// 목적이고, 그렇지 않으면 편집 결함과 서버 결함이 한 화면에서 섞인다.
//
// 연구 기록(`docs/research/editor/`)을 근거로 인용하지 않는다 — 그 디렉토리는
// 스스로 「요구사항 원장이 아니다」라고 적었고(`00.index.md`), 설정이 그것을
// 근거로 삼으면 `docs/spec` 밖 문서가 규범이 된다(`CON-ARCH-007` AC-2).
export default defineConfig(({ mode }) => {
  // **테스트 결과가 셸의 환경변수에 좌우되면 안 된다.**
  //
  // vitest 는 `NODE_ENV` 가 **비어 있을 때만** `test` 로 채운다. 셸에
  // `production` 이 박혀 있으면 react 가 production 조건으로 해석돼
  // `import { act } from 'react'` 가 `undefined` 가 되고, vendor 테스트
  // 39건이 `act is not a function` 으로 무더기로 깨진다 — 코드는 그대로인데
  // 어느 셸에서 돌렸는지가 통과 여부를 정한다.
  //
  // 빌드에는 손대지 않는다. 테스트 모드에서만 덮는다.
  if (mode === 'test') {
    process.env.NODE_ENV = 'test';
  }

  return {
  plugins: [react()],
  server: {
    port: 3399,
    open: false,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // vendor 드롭의 테스트도 수집한다. 초판은 `test/` 만 겨냥해
    // `src/vendor/atomic-editor/__tests__/` 가 한 번도 실행되지 않았다.
    include: ['test/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/vendor/atomic-editor/__tests__/setup.ts'],
  },
  };
});
