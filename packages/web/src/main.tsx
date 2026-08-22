import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { App } from './App.js';

const container = document.getElementById('root');
if (!container) {
  // 마운트 지점 부재는 index.html 이 깨진 경우뿐이라 복구할 수 있는 상태가 아니다.
  throw new Error('#root not found in document');
}

// 요청자는 `App` 이 세션에서 받아 온다 — 여기서 임시값을 만들어 넘기면
// 그 값이 서버의 답과 갈리는 순간을 아무도 알아채지 못한다.
/**
 * 서버 상태의 단일 클라이언트 (`CON-ARCH-004` AC-5).
 *
 * 창을 다시 볼 때마다 다시 받지 않는다 — 문서를 편집하다 탭을 옮겼다
 * 돌아오면 트리가 새로 오면서 열린 문서의 자리가 흔들린다.
 */
const queries = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queries}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
