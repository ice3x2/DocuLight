import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 에디터 패키지는 독립 실행된다 — 백엔드 없이 `npm run dev` 만으로
// 브라우저에서 확인할 수 있어야 한다. 편집기 동작을 서버·DB 없이 재는 것이
// 목적이고, 그렇지 않으면 편집 결함과 서버 결함이 한 화면에서 섞인다.
//
// 연구 기록(`docs/research/editor/`)을 근거로 인용하지 않는다 — 그 디렉토리는
// 스스로 「요구사항 원장이 아니다」라고 적었고(`00.index.md`), 설정이 그것을
// 근거로 삼으면 `docs/spec` 밖 문서가 규범이 된다(`CON-ARCH-007` AC-2).
export default defineConfig({
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
});
