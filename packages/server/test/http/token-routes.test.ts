import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import express, { Router } from 'express';

import { registerAccount } from '../../src/app/auth/account-service.js';
import type { AuthStores } from '../../src/app/auth/login-service.js';
import { authenticateToken, issueToken, type TokenStores } from '../../src/app/auth/token-service.js';
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  TOKEN_EXPIRY_CHOICES,
} from '../../src/domain/auth/token-expiry.js';
import { authRouter } from '../../src/http/routes/auth.js';
import { createHttpServer } from '../../src/http/server.js';
import { BcryptPasswordHasher } from '../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../src/infra/sqlite/session-repository.js';
import { SqliteTokenRepository } from '../../src/infra/sqlite/token-repository.js';
import { nodeStores } from '../support/acl-fixture.js';

/**
 * PAT 발급·조회·폐기 **라우트** (`SEC-AUTH-006` AC-2 · `SEC-AUTH-007` AC-1 ·
 * AC-2 · AC-5).
 *
 * 서비스 축은 `test/app/auth/pat.test.ts` 가 이미 잰다. 여기서 재는 것은
 * 그 서비스가 **제품 표면에 닿는가**이며, 그 둘은 다른 사실이다 — 서비스가
 * 아무리 옳아도 부르는 자리가 없으면 사용자는 그 능력을 갖지 못한다.
 *
 * 그래서 이 파일은 서비스의 규칙을 다시 재지 않는다. 라우트만이 정하는 것
 * 셋을 잰다: 주체를 어디서 세우는가 · 평문이 어느 응답에 실리는가 ·
 * 서비스의 거절 사유가 어느 상태 코드로 나가는가.
 */

let dir: string;
let db: Database;
let stores: AuthStores & TokenStores;
let server: Server;
let origin: string;
let me: string;
let you: string;

const PASSWORD = 'x'.repeat(10);
const NOW = new Date('2026-08-22T09:00:00.000Z');

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/** 로그인해서 세션 쿠키 한 줄을 얻는다. 이 라우트들의 유일한 자격이다. */
const 세션 = async (name: string) => {
  const login = await send('POST', '/api/auth/login', { name, password: PASSWORD });
  return (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-patroute-'));
  await mkdir(join(dir, 'web'), { recursive: true });
  await writeFile(join(dir, 'web', 'index.html'), '<!doctype html><title>DocuLight</title>', 'utf8');
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    tokens: new SqliteTokenRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => NOW,
  };
  me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
  you = idOf(await registerAccount(stores, { name: '다른이', password: PASSWORD, status: 'active' }));

  // 제품과 같은 조립으로 세운다 — 본문 파서는 `apiRouter` 가 한 번만 세운다.
  const api = Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(authRouter(stores));
  const app = createHttpServer({ webRoot: join(dir, 'web'), api });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-007 — 주체는 세션이 정한다', () => {
  it('세션 없는 요청은 셋 다 401 이다', async () => {
    expect((await send('GET', '/api/auth/tokens')).status).toBe(401);
    expect(
      (await send('POST', '/api/auth/tokens', { name: '노트북 CLI', scope: 'read-only' })).status,
    ).toBe(401);
    expect((await send('DELETE', '/api/auth/tokens/아무거나')).status).toBe(401);
  });

  it('PAT 로는 이 경로가 열리지 않는다 — 자격이 스스로를 재생산하면 무효화가 우회된다', async () => {
    // 비밀번호 변경이 그 계정의 PAT 를 전부 무효화하는데(원장 `G33` ①),
    // PAT 로 PAT 를 발급할 수 있으면 침입자가 끊기기 전에 새 것을 심어
    // 그 무효화를 지나간다. 그래서 이 표면은 세션만 받는다.
    const 살아있는토큰 = (
      issueToken(stores, me, {
        owner: me,
        name: '기존',
        scope: 'read-write',
        expiresInDays: 30,
      }) as { ok: true; token: string }
    ).token;

    const bearer = { authorization: `Bearer ${살아있는토큰}` };

    expect((await send('GET', '/api/auth/tokens', undefined, bearer)).status).toBe(401);
    expect(
      (await send('POST', '/api/auth/tokens', { name: '새것', scope: 'read-write' }, bearer)).status,
    ).toBe(401);
  });

  it('owner 를 본문으로 받지 않는다 — 받으면 self-only 판정이 클라이언트 입력에 걸린다', async () => {
    const cookie = await 세션('한범');

    // 남의 id 를 실어 보낸다. 라우트가 그것을 읽으면 서비스가 `self-only`
    // 로 거절해 400 대가 나가고, 읽지 않으면 **내 토큰**이 만들어진다.
    const issued = await send(
      'POST',
      '/api/auth/tokens',
      { owner: you, name: '남의 것을 노린다', scope: 'read-only' },
      { cookie },
    );
    expect(issued.status).toBe(201);

    const 내목록 = (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as {
      name: string;
    }[];
    expect(내목록.map((row) => row.name)).toEqual(['남의 것을 노린다']);

    // 상대의 목록은 비어 있다 — 본문의 `owner` 가 아무 일도 하지 않았다.
    const 남의목록 = (await (
      await send('GET', '/api/auth/tokens', undefined, { cookie: await 세션('다른이') })
    ).json()) as unknown[];
    expect(남의목록).toHaveLength(0);
  });
});

