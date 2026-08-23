import { isSuperuser } from '../../domain/principal/subject.js';
import type { FindingQueue } from '../../domain/ports/finding-queue.js';
import { RESOLUTION_OPERATION } from '../../domain/reconciliation/vocabulary.js';
import { managedWorkspacesOf } from '../acl/admin-scope.js';
import type { AclStores, Actor } from '../acl/permission-service.js';

/**
 * 재조정 대기열을 **읽고 해소하는** 자리 (`SEC-AUDIT-007` · `REL-AUDIT-002`).
 *
 * 대기열은 자기 스코프 칸을 갖지 않는다 (`R139-e`). 스코프는 항목이
 * 참조하는 감사 행에서 매번 파생하며, 그래서 이 파일이 감사 로그와 **같은
 * 선택기**(`managedWorkspacesOf` · `isSuperuser`)를 그대로 쓴다 — 새 접근
 * 규칙을 만들면 두 화면의 자격 판정이 갈리고, 갈린 사실은 한쪽만 열리는
 * 사람이 나타날 때까지 아무도 모른다 (`SEC-AUDIT-007` AC-6 · `R124`).
 */

/** 대기열이 쓰는 저장소. `AclStores` 가 이미 감사 두 경계를 든다. */
export type QueueStores = AclStores & { queue: FindingQueue };

/**
 * 항목이 어느 스코프에 드는가.
 *
 * `instance` 는 어느 워크스페이스에도 귀속되지 않는 항목과 **경계를 넘는**
 * 항목을 함께 담는다 — 둘을 가르면 그 구별 자체가 신호가 된다.
 */
export type FindingScope = { kind: 'workspace'; workspaceId: string } | { kind: 'instance' };

/** 화면과 API 가 함께 쓰는 대기열 한 줄. 워크스페이스 칸은 여기에도 없다. */
export interface QueueItem {
  readonly id: string;
  readonly type: string;
}

export interface QueueView {
  readonly items: readonly QueueItem[];
}

/**
 * 그 항목의 스코프 (`SEC-AUDIT-007` AC-1 · AC-3 · AC-4).
 *
 * 참조 감사 행들의 **대상 노드**가 속한 워크스페이스에서 파생한다. 행이
 * 자기 워크스페이스 칸을 들고 있으면 그것을 먼저 읽는다 — 영구 삭제가
 * 노드를 지워도 그 칸은 남으므로(`R140-e`), 노드 조회만으로 파생하면
 * 삭제된 노드의 항목이 통째로 인스턴스 스코프로 올라간다.
 *
 * 하나라도 풀리지 않거나 서로 다른 워크스페이스를 가리키면 인스턴스다 —
 * 불확실하면 좁은 쪽이 아니라 **위**다 (`R77-a` 와 같은 fail-closed 방향).
 */
export function scopeOf(stores: QueueStores, findingId: string): FindingScope {
  const rows = stores.auditLog.byIds(stores.queue.auditRefsOf(findingId));
  const workspaces = new Set(rows.map((row) => workspaceOf(stores, row)));

  if (workspaces.size !== 1) return { kind: 'instance' };
  const [only] = [...workspaces];
  return only === null ? { kind: 'instance' } : { kind: 'workspace', workspaceId: only };
}

function workspaceOf(
  stores: QueueStores,
  row: { workspaceId?: string; nodeId?: string },
): string | null {
  if (row.workspaceId !== undefined) return row.workspaceId;
  if (row.nodeId === undefined) return null;
  return stores.nodes.findById(row.nodeId)?.workspaceId ?? null;
}

/**
 * 이 요청자가 볼 수 있는 미해소 항목들 (`SEC-AUDIT-007` AC-5 · AC-6).
 *
 * 관리 워크스페이스가 하나도 없고 슈퍼유저도 아니면 `null` — 볼 것이 없는
 * 것과 볼 자격이 없는 것을 같은 값으로 접는다 (`SEC-ACL-006`).
 */
export function queueView(stores: QueueStores, actor: Actor): QueueView | null {
  const scope = visibleScope(stores, actor);
  if (scope === null) return null;

  return {
    items: stores.queue
      .unresolved()
      .filter((finding) => visible(scope, scopeOf(stores, finding.id)))
      .map((finding) => ({ id: finding.id, type: finding.type })),
  };
}

interface VisibleScope {
  readonly superuser: boolean;
  readonly managed: ReadonlySet<string>;
}

function visibleScope(stores: QueueStores, actor: Actor): VisibleScope | null {
  const superuser = isSuperuser(stores.principals.groupsOf(actor.id));
  const managed = managedWorkspacesOf(stores, actor).map((workspace) => workspace.id);
  if (!superuser && managed.length === 0) return null;
  return { superuser, managed: new Set(managed) };
}

function visible(scope: VisibleScope, finding: FindingScope): boolean {
  // 인스턴스 스코프는 슈퍼유저만 본다 — 감사 행의 규칙과 같다
  // (`SEC-AUDIT-010` AC-4 · AC-5).
  return finding.kind === 'instance' ? scope.superuser : scope.managed.has(finding.workspaceId);
}

/**
 * 그 항목의 **해소 시각과 해소자** (`REL-AUDIT-002` AC-5).
 *
 * 대기열이 아니라 해소 감사 행에서 읽는다. 미해소면 `null` — 빈 해소 감사
 * 행이 곧 미해소이므로 별도 상태 칸이 없다.
 */
export function resolutionOf(
  stores: QueueStores,
  findingId: string,
): { actor: string; occurredAt: string } | null {
  const resolutionAuditId = stores.queue.find(findingId)?.resolutionAuditId;
  if (resolutionAuditId === undefined || resolutionAuditId === null) return null;

  const row = stores.auditLog.byIds([resolutionAuditId]).at(0);
  if (row === undefined) return null;
  return { actor: row.actor, occurredAt: row.occurredAt };
}

export type ResolveResult = { ok: true } | { ok: false; rule: 'out-of-scope' | 'unknown-finding' };

/**
 * 두 사실을 손으로 이어 항목을 해소한다 (`R77-a` 수동 연결 ·
 * `REL-AUDIT-002`).
 *
 * **원 감사 행을 고치지 않는다.** 해소는 새 감사 행 1건을 더하는 것이고
 * 항목은 그 행을 가리킬 뿐이다 — 원 행을 갱신하면 재조정이 그 시점에
 * 상관 판정을 하지 못했다는 사실이 사후 정정으로 지워진다 (AC-6).
 */
export function resolveByManualLink(
  stores: QueueStores,
  actor: Actor,
  findingId: string,
): ResolveResult {
  const finding = stores.queue.find(findingId);
  if (finding === undefined) return { ok: false, rule: 'unknown-finding' };

  const scope = visibleScope(stores, actor);
  const where = scopeOf(stores, findingId);
  if (scope === null || !visible(scope, where)) return { ok: false, rule: 'out-of-scope' };

  const resolutionAuditId = stores.audit.append({
    operation: RESOLUTION_OPERATION.manualLink,
    actor: actor.id,
    // 대상 노드를 다시 적지 않는다 — 그 사실은 참조 감사 행이 이미 든다.
    // 워크스페이스만 싣는 이유는 이 행 자신의 스코프를 정하기 위해서다.
    ...(where.kind === 'workspace' ? { workspaceId: where.workspaceId } : {}),
  });
  stores.queue.resolve(findingId, resolutionAuditId);
  return { ok: true };
}
