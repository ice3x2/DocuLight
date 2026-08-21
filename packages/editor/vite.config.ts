import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 에디터 패키지는 독립 실행된다 — 백엔드 없이 `npm run dev` 만으로
// 브라우저에서 확인할 수 있어야 한다 (docs/research/editor/03 §4).
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
