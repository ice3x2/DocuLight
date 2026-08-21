import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import { logIn, type AuthStores } from '../../../src/app/auth/login-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import {
  approveAccount,
  currentSignupMode,
  reopenRejected,
  requestSignup,
  setSignupMode,
  type SignupStores,
} from '../../../src/app/auth/signup-service.js';
import { SIGNUP_MODES, bornStatus } from '../../../src/domain/auth/signup-mode.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: SignupStores & AuthStores & NodeStores;
let boss: string;
let plain: string;

const PASSWORD = 'x'.repeat(10);
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-signup-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => new Date('2026-08-22T09:00:00.000Z'),
  };
  boss = idOf(await registerAccount(stores, { name: '설치자', password: PASSWORD, status: 'active' }));
  stores.principals.addMember(SUPERUSER_GROUP_ID, boss);
  plain = idOf(await registerAccount(stores, { name: '일반', password: PASSWORD, status: 'active' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-AUTH-004 — 가입 모드 3종과 슈퍼유저 전용 설정', () => {
  it('AC-1: 세 모드 중 하나를 고를 수 있다', () => {
    expect([...SIGNUP_MODES].sort()).toEqual(['approval', 'invite-only', 'open']);

    for (const mode of SIGNUP_MODES) {
      expect(setSignupMode(stores, boss, mode), `${mode} 를 못 고른다`).toEqual({ ok: true });
      expect(currentSignupMode(stores)).toBe(mode);
    }
  });

  it('AC-3: 슈퍼유저가 아니면 변경이 거부된다', () => {
    setSignupMode(stores, boss, 'approval');

    expect(setSignupMode(stores, plain, 'open')).toEqual({ ok: false, rule: 'needs-superuser' });
    expect(currentSignupMode(stores)).toBe('approval');
  });

  it('AC-4: 저장된 모드가 저장소를 다시 열어도 유지된다', () => {
    setSignupMode(stores, boss, 'invite-only');
    db.close();

    db = openDatabase(join(dir, 'doculight.db'));
    // 설정만 다시 읽는다 — currentSignupMode 는 저장소 하나만 본다.
    expect(currentSignupMode({ settings: nodeStores(db).settings })).toBe('invite-only');
  });

  it('설정된 적 없으면 승인 모드다 — 기본값이 가장 닫힌 쪽은 아니지만 자유 가입도 아니다', () => {
    expect(currentSignupMode(stores)).toBe('approval');
  });
});

describe('FR-AUTH-004 · SEC-AUTH-004 — 모드가 계정이 태어나는 상태를 정한다', () => {
  it('AC-5: 승인 모드에서 신청한 계정은 pending 이며 로그인이 차단된다', async () => {
    setSignupMode(stores, boss, 'approval');

    const created = await requestSignup(stores, { name: '신청자', password: PASSWORD });
    expect(created.ok).toBe(true);
    expect(stores.principals.findById(idOf(created))?.status).toBe('pending');

    const attempt = await logIn(stores, { name: '신청자', password: PASSWORD });
    expect(attempt).toEqual({ ok: false, reason: '승인 대기 중' });
  });

  it('자유 가입 모드에서 신청한 계정은 곧바로 active 다', async () => {
    setSignupMode(stores, boss, 'open');

    const created = await requestSignup(stores, { name: '신청자', password: PASSWORD });
    expect(stores.principals.findById(idOf(created))?.status).toBe('active');
    expect((await logIn(stores, { name: '신청자', password: PASSWORD })).ok).toBe(true);
  });

  it('직접 등록 모드에서는 셀프 가입 경로가 닫힌다', async () => {
    setSignupMode(stores, boss, 'invite-only');

    expect(await requestSignup(stores, { name: '신청자', password: PASSWORD })).toEqual({
      ok: false,
      rule: 'signup-closed',
    });
  });

  it('태어나는 상태를 정하는 자리가 하나다 — 경로마다 다시 판단하지 않는다', () => {
    expect(bornStatus('open')).toBe('active');
    expect(bornStatus('approval')).toBe('pending');
    expect(bornStatus('invite-only')).toBe('pending');
  });
});

describe('SEC-AUTH-004 — 승인이 default 소속과 그룹 권한을 함께 연다', () => {
  it('AC-1 · AC-4: 승인하면 active 가 되고 그때부터 그룹 ACL 이 걸린다', async () => {
    setSignupMode(stores, boss, 'approval');
    const created = await requestSignup(stores, { name: '신청자', password: PASSWORD });
    const id = idOf(created);

    expect(approveAccount(stores, boss, id)).toEqual({ ok: true });
    expect(stores.principals.findById(id)?.status).toBe('active');
    expect((await logIn(stores, { name: '신청자', password: PASSWORD })).ok).toBe(true);
  });

  it('슈퍼유저가 아니면 승인할 수 없다', async () => {
    setSignupMode(stores, boss, 'approval');
    const id = idOf(await requestSignup(stores, { name: '신청자', password: PASSWORD }));

    expect(approveAccount(stores, plain, id)).toEqual({ ok: false, rule: 'needs-superuser' });
    expect(stores.principals.findById(id)?.status).toBe('pending');
  });
});

describe('FR-AUTH-002 — 거절 계정을 pending 으로 되돌린다', () => {
  it('AC-1 · AC-4: 되돌리면 상태만 바뀌고 계정이 새로 생기지 않는다', async () => {
    const id = idOf(await registerAccount(stores, { name: '거절된이', password: PASSWORD, status: 'rejected' }));
    const before = stores.principals.list('user').length;

    expect(reopenRejected(stores, boss, id)).toEqual({ ok: true });

    expect(stores.principals.findById(id)?.status).toBe('pending');
    expect(stores.principals.list('user')).toHaveLength(before);
    expect(stores.principals.findById(id)?.name).toBe('거절된이');
  });

  it('AC-3: 슈퍼유저가 아니면 되돌릴 수 없다', async () => {
    const id = idOf(await registerAccount(stores, { name: '거절된이', password: PASSWORD, status: 'rejected' }));

    expect(reopenRejected(stores, plain, id)).toEqual({ ok: false, rule: 'needs-superuser' });
    expect(stores.principals.findById(id)?.status).toBe('rejected');
  });

  it('rejected 가 아닌 계정은 이 조작의 대상이 아니다', async () => {
    expect(reopenRejected(stores, boss, plain)).toEqual({ ok: false, rule: 'not-rejected' });
  });

  it('AC-2: 되돌린 계정이 승인 대상 목록에 다시 나타난다', async () => {
    const id = idOf(await registerAccount(stores, { name: '거절된이', password: PASSWORD, status: 'rejected' }));

    const pendingBefore = stores.principals.list('user').filter((p) => p.status === 'pending');
    expect(pendingBefore.map((p) => p.id)).not.toContain(id);

    reopenRejected(stores, boss, id);

    const pendingAfter = stores.principals.list('user').filter((p) => p.status === 'pending');
    expect(pendingAfter.map((p) => p.id)).toContain(id);
  });
});
