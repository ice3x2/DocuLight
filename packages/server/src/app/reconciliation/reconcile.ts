import { hasDotSegment } from '../../domain/naming/hidden-name-rule.js';
import { SYSTEM_RECONCILER, type AuditSink } from '../../domain/ports/audit-sink.js';
import {
  FINDING_TYPE,
  RECONCILE_OPERATION,
  type FindingType,
  type ReconcileOperation,
} from '../../domain/reconciliation/vocabulary.js';
import type { DocumentStore } from '../../domain/ports/document-store.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import { reconcileWorkspaceSidecars } from '../workspace/restore-from-sidecar.js';

/**
 * 파일시스템과 DB 의 전체 재조정 (`REL-STORAGE-001` · `R77`).
 *
 * 서버가 정지한 동안 일어난 파일시스템 변경은 아무도 관측하지 못한다.
 * 이 절차가 그 간극을 메운다 — 등록되지 않은 파일은 노드로 세우고, 대응
 * 파일이 사라진 노드는 **지우지 않고** tombstone 으로 표시한다.
 */

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
  files: WorkspaceFiles;
  audit: AuditSink;
  queue: FindingQueue;
  /**
   * 한 워크스페이스의 반영을 통째로 묶는다 (`DR-STORAGE-002` AC-2).
   *
   * **선택 인자로 두지 않는다.** 없으면 원자성이 조용히 사라지고, 사라진
   * 사실은 회차가 도중에 죽는 날에야 드러난다 — 그때는 절반만 반영된
   * 상태가 이미 남아 있고 그 절반이 무엇인지 아무 기록에도 없다.
   *
   * 성능도 같은 처방에 걸린다. SQLite 는 트랜잭션 밖의 쓰기마다 디스크를
   * 동기화하므로, 1,300 개짜리 볼트의 첫 회차가 그 수만큼 동기화를 낸다.
   */
  transaction: <T>(fn: () => T) => T;
}

export interface ReconciliationResult {
  /** 디스크에만 있어 새로 세운 **파일** 노드. */
  created: NodeId[];
  /** 대응 파일이 사라져 tombstone 으로 표시한 노드. */
  orphaned: NodeId[];
  /** 파일이 돌아와 tombstone 을 푼 노드. */
  revived: NodeId[];
  /** 자기 자리에 있지 않아 격리한 워크스페이스 디렉토리. */
  quarantined: string[];
}

/**
 * 한 회차의 전체 재조정.
 *
 * **사이드카가 먼저다.** 워크스페이스 목록이 확정돼야 그 안의 파일을 볼 수
 * 있고, 사이드카 검사를 기동에만 두면 서버가 도는 중에 들어온 백업 사본이
 * 재기동 전까지 방치된다 — 그 사본 안의 파일은 어느 워크스페이스에도
 * 속하지 않아 스캔 대상조차 아니다.
 */
