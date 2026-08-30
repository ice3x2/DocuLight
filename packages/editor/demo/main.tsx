import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// 편집기 스타일은 진입점 하나로 얹는다 (`IR-EDITOR-001` AC-3) — 데모가
// 자기 목록을 따로 갖고 있으면 제품과 갈린다.
import '../src/styles/editor.css';
import './demo.css';

import App from './App';

// StrictMode 를 켠 채로 둔다 — 이중 마운트에서 CM 인스턴스가 중복 생성되지
// 않는지가 기능 요청서 수용기준 9 다. 데모가 그 상시 확인 수단이다.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
