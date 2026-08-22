import type { Clock } from '../auth/login-service.js';
import type { AuditRetention } from '../../domain/ports/audit-retention.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import { cutoffOf } from '../../domain/retention/retention.js';
import { retentionDaysOf } from '../settings/instance-settings.js';

export interface AuditRetentionStores {
  auditRetention: AuditRetention;
  settings: SettingStore;
  clock: Clock;
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
 */
export function sweepExpiredAudit(stores: AuditRetentionStores): { purged: number } {
  // 경계 계산은 휴지통과 **같은 함수**가 한다 — 낱개를 훑는 쪽과 집합을
  // 한 번에 지우는 쪽이 각자 `0` 을 판정하면 그 뜻이 한쪽에서만 바뀐다.
  const cutoff = cutoffOf(auditRetentionDays(stores), stores.clock());
  if (cutoff === null) return { purged: 0 };

  // `occurred_at` 이 `datetime('now')` 로 쓰인 UTC 문자열이라 같은 모양으로
  // 넘긴다 — ISO 의 `T` 와 밀리초를 그대로 두면 사전순 비교가 어긋난다.
  return { purged: stores.auditRetention.purgeBefore(sqliteTime(cutoff)) };
}

const sqliteTime = (at: Date): string => at.toISOString().replace('T', ' ').slice(0, 19);
