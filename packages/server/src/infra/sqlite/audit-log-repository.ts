import { randomUUID } from 'node:crypto';

import type { AuditEntry, AuditQuery, AuditRow, AuditSink } from '../../domain/ports/audit-sink.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';

/** 저장소가 돌려주는 행의 모양. 칸 이름은 스키마의 것이다. */
interface AuditRecord {
  id: string;
  occurred_at: string;
  operation: string;
  actor: string;
  node_id: string | null;
  workspace_id: string | null;
  subject_id: string | null;
  level: string | null;
  before_value: string | null;
  after_value: string | null;
  counterpart_node_id: string | null;
  target_role: string | null;
}

/**
 * 감사 로그의 SQLite 어댑터.
 *
 * **추가와 읽기만 있다.** 수정·삭제 메서드를 두지 않는 것이 행의 불변성
 * (`OBS-AUDIT-002`)을 지키는 방법이다 — 스키마는 UPDATE 를 막지 못하므로
 * 경로가 막는다.
 */
export class SqliteAuditLog implements AuditSink, AuditQuery {
  constructor(private readonly store: MetadataStore) {}

  append(entry: AuditEntry): string {
    const id = randomUUID();
    this.store.run(
      `INSERT INTO audit_log
         (id, operation, actor, node_id, workspace_id, subject_id, level,
          before_value, after_value, counterpart_node_id, target_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.operation,
        entry.actor,
        entry.nodeId ?? null,
        entry.workspaceId ?? null,
        entry.subjectId ?? null,
        entry.level ?? null,
        entry.beforeValue ?? null,
        entry.afterValue ?? null,
        entry.counterpartNodeId ?? null,
        // 상대 노드가 비면 역할도 함께 빈다 (`DR-AUDIT-002` AC-5) — 여기서
        // 강제해야 두 칸이 어긋난 행이 저장소에 들어오지 않는다.
        entry.counterpartNodeId === undefined ? null : (entry.targetRole ?? null),
      ],
    );
    return id;
  }

  inScope(
    workspaceIds: readonly string[],
    options: { includeInstance?: boolean; operation?: string } = {},
  ): AuditRow[] {
    const { where, params } = this.scope(workspaceIds, options);
    // 조작 조건은 스코프 조건 **뒤에** 붙는다 — 앞에 두면 조작만 맞는
    // 스코프 밖 행이 걸릴 여지가 생긴다.
    const byOperation = options.operation === undefined ? '' : ' AND operation = ?';
    const all = options.operation === undefined ? params : [...params, options.operation];
    return this.store
      .all<AuditRecord>(
        `SELECT * FROM audit_log WHERE ${where}${byOperation} ORDER BY occurred_at DESC, id DESC`,
        all,
      )
      .map(rowOf);
  }

  operationsInScope(
    workspaceIds: readonly string[],
    options: { includeInstance?: boolean } = {},
  ): string[] {
    const { where, params } = this.scope(workspaceIds, options);
    // **실제 기록 값에서 파생한다** (`IR-AUDIT-001` AC-1·AC-2). 고정 목록을
    // 두면 새 조작이 처음 기록돼도 배포 전까지 필터에 나타나지 않는다.
    return this.store
      .all<{ operation: string }>(
        `SELECT DISTINCT operation FROM audit_log WHERE ${where} ORDER BY operation`,
        params,
      )
      .map((r) => r.operation);
  }

  byIds(ids: readonly string[]): AuditRow[] {
    if (ids.length === 0) return [];
    const holes = ids.map(() => '?').join(', ');
    return this.store
      .all<AuditRecord>(`SELECT * FROM audit_log WHERE id IN (${holes})`, [...ids])
      .map(rowOf);
  }

  /**
   * 스코프 조건 한 벌. 두 질의가 **같은 조건**을 쓴다 — 나눠 적으면
   * 목록에 있는 조작이 필터에 없거나 그 반대가 된다.
   *
   * 스코프가 빈 행(`workspace_id IS NULL`)이 인스턴스 스코프이며 슈퍼유저만
   * 읽는다 (`SEC-AUTH-010` 아님 — `SEC-AUDIT-010` AC-3~AC-5).
   */
  private scope(
    workspaceIds: readonly string[],
    options: { includeInstance?: boolean },
  ): { where: string; params: unknown[] } {
    const holes = workspaceIds.map(() => '?').join(', ');
    const byWorkspace = workspaceIds.length === 0 ? '0' : `workspace_id IN (${holes})`;
    return options.includeInstance === true
      ? { where: `(${byWorkspace} OR workspace_id IS NULL)`, params: [...workspaceIds] }
      : { where: byWorkspace, params: [...workspaceIds] };
  }
}

const rowOf = (record: AuditRecord): AuditRow => ({
  id: record.id,
  occurredAt: record.occurred_at,
  operation: record.operation,
  actor: record.actor,
  ...(record.node_id === null ? {} : { nodeId: record.node_id }),
  ...(record.workspace_id === null ? {} : { workspaceId: record.workspace_id }),
  ...(record.subject_id === null ? {} : { subjectId: record.subject_id }),
  ...(record.level === null ? {} : { level: record.level }),
  ...(record.before_value === null ? {} : { beforeValue: record.before_value }),
  ...(record.after_value === null ? {} : { afterValue: record.after_value }),
  ...(record.counterpart_node_id === null ? {} : { counterpartNodeId: record.counterpart_node_id }),
  ...(record.target_role === null ? {} : { targetRole: record.target_role as 'origin' | 'copy' }),
});
