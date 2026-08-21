import type { AuditSink } from '../../domain/ports/audit-sink.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import type { WorkspaceId } from '../../domain/workspace/workspace.js';
import { quarantineDuplicateSidecar } from './quarantine-duplicate-sidecar.js';

/** 워크스페이스를 만들고 읽는 데 필요한 최소 묶음. */
export interface WorkspaceStores {
  workspaces: WorkspaceRepository;
  files: WorkspaceFiles;
}

/** 재조정은 발견을 남겨야 하므로 감사와 대기열이 더 필요하다. */
export interface WorkspaceReconciliationStores extends WorkspaceStores {
  audit: AuditSink;
  queue: FindingQueue;
}

export interface SidecarReconciliation {
  /** DB 값으로 파일을 다시 쓴 워크스페이스. */
  rewritten: WorkspaceId[];
  /** DB 에 레코드가 없어 파일에서 되살린 워크스페이스. */
  restored: WorkspaceId[];
  /** 자기 자리에 있지 않아 격리한 **디렉토리**. */
  quarantined: string[];
}

/**
 * 사이드카와 DB 를 맞춘다 (`DR-WORKSPACE-002` · `R40-d`).
 *
 * **흐름은 한 방향이다.** DB → 파일 재작성이 기본이고, 파일 → DB 복원은
 * DB 에 레코드가 없을 때 하나뿐이다. 양방향 동기화로 만들면 `cp -r` 로
 * 만든 백업 사본이 정본 이름을 덮어쓴다.
 *
 * **판정 기준은 자리다.** 사이드카는 자기 `id` 로 이름 붙은 디렉토리에
 * 있을 때만 권위를 갖는다(`R40-a` — 디렉토리명이 곧 ID). 어긋난 것은
 * 복원하지 않고 격리한다 — 복원하면 DB 에는 있는데 그 경로에는 아무것도
 * 없는 워크스페이스가 생기고, 같은 `id` 가 둘이면 이중 등록이 된다.
 */
export async function reconcileWorkspaceSidecars(
  stores: WorkspaceReconciliationStores,
): Promise<SidecarReconciliation> {
  const { workspaces, files } = stores;
  const result: SidecarReconciliation = { rewritten: [], restored: [], quarantined: [] };

  for (const { directory, workspace } of await files.readAllSidecars()) {
    if (directory !== workspace.id) {
      await quarantineDuplicateSidecar(stores, directory, workspace.id);
      result.quarantined.push(directory);
      continue;
    }

    const known = workspaces.findById(workspace.id);

    if (known === undefined) {
      // 유일한 역방향이다. 레코드가 없을 때만 파일을 믿는다.
      workspaces.restore(workspace);
      result.restored.push(workspace.id);
      continue;
    }

    await files.writeSidecar(known);
    result.rewritten.push(known.id);
  }

  return result;
}
