import type { FindingRetention } from '../../domain/ports/finding-retention.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';

/**
 * 대기열 항목의 보존 만료 소멸을 맡는 SQLite 어댑터 (`REL-AUDIT-003` · `G37`).
 *
 * `SqliteFindingQueue` 와 **다른 클래스**인 이유는 그쪽이 「항목은 해소될
 * 때까지 남는다」를 지키기 때문이다. 이 클래스를 손에 쥔 코드만 기간으로
 * 지울 수 있고, 지금 그것을 쥐는 곳은 감사 일소 하나다.
 *
 * **마이그레이션이 없다.** 참조 행은 `finding_id` 에 이미 걸린
 * `ON DELETE CASCADE`(`003_reconciliation_finding.sql`)가 걷어간다.
 */
export class SqliteFindingRetention implements FindingRetention {
  constructor(private readonly store: MetadataStore) {}

  purgeReferencing(cutoff: string): number {
    // `occurred_at` 은 `datetime('now')` 가 쓴 `YYYY-MM-DD HH:MM:SS` 다.
    // 그 형식은 사전순이 곧 시간순이라 문자열 비교로 충분하다.
    const before = this.store.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM reconciliation_finding WHERE id IN (${REFERENCING_EXPIRED})`,
      [cutoff],
    );
    this.store.run(
      `DELETE FROM reconciliation_finding WHERE id IN (${REFERENCING_EXPIRED})`,
      [cutoff],
    );
    return before?.n ?? 0;
  }
}

/**
 * 만료 감사 행을 **하나라도** 참조하는 항목의 id.
 *
 * 세는 질의와 지우는 질의가 같은 문장을 봐야 한다 — 갈리면 돌려주는 개수와
 * 실제로 사라진 개수가 어긋나고, 그 어긋남은 아무 데도 드러나지 않는다.
 */
const REFERENCING_EXPIRED = `SELECT finding_id
     FROM reconciliation_finding_audit_ref
    WHERE audit_log_id IN (SELECT id FROM audit_log WHERE occurred_at < ?)`;
