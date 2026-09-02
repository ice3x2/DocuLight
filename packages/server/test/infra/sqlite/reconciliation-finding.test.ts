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

  it('AC-2 — 참조 감사 행 없이 항목을 열 수 없다 (같은 사실을 대기열이 따로 적지 않는다)', () => {
    // 비우면 시각·대상 노드·행위자의 유일한 출처가 사라진다.
    expect(() => queue.open({ type: FINDING_TYPE.unregisteredFile, auditRefs: [] })).toThrow(
      /at least one audit reference/i,
    );
  });

  it('AC-8 — 대기열 자신에게는 지우는 경로가 없고, 항목은 참조 감사 행이 살아 있는 동안 남는다', () => {
    const a1 = audit.append({
      operation: RECONCILE_OPERATION.create,
      actor: SYSTEM_RECONCILER,
      nodeId: 'n1',
    });
    const id = queue.open({ type: FINDING_TYPE.unregisteredFile, auditRefs: [a1] });

    // **대기열 자신에게 지우는 경로가 없다는 것**이 이 자리가 재는 축이다.
    // 원장 `G37`(2026-09-02) 뒤로 지우는 경로 자체는 존재하지만 그것은
    // `FindingRetention` 포트에 있고, 소멸의 방아쇠는 참조 감사 행의 만료다
    // — 대기열이 스스로 자기 항목을 만료시키지는 않는다. 앞서 이 자리는
    // `Object.keys(queue)` 로 확인했는데 그것은 자기 열거 속성만 돌려주고
    // 메서드는 프로토타입에 있어 — 실제로 만료 메서드를 더해도 통과했다.
    // 프로토타입 사슬까지 훑어야 재는 것이 된다.
    const reachable: string[] = [];
    for (let o = queue as object; o !== null && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
      reachable.push(...Object.getOwnPropertyNames(o));
    }
    const removal = reachable.filter((name) => /purge|expire|prune|evict|delete|remove/i.test(name));
    expect(
      removal,
      `대기열에 지우는 경로가 생겼다: ${removal.join(', ')}. 해소만이 목록에서 빼야 한다`,
    ).toEqual([]);

    // 참조 감사 행이 살아 있는 동안은 항목도 남는다 — 그 사이에 사라지면
    // 재조정 통지라는 완화책이 무너진다. 참조가 만료한 뒤의 동참 소멸은
    // `test/app/audit/retention-finding.test.ts` 가 잰다.
    expect(queue.unresolved().map((f) => f.id)).toEqual([id]);
  });
});
