import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readSetting, writeSettings } from '../../../src/app/settings/instance-settings.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

/**
 * 감사 보존 ≥ 휴지통 보존 (`REL-AUDIT-003` AC-5 · 원장 `R154`).
 *
 * 감사가 더 짧으면 **삭제 기록이 휴지통 항목보다 먼저 사라진다** — 지워진
 * 문서는 아직 복구 가능한데 누가 지웠는지는 이미 모르는 상태다.
 *
 * 강제 지점이 화면이 아니라 이 경로인 이유는 화면에만 두면 API 로 뚫리기
 * 때문이고, **양방향**인 이유는 감사를 낮추는 것과 휴지통을 올리는 것이
 * 같은 역전을 만들기 때문이다.
 */

let dir: string;
let db: Database;
let store: SqliteSettingStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-retention-invariant-'));
  db = openDatabase(join(dir, 'doculight.db'));
  store = new SqliteSettingStore(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-003 AC-5 — 감사 보존은 휴지통 보존보다 짧을 수 없다', () => {
  it('감사를 휴지통보다 낮추면 거절한다', () => {
    const saved = writeSettings(store, { 'audit-retention-days': '7' });

    // 기본 휴지통 보존이 30일이다.
    expect(saved).toEqual({ ok: false, rule: 'retention-inverted' });
    expect(readSetting(store, 'audit-retention-days')).toBe('365');
  });

  it('휴지통을 감사보다 올려도 거절한다 — 같은 역전에 반대쪽으로 도달한다', () => {
    writeSettings(store, { 'audit-retention-days': '60' });

    expect(writeSettings(store, { 'trash-retention-days': '90' })).toEqual({
      ok: false,
      rule: 'retention-inverted',
    });
    expect(readSetting(store, 'trash-retention-days')).toBe('30');
  });

  it('한 번에 둘을 바꾸면 그 조합으로 판정한다', () => {
    // 순서 강제를 피하는 길이 있어야 한다 — 없으면 관리자가 두 값을
    // 올바른 순서로 넣는 법을 스스로 알아내야 한다.
    expect(writeSettings(store, { 'trash-retention-days': '90', 'audit-retention-days': '120' })).toEqual({
      ok: true,
    });
    expect(readSetting(store, 'trash-retention-days')).toBe('90');
    expect(readSetting(store, 'audit-retention-days')).toBe('120');
  });

  it('감사가 0(무제한)이면 언제나 통과한다', () => {
    expect(writeSettings(store, { 'audit-retention-days': '0' })).toEqual({ ok: true });
    expect(writeSettings(store, { 'trash-retention-days': '9999' })).toEqual({ ok: true });
  });

  it('휴지통이 0(무제한)인데 감사가 유한이면 거절한다', () => {
    // 휴지통 항목은 영원히 남는데 그것을 만든 삭제 기록만 사라진다.
    writeSettings(store, { 'audit-retention-days': '0', 'trash-retention-days': '0' });

    expect(writeSettings(store, { 'audit-retention-days': '365' })).toEqual({
      ok: false,
      rule: 'retention-inverted',
    });
  });

  it('같으면 통과한다 — 금지된 것은 짧은 것이지 같은 것이 아니다', () => {
    expect(writeSettings(store, { 'audit-retention-days': '30' })).toEqual({ ok: true });
  });

  it('보존과 무관한 설정은 이 판정을 거치지 않는다', () => {
    expect(writeSettings(store, { 'signup-mode': 'open' })).toEqual({ ok: true });
    expect(readSetting(store, 'signup-mode')).toBe('open');
  });

  it('열거에 없는 키는 여전히 거절한다', () => {
    expect(writeSettings(store, { 'trash-retention-day': '7' })).toEqual({
      ok: false,
      rule: 'unknown-key',
    });
  });
});
