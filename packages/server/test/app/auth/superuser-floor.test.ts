import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import type { AuthStores } from '../../../src/app/auth/login-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import {
  removeFromGroup,
  setAccountStatus,
  type PrincipalGuardRule,
} from '../../../src/app/principal/principal-service.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores & NodeStores;
let onlyOne: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-floor-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => new Date('2026-08-22T09:00:00.000Z'),
  };
  onlyOne = idOf(await registerAccount(stores, { name: '설치자', password: 'x'.repeat(8), status: 'active' }));
  stores.principals.addMember(SUPERUSER_GROUP_ID, onlyOne);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const REFUSED: { ok: false; rule: PrincipalGuardRule } = { ok: false, rule: 'last-active-superuser' };

const activeSuperusers = () =>
  stores.principals
    .membersOf(SUPERUSER_GROUP_ID)
    .filter((id) => stores.principals.findById(id)?.status === 'active');

describe('SEC-AUTH-016 — active 슈퍼유저를 0명으로 만드는 조작을 거부한다', () => {
  it('AC-1: 마지막 한 명을 그룹에서 빼는 조작이 거부된다', () => {
    expect(removeFromGroup(stores, SUPERUSER_GROUP_ID, onlyOne)).toEqual(REFUSED);
    expect(activeSuperusers()).toEqual([onlyOne]);
  });

  it('AC-2 · AC-3 · AC-4: 마지막 한 명의 상태를 셋 중 어느 것으로도 바꾸지 못한다', () => {
    for (const status of ['suspended', 'pending', 'rejected'] as const) {
      expect(setAccountStatus(stores, onlyOne, status), `${status} 전환이 통과한다`).toEqual(REFUSED);
      expect(stores.principals.findById(onlyOne)?.status).toBe('active');
    }
  });

  it('AC-5: 열거되지 않은 경로라도 결과가 0이면 거부된다 — 규범은 결과 상태다', () => {
    // 슈퍼유저가 둘일 때: 하나를 빼고 남은 하나를 정지시키는 두 단계.
    // 각 단계는 개별로는 「마지막」이 아니지만 두 번째 단계의 **결과**가 0 이다.
    const second = stores.principals.createUser('두번째');
    stores.principals.setStatus(second.id, 'active');
    stores.principals.addMember(SUPERUSER_GROUP_ID, second.id);

    expect(removeFromGroup(stores, SUPERUSER_GROUP_ID, second.id)).toEqual({ ok: true });
    expect(setAccountStatus(stores, onlyOne, 'suspended')).toEqual(REFUSED);
  });

  it('AC-5: active 가 아닌 멤버는 바닥을 떠받치지 못한다', () => {
    // 멤버 수는 둘이지만 active 는 하나다. 「멤버 수」로 세면 통과한다.
    const dormant = stores.principals.createUser('휴면');
    stores.principals.setStatus(dormant.id, 'suspended');
    stores.principals.addMember(SUPERUSER_GROUP_ID, dormant.id);

    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID)).toHaveLength(2);
    expect(setAccountStatus(stores, onlyOne, 'suspended'), 'active 가 아닌 멤버가 바닥으로 세어졌다').toEqual(REFUSED);
  });

  it('둘 이상이면 한 명을 빼거나 정지시킬 수 있다 — 거부가 전체로 번지지 않는다', () => {
    const second = stores.principals.createUser('두번째');
    stores.principals.setStatus(second.id, 'active');
    stores.principals.addMember(SUPERUSER_GROUP_ID, second.id);

    expect(setAccountStatus(stores, second.id, 'suspended')).toEqual({ ok: true });
    expect(activeSuperusers()).toEqual([onlyOne]);
  });

  it('슈퍼유저가 아닌 계정의 정지는 이 가드와 무관하다', async () => {
    const other = idOf(await registerAccount(stores, { name: '일반', password: 'x'.repeat(8), status: 'active' }));

    expect(setAccountStatus(stores, other, 'suspended')).toEqual({ ok: true });
  });

  it('AC-6: 주체 ACL 일괄 회수는 그룹 멤버십을 바꾸지 않으므로 걸리지 않는다', () => {
    const ws = 'ws-1';
    db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [ws, '기획팀']);
    stores.acl.grant({ nodeId: ws, principalId: onlyOne, level: 'admin', grantedBy: null });

    // 그 주체의 ACL 항목을 전부 걷는다 — 멤버십은 그대로다.
    for (const entry of stores.acl.entriesOn(ws)) stores.acl.revoke(entry.id);

    expect(activeSuperusers()).toEqual([onlyOne]);
    // 여전히 슈퍼유저이므로 우회는 살아 있다. ACL 회수가 슈퍼유저를
    // 끌어내리는 경로가 아니라는 것이 이 AC 의 내용이다.
    expect(stores.principals.groupsOf(onlyOne)).toContain(SUPERUSER_GROUP_ID);
  });
});

describe('SEC-AUTH-009 — 계정을 정지하면 그 세션도 함께 끊긴다', () => {
  it('정지된 계정의 세션이 남아 있으면 그 쿠키가 살아 있는 자격증명이 된다', async () => {
    const other = idOf(await registerAccount(stores, { name: '일반', password: 'x'.repeat(8), status: 'active' }));
    stores.sessions.create('해시값', {
      userId: other,
      createdAt: '2026-08-22T09:00:00.000Z',
      expiresAt: '2026-08-23T09:00:00.000Z',
    });

    setAccountStatus(stores, other, 'suspended');

    // 인증 단계가 상태를 다시 보므로 판정은 이미 닫혀 있다. 행까지 걷는
    // 이유는 남겨 두면 「살아 있는 세션 목록」이 사실과 어긋나기 때문이다.
    expect(stores.sessions.find('해시값')).toBeUndefined();
  });
});
