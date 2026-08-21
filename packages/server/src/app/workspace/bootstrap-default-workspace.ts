import type { Workspace } from '../../domain/workspace/workspace.js';
import { createWorkspace } from './create-workspace.js';
import type { WorkspaceStores } from './restore-from-sidecar.js';

/**
 * 최초 기동이 만드는 워크스페이스의 표시 이름 (`FR-WORKSPACE-006` AC-2).
 *
 * 1.0 이행 도구와 설치 마법사가 이 이름을 기대하므로 자리마다 적으면
 * 갈린다. 정의는 여기 하나다.
 */
export const DEFAULT_WORKSPACE_NAME = 'workspace';

/**
 * 워크스페이스가 하나도 없으면 기본 워크스페이스를 만든다
 * (`FR-WORKSPACE-006` · `R56`).
 *
 * **판정 기준은 개수다.** 이름이 `workspace` 인 것이 있는지로 판정하면
 * 사용자가 그것을 개명한 순간 매 기동마다 하나씩 늘어난다.
 *
 * 사이드카 재구성(`DR-WORKSPACE-002` AC-7)보다 **뒤에** 불러야 한다 —
 * 앞서 부르면 DB 만 비어 있는 재구성 상황에서 필요 없는 워크스페이스가
 * 하나 더 생긴다.
 *
 * @returns 만든 워크스페이스. 이미 있어 아무것도 하지 않았으면 `undefined`.
 */
export async function bootstrapDefaultWorkspace(
  stores: WorkspaceStores,
): Promise<Workspace | undefined> {
  if (stores.workspaces.list().length > 0) {
    return undefined;
  }
  // 레이아웃과 사이드카를 여기서 다시 만들지 않는다 — 생성 경로는 하나다.
  return createWorkspace(stores, DEFAULT_WORKSPACE_NAME);
}
