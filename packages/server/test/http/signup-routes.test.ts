import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { forgetInstallTokenForTest, mintInstallToken } from '../../src/app/install/install-service.js';

/**
 * 가입 신청·승인이 **HTTP 표면에 실제로 있는가** (`FR-AUTH-004` AC-5 ·
 * `SEC-AUTH-004` · `FR-AUTH-002`).
 *
 * `signup-service.ts` 는 세 조작(신청·승인·재심사)을 모두 갖추고 있었으나
 * 그것을 부르는 라우트가 없어 조립 방벽이 그 모듈을 「아직 배선되지 않음」
 * 허용목록에 담고 있었다. 서비스만 재는 시험은 그 단절을 통과시킨다 —
 * 이 저장소가 이 회차에만 세 번 만난 형태다.
 */
let dir: string;
let runtime: ServerRuntime;
let server: Server;
let origin: string;
let bossCookie: string;

const BOSS_PASSWORD = 'x'.repeat(12);
const 신청자 = { name: 'newcomer', password: 'y'.repeat(12) };

const 설치한다 = async () => {
  forgetInstallTokenForTest();
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  const 열림 = await fetch(`${origin}/api/install/verify-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const { installSession } = (await 열림.json()) as { installSession: string };

  await fetch(`${origin}/api/install/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession,
      superuserName: 'boss',
      password: BOSS_PASSWORD,
      workspaceName: '기본',
      defaultGroupLevel: 'view',
      // 승인 흐름을 재려면 이 모드여야 한다.
      signupMode: 'approval',
    }),
  });
};

const 로그인 = async (name: string, password: string) => {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, password }),
  });
  return {
    status: response.status,
    cookie: (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '',
  };
};

