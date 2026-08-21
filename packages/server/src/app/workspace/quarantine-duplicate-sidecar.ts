import { SYSTEM_RECONCILER, type AuditSink } from '../../domain/ports/audit-sink.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import {
  DUPLICATE_SIDECAR_FINDING,
  QUARANTINE_OPERATION,
} from '../../domain/workspace/quarantine.js';
import type { WorkspaceId } from '../../domain/workspace/workspace.js';

export {
  DUPLICATE_SIDECAR_FINDING,
  QUARANTINE_DIRECTORY,
  QUARANTINE_OPERATION,
} from '../../domain/workspace/quarantine.js';

/**
 * 자기 자리에 있지 않은 사이드카를 격리한다 (`DR-WORKSPACE-002` AC-5 · AC-6).
 *
 * `cp -r` 로 만든 백업 사본이 `docsRoot` 안에 남으면 같은 `id` 를 가진
 * 사이드카가 둘이 된다. 그대로 두면 DB 에 이중 등록되어, 어느 쪽이 정본인지
 * 아무도 알 수 없게 된다.
 *
 * **지우지 않고 옮긴다.** 사본과 원본을 자동으로 판별할 수 없으므로 사람이
 * 판단할 때까지 둘 다 남긴다.
 *
 * 순서가 규칙이다 — 감사 행이 먼저고 대기열이 그것을 참조한다. 뒤집으면
 * 참조 없는 항목이 생겨 시각·행위자의 유일한 출처가 사라진다(`R139`).
 */
export async function quarantineDuplicateSidecar(
  stores: { files: WorkspaceFiles; audit: AuditSink; queue: FindingQueue },
  directory: string,
  workspaceId: WorkspaceId,
): Promise<void> {
  await stores.files.quarantine(directory);

  const auditId = stores.audit.append({
    operation: QUARANTINE_OPERATION,
    actor: SYSTEM_RECONCILER,
    workspaceId,
  });
  stores.queue.open({ type: DUPLICATE_SIDECAR_FINDING, auditRefs: [auditId] });
}
