import { AppShell } from './shell/AppShell.js';
import type { Viewer } from './shell/shell-contract.js';

/**
 * 앱의 진입 컴포넌트.
 *
 * 셸 자체는 `AppShell` 이 소유한다 — 여기 두면 라우팅·인증 게이트가
 * 붙을 때 그것들이 셸 구조와 한 파일에서 얽힌다.
 */
export function App({ viewer }: { viewer: Viewer }) {
  return <AppShell viewer={viewer} />;
}
