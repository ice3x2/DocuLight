import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import { changePassword } from '../../../src/app/auth/password-service.js';
import { logIn, type AuthStores } from '../../../src/app/auth/login-service.js';
import {
  authenticateToken,
  issueToken,
  revokeToken,
  type TokenStores,
} from '../../../src/app/auth/token-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores & TokenStores;
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
    tokens: new SqliteTokenRepository(db),
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

/**
 * 비밀번호 변경이 PAT 에 미치는 파급 (원장 `G33` ①).
 *
 * 세션은 끊으면서 PAT 를 남기는 것은 일관된 선택이 아니라 구멍이다 —
 * PAT 발급의 관문은 「본인인가」와 「계정이 열려 있는가」 둘뿐이라 현재
 * 비밀번호를 묻지 않고, 그래서 탈취된 세션 하나가 세션 일괄 종료를 살아
 * 넘기는 장기 자격으로 승격한다.
 */
describe('SEC-AUTH-018 — 바꾸면 그 계정의 살아 있던 PAT 가 전부 무효화된다', () => {
  const 발급 = (owner: string) =>
    issueToken(stores, owner, {
      owner,
      name: '노트북',
      scope: 'read-write',
      expiresInDays: 30,
    }) as { ok: true; id: string; token: string };

  /** 감사에 쌓인 `pat.revoke` 행 수. 값을 세야 중복 폐기가 드러난다. */
  const 폐기행수 = () =>
    db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_log WHERE operation = 'pat.revoke'",
    )[0]!.n;

  it('변경 전에 발급한 PAT 가 변경 뒤에는 서지 않는다', async () => {
    const pat = 발급(me);
    // 먼저 서는 것을 확인한다 — 그러지 않으면 이 항이 공허하다.
    expect(authenticateToken(stores, pat.token)?.userId).toBe(me);

    expect(await changePassword(stores, me, { actor: me, current: OLD, next: NEW })).toEqual({
      ok: true,
    });

    // **인증 경로로 잰다.** 저장소의 `revokedAt` 값만 보면 판정 경로가 그
    // 칸을 읽지 않아도 통과한다.
    expect(
      authenticateToken(stores, pat.token),
      '비밀번호를 바꿔도 예전 PAT 가 그대로 선다',
    ).toBeUndefined();
  });

  it('다른 계정의 PAT 는 그대로 산다 — 「전부 폐기」가 아니다', async () => {
    const 내것 = 발급(me);
    const 남의것 = 발급(boss);

    await changePassword(stores, me, { actor: me, current: OLD, next: NEW });

    expect(authenticateToken(stores, 내것.token)).toBeUndefined();
    expect(
      authenticateToken(stores, 남의것.token)?.userId,
      '남의 계정 토큰까지 끊었다',
    ).toBe(boss);
  });

  it('현재 비밀번호가 틀려 거절되면 토큰이 하나도 폐기되지 않는다', async () => {
    const pat = 발급(me);

    expect(await changePassword(stores, me, { actor: me, current: '틀림', next: NEW })).toEqual({
      ok: false,
      rule: 'wrong-password',
    });

    expect(authenticateToken(stores, pat.token)?.userId, '거절하면서 폐기했다').toBe(me);
    expect(폐기행수(), '거절했는데 감사에 폐기 행이 남았다').toBe(0);
  });

  it('본인이 아니어서 거절되면 토큰이 하나도 폐기되지 않는다', async () => {
    const pat = 발급(me);

    expect(await changePassword(stores, me, { actor: boss, current: OLD, next: NEW })).toEqual({
      ok: false,
      rule: 'self-only',
    });

    expect(authenticateToken(stores, pat.token)?.userId, '거절하면서 폐기했다').toBe(me);
    expect(폐기행수(), '거절했는데 감사에 폐기 행이 남았다').toBe(0);
  });

  it('감사에 쌓는 폐기 행 수가 살아 있던 토큰 수와 같다', async () => {
    const 첫째 = 발급(me);
    const 둘째 = 발급(me);
    const 이미폐기 = 발급(me);
    expect(revokeToken(stores, me, 이미폐기.id)).toEqual({ ok: true });
    expect(폐기행수()).toBe(1);

    await changePassword(stores, me, { actor: me, current: OLD, next: NEW });

    // 살아 있던 둘만 더해져 셋이다. 이미 폐기된 것까지 다시 폐기하면 넷이
    // 되고, 그 중복은 값을 세지 않으면 드러나지 않는다.
    expect(폐기행수(), '이미 폐기된 토큰에 폐기 행이 겹쳐 쌓였다').toBe(3);
    expect(authenticateToken(stores, 첫째.token)).toBeUndefined();
    expect(authenticateToken(stores, 둘째.token)).toBeUndefined();
  });
});
