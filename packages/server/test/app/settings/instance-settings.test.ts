import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  INSTANCE_SETTING_KEYS,
  readSetting,
  writeSetting,
  type InstanceSettingKey,
} from '../../../src/app/settings/instance-settings.js';
import { loadConfig } from '../../../src/config/config.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSettingStore } from '../../../src/infra/sqlite/setting-store.js';

let dir: string;
let dbFile: string;
let db: Database;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-settings-'));
  dbFile = join(dir, 'doculight.db');
  db = openDatabase(dbFile);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const store = () => new SqliteSettingStore(db);

describe('DR-SHELL-001 — 런타임 설정의 단일 저장소는 DB 다', () => {
  it('AC-1: 쓰면 DB 에 들어가고 같은 값이 읽힌다', () => {
    writeSetting(store(), 'trash-retention-days', '7');

    expect(readSetting(store(), 'trash-retention-days')).toBe('7');
  });

  it('AC-1: 쓴 적 없는 키는 그 설정의 기본값으로 읽힌다', () => {
    // 기본값이 없으면 설치 직후의 인스턴스가 설정 하나마다 다르게 동작한다.
    for (const key of INSTANCE_SETTING_KEYS) {
      expect(readSetting(store(), key), `${key} 의 기본값이 없다`).toBeTruthy();
    }
  });

  it('AC-3: DB 를 닫았다 다시 열어도 값이 남는다 — 재기동이 이것이다', () => {
    writeSetting(store(), 'upload-size-limit-bytes', '1048576');
    db.close();

    db = openDatabase(dbFile);
    expect(readSetting(store(), 'upload-size-limit-bytes')).toBe('1048576');
  });

  it('AC-2: config 는 포트·docsRoot·DB 경로·프록시 홉 수 넷만 담는다', () => {
    // 여기 런타임 설정이 하나라도 들어오면 그 값의 출처가 둘이 되고,
    // 설정 모달에서 바꾼 값이 재기동에서 조용히 되돌아간다.
    //
    // 목록이 **닫혀 있다**. 판정 기준은 「DB 에 둘 수 없는 기동 값인가」
    // 이며(`R166-a`), 그것은 새 칸을 넣기 위한 열쇠가 아니라 이 넷이 왜
    // 여기 있는지의 설명이다 — 그것으로 칸을 늘리기 시작하면 닫힌 목록이
    // 아니게 된다. 넷째 칸은 `R166` 판정으로 들어왔고, 그때 요구를 먼저
    // 고친 뒤 이 줄을 고쳤다.
    expect(Object.keys(loadConfig({})).sort()).toEqual(
      ['databaseFile', 'docsRoot', 'port', 'trustProxyHops'].sort(),
    );
  });

  it('AC-2: config 의 어떤 칸도 런타임 설정 이름을 갖지 않는다', () => {
    const keys = Object.keys(loadConfig({})).join(' ');

    expect(keys).not.toMatch(/retention|signup|upload|version|limit/i);
  });

  it('IR-SHELL-002 AC-7: 다섯 설정이 모두 키를 갖는다', () => {
    expect([...INSTANCE_SETTING_KEYS].sort()).toEqual(
      [
        'signup-mode',
        'upload-size-limit-bytes',
        'retained-version-count',
        'trash-retention-days',
        'audit-retention-days',
      ].sort(),
    );
  });

  it('열거에 없는 키는 쓸 수 없다 — 오타가 조용한 기본값으로 살아남는다', () => {
    // 자유 문자열을 받으면 오타 하나가 새 설정을 만들고, 그 설정은 아무도
    // 읽지 않으므로 「저장했는데 안 바뀐다」로 나타난다.
    const typo = 'trash-retention-day' as InstanceSettingKey;

    expect(() => writeSetting(store(), typo, '7')).toThrow();
  });
});
