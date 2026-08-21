import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authenticateSession, logIn, logOut, type AuthStores } from '../../../src/app/auth/login-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores;
let now: Date;

const PASSWORD = '올바른-말-네-개';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-login-'));
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T09:00:00.000Z');
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    // 시계를 함수 뒤로 민다 — 테스트가 실제 시각을 기다리면 그 시험은
    // 느리거나 불안정하거나 둘 다가 된다.
    clock: () => now,
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const enroll = async (name: string, status: 'active' | 'pending' | 'suspended' | 'rejected' = 'active') => {
  const account = await registerAccount(stores, { name, password: PASSWORD, status });
  return (account as { ok: true; id: string }).id;
};

describe('SEC-AUTH-001 — 로그인과 세션', () => {
  it('AC-2: 로그인에 성공하면 세션이 발급된다', async () => {
    const id = await enroll('한범');

    const result = await logIn(stores, { name: '한범', password: PASSWORD });

    expect(result.ok).toBe(true);
    const token = (result as { ok: true; sessionToken: string }).sessionToken;
    expect(token).toBeTruthy();
    expect(authenticateSession(stores, token)?.userId).toBe(id);
  });

  it('AC-1: 틀린 비밀번호로는 세션이 나오지 않는다', async () => {
    await enroll('한범');

    expect((await logIn(stores, { name: '한범', password: '틀림' })).ok).toBe(false);
  });

  it('없는 계정과 틀린 비밀번호가 같은 값으로 거절된다', async () => {
    await enroll('한범');

    const wrongPassword = await logIn(stores, { name: '한범', password: '틀림' });
    const noSuchUser = await logIn(stores, { name: '없는사람', password: PASSWORD });

    // 사유가 갈리면 그 차이가 계정 존재 여부를 알려주는 오라클이 된다.
    expect(wrongPassword).toEqual(noSuchUser);
  });
});

describe('SEC-AUTH-003 · FR-AUTH-001 — 상태 게이트가 로그인 단계에서 걸린다', () => {
  it('AC-2: 비밀번호가 옳아도 active 가 아니면 차단된다', async () => {
    for (const status of ['pending', 'suspended', 'rejected'] as const) {
      await enroll(`사용자-${status}`, status);

      const result = await logIn(stores, { name: `사용자-${status}`, password: PASSWORD });

      expect(result.ok, `${status} 계정이 로그인했다`).toBe(false);
    }
  });

  it('FR-AUTH-001: 차단 사유가 상태별로 다르게 돌아온다', async () => {
    const reasons: string[] = [];
    for (const status of ['pending', 'suspended', 'rejected'] as const) {
      await enroll(`사용자-${status}`, status);
      const result = await logIn(stores, { name: `사용자-${status}`, password: PASSWORD });
      reasons.push((result as { ok: false; reason: string }).reason);
    }

    expect(reasons).toEqual(['승인 대기 중', '계정이 정지됨', '가입이 거절됨']);
  });
});

describe('SEC-AUTH-002 — 세션에 권한 스냅샷을 담지 않는다', () => {
  it('AC-1: 세션 레코드 어디에도 권한·그룹·ACL 값이 없다', async () => {
    await enroll('한범');
    await logIn(stores, { name: '한범', password: PASSWORD });

    const columns = db
      .all<{ name: string }>('PRAGMA table_info(session)')
      .map((c) => c.name.toLowerCase());

    for (const column of columns) {
      expect(column, `session.${column} 이 권한 스냅샷으로 보인다`).not.toMatch(
        /level|permission|scope|group|acl|role/,
      );
    }

    // 저장된 행에도 그런 값이 실려 있지 않다.
    const rows = db.all<Record<string, unknown>>('SELECT * FROM session');
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toMatch(/view|edit|admin/);
  });

  it('AC-3 · AC-5: 같은 세션으로 보낸 다음 요청부터 권한 변경이 반영된다', async () => {
    const id = await enroll('한범');
    const token = ((await logIn(stores, { name: '한범', password: PASSWORD })) as {
      ok: true;
      sessionToken: string;
    }).sessionToken;

    // 세션은 「누구인가」만 담는다. 무엇을 할 수 있는지는 매 요청 계산된다.
    expect(authenticateSession(stores, token)?.userId).toBe(id);

    stores.principals.setStatus(id, 'suspended');

    // 재로그인 없이 다음 조회부터 닫힌다 (`SEC-AUTH-003` AC-3 와 같은 게이트).
    expect(authenticateSession(stores, token)).toBeUndefined();
  });
});

describe('SEC-AUTH-019 — 사용자가 자기 세션을 종료한다', () => {
  it('AC-2: 로그아웃하면 그 세션으로 더는 인증되지 않는다', async () => {
    await enroll('한범');
    const token = ((await logIn(stores, { name: '한범', password: PASSWORD })) as {
      ok: true;
      sessionToken: string;
    }).sessionToken;

    expect(logOut(stores, token)).toEqual({ ok: true });
    expect(authenticateSession(stores, token)).toBeUndefined();
  });

  it('AC-4: 로그아웃이 다른 사용자의 세션에 영향을 주지 않는다', async () => {
    await enroll('한범');
    await enroll('다른이');
    const mine = ((await logIn(stores, { name: '한범', password: PASSWORD })) as { ok: true; sessionToken: string }).sessionToken;
    const yours = ((await logIn(stores, { name: '다른이', password: PASSWORD })) as { ok: true; sessionToken: string }).sessionToken;

    logOut(stores, mine);

    expect(authenticateSession(stores, mine)).toBeUndefined();
    expect(authenticateSession(stores, yours)).toBeDefined();
  });

  it('AC-4: 같은 사용자의 다른 세션도 건드리지 않는다 — 로그아웃은 이 브라우저의 일이다', async () => {
    await enroll('한범');
    const first = ((await logIn(stores, { name: '한범', password: PASSWORD })) as { ok: true; sessionToken: string }).sessionToken;
    const second = ((await logIn(stores, { name: '한범', password: PASSWORD })) as { ok: true; sessionToken: string }).sessionToken;

    logOut(stores, first);

    expect(authenticateSession(stores, first)).toBeUndefined();
    expect(authenticateSession(stores, second)).toBeDefined();
  });
});

describe('세션 토큰은 저장소에 평문으로 남지 않는다', () => {
  it('발급된 값이 그대로 DB 에 있으면 DB 유출이 곧 세션 탈취다', async () => {
    await enroll('한범');
    const token = ((await logIn(stores, { name: '한범', password: PASSWORD })) as {
      ok: true;
      sessionToken: string;
    }).sessionToken;

    const stored = JSON.stringify(db.all('SELECT * FROM session'));
    expect(stored).not.toContain(token);
  });
});
