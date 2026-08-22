import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './styles/shell.css';

const container = document.getElementById('root');
if (!container) {
  // 마운트 지점 부재는 index.html 이 깨진 경우뿐이라 복구할 수 있는 상태가 아니다.
  throw new Error('#root not found in document');
}

// 요청자도 서버 상태 클라이언트도 `App` 이 소유한다 — 여기서 조립해
// 넘기면 앱을 세우는 자리마다 그 조립을 따라 적어야 하고, 하나를 빠뜨리면
// 그 자리에서만 캐시 없이 돈다.
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
