import { hasDotSegment } from '../../domain/naming/hidden-name-rule.js';
import type { AuditSink } from '../../domain/ports/audit-sink.js';
import type { DocumentStore } from '../../domain/ports/document-store.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRepository } from '../../domain/ports/node-repository.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';

/**
 * 파일시스템과 DB 의 전체 재조정 (`REL-STORAGE-001` · `R77`).
 *
 * 서버가 정지한 동안 일어난 파일시스템 변경은 아무도 관측하지 못한다.
 * 이 절차가 그 간극을 메운다 — 등록되지 않은 파일은 노드로 세우고, 대응
 * 파일이 사라진 노드는 **지우지 않고** tombstone 으로 표시한다.
 */

/** 행위자 이름. 사람이 한 일이 아니라는 것을 감사 로그에서 구별할 수 있어야 한다. */
const RECONCILER = 'system:reconciler';

/**
 * 주기 재조정 간격.
 *
 * 원장이 구체값을 정하지 않았다. 5분으로 둔 근거 — 큰 볼트에서 전체
 * 스캔이 도는 비용을 감당할 만큼 길고, 서버 밖에서 파일을 만진 사람이
 * 자리를 뜨기 전에 대기열에서 그 사실을 볼 만큼 짧다.
 *
 * 런타임에 바꿀 수 있는 설정의 단일 저장소는 DB 다(`DR-SHELL-001`).
 * 그 저장소가 서면 이 값은 그쪽으로 옮겨간다 — 기동 설정에 두면 DB 를
 * 열기 전에 알 필요가 없는 값이 부트 설정에 섞인다.
 */
export const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

export interface ReconciliationStores {
  nodes: NodeRepository;
  workspaces: WorkspaceRepository;
  documents: DocumentStore;
  audit: AuditSink;
  queue: FindingQueue;
}

export interface ReconciliationResult {
  /** 디스크에만 있어 새로 세운 **파일** 노드. */
  created: NodeId[];
  /** 대응 파일이 사라져 tombstone 으로 표시한 노드. */
  orphaned: NodeId[];
}

export async function reconcile(stores: ReconciliationStores): Promise<ReconciliationResult> {
  const result: ReconciliationResult = { created: [], orphaned: [] };

  for (const workspace of stores.workspaces.list()) {
    await reconcileWorkspace(stores, workspace.id, result);
  }
  return result;
}

async function reconcileWorkspace(
  stores: ReconciliationStores,
  workspaceId: string,
  result: ReconciliationResult,
): Promise<void> {
  const { nodes, documents } = stores;

  // 점으로 시작하는 세그먼트는 등재하지 않는다. 사이드카와 `.obsidian` 은
  // 제품·도구가 쓰는 예약 자리이고, 노드로 만들면 숨김 규칙이 낸 자리에
  // 트리 항목이 들어앉는다(`SEC-STORAGE-004`).
  const onDisk = (await documents.list(workspaceId)).filter((path) => !hasDotSegment(path));

  const known = new Map(nodes.allIn(workspaceId).map((node) => [nodes.pathOf(node.id), node]));

  for (const path of onDisk) {
    if (known.has(path)) {
      continue;
    }
    const id = ensurePath(stores, workspaceId, path, known);
    result.created.push(id);
  }

  const alive = new Set(onDisk);
  for (const [path, node] of known) {
    // 디렉토리는 파일 경로에서 파생되므로 따로 세지 않는다. 세면 빈
    // 디렉토리가 매 회차마다 사라진 것으로 읽힌다.
    if (node.kind !== 'file' || alive.has(path) || node.orphanedAt !== null) {
      continue;
    }
    const at = new Date().toISOString();
    nodes.markOrphaned(node.id, at);
    record(stores, 'orphan', node.id, 'missing-file');
    result.orphaned.push(node.id);
  }
}

/**
 * 경로의 모든 단계를 세운다. 중간 디렉토리가 서지 않으면 파일 노드가
 * 부모 없이 떠서 ACL 상속의 출발점 자체가 없어진다.
 *
 * @returns 마지막 단계(파일)의 노드 ID.
 */
function ensurePath(
  stores: ReconciliationStores,
  workspaceId: string,
  path: string,
  known: Map<string, { id: NodeId }>,
): NodeId {
  const segments = path.split('/');
  let parentId: NodeId | null = null;
  let walked = '';

  segments.forEach((name, index) => {
    walked = walked === '' ? name : `${walked}/${name}`;
    const existing = known.get(walked);
    if (existing !== undefined) {
      parentId = existing.id;
      return;
    }

    const isLeaf = index === segments.length - 1;
    const id = stores.nodes.create({
      workspaceId,
      parentId,
      kind: isLeaf ? 'file' : 'directory',
      name,
    });
    known.set(walked, { id });
    // 발견은 **사실**이므로 감사 로그가 먼저다. 대기열은 그 행을 참조한다
    // (`R139` — 같은 사실을 두 곳에 적지 않는다).
    record(stores, 'create', id, 'unregistered-file');
    parentId = id;
  });

  return parentId!;
}

function record(
  stores: ReconciliationStores,
  operation: 'create' | 'orphan',
  nodeId: NodeId,
  type: string,
): void {
  const auditId = stores.audit.append({ operation, actor: RECONCILER, nodeId });
  stores.queue.open({ type, auditRefs: [auditId] });
}

export interface ReconciliationLoop {
  /**
   * 다음 회차를 막고 **돌고 있는 회차가 끝날 때까지 기다린다.**
   *
   * 기다리지 않으면 종료 절차가 DB 를 닫은 뒤에 그 회차의 쓰기가 도착한다.
   */
  stop(): Promise<void>;
}

/**
 * 기동 시 1회 돌고 그 뒤 주기적으로 반복한다 (`AC-4`).
 *
 * 첫 회차를 `setTimeout(0)` 으로 미루는 이유는 기동 경로를 막지 않기
 * 위해서다 — 큰 볼트의 전체 스캔이 리스너를 여는 것보다 앞서면 서버가
 * 스캔이 끝날 때까지 요청을 받지 못한다.
 */
export function startReconciliationLoop(
  stores: ReconciliationStores,
  options: {
    intervalMs?: number;
    onRun?: (result: ReconciliationResult) => void;
  } = {},
): ReconciliationLoop {
  let stopped = false;
  let inFlight: Promise<void> | undefined;

  const once = async () => {
    const result = await reconcile(stores);
    // 멈춘 뒤에는 알리지 않는다 — 종료 절차가 이미 자원을 닫았을 수 있다.
    if (!stopped) {
      options.onRun?.(result);
    }
  };

  const run = () => {
    // 앞 회차가 아직 돌고 있으면 건너뛴다. 큰 볼트에서 한 회차가 간격보다
    // 오래 걸리면 회차가 겹쳐 쌓이고, 겹친 둘이 같은 미등록 파일을 각각
    // 노드로 세워 중복이 생긴다.
    if (stopped || inFlight !== undefined) {
      return;
    }
    inFlight = once().finally(() => {
      inFlight = undefined;
    });
  };

  const first = setTimeout(run, 0);
  const timer = setInterval(run, options.intervalMs ?? RECONCILE_INTERVAL_MS);

  return {
    async stop() {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      await inFlight;
    },
  };
}
