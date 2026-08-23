import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { forgetInstallTokenForTest, mintInstallToken } from '../../src/app/install/install-service.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';

/**
 * 설치 두 엔드포인트의 **HTTP 계약** (`SEC-AUTH-012` · `SEC-AUTH-013` ·
 * `SEC-AUTH-015` · `SEC-AUTH-017`).
 *
 * 판정 로직은 `install-service.ts` 가 이미 갖고 있고 단위 시험도 있다. 여기서
 * 재는 것은 **그 판정이 라우트를 통해 실제로 닿는가** 다 — 서비스가 옳아도
 * 라우트가 없으면 새 인스턴스는 아무것도 하지 못한다.
 */

let dir: string;
let runtime: ServerRuntime;
let server: Server;
let origin: string;

const post = (path: string, body: unknown) =>
  fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 토큰을 발급받는다 — 기동이 낼 값을 시험이 직접 만든다. */
const 토큰 = () => mintInstallToken({ ...runtime.stores, announce: () => undefined });

const 세션 = async (value: string) => {
  const response = await post('/api/install/verify-token', { token: value });
  return { status: response.status, body: (await response.json()) as { installSession?: string } };
};

const 설치 = (installSession: string | undefined, over: Record<string, unknown> = {}) =>
  post('/api/install/commit', {
    ...(installSession === undefined ? {} : { installSession }),
    superuserName: '설치자',
    password: 'x'.repeat(10),
    workspaceName: '기본',
    defaultGroupLevel: 'view',
    signupMode: 'approval',
    ...over,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-install-routes-'));
  forgetInstallTokenForTest();
  runtime = await bootstrap({
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'db', 'doculight.db'),
    port: 0,
  });
  server = createApp(runtime).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  await runtime.close();
  forgetInstallTokenForTest();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-015 — 설치 세션이 모든 설치 요청을 지킨다', () => {
  it('AC-1: 토큰 검증에 성공하면 설치 세션이 발급된다', async () => {
    const 결과 = await 세션(토큰());

    expect(결과.status).toBe(200);
    expect(typeof 결과.body.installSession).toBe('string');
  });

  it('AC-3: 설치 세션 없이 커밋을 부르면 거부된다', async () => {
    토큰();

    const 결과 = await 설치(undefined);

    expect(결과.status).toBe(401);
  });

  it('AC-2 · AC-4: 지어낸 설치 세션으로는 커밋이 성립하지 않는다', async () => {
    토큰();

    // 클라이언트가 단계 전환 상태를 조작해 다음 단계로 건너뛰는 경우다.
    const 결과 = await 설치('지어낸-세션-값');

    expect(결과.status).toBe(401);
  });
});

describe('SEC-AUTH-012 — 토큰 없이는 설치를 진행할 수 없다', () => {
  it('AC-2: 틀린 토큰으로는 세션이 나오지 않는다', async () => {
    토큰();

    const 결과 = await 세션('틀린값');

    expect(결과.status).toBe(401);
    expect(결과.body.installSession).toBeUndefined();
  });

  it('AC-3 · AC-4: 틀린 토큰 뒤에도 같은 토큰으로 다시 진행할 수 있다', async () => {
    const value = 토큰();
    await 세션('오타');

    // 실패가 토큰을 태우면 오타 한 번에 서버를 재기동해야 한다.
    expect((await 세션(value)).status).toBe(200);
  });

  it('AC-5 · AC-6: 커밋이 성공하면 그 토큰이 소진된다', async () => {
    const value = 토큰();
    const 열림 = await 세션(value);

    expect((await 설치(열림.body.installSession)).status).toBe(200);

    // 소진된 토큰으로는 두 번째 설치가 성립하지 않는다.
    expect((await 세션(value)).status).toBe(401);
  });
});

describe('SEC-AUTH-013 — 만료된 토큰은 거부된다', () => {
  it('AC-1 · AC-2: 30분이 지난 토큰으로는 세션이 나오지 않는다', async () => {
    const 지금 = runtime.stores.clock();
    const value = 토큰();

    // 시계를 31분 민다 — 토큰 수명은 30분이다.
    runtime.stores.clock = () => new Date(지금.getTime() + 31 * 60 * 1000);

    expect((await 세션(value)).status).toBe(401);
  });
});

describe('SEC-AUTH-017 — 고른 초기 권한이 실제 ACL 로 적용된다', () => {
  it('AC-3: 마법사에서 고른 값이 기본 워크스페이스의 default 그룹 항목이 된다', async () => {
    const 열림 = await 세션(토큰());

    const 결과 = await 설치(열림.body.installSession, { defaultGroupLevel: 'view' });
    expect(결과.status).toBe(200);

    const { workspaceId } = (await 결과.json()) as { workspaceId: string };
    const 항목 = runtime.stores.acl.entriesFor([workspaceId], [DEFAULT_GROUP_ID]);

    expect(항목.map((one) => one.level)).toEqual(['view']);
  });

  it('설치가 끝나면 최초 슈퍼유저가 선다 — 그 사실이 게이트를 연다', async () => {
    const 열림 = await 세션(토큰());
    await 설치(열림.body.installSession);

    expect(runtime.stores.principals.membersOf(SUPERUSER_GROUP_ID)).toHaveLength(1);
  });
});
