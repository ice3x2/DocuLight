import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SYSTEM_RECONCILER } from '../../../src/domain/ports/audit-sink.js';
import {
  FINDING_TYPE,
  RECONCILE_OPERATION,
} from '../../../src/domain/reconciliation/vocabulary.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';

let dir: string;
let db: Database;
let queue: SqliteFindingQueue;
let audit: SqliteAuditLog;

const columnsOf = (table: string) =>
  db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-queue-'));
  db = openDatabase(join(dir, 'doculight.db'));
  audit = new SqliteAuditLog(db);
  queue = new SqliteFindingQueue(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-001 — 재조정 대기열은 감사 로그와 별개 저장소다', () => {
  it('AC-1 — 재조정 대기열이 audit_log 와 별개의 저장소로 존재한다', () => {
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);

    expect(tables).toContain('audit_log');
    expect(tables).toContain('reconciliation_finding');

    // 「별개 저장소」의 실질은 이름이 다른 것이 아니라 **칸이 겹치지 않는 것**이다.
    // 두 테이블이 같은 사실을 담으면 이름만 둘이고 저장소는 하나다.
    const auditCols = new Set(columnsOf('audit_log'));
    const shared = columnsOf('reconciliation_finding').filter(
      (c) => c !== 'id' && auditCols.has(c),
    );
    expect(
      shared,
      `reconciliation_finding and audit_log resolve to the same store: shared columns ${shared.join(', ')}`,
    ).toEqual([]);
  });

  it('AC-2 — 대기열 항목이 유형·참조 감사 행·해소 감사 행 세 축만 갖는다', () => {
    const cols = columnsOf('reconciliation_finding').filter((c) => c !== 'id');
    const extra = cols.filter((c) => !['type', 'resolution_audit_id'].includes(c));
    expect(
      extra,
      `reconciliation_finding has an axis outside {type, audit refs, resolution}: ${extra.join(', ')}`,
    ).toEqual([]);
    // 참조 축은 1..N 이라 별도 테이블이다.
    expect(columnsOf('reconciliation_finding_audit_ref')).toContain('audit_log_id');
  });

  it('AC-3 — 대기열 항목이 시각·대상 노드·행위자·해소 시각·해소자를 자기 칸으로 갖지 않는다', () => {
    const forbidden = ['occurred_at', 'node_id', 'actor', 'resolved_at', 'resolver', 'workspace_id'];
    const present = columnsOf('reconciliation_finding').filter((c) => forbidden.includes(c));
    expect(
      present,
      `forbidden column present: ${present.join('|')}`,
    ).toEqual([]);
  });

  it('AC-4 — 미해소가 해소 감사 행의 비어 있음으로 판정되며 별도 칸이 아니다', () => {
    const a1 = audit.append({ operation: RECONCILE_OPERATION.create, actor: SYSTEM_RECONCILER, nodeId: 'n1' });
    const id = queue.open({ type: FINDING_TYPE.unregisteredFile, auditRefs: [a1] });

    expect(queue.unresolved().map((f) => f.id)).toEqual([id]);

    const a2 = audit.append({ operation: 'resolve', actor: 'u1', nodeId: 'n1' });
    queue.resolve(id, a2);

    expect(queue.unresolved()).toEqual([]);
    // 상태를 나타내는 별도 칸이 없어야 한다.
    const stateCols = columnsOf('reconciliation_finding').filter((c) =>
      ['status', 'is_resolved', 'state', 'resolved'].includes(c),
    );
    expect(stateCols).toEqual([]);
  });

  it('AC-5 — 참조 감사 행이 복수를 담고 신규 노드와 tombstone 두 행이 한 항목으로 묶인다', () => {
    const created = audit.append({ operation: RECONCILE_OPERATION.create, actor: SYSTEM_RECONCILER, nodeId: 'n2' });
    const tombstoned = audit.append({ operation: RECONCILE_OPERATION.orphan, actor: SYSTEM_RECONCILER, nodeId: 'n1' });

    const id = queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [created, tombstoned] });

    expect(queue.auditRefsOf(id)).toEqual([created, tombstoned]);
  });

  it('AC-7 — 참조 감사 행 없이 항목을 열 수 없다 (같은 사실을 대기열이 따로 적지 않는다)', () => {
    // 비우면 시각·대상 노드·행위자의 유일한 출처가 사라진다.
    expect(() => queue.open({ type: FINDING_TYPE.unregisteredFile, auditRefs: [] })).toThrow(
      /at least one audit reference/i,
    );
  });

  it('AC-8 — 해소되지 않은 항목은 남는다', () => {
    const a1 = audit.append({ operation: RECONCILE_OPERATION.create, actor: SYSTEM_RECONCILER, nodeId: 'n1' });
    const id = queue.open({ type: FINDING_TYPE.unregisteredFile, auditRefs: [a1] });

    // 보존 기간으로 지우는 경로가 대기열에 없어야 한다 — 해소만이 목록에서 뺀다.
    expect(queue.unresolved().map((f) => f.id)).toEqual([id]);
    expect(Object.keys(queue)).not.toContain('purgeExpired');
  });
});
