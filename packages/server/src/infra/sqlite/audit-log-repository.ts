import { randomUUID } from 'node:crypto';

import type { AuditEntry, AuditSink } from '../../domain/ports/audit-sink.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';

/**
 * 감사 로그의 SQLite 어댑터.
 *
 * **추가만 있다.** 수정·삭제 메서드를 두지 않는 것이 `R84-a` 불변성을 지키는
 * 방법이다 — 스키마는 UPDATE 를 막지 못하므로 경로가 막는다.
 */
export class SqliteAuditLog implements AuditSink {
  constructor(private readonly store: MetadataStore) {}

  append(entry: AuditEntry): string {
    const id = randomUUID();
    this.store.run(
      `INSERT INTO audit_log (id, operation, actor, node_id, workspace_id, subject_id, level)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        entry.operation,
        entry.actor,
        entry.nodeId ?? null,
        entry.workspaceId ?? null,
        entry.subjectId ?? null,
        entry.level ?? null,
      ],
    );
    return id;
  }
}
