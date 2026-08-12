import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 에디터 패키지는 독립 실행된다 — 백엔드 없이 `npm run dev` 만으로
// 브라우저에서 확인할 수 있어야 한다 (docs/research/editor/03 §4).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    open: false,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}'],
  },
});