const 신청한다 = (body: unknown) =>
  fetch(`${origin}/api/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** 명부에서 그 이름의 계정을 찾는다. 승인 대상을 고르는 유일한 길이다. */
const 명부에서찾는다 = async (name: string) => {
  const response = await fetch(`${origin}/api/roster/users`, { headers: { cookie: bossCookie } });
  const rows = (await response.json()) as { id: string; name: string; status: string }[];
  return rows.find((one) => one.name === name);
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-signup-'));
  runtime = await bootstrap({
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'db', 'doculight.db'),
  });
  server = createApp(runtime).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await 설치한다();
  bossCookie = (await 로그인('boss', BOSS_PASSWORD)).cookie;
});

afterEach(async () => {
  server.close();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-AUTH-004 AC-5 — 가입 신청이 HTTP 표면에 있다', () => {
  it('신청하면 계정이 `pending` 으로 서고 그 상태로는 로그인할 수 없다', async () => {
    expect((await 신청한다(신청자)).status).toBe(201);

    const 계정 = await 명부에서찾는다(신청자.name);
    expect(계정?.status).toBe('pending');

    // 상태만 재면 게이트가 그 상태를 보지 않아도 통과한다 — 실제 로그인으로
    // 막히는 것까지 확인한다.
    expect((await 로그인(신청자.name, 신청자.password)).status).toBe(401);
  });

  it('인증 없이도 신청할 수 있다 — 계정이 없는 사람이 하는 조작이다', async () => {
    // 이 라우트에 인증을 요구하면 신청 자체가 불가능해진다. 그 모순은
    // 조용해서, 라우트를 세우는 사람이 습관으로 인증을 붙이면 드러나지 않는다.
    const response = await 신청한다({ name: 'anonymous', password: 'z'.repeat(12) });

    expect(response.status).toBe(201);
  });

  it('`invite-only` 모드에서는 신청이 거절된다', async () => {
    // 모드를 서비스로 직접 바꾸지 않고 **설정 표면을 지난다** — 직접 바꾸면
    // 그 표면이 없어도 이 항이 통과한다 (`FR-AUTH-004` AC-2 · AC-4).
    const 바꿈 = await fetch(`${origin}/api/instance/signup-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bossCookie },
      body: JSON.stringify({ mode: 'invite-only' }),
    });
    expect(바꿈.status).toBe(204);

    const response = await 신청한다({ name: 'blocked', password: 'w'.repeat(12) });

    expect(response.status).toBe(403);
    expect(await 명부에서찾는다('blocked')).toBeUndefined();
  });

  it('`FR-AUTH-004` AC-3: 슈퍼유저가 아니면 가입 모드를 바꿀 수 없다', async () => {
    await 신청한다(신청자);
    const 계정 = await 명부에서찾는다(신청자.name);
    await fetch(`${origin}/api/roster/users/${계정!.id}/approve`, {
      method: 'POST',
      headers: { cookie: bossCookie },
    });
    const 일반 = await 로그인(신청자.name, 신청자.password);

    const 거절 = await fetch(`${origin}/api/instance/signup-mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 일반.cookie },
      body: JSON.stringify({ mode: 'open' }),
    });

    expect(거절.status).not.toBe(204);
    // 거절만 재면 「거절하고 바꿔 버리는」 구현이 통과한다 — 모드가 그대로여야
    // 하고, 그것은 신청이 여전히 승인 대기로 서는 것으로 확인된다.
    await 신청한다({ name: 'third', password: 'e'.repeat(12) });
    expect((await 명부에서찾는다('third'))?.status).toBe('pending');
  });
});

describe('SEC-AUTH-004 · FR-AUTH-002 — 승인과 재심사가 HTTP 표면에 있다', () => {
  const 승인한다 = (id: string, cookie: string) =>
    fetch(`${origin}/api/roster/users/${id}/approve`, { method: 'POST', headers: { cookie } });

  const 되돌린다 = (id: string, cookie: string) =>
    fetch(`${origin}/api/roster/users/${id}/reopen`, { method: 'POST', headers: { cookie } });

  it('승인하면 `active` 가 되고 그때부터 로그인된다', async () => {
    await 신청한다(신청자);
    const 계정 = await 명부에서찾는다(신청자.name);

    expect((await 승인한다(계정!.id, bossCookie)).status).toBe(204);

    expect((await 명부에서찾는다(신청자.name))?.status).toBe('active');
    // 승인의 뜻은 「로그인할 수 있다」이지 「상태 문자열이 바뀌었다」가 아니다.
    expect((await 로그인(신청자.name, 신청자.password)).status).toBe(200);
  });

  it('슈퍼유저가 아니면 승인할 수 없고 그때 상태가 그대로다', async () => {
    await 신청한다(신청자);
    const 계정 = await 명부에서찾는다(신청자.name);
    await 승인한다(계정!.id, bossCookie);

    // 승인된 일반 사용자로 붙는다 — 인증은 됐지만 자격이 없는 자리다.
    const 일반 = await 로그인(신청자.name, 신청자.password);
    await 신청한다({ name: 'second', password: 'q'.repeat(12) });
    const 둘째 = await 명부에서찾는다('second');

    const 거절 = await 승인한다(둘째?.id ?? 'none', 일반.cookie);

    expect(거절.status).not.toBe(204);
    // 거절만 재면 「거절하고 바꿔 버리는」 구현이 통과한다.
    expect((await 명부에서찾는다('second'))?.status).toBe('pending');
  });

  it('인증 없는 승인 요청은 거절된다', async () => {
    await 신청한다(신청자);
    const 계정 = await 명부에서찾는다(신청자.name);

    expect((await 승인한다(계정!.id, '')).status).toBe(401);
    expect((await 명부에서찾는다(신청자.name))?.status).toBe('pending');
  });

  it('`FR-AUTH-002` — 거절된 계정을 `pending` 으로 되돌리면 다시 승인 대상이 된다', async () => {
    await 신청한다(신청자);
    const 계정 = await 명부에서찾는다(신청자.name);

    // 거절은 기존 상태 전환 표면이 소유한다. 여기서는 그 뒤의 되돌리기를 잰다.
    await fetch(`${origin}/api/roster/users/${계정!.id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: bossCookie },
      body: JSON.stringify({ status: 'rejected' }),
    });
    expect((await 명부에서찾는다(신청자.name))?.status).toBe('rejected');

    expect((await 되돌린다(계정!.id, bossCookie)).status).toBe(204);

    expect((await 명부에서찾는다(신청자.name))?.status).toBe('pending');
  });
});
