import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import type { Viewer } from './shell/shell-contract.js';

const container = document.getElementById('root');
if (!container) {
  // 마운트 지점 부재는 index.html 이 깨진 경우뿐이라 복구할 수 있는 상태가 아니다.
  throw new Error('#root not found in document');
}

/**
 * 서버가 세션을 돌려주기 전까지의 요청자 — **최소 권한**이다.
 *
 * 넉넉하게 잡으면 서버가 거절할 카테고리가 먼저 화면에 서고, 사용자는
 * 그것을 고장으로 읽는다. 반대로 좁게 잡으면 세션이 오는 순간 열린다.
 */
const UNKNOWN_VIEWER: Viewer = { superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 };

createRoot(container).render(
  <StrictMode>
    <App viewer={UNKNOWN_VIEWER} />
  </StrictMode>,
);
