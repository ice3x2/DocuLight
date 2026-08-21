import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import type { WorkspaceId } from '../../domain/workspace/workspace.js';

export interface WorkspaceStores {
  workspaces: WorkspaceRepository;
  files: WorkspaceFiles;
}

export interface SidecarReconciliation {
  /** DB 값으로 파일을 다시 쓴 워크스페이스. */
  rewritten: WorkspaceId[];
  /** DB 에 레코드가 없어 파일에서 되살린 워크스페이스. */
  restored: WorkspaceId[];
}

/**
 * 사이드카와 DB 를 맞춘다 (`DR-WORKSPACE-002` · `R40-d`).
 *
 * **흐름은 한 방향이다.** DB → 파일 재작성이 기본이고, 파일 → DB 복원은
 * DB 에 레코드가 없을 때 하나뿐이다. 양방향 동기화로 만들면 `cp -r` 로
 * 만든 백업 사본이 정본 이름을 덮어쓴다.
 */
export async function reconcileWorkspaceSidecars({
  workspaces,
  files,
}: WorkspaceStores): Promise<SidecarReconciliation> {
  const result: SidecarReconciliation = { rewritten: [], restored: [] };

  for (const sidecar of await files.readAllSidecars()) {
    const known = workspaces.findById(sidecar.id);

    if (known === undefined) {
      // 유일한 역방향이다. 레코드가 없을 때만 파일을 믿는다.
      workspaces.restore(sidecar);
      result.restored.push(sidecar.id);
      continue;
    }

    await files.writeSidecar(known);
    result.rewritten.push(known.id);
  }

  return result;
}
