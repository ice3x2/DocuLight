import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev 서버 포트는 3399 다 (C-09).
//
// dev 에서만 `/api` 를 Express 로 프록시한다. 운영에서는 한 Node 프로세스가
// 정적 산출물과 API 를 **같은 오리진**에 올리므로(`OPS-ARCH-001`) 이 프록시가
// 사라진다 — 그래서 CORS 설정이 어느 쪽에도 필요하지 않다.
const API_DEV_ORIGIN = process.env.DOCULIGHT_API_ORIGIN ?? 'http://localhost:3400';

export default defineConfig({
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
});
