import { existsSync, readFileSync } from 'node:fs';
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
 * 그 산출물은 **추적되지 않는다** (`dist/` 는 gitignore 대상).
 *
 * 클린 체크아웃에서 이 시험이 파일 없음 예외로 죽으면 원인이 「자산
 * 경로가 틀렸다」로 읽히지 않는다. 그래서 의존을 명시적으로 단언하고
 * 무엇을 먼저 돌려야 하는지 메시지에 적는다 — 건너뛰면 CI 에서 조용히
 * 사라진다.
 */
const 산출물이있다 = () =>
  expect(existsSync(WEB_INDEX), `먼저 빌드하라: npm run build -w @doculight/web (${WEB_INDEX})`).toBe(
    true,
  );

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

      // **정답을 못박는다.** 빈 본문은 토큰도 세션도 없으므로 두 경로
      // 모두 401 이다. 「404 가 아니다」로 재면 500 도 통과하고, 그것은
      // 라우트가 있다는 증거가 되지 못한다.
      expect([path, response.status]).toEqual([path, 401]);
    }
  });

  it('AC-1: 빌드 산출물이 **실제로 가리키는** 자산 경로가 막히지 않는다', async () => {
    // **허용목록을 허용목록으로 재지 않는다.** 그렇게 재면 게이트가 자기
    // 설정값을 통과시킨다는 동어반복이 되고, 그 값이 빌드 산출물의 자리와
    // 어긋나 있어도 통과한다 — 실제로 그렇게 어긋나 있었고 설치 화면이
    // 껍데기만 받았다.
    산출물이있다();
    const html = readFileSync(WEB_INDEX, 'utf8');
    const 자산 = [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]!);

    // 산출물이 자산을 하나도 안 가리키면 위 단언이 공짜로 참이 된다.
    expect(자산.length).toBeGreaterThan(0);

    for (const path of 자산) {
      const response = await fetch(`${origin}${path}`);

      // **200 을 못박는다.** 「503 이 아니다」로 재면 `webRoot` 가 어긋나
      // 모든 자산이 404 가 되어도 통과하는데, 그 404 상태가 정확히 이
      // 시험이 막겠다고 선언한 「설치 화면이 껍데기만 받는」 상태다.
      expect([path, response.status]).toEqual([path, 200]);
    }
  });

  it('AC-1: 설치 화면 경로가 셸을 준다', async () => {
    expect((await fetch(`${origin}/install`)).status).toBe(200);
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

  it('관문은 열린 뒤 슈퍼유저를 다시 세지 않는다 — 매 요청 세면 정적 자산 하나마다 SQLite 가 돈다', async () => {
    await 설치한다();

    // 관문은 **모든** 요청 앞에 선다. 판정을 매번 다시 하면 번들·아이콘
    // 하나하나가 `membersOf` + 멤버 수만큼의 `findById` 를 동기로 돌리고,
    // better-sqlite3 이라 그것이 이벤트 루프를 막는다.
    let 셈 = 0;
    const 원래 = runtime.stores.principals.membersOf.bind(runtime.stores.principals);
    runtime.stores.principals.membersOf = (group) => {
      셈 += 1;
      return 원래(group);
    };

    for (let i = 0; i < 5; i += 1) await fetch(`${origin}/install`);

    // **굳는 그 한 번**만 센다 — 첫 요청이 참을 읽고, 나머지 넷은 세지
    // 않는다. 설치가 끝난 인스턴스가 설치 전으로 돌아가려면 살아 있는
    // 슈퍼유저가 전부 사라져야 하는데 `SEC-AUTH-016` 이 그 조작을
    // 거부하므로, 이 값은 단조롭다.
    expect(셈).toBe(1);
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

describe('SEC-AUTH-010 AC-1 — 설치 전 인스턴스가 사람을 설치 화면으로 보낸다', () => {
  it('브라우저가 루트를 열면 설치 화면으로 유도된다 — 평문 503 이 아니다', async () => {
    // 운영자가 브라우저에 서버 주소를 치는 것이 첫 접촉이다. 거기서
    // 「Service Unavailable」 평문을 받으면 설치 화면이 있다는 사실 자체를
    // 알 수 없고, 콘솔에도 경로를 알려 주는 줄이 없었다.
    const response = await fetch(`${origin}/`, {
      headers: { accept: 'text/html' },
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/install');
  });

  it('API 요청은 유도하지 않는다 — 리다이렉트를 JSON 으로 읽을 수 없다', async () => {
    const response = await fetch(`${origin}/api/session`, { redirect: 'manual' });

    expect(response.status).toBe(503);
  });

  it('설치 전 503 은 그 사유를 본문에 싣는다 — 다른 503 과 갈려야 한다', async () => {
    // 리버스 프록시·드레이닝·과부하도 503 이다. 상태 코드만 보고 설치
    // 화면을 세우면, 운영 중인 인스턴스가 30초 재시작하는 동안 로그인한
    // 사용자에게 「설치 토큰을 입력하세요」가 뜬다.
    const body = (await (await fetch(`${origin}/api/session`)).json()) as { state?: string };

    expect(body.state).toBe('uninstalled');
  });
});
