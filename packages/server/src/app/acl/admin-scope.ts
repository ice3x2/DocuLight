import { permissionOf, type AclStores, type Actor } from './permission-service.js';
import type { Workspace } from '../../domain/workspace/workspace.js';

/**
 * 요청자가 **관리하는** 워크스페이스들.
 *
 * 권한 관리 화면 셋 — 주체 축 회수 · 유효 권한 시뮬레이션 · 상속 끊김
 * 목록 — 이 모두 「어디까지가 내 범위인가」로 시작한다. 세 곳이 각자
 * 재면 한 곳만 고쳐지고 나머지가 조용히 어긋난다.
 *
 * **노드가 아니라 워크스페이스 단위로 잰다.** 노드 계층에는 관리를 부여할
 * 수 없으므로(`SEC-WORKSPACE-002`) 어떤 노드에서 관리를 갖는다는 것은 곧
 * 그 워크스페이스에서 관리를 갖는다는 뜻이고, 둘은 같은 판정이다. 노드마다
 * 되물으면 질의가 노드 수만큼 붙는다.
 *
 * 슈퍼유저에게는 전부가 담긴다 — 상방 게이트가 모든 워크스페이스에서
 * `admin` 을 내주기 때문이며, 그래서 「전 인스턴스」를 따로 표현할 분기가
 * 필요 없다.
 */
export function managedWorkspacesOf(stores: AclStores, actor: Actor): Workspace[] {
  return stores.workspaces.list().filter(
    (workspace) => permissionOf(stores, actor, workspace.id) === 'admin',
  );
}
