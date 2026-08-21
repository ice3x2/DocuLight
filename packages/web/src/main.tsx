import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) {
  // 마운트 지점 부재는 index.html 이 깨진 경우뿐이라 복구할 수 있는 상태가 아니다.
  throw new Error('#root not found in document');
}

// 요청자는 `App` 이 세션에서 받아 온다 — 여기서 임시값을 만들어 넘기면
// 그 값이 서버의 답과 갈리는 순간을 아무도 알아채지 못한다.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
