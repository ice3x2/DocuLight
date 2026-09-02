import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  sweepExpiredAudit,
  type AuditRetentionStores,
} from '../../../src/app/audit/audit-retention.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { SYSTEM_RECONCILER } from '../../../src/domain/ports/audit-sink.js';
import {
  FINDING_TYPE,
  RESOLUTION_OPERATION,
} from '../../../src/domain/reconciliation/vocabulary.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteAuditRetention } from '../../../src/infra/sqlite/audit-retention-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteFindingRetention } from '../../../src/infra/sqlite/finding-retention-repository.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

let dir: string;
let db: Database;
let audit: SqliteAuditLog;
let queue: SqliteFindingQueue;
let stores: AuditRetentionStores;

/** 그만큼 나이 든 감사 행 하나. 시각은 저장소가 쓰므로 여기서 되짚는다. */
function aged(days: number): string {
  const id = audit.append({ operation: '재조정', actor: SYSTEM_RECONCILER });
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
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-retention-finding-'));
  db = openDatabase(join(dir, 'doculight.db'));
  audit = new SqliteAuditLog(db);
  queue = new SqliteFindingQueue(db);
  stores = {
    auditRetention: new SqliteAuditRetention(db),
    findingRetention: new SqliteFindingRetention(db),
    settings: new SqliteSettingStore(db),
    clock: () => new Date(),
    transaction: <T,>(fn: () => T): T => db.transaction(fn),
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-003 · 원장 `G37` — 대기열 항목의 수명은 자기 참조가 정한다', () => {
  it('참조가 걸린 만료 행이 있어도 일소가 예외 없이 끝나고 참조된 행도 무참조 행도 사라진다', () => {
    // 지금은 이 자리에서 `DELETE FROM audit_log` 가 문장째 무너져,
    // **아무도 참조하지 않는 만료 행까지** 한 건도 지워지지 않는다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const referenced = aged(31);
    queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [referenced] });
    const unreferenced = aged(31);
    const fresh = aged(29);

    expect(() => sweepExpiredAudit(stores)).not.toThrow();

    expect(surviving()).toEqual([fresh]);
    expect(surviving()).not.toContain(referenced);
    expect(surviving()).not.toContain(unreferenced);
  });

  it('그 행을 참조하던 항목이 함께 사라진다', () => {
    // 참조를 잃은 항목은 이미 항목이 아니다 — 시각·대상 노드·행위자의
    // 유일한 출처가 참조 감사 행이다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const expired = aged(31);
    const findingId = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [expired] });

    sweepExpiredAudit(stores);

    expect(queue.unresolved()).toEqual([]);
    expect(queue.find(findingId)).toBeUndefined();
    expect(queue.auditRefsOf(findingId)).toEqual([]);
  });

  it('참조 감사 행이 보존 기간 안이면 감사 행도 항목도 그대로 남는다', () => {
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const fresh = aged(29);
    const findingId = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [fresh] });

    sweepExpiredAudit(stores);

    expect(surviving()).toEqual([fresh]);
    expect(queue.find(findingId)?.id).toBe(findingId);
    expect(queue.auditRefsOf(findingId)).toEqual([fresh]);
  });

  it('참조 둘 중 하나만 만료해도 사라진다 — 가장 이른 참조가 수명을 정한다', () => {
    // 참조 둘을 갖는 유일한 유형이다. 「모두 만료해야 소멸」로 두면 살아남은
    // 참조가 만료한 참조를 다시 붙들어 만료 자체가 무기한이 된다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const vanished = aged(31);
    const appeared = aged(29);
    const findingId = queue.open({
      type: FINDING_TYPE.correlationRejected,
      auditRefs: [vanished, appeared],
    });

    sweepExpiredAudit(stores);

    expect(queue.find(findingId)).toBeUndefined();
    expect(queue.auditRefsOf(findingId)).toEqual([]);
    // 살아남은 참조가 가리키던 감사 행 자체는 만료하지 않았으므로 남는다.
    expect(surviving()).toEqual([appeared]);
  });

  it('해소된 항목도 같은 규칙으로 사라진다', () => {
    // 해소는 `resolution_audit_id` 만 갱신하고 참조 행을 남긴다 — 그래서
    // 해소된 항목 하나만 있는 DB 에서도 지금은 일소가 같은 자리에서 죽는다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const expired = aged(31);
    const findingId = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [expired] });
    const resolution = audit.append({
      operation: RESOLUTION_OPERATION.manualLink,
      actor: 'user-1',
    });
    queue.resolve(findingId, resolution);

    sweepExpiredAudit(stores);

    expect(queue.find(findingId)).toBeUndefined();
    expect(surviving()).toEqual([resolution]);
  });

  it('보존 일수가 0 이면 항목도 감사 행도 하나도 사라지지 않는다', () => {
    writeSetting(stores.settings, 'audit-retention-days', '0');
    const ancient = aged(4000);
    const findingId = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [ancient] });

    sweepExpiredAudit(stores);

    expect(surviving()).toEqual([ancient]);
    expect(queue.find(findingId)?.id).toBe(findingId);
  });

  it('소멸이 감사 행을 새로 만들지 않는다', () => {
    // 만들면 그 행이 다시 만료 대상이 되어 끝없이 자기를 참조한다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const expired = aged(31);
    queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [expired] });

    const { purged } = sweepExpiredAudit(stores);

    expect(purged).toBe(1);
    expect(surviving()).toEqual([]);
  });

  it('항목 삭제와 감사 행 삭제가 갈라져 반영되지 않는다', () => {
    // 항목만 사라진 중간 상태가 남으면 그 항목이 무엇을 가리켰는지 아무
    // 데서도 읽을 수 없다. 감사 행 삭제가 죽는 상황을 만들어 재어 본다.
    writeSetting(stores.settings, 'audit-retention-days', '30');
    const expired = aged(31);
    const findingId = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [expired] });

    const failingAuditPurge: AuditRetentionStores = {
      ...stores,
      auditRetention: {
        purgeBefore(): number {
          throw new Error('감사 행 삭제 실패');
        },
      },
    };

    expect(() => sweepExpiredAudit(failingAuditPurge)).toThrow('감사 행 삭제 실패');

    expect(queue.find(findingId)?.id).toBe(findingId);
    expect(queue.auditRefsOf(findingId)).toEqual([expired]);
    expect(surviving()).toEqual([expired]);
  });
});
