import { SYSTEM_RECONCILER, type AuditSink } from '../../domain/ports/audit-sink.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import {
  FINDING_TYPE,
  RECONCILE_OPERATION,
} from '../../domain/reconciliation/vocabulary.js';
import type { AddEvent, CorrelationVerdict, UnlinkEvent } from '../../domain/watch/correlation.js';

/**
 * 상관 판정을 노드·ACL·재조정 대기열에 반영한다 (`REL-STORAGE-002`).
 *
 * 판정 자체는 `domain/watch/correlation.ts` 가 소유한다 — 이 자리는 그
 * 판정이 **무엇을 바꾸는가**만 정한다.
 *
 * ACL 을 직접 옮기는 코드가 없다는 점에 주의하라. 권한은 노드에 붙어
 * 있으므로 **같은 노드를 살려 두면 저절로 따라가고, 새 노드를 세우면
 * 저절로 끊긴다.** 그것이 이 조항이 fail-closed 를 얻는 방식이다 — 이식을
 * 하지 않는 것이 곧 안전 쪽이고, 이식하는 코드를 두면 그 코드가 언제
 * 도는지를 매번 따져야 한다.
 */

export interface RelocationStores {
  nodes: NodeRepository;
  audit: AuditSink;
  queue: FindingQueue;
}

export interface RelocationResult {
  /** 같은 노드가 새 경로를 가졌다 (AC-1). */
  readonly relocated: readonly NodeId[];
  /** tombstone 이 된 노드 (AC-4). */
  readonly orphaned: readonly NodeId[];
  /** 새로 세운 노드 (AC-4). */
  readonly created: readonly NodeId[];
  /** 대기열에 연 항목 (AC-5). */
  readonly findings: readonly string[];
}

export function applyRelocation(
  stores: RelocationStores,
  workspaceId: string,
  verdict: CorrelationVerdict,
): RelocationResult {
  const relocated: NodeId[] = [];
  const orphaned: NodeId[] = [];
  const created: NodeId[] = [];
  const findings: string[] = [];

  // --- 인정된 이동 (AC-1)
  for (const one of verdict.moved) {
    moveTo(stores, workspaceId, one.unlink.nodeId, one.add.path);
    // 인정도 **추측**이었다는 사실을 남긴다. 남기지 않으면 나중에 오이식을
    // 조사할 때 어느 이동이 사람의 것이고 어느 것이 추측인지 가릴 수 없다.
    stores.audit.append({
      operation: RECONCILE_OPERATION.relocate,
      actor: SYSTEM_RECONCILER,
      nodeId: one.unlink.nodeId,
    });
    relocated.push(one.unlink.nodeId);
  }

  // --- 짝이 없던 사라짐
  for (const one of verdict.orphaned) {
    // **휴지통에 든 노드는 서버가 스스로 옮긴 것이다** (`REL-STORAGE-003`).
    // 삭제가 파일을 `.trash/<노드ID>/` 로 옮기므로 원래 자리에서는 사라지고,
    // 그 사라짐에는 짝이 없다 — 옮겨 간 자리가 숨은 이름이라 감시가 보지
    // 않기 때문이다. 그것을 고아로 표시하면 복구가 `trashedAt` 만 지우므로
    // 되살린 문서가 트리에는 서고 열리지 않는다. 사용자는 트리에 이름이
    // 있으니 잃어버린 줄도 모른다.
    //
    // 「서버가 옮긴 것은 감시가 따라가되 새로 만들지 않는다」와 같은 축의
    // 셋째 조각이다. 앞의 둘은 경로가 바뀌므로 노드가 그 경로를 이미 갖고
    // 있는지로 갈리지만, 휴지통은 노드 경로를 바꾸지 않아 그 규칙에
    // 걸리지 않는다.
    const node = stores.nodes.findById(one.nodeId);
    if (node !== undefined && node.trashedAt !== null) continue;

    const gone = markGone(stores, one);
    orphaned.push(gone.nodeId);
    findings.push(openFinding(stores, FINDING_TYPE.missingFile, [gone.auditId]));
  }

  // --- 짝이 없던 나타남
  for (const one of verdict.appeared) {
    const fresh = appear(stores, workspaceId, one);
    created.push(fresh.id);
    findings.push(openFinding(stores, FINDING_TYPE.unregisteredFile, [fresh.auditId]));
  }

  // --- 거절된 쌍 (AC-4 · AC-5)
  for (const one of verdict.rejected) {
    const gone = markGone(stores, one.unlink);
    const fresh = appear(stores, workspaceId, one.add);
    orphaned.push(gone.nodeId);
    created.push(fresh.id);
    // **두 감사 행을 한 항목으로 묶는다** (`R139-a`). 따로 열면 대기열을
    // 보는 사람이 그 둘이 같은 사건의 양면이라는 것을 알 수 없고, 수동
    // 연결(`R77-a`)의 대상이 무엇인지도 흐려진다.
    findings.push(
      openFinding(stores, FINDING_TYPE.correlationRejected, [gone.auditId, fresh.auditId]),
    );
  }

  return { relocated, orphaned, created, findings };
}

