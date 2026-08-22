import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  auditRetentionDays,
  sweepExpiredAudit,
  type AuditRetentionStores,
} from '../../../src/app/audit/audit-retention.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { SYSTEM_RECONCILER } from '../../../src/domain/ports/audit-sink.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteAuditRetention } from '../../../src/infra/sqlite/audit-retention-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

let dir: string;
let db: Database;
let audit: SqliteAuditLog;
let stores: AuditRetentionStores;

/** 그만큼 나이 든 감사 행 하나. 시각은 저장소가 쓰므로 여기서 되짚는다. */
function aged(days: number): string {
  const id = audit.append({ operation: '부여', actor: SYSTEM_RECONCILER });
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  db.run('UPDATE audit_log SET occurred_at = ? WHERE id = ?', [when, id]);
  return id;
}

const surviving = (): string[] =>
  db.all<{ id: string }>('SELECT id FROM audit_log').map((row) => row.id);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-retention-'));
  db = openDatabase(join(dir, 'doculight.db'));
  audit = new SqliteAuditLog(db);
  stores = {
    auditRetention: new SqliteAuditRetention(db),
    settings: new SqliteSettingStore(db),
    clock: () => new Date(),
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-003 — 보존 기간이 지난 감사 행은 자동으로 소멸한다', () => {
  it('AC-1 · AC-2: 넘긴 것만 사라지고 안의 것은 남는다', () => {
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const old = aged(31);
    const fresh = aged(29);

    sweepExpiredAudit(stores);

    expect(surviving()).toEqual([fresh]);
    expect(surviving()).not.toContain(old);
  });

  it('AC-3: 0 이면 아무리 오래된 행도 사라지지 않는다', () => {
    // 휴지통과 같은 표기다 — 인접한 두 설정 칸에서 같은 값이 정반대를
    // 뜻하면 반드시 오독된다.
    writeSetting(stores.settings, 'audit-retention-days', '0');
    const ancient = aged(4000);

    sweepExpiredAudit(stores);

    expect(surviving()).toEqual([ancient]);
  });

  it('AC-4: 소멸이 감사 행을 새로 만들지 않는다', () => {
    // 만들면 그 행이 다시 만료 대상이 되어 끝없이 자기를 참조한다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    aged(31);
    aged(31);

    const { purged } = sweepExpiredAudit(stores);

    expect(purged).toBe(2);
    expect(surviving()).toEqual([]);
  });

  it('설정이 없으면 기본 365일이다', () => {
    expect(auditRetentionDays(stores)).toBe(365);
  });

  it('숫자가 아닌 값은 기본값으로 읽는다 — 오타 하나가 전량 소멸이 되면 안 된다', () => {
    writeSetting(stores.settings, 'audit-retention-days', '서른');

    expect(auditRetentionDays(stores)).toBe(365);
  });
});
