import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PERSONAL_SETTING_KEYS,
  readPersonalSetting,
  writePersonalSettings,
} from '../../../src/app/settings/personal-settings.js';
import { INSTANCE_SETTING_KEYS, readSetting, writeSetting } from '../../../src/app/settings/instance-settings.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqlitePersonalSettingStore } from '../../../src/infra/sqlite/personal-setting-store.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

let dir: string;
let db: Database;
let store: SqlitePersonalSettingStore;

const 나 = 'user-me';
const 너 = 'user-you';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-personal-'));
  db = openDatabase(join(dir, 'doculight.db'));
  store = new SqlitePersonalSettingStore(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-SHELL-002 — 개인 설정의 단일 저장소는 사용자별 DB 행이다', () => {
  it('AC-1: 쓰면 들어가고 같은 사용자로 읽으면 그 값이 나온다', () => {
    expect(writePersonalSettings(store, 나, { theme: 'dark' })).toEqual({ ok: true });

    expect(readPersonalSetting(store, 나, 'theme')).toBe('dark');
  });

  it('AC-2: 한 사용자가 바꾼 값이 다른 사용자에게 나타나지 않는다', () => {
    writePersonalSettings(store, 나, { theme: 'dark' });

    // 전역 평면 맵에 얹으면 여기서 `dark` 가 나온다 — 그것이 이 요구가
    // 인스턴스 설정 표를 쓰지 말라고 한 이유다.
    expect(readPersonalSetting(store, 너, 'theme')).toBe('system');
  });

  it('AC-3: 쓴 적 없는 항목은 그 설정의 기본값으로 읽힌다', () => {
    expect(readPersonalSetting(store, 나, 'default-view-mode')).toBe('view');
    expect(readPersonalSetting(store, 나, 'default-edit-subview')).toBe('live-preview');
    expect(readPersonalSetting(store, 나, 'theme')).toBe('system');
  });

  it('AC-4: DB 를 닫았다 다시 열어도 남는다', () => {
    writePersonalSettings(store, 나, { theme: 'light' });
    const path = join(dir, 'doculight.db');
    db.close();

    db = openDatabase(path);

    expect(readPersonalSetting(new SqlitePersonalSettingStore(db), 나, 'theme')).toBe('light');
  });

  it('AC-5: 인스턴스 설정과 서로의 값을 읽거나 덮지 않는다', () => {
    const instance = new SqliteSettingStore(db);
    writeSetting(instance, 'signup-mode', 'open');
    writePersonalSettings(store, 나, { theme: 'dark' });

    // 같은 표를 쓰면 한쪽 키가 다른 쪽 목록에 나타나거나 값이 섞인다.
    expect(readSetting(instance, 'signup-mode')).toBe('open');
    expect(readPersonalSetting(store, 나, 'theme')).toBe('dark');
    expect(PERSONAL_SETTING_KEYS.some((key) => (INSTANCE_SETTING_KEYS as readonly string[]).includes(key))).toBe(false);
  });

  it('AC-6: 열거에 없는 키는 쓸 수 없다', () => {
    expect(writePersonalSettings(store, 나, { 'font-size': '14' })).toEqual({
      ok: false,
      rule: 'unknown-key',
    });

    // 거절이 값으로 오는 것이지 조용히 통과하는 것이 아니다.
    expect(readPersonalSetting(store, 나, 'theme')).toBe('system');
  });
});

describe('IR-SHELL-004 — 두 카테고리가 담는 세 항목', () => {
  it('AC-6: 개인 설정 키는 정확히 셋이다', () => {
    expect([...PERSONAL_SETTING_KEYS].sort()).toEqual([
      'default-edit-subview',
      'default-view-mode',
      'theme',
    ]);
  });

  it('AC-3: 기본 열람 모드는 둘만 허용하고 기본값이 보기 다', () => {
    expect(writePersonalSettings(store, 나, { 'default-view-mode': 'edit' })).toEqual({ ok: true });
    expect(writePersonalSettings(store, 나, { 'default-view-mode': 'preview' })).toEqual({
      ok: false,
      rule: 'unknown-value',
    });
    expect(readPersonalSetting(store, 너, 'default-view-mode')).toBe('view');
  });

  it('AC-4: 편집 하위 뷰는 둘만 허용하고 기본값이 라이브 프리뷰 다', () => {
    expect(writePersonalSettings(store, 나, { 'default-edit-subview': 'source' })).toEqual({
      ok: true,
    });
    expect(writePersonalSettings(store, 나, { 'default-edit-subview': 'wysiwyg' })).toEqual({
      ok: false,
      rule: 'unknown-value',
    });
    expect(readPersonalSetting(store, 너, 'default-edit-subview')).toBe('live-preview');
  });

  it('AC-5: 테마는 셋만 허용하고 기본값이 시스템 이다', () => {
    for (const value of ['light', 'dark', 'system']) {
      expect(writePersonalSettings(store, 나, { theme: value })).toEqual({ ok: true });
    }
    expect(writePersonalSettings(store, 나, { theme: 'sepia' })).toEqual({
      ok: false,
      rule: 'unknown-value',
    });
    expect(readPersonalSetting(store, 너, 'theme')).toBe('system');
  });

  it('AC-7: 세 항목이 인스턴스 설정 다섯에 들어가지 않는다', () => {
    expect(INSTANCE_SETTING_KEYS).toHaveLength(5);
    for (const key of PERSONAL_SETTING_KEYS) {
      expect(INSTANCE_SETTING_KEYS as readonly string[]).not.toContain(key);
    }
  });

  it('AC-6: 자동 저장 지연과 글꼴은 항목이 아니다', () => {
    // 요구가 이름을 대어 뺀 둘이다 — 「없다」를 재지 않으면 나중에 조용히
    // 들어와도 아무도 모른다.
    for (const key of ['autosave-delay-ms', 'font-family', 'font-size']) {
      expect(writePersonalSettings(store, 나, { [key]: '값' })).toEqual({
        ok: false,
        rule: 'unknown-key',
      });
    }
  });
});