export async function reconcile(stores: ReconciliationStores): Promise<ReconciliationResult> {
  const sidecars = await reconcileWorkspaceSidecars(stores);
  const result: ReconciliationResult = {
    created: [],
    orphaned: [],
    revived: [],
    quarantined: sidecars.quarantined,
  };

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

  // **디스크 스캔을 먼저 끝낸다.** 트랜잭션 안에서 입출력을 기다리면 그
  // 시간만큼 DB 가 잠긴다 — 락을 쥔 채 I/O 하지 않는다는 규칙이 여기에도
  // 그대로 걸린다.

  // 점으로 시작하는 세그먼트는 등재하지 않는다. 사이드카와 `.obsidian` 은
  // 제품·도구가 쓰는 예약 자리이고, 노드로 만들면 숨김 규칙이 낸 자리에
  // 트리 항목이 들어앉는다(`SEC-STORAGE-004`).
  const onDisk = (await documents.list(workspaceId)).filter((path) => !hasDotSegment(path));

  // **여기부터 한 트랜잭션이다** (`DR-STORAGE-002` AC-2). 도중에 죽으면
  // 어느 것도 반영되지 않는다 — 절반만 반영된 상태가 남으면 다음 회차가
  // 그 절반 위에서 돌고, 그 절반이 무엇인지는 아무 기록에도 없다.
  stores.transaction(() => {
    // **경로를 한 번에 판다.** 노드마다 `pathOf` 를 부르면 그 수만큼 재귀
    // 질의가 돌아 큰 볼트에서 회차가 늘어진다 (`CON-ACL-001` AC-4).
    const paths = nodes.pathsIn(workspaceId);
    const known = new Map(
      nodes.allIn(workspaceId).map((node) => [paths.get(node.id) ?? '', node] as const),
    );

    // 한 회차가 낸 행들을 한 줄로 접는 상관 키 (`IR-AUDIT-003` AC-9) — 회차
    // 하나가 수십 건을 발견해도 뷰어에서는 조작 종류마다 한 줄이다.
    const correlationId = stores.audit.newCorrelation();

    for (const path of onDisk) {
      const existing = known.get(path);
      if (existing !== undefined) {
        // 사라졌던 파일이 돌아왔다. 새 노드로 대신하면 ID 가 바뀌어 그 노드
        // 앞으로 부여된 권한과 이력이 끊긴다 — 있던 노드를 되살린다.
        if (existing.orphanedAt !== null) {
          nodes.clearOrphan(existing.id);
          stores.audit.append({
            operation: RECONCILE_OPERATION.restore,
            actor: SYSTEM_RECONCILER,
            nodeId: existing.id,
            correlationId,
          });
          result.revived.push(existing.id);
        }
        continue;
      }
      const id = ensurePath(stores, workspaceId, path, known, correlationId);
      result.created.push(id);
    }

    const alive = new Set(onDisk);
    for (const [path, node] of known) {
      // 디렉토리는 파일 경로에서 파생되므로 따로 세지 않는다. 세면 빈
      // 디렉토리가 매 회차마다 사라진 것으로 읽힌다.
      //
      // **휴지통에 든 노드도 세지 않는다** (`REL-STORAGE-003`). 삭제가 파일을
      // `.trash/<노드ID>/` 로 옮기므로 원래 자리에서는 사라지는데, 서버가
      // 스스로 옮긴 것이라 소실이 아니다. 고아로 세면 복구가 `trashedAt` 만
      // 지우므로 되살린 문서가 트리에는 서고 열리지 않는다.
      if (
        node.kind !== 'file' ||
        alive.has(path) ||
        node.orphanedAt !== null ||
        node.trashedAt !== null
      ) {
        continue;
      }
      const at = new Date().toISOString();
      nodes.markOrphaned(node.id, at);
      record(stores, RECONCILE_OPERATION.orphan, node.id, FINDING_TYPE.missingFile, correlationId);
      result.orphaned.push(node.id);
    }
  });
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
  known: Map<string, NodeRecord>,
  correlationId: string,
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
    const kind = isLeaf ? 'file' : 'directory';
    const id = stores.nodes.create({ workspaceId, parentId, kind, name });
    // 방금 만든 것도 **완전한 레코드**로 넣는다. 절반만 채운 값을 넣으면
    // 아래 tombstone 루프가 `kind` 를 `undefined` 로 읽고, 그것이 우연히
    // 걸러지는 조건 순서에 기대게 된다.
    // 디스크에서 주운 노드는 상속을 유지한 채 등재된다 — 재조정은 권한을
    // 판단하지 않는다(`SEC-ACL-003` AC-1 의 기본값 그대로다).
    known.set(walked, {
      id,
      workspaceId,
      parentId,
      kind,
      name,
      orphanedAt: null,
      inheritsAcl: true,
      trashedAt: null,
    });
    // 발견은 **사실**이므로 감사 로그가 먼저다. 대기열은 그 행을 참조한다
    // (`R139` — 같은 사실을 두 곳에 적지 않는다).
    record(stores, RECONCILE_OPERATION.create, id, FINDING_TYPE.unregisteredFile, correlationId);
    parentId = id;
  });

  return parentId!;
}

function record(
  stores: ReconciliationStores,
  operation: ReconcileOperation,
  nodeId: NodeId,
  type: FindingType,
  correlationId: string,
): void {
  const auditId = stores.audit.append({ operation, actor: SYSTEM_RECONCILER, nodeId, correlationId });
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
    /**
     * 기동 즉시 한 회차를 돌 것인가. 호출자가 이미 한 번 돌렸다면 `false`
     * 다 — 켠 채로 두면 큰 볼트에서 기동 직후 스캔 비용이 두 배가 된다.
     */
    runImmediately?: boolean;
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

  const first = options.runImmediately === false ? undefined : setTimeout(run, 0);
  const timer = setInterval(run, options.intervalMs ?? RECONCILE_INTERVAL_MS);

  // 타이머가 이벤트 루프를 잡지 않게 한다. 잡으면 할 일이 끝난 프로세스가
  // `close()` 를 부르기 전까지 종료하지 못한다.
  first?.unref?.();
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      if (first !== undefined) {
        clearTimeout(first);
      }
      clearInterval(timer);
      await inFlight;
    },
  };
}
