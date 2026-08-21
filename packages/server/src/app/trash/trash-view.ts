import type { Actor } from '../acl/permission-service.js';
import { visibleWorkspacesOf } from '../acl/permission-service.js';
import { canPurge, listTrash, type TrashStores } from './trash-service.js';

/**
 * 목록 범위 (`FR-SHELL-007` AC-5).
 *
 * `all` 은 **요청**이지 권한이 아니다 — 관리 권한이 없는 워크스페이스에서
 * `all` 을 달라고 해도 본인 것만 온다. 토글이 권한을 대신하면 그것이 곧
 * 우회 경로가 된다.
 */
export type TrashScope = 'mine' | 'all';

export interface TrashRow {
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  originalPath: string;
  deletedAt: string;
  deletedBy: string;
  /** 이 행의 영구 삭제 버튼을 그릴 것인가 (`SEC-SHELL-001`). */
  canPurge: boolean;
}

export interface TrashViewOptions {
  /** 주면 그 워크스페이스로 좁힌다 (`FR-SHELL-007` AC-4). */
  workspaceId?: string;
  scope?: TrashScope;
}

/**
 * 접근 가능한 전 워크스페이스의 휴지통을 하나의 목록으로 (`FR-SHELL-007`).
 *
 * 권한의 바닥은 `listTrash` 가 소유한다 — 여기서는 그 결과를 **좁히기만**
 * 한다. 좁히는 것은 언제나 안전하지만, 여기서 다시 넓히면 두 곳이 권한을
 * 판정하게 되고 한쪽만 규칙이 바뀐다.
 *
 * 판정은 행마다 **그 행의 워크스페이스**를 기준으로 한다(`SEC-SHELL-001`
 * AC-3) — 한 목록 안에 영구 삭제가 열린 행과 닫힌 행이 함께 선다.
 */
export function trashView(
  stores: TrashStores,
  actor: Actor,
  { workspaceId, scope = 'mine' }: TrashViewOptions = {},
): TrashRow[] {
  const workspaces = visibleWorkspacesOf(stores, actor).filter(
    (entry) => workspaceId === undefined || entry.workspace.id === workspaceId,
  );

  return workspaces.flatMap((entry) => {
    const listed = listTrash(stores, actor, entry.workspace.id);
    if (!listed.ok) return [];

    const rows = scope === 'all' ? listed.entries : listed.entries.filter((e) => e.deletedBy === actor.id);

    return rows.map((e) => ({
      nodeId: e.nodeId,
      workspaceId: e.workspaceId,
      workspaceName: entry.workspace.name,
      originalPath: e.originalPath,
      deletedAt: e.deletedAt,
      deletedBy: e.deletedBy,
      canPurge: canPurge(stores, actor, e),
    }));
  });
}
