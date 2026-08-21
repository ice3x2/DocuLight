import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../src/app/auth/account-service.js';
import type { AuthStores } from '../../src/app/auth/login-service.js';
import { LOGIN_ATTEMPTS_PER_WINDOW, SESSION_COOKIE, authRouter } from '../../src/http/routes/auth.js';
import { createHttpServer } from '../../src/http/server.js';
import { BcryptPasswordHasher } from '../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../src/infra/sqlite/session-repository.js';
import { nodeStores } from '../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores;
let server: Server;
let origin: string;

const PASSWORD = 'x'.repeat(10);

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-authroute-'));
  await mkdir(join(dir, 'web'), { recursive: true });
  await writeFile(join(dir, 'web', 'index.html'), '<!doctype html><title>DocuLight</title>', 'utf8');
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => new Date('2026-08-22T09:00:00.000Z'),
  };
  await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' });

  const app = createHttpServer({ webRoot: join(dir, 'web'), api: authRouter(stores) });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-001 — 세션 쿠키는 HttpOnly 다', () => {
  it('AC-2: 로그인 성공 시 HttpOnly 쿠키가 발급된다', async () => {
    const response = await post('/api/auth/login', { name: '한범', password: PASSWORD });

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(SESSION_COOKIE);
    // HttpOnly 가 없으면 XSS 하나로 세션이 통째로 새어 나간다.
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite');
  });

  it('세션 토큰이 응답 본문에 실리지 않는다 — 실리면 HttpOnly 가 무의미해진다', async () => {
    const response = await post('/api/auth/login', { name: '한범', password: PASSWORD });
    const cookie = response.headers.get('set-cookie') ?? '';
    const token = /doculight_session=([^;]+)/.exec(cookie)?.[1] ?? '';

    expect(token).toBeTruthy();
    expect(await response.text()).not.toContain(token);
  });

  it('실패한 로그인은 쿠키를 발급하지 않는다', async () => {
    const response = await post('/api/auth/login', { name: '한범', password: '틀림' });

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('SEC-AUTH-001 — 로그인 rate limit', () => {
  it('AC-3: 임계값을 넘은 시도가 거부된다', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < LOGIN_ATTEMPTS_PER_WINDOW + 3; i += 1) {
      statuses.push((await post('/api/auth/login', { name: '한범', password: '틀림' })).status);
    }

    expect(statuses.filter((s) => s === 429).length, '임계값을 넘겨도 거부되지 않는다').toBeGreaterThan(0);
  });

  it('AC-4 · AC-5: 카운터가 소스 IP 별로 유지된다 — 전역 단일 카운터가 아니다', async () => {
    // 한 IP 를 임계값까지 태운다.
    for (let i = 0; i < LOGIN_ATTEMPTS_PER_WINDOW + 3; i += 1) {
      await post('/api/auth/login', { name: '한범', password: '틀림' }, { 'x-forwarded-for': '203.0.113.1' });
    }
    const burned = await post('/api/auth/login', { name: '한범', password: '틀림' }, { 'x-forwarded-for': '203.0.113.1' });
    expect(burned.status).toBe(429);

    // 다른 IP 는 그대로다. 전역 카운터였다면 여기도 429 다.
    const fresh = await post('/api/auth/login', { name: '한범', password: PASSWORD }, { 'x-forwarded-for': '203.0.113.9' });
    expect(fresh.status, '한 IP 의 시도가 다른 IP 를 막았다').toBe(200);
  });
});

describe('SEC-AUTH-019 — 로그아웃', () => {
  it('AC-2: 로그아웃하면 쿠키가 지워진다', async () => {
    const login = await post('/api/auth/login', { name: '한범', password: PASSWORD });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    const out = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie } });

    expect(out.status).toBe(204);
    expect((out.headers.get('set-cookie') ?? '').toLowerCase()).toMatch(/expires=|max-age=0/);
  });

  it('AC-3: 로그아웃한 쿠키로는 세션 조회가 실패한다', async () => {
    const login = await post('/api/auth/login', { name: '한범', password: PASSWORD });
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(200);

    await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { cookie } });

    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401);
  });
});
