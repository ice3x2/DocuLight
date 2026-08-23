import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { logIn } from '../../../src/app/auth/login-service.js';
import { setAccountStatus } from '../../../src/app/principal/principal-service.js';
import {
  RESERVED_ACTORS,
  SYSTEM_RECONCILER,
} from '../../../src/domain/principal/system-principals.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';

let dir: string;
let db: Database;
let principals: SqlitePrincipalRepository;
let sessions: SqliteSessionRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-reserved-'));
  db = openDatabase(join(dir, 'doculight.db'));
  principals = new SqlitePrincipalRepository(db);
  sessions = new SqliteSessionRepository(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-AUDIT-001 — 예약 주체는 계정이 아니다', () => {
  it('AC-3: 예약 주체 ID 로는 계정이 서지 않는다', () => {
    for (const actor of RESERVED_ACTORS) expect(principals.findById(actor)).toBeUndefined();
  });

  it('AC-3: 예약 주체 ID 로 세션을 심을 수 없다 — 스키마가 막는다', () => {
    // 응용 계층의 가드만 두면 저장소를 직접 만지는 경로가 남는다. 외래키가
    // 그 경로를 닫는다는 것을 여기서 고정한다.
    expect(() =>
      sessions.create('hash-1', {
        userId: SYSTEM_RECONCILER,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    ).toThrow();
  });

  it('AC-3: 같은 이름의 계정을 만들어도 그 계정의 ID 는 예약 주체가 아니다', async () => {
    const stores = {
      principals,
      sessions,
      passwords: new BcryptPasswordHasher(),
      clock: () => new Date(),
    };
    const 위장 = principals.createUser(SYSTEM_RECONCILER);
    principals.setPasswordHash(위장.id, await stores.passwords.hash('열려라'));

    const 결과 = await logIn(stores, { name: SYSTEM_RECONCILER, password: '열려라' });

    // 로그인 자체는 된다 — 그냥 이상한 이름의 사람이다. 재는 것은 그 사람이
    // **예약 주체가 되지 않는다**는 것이다: 되면 그 사람의 조작이 감사에서
    // 하위체계의 것으로 읽힌다.
    expect(결과.ok).toBe(true);
    expect((결과 as { userId: string }).userId).not.toBe(SYSTEM_RECONCILER);
  });

  it('AC-4 · AC-5: 예약 주체의 상태 전환이 그 사유로 거절된다', () => {
    const stores = { principals, sessions };

    for (const actor of RESERVED_ACTORS) {
      const 결과 = setAccountStatus(stores, actor, 'suspended');

      // `unknown-principal` 로 떨어지면 「계정이 없어서」 막힌 것이고, 그
      // 우연은 언젠가 계정이 생기면 사라진다. 사유를 명시적으로 잰다.
      expect(결과).toEqual({ ok: false, rule: 'reserved-principal' });
    }
  });

  it('사람 계정의 상태 전환은 그대로 된다 — 거부 시험만 두면 아무도 못 바꾸는 구현이 통과한다', () => {
    const 한범 = principals.createUser('한범');

    expect(setAccountStatus({ principals, sessions }, 한범.id, 'suspended').ok).toBe(true);
    expect(principals.findById(한범.id)?.status).toBe('suspended');
  });
});
