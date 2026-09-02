import type { Clock } from '../auth/login-service.js';
import type { AuditRetention } from '../../domain/ports/audit-retention.js';
import type { FindingRetention } from '../../domain/ports/finding-retention.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import { cutoffOf } from '../../domain/retention/retention.js';
import { retentionDaysOf } from '../settings/instance-settings.js';

export interface AuditRetentionStores {
  auditRetention: AuditRetention;
  /**
   * 만료 감사 행을 참조하는 대기열 항목을 걷어내는 자리 (`G37`).
   *
   * 감사 소멸과 **한 조립에** 두어야 한다 — 나누면 참조가 걸린 만료 행이
   * 하나 생기는 순간 감사 일소가 문장째 무너지고, 아무도 참조하지 않는
   * 만료 행까지 한 건도 지워지지 않는다.
   */
  findingRetention: FindingRetention;
  settings: SettingStore;
  clock: Clock;
  /**
   * 두 소멸을 하나로 묶는다 (`G37`).
   *
   * **선택 인자로 두지 않는다.** 없으면 항목만 사라지고 감사 행은 남은
   * 중간 상태가 생기는데, 그 상태에서는 사라진 항목이 무엇을 가리켰는지
   * 아무 데서도 읽을 수 없다 (선례: `ReconciliationStores.transaction`).
   */
  transaction: <T>(fn: () => T) => T;
}

/** 설정된 감사 보존 일수 (`REL-AUDIT-003`). */
export function auditRetentionDays(stores: AuditRetentionStores): number {
  return retentionDaysOf(stores.settings, 'audit-retention-days');
}

/**
 * 보존 기간이 지난 감사 행을 소멸시킨다 (`REL-AUDIT-003`).
 *
 * **사람의 조작이 없다.** 그래서 권한 판정도 없고 감사 기록도 남기지 않는다
 * (AC-4) — 남기면 그 행이 다시 만료 대상이 되어 끝없이 자기를 참조한다.
 * 판정할 주체가 없는 조작이라는 사실이, 이 함수가 요청 경로에서 불리면 안
 * 되는 이유이기도 하다.
 *
 * **대기열 항목이 감사 행보다 먼저 사라진다** (원장 `G37`). 항목의 수명은
 * 자기 참조가 정하므로, 참조 감사 행 중 가장 이른 것이 보존 기간을 넘기면
 * 그 항목도 함께 소멸한다. 순서를 정하는 자리를 여기에 두는 이유는 그
 * 규칙이 조항 옆에 보여야 하기 때문이다 — 어댑터에 흩어 놓으면 어느 쪽이
 * 먼저인지가 SQL 두 개의 배치로만 남는다.
 */
export function sweepExpiredAudit(stores: AuditRetentionStores): { purged: number } {
  // 경계 계산은 휴지통과 **같은 함수**가 한다 — 낱개를 훑는 쪽과 집합을
  // 한 번에 지우는 쪽이 각자 `0` 을 판정하면 그 뜻이 한쪽에서만 바뀐다.
  const cutoff = cutoffOf(auditRetentionDays(stores), stores.clock());
  if (cutoff === null) return { purged: 0 };

  // `occurred_at` 이 `datetime('now')` 로 쓰인 UTC 문자열이라 같은 모양으로
  // 넘긴다 — ISO 의 `T` 와 밀리초를 그대로 두면 사전순 비교가 어긋난다.
  const at = sqliteTime(cutoff);

  return stores.transaction(() => {
    // **항목이 먼저다.** 감사 행을 먼저 지우면 참조가 그 행을 붙들어
    // `DELETE FROM audit_log` 가 문장째 무너지고, 아무도 참조하지 않는
    // 만료 행까지 한 건도 지워지지 않는다.
    stores.findingRetention.purgeReferencing(at);
    return { purged: stores.auditRetention.purgeBefore(at) };
  });
}

const sqliteTime = (at: Date): string => at.toISOString().replace('T', ' ').slice(0, 19);
