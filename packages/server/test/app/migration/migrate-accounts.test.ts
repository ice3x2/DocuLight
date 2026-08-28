import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf } from '../../../src/app/acl/permission-service.js';
import { logIn } from '../../../src/app/auth/login-service.js';
import { migrateAccounts } from '../../../src/app/migration/migrate-accounts.js';
import { DEFAULT_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 1.0 계정과 자격증명의 이행 (`MIG-AUTH-002` AC-1 · AC-2 · AC-3).
 *
 * 이 파일이 재는 것은 **저장소에 무엇이 남는가**다. 1.0 전역 API Key 가
 * 2.0 에서 성립하지 않는다는 것(AC-4)과 그 클라이언트에게 안내가 닿는다는
 * 것(AC-5)은 HTTP 표면의 성질이라 `test/http/legacy-credentials.test.ts` 가
 * 소유한다 — 자격증명이 거부되는 자리는 저장소가 아니라 인증 관문이다.
 */

let dir: string;
let db: Database;
let stores: ReturnType<typeof nodeStores>;

/** 1.0 `data/users.json` 의 봉투. 이행 도구가 실제로 받는 모양이다. */
const legacyUsersJson = (users: unknown[]) => ({
  version: 1,
  users,
  updatedAt: '2026-08-20T00:00:00.000Z',
});

/**
 * 1.0 사용자 레코드 하나.
 *
 * 필드 이름과 개수를 실측(`C:\Work\git\DocuLight\DocLight\data\users.json`)에
 * 맞춘다 — 이행이 읽지 않는 필드까지 함께 넣어야, 읽는 필드만 골라 오는지가
 * 실제로 재어진다.
 */
const legacyUser = (over: Record<string, unknown> = {}) => ({
  id: 'u-1',
  email: 'han@example.com',
  passwordHash: '$2b$12$0000000000000000000000',
  status: 'active',
  groupId: 'g-editor',
  userKey: 'legacy-global-key',
  userKeyHash: 'sha256-of-legacy-global-key',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: '2026-08-01T00:00:00.000Z',
  failedLoginAttempts: 0,
  failedLoginCount: 0,
  lockedUntil: null,
  ...over,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-migrate-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

it('1.0 계정은 원래 상태가 무엇이든 이행 뒤 전원 active 다', () => {
  migrateAccounts(
    stores,
    legacyUsersJson([
      legacyUser({ id: 'u-1', email: 'active@example.com', status: 'active' }),
      legacyUser({ id: 'u-2', email: 'pending@example.com', status: 'pending' }),
      legacyUser({ id: 'u-3', email: 'locked@example.com', status: 'locked' }),
    ]),
  );

  const migrated = stores.principals.list('user');
  expect(migrated).toHaveLength(3);
  expect(migrated.map((one) => one.status)).toEqual(['active', 'active', 'active']);
});

it('이행 계정은 default 그룹 앞으로 부여된 권한을 실제로 받는다', () => {
  const workspace = stores.workspaces.create('기획팀');
  const installer = superuserActor(stores);
  const granted = grantPermission(stores, installer, {
    nodeId: workspace.id,
    principalId: DEFAULT_GROUP_ID,
    level: 'edit',
  });
  expect(granted.ok).toBe(true);

  migrateAccounts(stores, legacyUsersJson([legacyUser({ email: 'han@example.com' })]));

  const account = stores.principals.list('user').find((one) => one.name === 'han@example.com');
  expect(account).toBeDefined();
  expect(permissionOf(stores, actorFor(stores.principals, account!.id), workspace.id)).toBe('edit');
});

it('1.0 의 bcrypt 해시를 그대로 옮겨 기존 비밀번호로 로그인할 수 있다', async () => {
  // 1.0 이 실제로 쓰는 형식이다 — 비용 인자 12 의 `$2b$`(실측).
  const passwordHash = await bcrypt.hash('원래비밀번호', 12);
  expect(passwordHash.startsWith('$2b$12$')).toBe(true);

  migrateAccounts(stores, legacyUsersJson([legacyUser({ email: 'han@example.com', passwordHash })]));

  const outcome = await logIn(
    {
      principals: stores.principals,
      sessions: new SqliteSessionRepository(db),
      passwords: new BcryptPasswordHasher(),
      clock: () => new Date('2026-08-28T00:00:00.000Z'),
    },
    { name: 'han@example.com', password: '원래비밀번호' },
  );

  expect(outcome.ok).toBe(true);
});
