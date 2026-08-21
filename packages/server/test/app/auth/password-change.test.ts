import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import { changePassword } from '../../../src/app/auth/password-service.js';
import { logIn, type AuthStores } from '../../../src/app/auth/login-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores;
let me: string;
let boss: string;

const OLD = 'x'.repeat(10);
const NEW = 'y'.repeat(10);
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-pw-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => new Date('2026-08-22T09:00:00.000Z'),
  };
  me = idOf(await registerAccount(stores, { name: '한범', password: OLD, status: 'active' }));
  boss = idOf(await registerAccount(stores, { name: '설치자', password: OLD, status: 'active' }));
  stores.principals.addMember(SUPERUSER_GROUP_ID, boss);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-018 — 본인이 자기 비밀번호를 변경한다', () => {
  it('AC-2 · AC-3: 새 것으로 로그인되고 이전 것으로는 안 된다', async () => {
    expect(await changePassword(stores, me, { actor: me, current: OLD, next: NEW })).toEqual({ ok: true });

    expect((await logIn(stores, { name: '한범', password: NEW })).ok).toBe(true);
    expect((await logIn(stores, { name: '한범', password: OLD })).ok).toBe(false);
  });

  it('AC-4: 슈퍼유저를 포함해 누구도 타인의 비밀번호를 바꾸지 못한다', async () => {
    expect(await changePassword(stores, me, { actor: boss, current: OLD, next: NEW })).toEqual({
      ok: false,
      rule: 'self-only',
    });

    // 그리고 실제로 안 바뀌었다.
    expect((await logIn(stores, { name: '한범', password: OLD })).ok).toBe(true);
  });

  it('현재 비밀번호를 모르면 바꾸지 못한다 — 탈취된 세션이 계정을 빼앗지 못하게 한다', async () => {
    expect(await changePassword(stores, me, { actor: me, current: '틀림', next: NEW })).toEqual({
      ok: false,
      rule: 'wrong-password',
    });
    expect((await logIn(stores, { name: '한범', password: OLD })).ok).toBe(true);
  });

  it('바꾸면 그 계정의 다른 세션이 끊긴다 — 바꾸는 이유가 대개 그것이다', async () => {
    const first = (await logIn(stores, { name: '한범', password: OLD })) as { ok: true; sessionToken: string };
    expect(first.ok).toBe(true);

    await changePassword(stores, me, { actor: me, current: OLD, next: NEW });

    const { authenticateSession } = await import('../../../src/app/auth/login-service.js');
    expect(authenticateSession(stores, first.sessionToken)).toBeUndefined();
  });
});
