import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

// 편집기 화면의 스타일 (`IR-EDITOR-001`). 편집기는 자기 스타일을 진입점
// 하나로 내보내고, 그것을 얹는 것은 쓰는 쪽의 몫이다 — 얹지 않으면 데코레이션
// 클래스는 붙지만 규칙이 없어 태그가 칩으로 보이지 않고 수식이 두 벌 겹친다.
import '@doculight/editor/styles.css';
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
