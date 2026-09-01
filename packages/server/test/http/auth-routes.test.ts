import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../src/app/auth/account-service.js';
import type { AuthStores } from '../../src/app/auth/login-service.js';
import express, { Router } from 'express';

import { SESSION_COOKIE, authRouter } from '../../src/http/routes/auth.js';
import { LOGIN_ATTEMPTS_PER_WINDOW } from '../../src/http/rate-key.js';
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

  // **제품과 같은 조립으로 세운다.** 본문 파서는 `apiRouter` 가 한 번만
  // 세우므로(라우터마다 세우면 먼저 선 것이 뒤따르는 한도를 죽인다) 이
  // 라우터를 단독으로 마운트하면 제품에 없는 구성이 된다.
  const api = Router();
  api.use(express.json({ limit: '1mb' }));
  api.use(authRouter(stores));
  // **프록시 신뢰를 선언한 배포**를 세운다. 그러지 않으면 `x-forwarded-for`
  // 가 무시되어(그것이 클라이언트가 정하는 값이기 때문이다) 이 시험이
  // 출발지를 가를 방법이 없다 — 헤더가 무조건 먹히던 시절에는 그 사실이
  // 곧 제한 우회로였다.
  const app = createHttpServer({ webRoot: join(dir, 'web'), api, trustProxy: 1 });
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

  it('프록시를 선언하지 않은 배포는 그 헤더를 믿지 않는다 — 믿으면 제한이 사라진다', async () => {
    const { createHttpServer: 세우기 } = await import('../../src/http/server.js');
    const api = Router();
    api.use(express.json({ limit: '1mb' }));
    api.use(authRouter(stores));
    // `trustProxy` 를 주지 않는다 — 프록시 없는 배포다.
    const plain = 세우기({ webRoot: join(dir, 'web'), api }).listen(0);
    await new Promise((resolve) => plain.once('listening', resolve));
    const at = `http://127.0.0.1:${(plain.address() as AddressInfo).port}`;

    const 두드린다 = (ip: string) =>
      fetch(`${at}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ name: '한범', password: '틀림' }),
      });

    // 요청마다 다른 헤더를 붙인다. 그 값을 믿으면 매번 새 버킷을 받아
    // 영원히 429 가 나오지 않는다.
    try {
      for (let i = 0; i < LOGIN_ATTEMPTS_PER_WINDOW + 2; i += 1) await 두드린다(`198.51.100.${i}`);

      expect((await 두드린다('198.51.100.200')).status).toBe(429);
    } finally {
      // 단언이 죽어도 닫는다 — 안 닫으면 리스너와 제한기의 타이머가 남아
      // 뒤따르는 시험이 그 잔재 위에서 돈다.
      plain.close();
    }
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

describe('SEC-AUTH-018 — 비밀번호 변경 라우트', () => {
  const NEXT = 'y'.repeat(12);

  const 로그인쿠키 = async (password = PASSWORD) => {
    const login = await post('/api/auth/login', { name: '한범', password });
    return (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  };

  it('AC-2 · AC-3: 바꾸면 새 것으로 로그인되고 이전 것으로는 안 된다', async () => {
    const cookie = await 로그인쿠키();

    const changed = await post('/api/auth/password', { current: PASSWORD, next: NEXT }, { cookie });
    expect(changed.status).toBe(204);

    // **실제 로그인으로 잰다.** 저장된 해시만 보면 검증 경로가 그것을 쓰지
    // 않아도 통과한다.
    expect((await post('/api/auth/login', { name: '한범', password: NEXT })).status).toBe(200);
    expect((await post('/api/auth/login', { name: '한범', password: PASSWORD })).status).toBe(401);
  });

  it('현재 비밀번호가 틀리면 거절하고 아무것도 바꾸지 않는다', async () => {
    const cookie = await 로그인쿠키();

    const refused = await post('/api/auth/password', { current: '틀림', next: NEXT }, { cookie });
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { rule?: string }).rule).toBe('wrong-password');

    // 거절만 재면 「거절하고 바꿔 버리는」 구현이 통과한다.
    expect((await post('/api/auth/login', { name: '한범', password: PASSWORD })).status).toBe(200);
    expect((await post('/api/auth/login', { name: '한범', password: NEXT })).status).toBe(401);
  });

  it('인증되지 않은 요청은 401 이고 아무것도 바꾸지 않는다', async () => {
    const refused = await post('/api/auth/password', { current: PASSWORD, next: NEXT });
    expect(refused.status).toBe(401);

    expect((await post('/api/auth/login', { name: '한범', password: PASSWORD })).status).toBe(200);
  });

  it('AC-2 의 뒤끝 — 바꾸고 나면 그 계정의 기존 세션이 끊긴다', async () => {
    const cookie = await 로그인쿠키();

    await post('/api/auth/password', { current: PASSWORD, next: NEXT }, { cookie });

    // 비밀번호를 바꾸는 이유가 대개 「누가 내 계정에 들어와 있다」이므로,
    // 기존 세션이 살아 있으면 회전이 무의미하다.
    expect((await fetch(`${origin}/api/auth/me`, { headers: { cookie } })).status).toBe(401);
  });
});
