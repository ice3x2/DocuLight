import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { INSTALL_ALLOWLIST } from '../../src/http/middleware/install-gate.js';
import { forgetInstallTokenForTest, mintInstallToken } from '../../src/app/install/install-service.js';
import { SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';

/** 빌드 산출물의 진입 HTML. 자산 경로의 정본은 여기다 — 허용목록이 아니다. */
const WEB_INDEX = resolve(import.meta.dirname, '..', '..', '..', 'web', 'dist', 'index.html');

/**
 * **운영 조립**이 설치 경로를 실제로 세우는가 (`SEC-AUTH-010` · `SEC-AUTH-011`).
 *
 * 기존 `install-gate.test.ts` 는 게이트를 시험이 **직접 주입**하고 그 뒤에
 * 아무 라우터나 세운다. 그래서 게이트 자체의 규칙은 재지만 **그 게이트가
 * 제품에 물려 있는지**는 재지 못한다 — 그 구멍이 이 결함을 낳았다.
 *
 * 이 시험은 `bootstrap` 이 만든 진짜 런타임 위에 `createApp` 이 만든 진짜
 * 앱을 세운다. 그러므로 배선이 빠지면 여기서 죽는다.
 */

let dir: string;
let runtime: ServerRuntime;
let server: Server;
let origin: string;

/** 허용목록 밖의 경로. 설치 전에는 전부 막혀야 한다. */
const BEHIND_THE_GATE = ['/api/auth/login', '/api/auth/me', '/api/workspaces', '/api/무엇이든'];

const 세운다 = async () => {
  runtime = await bootstrap({
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'db', 'doculight.db'),
    port: 0,
  });
  server = createApp(runtime).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-assembly-'));
  await 세운다();
});

afterEach(async () => {
  server.close();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-011 — 게이트가 운영 조립에 물려 있다', () => {
  it('AC-2 · AC-3 · AC-4 · AC-5 · AC-6: 설치 전에는 허용목록 밖의 모든 경로가 막힌다', async () => {
    for (const path of BEHIND_THE_GATE) {
      const response = await fetch(`${origin}${path}`);

      // 게이트가 서지 않으면 로그인 경로가 400/401 로 살아 있고, 그것은
      // 「막혔다」가 아니다.
      expect([path, response.status]).toEqual([path, 503]);
    }
  });

  it('AC-1: 허용목록의 API 두 경로에 라우트가 실제로 있다 — 404 가 아니다', async () => {
    // **POST 로 두드린다.** 두 경로는 POST 전용이라 GET 은 라우트가 있어도
    // 404 이며, 그 404 는 「라우트가 없다」와 구별되지 않는다.
    const API = INSTALL_ALLOWLIST.filter((path) => path.startsWith('/api/'));
    expect(API).toHaveLength(2);

    for (const path of API) {
      const response = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      // 게이트가 열어 준 자리에 라우트가 없으면 404 다. 그러면 게이트만
      // 서고 통과할 문이 없어 새 인스턴스가 아무것도 못 한다.
      expect([path, response.status === 404]).toEqual([path, false]);
    }
  });

  it('AC-1: 빌드 산출물이 **실제로 가리키는** 자산 경로가 막히지 않는다', async () => {
    // **허용목록을 허용목록으로 재지 않는다.** 그렇게 재면 게이트가 자기
    // 설정값을 통과시킨다는 동어반복이 되고, 그 값이 빌드 산출물의 자리와
    // 어긋나 있어도 통과한다 — 실제로 그렇게 어긋나 있었고 설치 화면이
    // 껍데기만 받았다.
    const html = readFileSync(WEB_INDEX, 'utf8');
    const 자산 = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!);

    // 산출물이 자산을 하나도 안 가리키면 위 단언이 공짜로 참이 된다.
    expect(자산.length).toBeGreaterThan(0);

    for (const path of 자산) {
      const response = await fetch(`${origin}${path}`);

      expect([path, response.status]).not.toEqual([path, 503]);
    }
  });

  it('AC-1: 설치 화면 경로 자체도 막히지 않는다', async () => {
    expect((await fetch(`${origin}/install`)).status).not.toBe(503);
  });
});

describe('SEC-AUTH-010 — 슈퍼유저 0명이면 설치 화면으로 유도된다', () => {
  it('AC-1: 갓 만든 인스턴스는 설치 전 상태다', async () => {
    // 기본 워크스페이스는 기동이 만들지만 슈퍼유저는 없다 — 그 상태가
    // 곧 「설치 전」이며, 게이트가 그것을 판정한다.
    const response = await fetch(`${origin}/api/auth/me`);

    expect(response.status).toBe(503);
  });
});

describe('SEC-AUTH-010 — 설치를 마치면 관문이 열리고 화면이 다시 서지 않는다', () => {
  /** 마법사를 실제로 통과한다 — 판정을 우회해 슈퍼유저를 심지 않는다. */
  const 설치한다 = async () => {
    forgetInstallTokenForTest();
    const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
    const 열림 = await fetch(`${origin}/api/install/verify-token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    const { installSession } = (await 열림.json()) as { installSession: string };

    return fetch(`${origin}/api/install/commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        installSession,
        superuserName: '설치자',
        password: 'x'.repeat(10),
        workspaceName: '기본',
        defaultGroupLevel: 'view',
        signupMode: 'approval',
      }),
    });
  };

  it('AC-5: 커밋 뒤에는 같은 프로세스에서 관문이 열린다', async () => {
    expect((await fetch(`${origin}/api/auth/me`)).status).toBe(503);

    expect((await 설치한다()).status).toBe(200);

    // 판정을 기동 시점에 굳히면 여기서도 계속 503 이고, 설치를 마친
    // 사람이 재기동 전까지 아무것도 하지 못한다.
    expect((await fetch(`${origin}/api/auth/me`)).status).not.toBe(503);
  });

  it('AC-3 · AC-4: 마법사가 만든 최초 슈퍼유저는 그룹 멤버이고 즉시 active 다', async () => {
    await 설치한다();

    const 멤버 = runtime.stores.principals.membersOf(SUPERUSER_GROUP_ID);
    expect(멤버).toHaveLength(1);

    // `pending` 으로 태어나면 승인해 줄 사람이 아직 없어 영원히 갇힌다.
    expect(runtime.stores.principals.findById(멤버[0]!)?.status).toBe('active');
  });

  it('AC-2: 설치를 마친 뒤에는 마법사가 다시 성립하지 않는다', async () => {
    await 설치한다();

    expect((await 설치한다()).status).toBe(400);
  });
});
