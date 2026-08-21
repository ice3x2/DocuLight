import { randomUUID } from 'node:crypto';

import type { Finding, FindingQueue, OpenFinding } from '../../domain/ports/finding-queue.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';

/**
 * 재조정 대기열의 SQLite 어댑터 (`REL-AUDIT-001` · `R139` 계열).
 *
 * **보존 기간으로 지우는 경로를 두지 않는다** — 항목은 해소될 때까지 남는다
 * (`AC-8`). 감사 로그의 보존 기간(`R84-a`)과 성질이 반대다.
 */
export class SqliteFindingQueue implements FindingQueue {
  constructor(private readonly store: MetadataStore) {}

  open(finding: OpenFinding): string {
    // 사전 검사다. 참조가 비면 시각·대상 노드·행위자의 유일한 출처가 사라지므로
    // 예외를 제어흐름으로 쓰지 않고 여기서 거른다.
    if (finding.auditRefs.length === 0) {
      throw new Error(
        'reconciliation finding requires at least one audit reference — ' +
          'occurrence time, target node and actor are read from it (R139)',
      );
    }

    const id = randomUUID();
    // 항목과 그 참조는 함께 서거나 함께 서지 않는다. 절반만 남으면 참조 없는
    // 항목이 생겨 위 사전 검사가 무의미해진다.
    this.store.transaction(() => {
      this.store.run('INSERT INTO reconciliation_finding (id, type) VALUES (?, ?)', [
        id,
        finding.type,
      ]);
      finding.auditRefs.forEach((auditId, index) => {
        this.store.run(
          'INSERT INTO reconciliation_finding_audit_ref (finding_id, audit_log_id, ordinal) VALUES (?, ?, ?)',
          [id, auditId, index],
        );
      });
    });
    return id;
  }

  resolve(findingId: string, resolutionAuditId: string): void {
    this.store.run('UPDATE reconciliation_finding SET resolution_audit_id = ? WHERE id = ?', [
      resolutionAuditId,
      findingId,
    ]);
  }

  unresolved(): Finding[] {
    return this.store
      .all<{ id: string; type: string; resolution_audit_id: string | null }>(
        'SELECT id, type, resolution_audit_id FROM reconciliation_finding WHERE resolution_audit_id IS NULL ORDER BY rowid',
      )
      .map((r) => ({ id: r.id, type: r.type, resolutionAuditId: r.resolution_audit_id }));
  }

  auditRefsOf(findingId: string): string[] {
    return this.store
      .all<{ audit_log_id: string }>(
        'SELECT audit_log_id FROM reconciliation_finding_audit_ref WHERE finding_id = ? ORDER BY ordinal',
        [findingId],
      )
      .map((r) => r.audit_log_id);
  }
}
