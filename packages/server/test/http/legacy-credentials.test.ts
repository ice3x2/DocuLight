import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { migrateAccounts } from '../../src/app/migration/migrate-accounts.js';
import { issueToken } from '../../src/app/auth/token-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { mcpRouter } from '../../src/http/routes/mcp.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteTokenRepository } from '../../src/infra/sqlite/token-repository.js';
import { SqliteVectorIndex } from '../../src/infra/sqlite/vector-index-repository.js';
import { attachmentStores } from '../support/acl-fixture.js';

/**
 * 이행 뒤의 1.0 전역 API Key (`MIG-AUTH-002` AC-4 · AC-5).
 *
 * 1.0 은 `X-API-Key` 헤더 하나로 전역 키를 받았고 같은 값을
 * `Authorization: Bearer` 로도 받았다(1.0 `src/middleware/auth.js`). 그
 * 클라이언트는 이행 뒤에도 같은 요청을 보내므로, **거부되는 것**과
 * **무엇으로 갈아타야 하는지 알게 되는 것** 둘을 함께 재야 한다 — 거부만
 * 하면 그 클라이언트는 자기가 왜 끊겼는지 모른 채 남는다.
 */

/** 1.0 사용자 레코드가 실은 값. `userKey` 가 그 전역 키다. */
const LEGACY_KEY = 'legacy-global-api-key';

const legacyUsersJson = {
  version: 1,
  users: [
    {
      id: 'u-1',
      email: 'han@example.com',
      passwordHash: '$2b$12$AAAAAAAAAAAAAAAAAAAAAA',
      status: 'active',
      groupId: 'g-editor',
      userKey: LEGACY_KEY,
      userKeyHash: 'sha256-of-legacy-global-api-key',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastLoginAt: null,
      failedLoginAttempts: 0,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  ],
  updatedAt: '2026-08-20T00:00:00.000Z',
};

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & {
  tokens: SqliteTokenRepository;
  vectors: SqliteVectorIndex;
};
let app: Express;
let pat: string;

const rpc = (method: string, params?: unknown) => ({
  jsonrpc: '2.0',
  id: 1,
  method,
  ...(params === undefined ? {} : { params }),
});

const issued = (r: unknown) => r as { ok: true; id: string; token: string };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-legacy-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...attachmentStores(db, docsRoot),
    tokens: new SqliteTokenRepository(db),
    vectors: new SqliteVectorIndex(db),
  };
  await createWorkspace(
    { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
    '기획팀',
  );

  // **이행을 실제로 돌린 뒤에 잰다.** AC-4 의 문면이 「이행 뒤」이므로,
  // 이행하지 않은 상태에서 재면 이행이 그 키를 옮겨 놓아도 통과한다.
  const [migrated] = migrateAccounts(stores, legacyUsersJson);
  expect(migrated).toBeDefined();

  pat = issued(
    issueToken(stores, migrated!, {
      owner: migrated!,
      name: '이행 뒤 노트북',
      scope: 'read-only',
      expiresInDays: 30,
    }),
  ).token;

  app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', mcpRouter({ stores }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

it('AC-4: 이행 뒤 1.0 전역 API Key 를 X-API-Key 로 보내면 도구가 돌지 않는다', async () => {
  const res = await request(app)
    .post('/api/mcp')
    .set('X-API-Key', LEGACY_KEY)
    .send(rpc('tools/call', { name: 'list_documents', arguments: {} }));

  expect(res.status, '1.0 전역 API Key 가 X-API-Key 로 통과했다').toBe(401);
});

it('AC-4: 같은 값을 Authorization: Bearer 로 보내도 성립하지 않는다', async () => {
  const res = await request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${LEGACY_KEY}`)
    .send(rpc('tools/list'));

  expect(res.status, '1.0 전역 API Key 가 Bearer 로 통과했다').toBe(401);
});

/**
 * 1.0 의 헤더 **경로** 자체가 자격이 되지 않는다는 것을 잰다.
 *
 * 앞 두 항은 1.0 키 값이 2.0 저장소에 없어서 거부되는 것이라, 관문이 그
 * 헤더를 자격으로 읽더라도 통과한다. 그래서 **유효한 PAT 평문**을 그 헤더에
 * 실어 보낸다 — 값은 완벽하므로, 여기서 200 이 나오면 그것은 값이 아니라
 * 경로가 열려 있다는 뜻이다.
 */
it('AC-4: X-API-Key 는 값이 유효한 토큰이어도 자격으로 읽히지 않는다', async () => {
  const res = await request(app).post('/api/mcp').set('X-API-Key', pat).send(rpc('tools/list'));

  expect(res.status, 'X-API-Key 헤더가 자격증명으로 읽혔다').toBe(401);
});

it('AC-5: X-API-Key 로 온 거부 응답이 PAT 재발급 안내를 싣는다', async () => {
  const res = await request(app)
    .post('/api/mcp')
    .set('X-API-Key', LEGACY_KEY)
    .send(rpc('tools/list'));

  const guidance = JSON.stringify(res.body);
  expect(guidance, '거부만 하고 갈아탈 곳을 알려주지 않았다').toContain('PAT');
  // 유예 없이 끊긴다는 사실이 안내에 함께 있어야 한다 — 「곧 끊긴다」로
  // 읽으면 그 클라이언트는 발급을 미룬다.
  expect(guidance).toContain('유예');
});

it('AC-5: 안내가 발급할 곳을 가리킨다 — 「발급받으십시오」만으로는 수행 불가능한 지시다', async () => {
  const res = await request(app)
    .post('/api/mcp')
    .set('X-API-Key', LEGACY_KEY)
    .send(rpc('tools/list'));

  // 그 화면이 서기 전에는 가리키지 **않는** 것이 옳았다 — 없는 화면을
  // 가리키는 안내는 안내가 아니라 오도다. `SEC-AUTH-007` AC-1 의 발급
  // 경로가 서면서 그 조건이 풀렸고, 그때부터는 가리키지 않는 쪽이 결함이다.
  const guidance = JSON.stringify(res.body);
  expect(guidance, '갈아탈 곳의 이름이 안내에 없다').toContain('액세스 토큰');
  expect(guidance, '어디서 여는지가 안내에 없다').toContain('설정');
});

it('AC-5: 안내는 1.0 클라이언트에게만 간다 — PAT 로 인증된 요청에는 실리지 않는다', async () => {
  const res = await request(app)
    .post('/api/mcp')
    .set('Authorization', `Bearer ${pat}`)
    .send(rpc('tools/list'));

  expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toContain('재발급');
});
