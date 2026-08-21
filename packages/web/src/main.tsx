import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) {
  // 마운트 지점 부재는 index.html 이 깨진 경우뿐이라 복구할 수 있는 상태가 아니다.
  throw new Error('#root not found in document');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