describe('SEC-AUTH-007 AC-1 — 자기 PAT 를 발급한다', () => {
  it('발급 응답이 평문과 id 를 준다', async () => {
    const cookie = await 세션('한범');

    const response = await send(
      'POST',
      '/api/auth/tokens',
      { name: '노트북 CLI', scope: 'read-write' },
      { cookie },
    );

    expect(response.status).toBe(201);
    const issued = (await response.json()) as { id: string; token: string };
    expect(issued.id).toBeTruthy();
    expect(issued.token).toBeTruthy();
  });

  it('그 평문이 실제로 인증되는 값이다 — 문자열이 오는 것과 쓸 수 있는 것은 다르다', async () => {
    const cookie = await 세션('한범');

    const issued = (await (
      await send('POST', '/api/auth/tokens', { name: 'CI', scope: 'read-only' }, { cookie })
    ).json()) as { token: string };

    expect(authenticateToken(stores, issued.token)).toEqual({ userId: me, scope: 'read-only' });
  });

  it('AC-5: 발급이 감사 로그에 남는다', async () => {
    const cookie = await 세션('한범');
    await send('POST', '/api/auth/tokens', { name: 'CI', scope: 'read-only' }, { cookie });

    expect(
      db.all("SELECT operation, actor FROM audit_log WHERE operation = 'pat.issue'"),
    ).toEqual([{ operation: 'pat.issue', actor: me }]);
  });

  it('SEC-AUTH-008 AC-1: 두 스코프가 그대로 실린다', async () => {
    const cookie = await 세션('한범');

    for (const scope of ['read-only', 'read-write'] as const) {
      expect(
        (await send('POST', '/api/auth/tokens', { name: scope, scope }, { cookie })).status,
      ).toBe(201);
    }

    const rows = (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as {
      scope: string;
    }[];
    expect(rows.map((row) => row.scope).sort()).toEqual(['read-only', 'read-write']);
  });

  it('이름이 없거나 스코프가 둘 중 하나가 아니면 400 이고 아무것도 만들어지지 않는다', async () => {
    const cookie = await 세션('한범');

    expect((await send('POST', '/api/auth/tokens', { scope: 'read-only' }, { cookie })).status).toBe(400);
    expect((await send('POST', '/api/auth/tokens', { name: '', scope: 'read-only' }, { cookie })).status).toBe(400);
    expect((await send('POST', '/api/auth/tokens', { name: 'x', scope: 'admin' }, { cookie })).status).toBe(400);

    expect(
      (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as unknown[],
    ).toHaveLength(0);
  });
});

describe('SEC-AUTH-006 AC-2 — 평문은 발급 응답에만 실린다', () => {
  it('목록 응답 어디에도 평문이 없다', async () => {
    const cookie = await 세션('한범');
    const issued = (await (
      await send('POST', '/api/auth/tokens', { name: '노트북 CLI', scope: 'read-write' }, { cookie })
    ).json()) as { token: string };

    const listed = await (await send('GET', '/api/auth/tokens', undefined, { cookie })).text();

    // 본문 전체를 문자열로 훑는다 — 필드 이름을 지목해 확인하면 다른
    // 이름의 칸에 실려 나가는 구현이 그대로 통과한다.
    expect(listed).not.toContain(issued.token);
  });

  it('목록은 화면이 그릴 넷을 준다 — 이름·스코프·만료일·마지막 사용', async () => {
    const cookie = await 세션('한범');
    await send('POST', '/api/auth/tokens', { name: '노트북 CLI', scope: 'read-write' }, { cookie });

    const [row] = (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as {
      id: string;
      name: string;
      scope: string;
      expiresAt: string;
      lastUsedAt: string | null;
      revokedAt: string | null;
    }[];

    expect(row?.name).toBe('노트북 CLI');
    expect(row?.scope).toBe('read-write');
    expect(row?.expiresAt).toBeTruthy();
    // 아직 쓴 적이 없다 — 화면이 `사용 안 함` 으로 그릴 근거다.
    expect(row?.lastUsedAt).toBeNull();
    expect(row?.revokedAt).toBeNull();
  });

  it('남의 토큰은 목록에 나타나지 않는다', async () => {
    issueToken(stores, you, { owner: you, name: '남의 것', scope: 'read-only', expiresInDays: 30 });

    const rows = (await (
      await send('GET', '/api/auth/tokens', undefined, { cookie: await 세션('한범') })
    ).json()) as unknown[];

    expect(rows).toHaveLength(0);
  });
});

describe('SEC-AUTH-006 AC-3 — 만료 기간을 고른다', () => {
  it(`기본값 ${DEFAULT_TOKEN_EXPIRY_DAYS}일이 적용된다 — 안 보내도 만료일이 선다`, async () => {
    const cookie = await 세션('한범');
    await send('POST', '/api/auth/tokens', { name: 'CI', scope: 'read-only' }, { cookie });

    const [row] = (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as {
      expiresAt: string;
    }[];

    const 기대 = new Date(NOW.getTime() + DEFAULT_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    expect(row?.expiresAt).toBe(기대.toISOString());
  });

  it('고를 수 있는 값 전부가 통과한다', async () => {
    const cookie = await 세션('한범');

    for (const days of TOKEN_EXPIRY_CHOICES) {
      expect(
        (await send('POST', '/api/auth/tokens', { name: `${days}`, scope: 'read-only', expiresInDays: days }, { cookie })).status,
        `${days}일이 거절됐다`,
      ).toBe(201);
    }
  });

  it('목록 밖의 값은 400 이다 — 자유 정수를 받으면 사실상 만료 없는 토큰이 생긴다', async () => {
    const cookie = await 세션('한범');

    for (const days of [0, 7, 36500, -1, 90.5, '90']) {
      expect(
        (await send('POST', '/api/auth/tokens', { name: 'x', scope: 'read-only', expiresInDays: days }, { cookie })).status,
        `${String(days)}이 통과했다`,
      ).toBe(400);
    }

    expect(
      (await (await send('GET', '/api/auth/tokens', undefined, { cookie })).json()) as unknown[],
    ).toHaveLength(0);
  });
});

describe('SEC-AUTH-007 AC-2 · AC-4 — 폐기', () => {
  const 발급 = async (cookie: string) =>
    (await (
      await send('POST', '/api/auth/tokens', { name: '노트북 CLI', scope: 'read-write' }, { cookie })
    ).json()) as { id: string; token: string };

  it('AC-2: 자기 토큰을 폐기하면 그 토큰으로 인증이 성립하지 않는다', async () => {
    const cookie = await 세션('한범');
    const issued = await 발급(cookie);

    const revoked = await send('DELETE', `/api/auth/tokens/${issued.id}`, undefined, { cookie });

    expect(revoked.status).toBe(204);
    // 목록에서 사라지는 것만 재면 「목록에서만 감추는」 구현이 통과한다.
    expect(authenticateToken(stores, issued.token)).toBeUndefined();
  });

  it('AC-5: 폐기가 감사 로그에 남는다', async () => {
    const cookie = await 세션('한범');
    const issued = await 발급(cookie);

    await send('DELETE', `/api/auth/tokens/${issued.id}`, undefined, { cookie });

    expect(
      db.all("SELECT operation, actor FROM audit_log WHERE operation = 'pat.revoke'"),
    ).toEqual([{ operation: 'pat.revoke', actor: me }]);
  });

  it('AC-4: 남의 토큰 폐기 시도는 403 이고 그 토큰은 그대로 산다', async () => {
    const 남의것 = issueToken(stores, you, {
      owner: you,
      name: '남의 것',
      scope: 'read-only',
      expiresInDays: 30,
    }) as { ok: true; id: string; token: string };

    const refused = await send('DELETE', `/api/auth/tokens/${남의것.id}`, undefined, {
      cookie: await 세션('한범'),
    });

    expect(refused.status).toBe(403);
    expect(authenticateToken(stores, 남의것.token)).toEqual({ userId: you, scope: 'read-only' });
  });

  it('없는 토큰은 404 다 — 있는 것과 같은 자리에서 갈린다', async () => {
    const cookie = await 세션('한범');
    const issued = await 발급(cookie);

    // **둘을 한 항에서 잰다.** 404 만 단언하면 라우트가 아예 없을 때도
    // 통과한다 — 붙지 않은 경로의 응답이 바로 404 이기 때문이다. 있는 id 가
    // 204 를 주는 것과 짝지어야 이 항이 무언가를 재기 시작한다.
    expect(
      (await send('DELETE', `/api/auth/tokens/${issued.id}`, undefined, { cookie })).status,
    ).toBe(204);
    expect(
      (await send('DELETE', '/api/auth/tokens/없는-토큰', undefined, { cookie })).status,
    ).toBe(404);
  });
});
