import type { AuditRetention } from '../../domain/ports/audit-retention.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';

/**
 * 감사 보존 만료의 SQLite 어댑터 (`REL-AUDIT-003`).
 *
 * `SqliteAuditLog` 과 **다른 클래스**인 이유는 그쪽이 추가만 여는 것으로
 * 불변성을 지키기 때문이다. 이 클래스를 손에 쥔 코드만 지울 수 있고,
 * 지금 그것을 쥐는 곳은 만료 청소 하나다.
 */
export class SqliteAuditRetention implements AuditRetention {
  constructor(private readonly store: MetadataStore) {}

  purgeBefore(cutoff: string): number {
    // `occurred_at` 은 `datetime('now')` 가 쓴 `YYYY-MM-DD HH:MM:SS` 다.
    // 그 형식은 사전순이 곧 시간순이라 문자열 비교로 충분하다.
    const before = this.store.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM audit_log WHERE occurred_at < ?',
      [cutoff],
    );
    this.store.run('DELETE FROM audit_log WHERE occurred_at < ?', [cutoff]);
    return before?.n ?? 0;
  }
}