/** 노드를 그 경로로 옮긴다. 중간 디렉토리가 없으면 세운다. */
function moveTo(
  stores: RelocationStores,
  workspaceId: string,
  nodeId: NodeId,
  path: string,
): void {
  const segments = path.split('/');
  const name = segments.pop()!;
  const parentId = ensureDirectories(stores, workspaceId, segments);
  stores.nodes.relocate(nodeId, { parentId, name });
}

/**
 * 경로의 디렉토리 단계를 세우고 마지막 디렉토리를 돌려준다.
 *
 * 중간 단계가 서지 않으면 파일 노드가 부모 없이 떠서 ACL 상속의 출발점
 * 자체가 없어진다 — 재조정이 같은 이유로 같은 일을 한다.
 */
function ensureDirectories(
  stores: RelocationStores,
  workspaceId: string,
  segments: readonly string[],
): NodeId | null {
  let parentId: NodeId | null = null;
  for (const name of segments) {
    const found: NodeRecord | undefined = stores.nodes
      .children({ workspaceId, parentId })
      .find((one) => one.name === name && one.kind === 'directory');
    parentId =
      found?.id ?? stores.nodes.create({ workspaceId, parentId, kind: 'directory', name });
  }
  return parentId;
}

function markGone(
  stores: RelocationStores,
  unlink: UnlinkEvent,
): { nodeId: NodeId; auditId: string } {
  stores.nodes.markOrphaned(unlink.nodeId, new Date().toISOString());
  const auditId = stores.audit.append({
    operation: RECONCILE_OPERATION.orphan,
    actor: SYSTEM_RECONCILER,
    nodeId: unlink.nodeId,
  });
  return { nodeId: unlink.nodeId, auditId };
}

function appear(
  stores: RelocationStores,
  workspaceId: string,
  add: AddEvent,
): { id: NodeId; auditId: string } {
  const segments = add.path.split('/');
  const name = segments.pop()!;
  const parentId = ensureDirectories(stores, workspaceId, segments);
  // 상속을 유지한 채 선다. 옛 노드의 권한을 물려주지 **않는** 것이 이
  // 조항의 요점이며, 그것은 새 노드를 세우는 것만으로 이미 성립한다.
  const id = stores.nodes.create({ workspaceId, parentId, kind: 'file', name });
  const auditId = stores.audit.append({
    operation: RECONCILE_OPERATION.create,
    actor: SYSTEM_RECONCILER,
    nodeId: id,
  });
  return { id, auditId };
}

function openFinding(
  stores: RelocationStores,
  type: string,
  auditRefs: readonly string[],
): string {
  return stores.queue.open({ type, auditRefs });
}
