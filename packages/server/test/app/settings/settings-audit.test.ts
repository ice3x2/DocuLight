import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SETTINGS_OPERATIONS, writeSettings } from '../../../src/app/settings/instance-settings.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

let dir: string;
let db: Database;
let settings: SqliteSettingStore;
let audit: SqliteAuditLog;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-settings-audit-'));
  db = openDatabase(join(dir, 'doculight.db'));
  settings = new SqliteSettingStore(db);
  audit = new SqliteAuditLog(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 설정 변경은 워크스페이스에 귀속되지 않으므로 인스턴스 스코프다. */
const rows = () =>
  audit
    .inScope([], { includeInstance: true })
    .filter((row) => SETTINGS_OPERATIONS.includes(row.operation));

/** 그 행이 가리키는 설정. 조작 값이 그 축을 갖는다 (`DR-AUDIT-002` AC-8). */
const 설정 = (row: { operation: string }) => row.operation.replace('settings.', '');

describe('OBS-AUDIT-006 — 인스턴스 설정 변경을 기록한다', () => {
  it('AC-1: 이전값과 이후값이 함께 남는다', () => {
    writeSettings(settings, { 'trash-retention-days': '30' }, { audit, actor: 'u1' });

    writeSettings(settings, { 'trash-retention-days': '7' }, { audit, actor: 'u1' });

    const 마지막 = rows().find((row) => row.beforeValue === '30');
    expect(마지막).toMatchObject({
      actor: 'u1',
      beforeValue: '30',
      afterValue: '7',
      // 어느 설정인지가 없으면 「무언가 30 에서 7 로 바뀌었다」만 남는다.
      // 그 축은 조작 값이 갖는다 — `subjectId` 는 principal ID 만 담는다.
      operation: 'settings.trash-retention-days',
    });
  });

  it('AC-2 · AC-3: 두 보존 기간의 축소가 각각 기록된다', () => {
    writeSettings(settings, { 'audit-retention-days': '365', 'trash-retention-days': '90' }, { audit, actor: 'u1' });

    writeSettings(
      settings,
      { 'audit-retention-days': '180', 'trash-retention-days': '30' },
      { audit, actor: 'u1' },
    );

    const 줄인것 = rows().filter((row) => row.beforeValue === '365' || row.beforeValue === '90');
    expect(줄인것.map(설정).sort()).toEqual([
      'audit-retention-days',
      'trash-retention-days',
    ]);
  });

  it('AC-4: 한 번의 저장이 여러 필드를 바꾸면 필드마다 1행이다', () => {
    // 셋 다 **기본값과 다른** 값으로 바꾼다 — 기본값 그대로면 바뀐 것이
    // 없어 행도 없고, 그러면 이 시험이 아무것도 재지 않는다.
    writeSettings(
      settings,
      { 'audit-retention-days': '400', 'trash-retention-days': '90', 'signup-mode': 'open' },
      { audit, actor: 'u1' },
    );

    // 묶어서 1행으로 남기면 어느 설정이 무엇으로 바뀌었는지 이전값·이후값
    // 두 칸에 담을 수 없다.
    expect(rows()).toHaveLength(3);
    expect(rows().map(설정).sort()).toEqual([
      'audit-retention-days',
      'signup-mode',
      'trash-retention-days',
    ]);
  });

  it('값이 그대로면 행을 남기지 않는다 — 안 바뀐 것이 바뀐 것처럼 쌓인다', () => {
    writeSettings(settings, { 'signup-mode': 'approval' }, { audit, actor: 'u1' });
    const 처음 = rows().length;

    writeSettings(settings, { 'signup-mode': 'approval' }, { audit, actor: 'u1' });

    expect(rows()).toHaveLength(처음);
  });

  it('거절된 저장은 기록하지 않는다 — 시도와 실행이 구별되지 않는다', () => {
    // 감사 보존이 휴지통 보존보다 짧아지는 조합은 거절된다.
    const 결과 = writeSettings(
      settings,
      { 'audit-retention-days': '1', 'trash-retention-days': '90' },
      { audit, actor: 'u1' },
    );

    expect(결과.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });

  it('감사를 주지 않아도 저장은 된다 — 설치·시험 경로가 기록기를 요구하지 않는다', () => {
    expect(writeSettings(settings, { 'signup-mode': 'invite-only' }).ok).toBe(true);
  });
});
