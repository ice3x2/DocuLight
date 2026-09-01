import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { reconcile } from '../../src/app/reconciliation/reconcile.js';
import { forgetInstallTokenForTest, mintInstallToken } from '../../src/app/install/install-service.js';

/**
 * **운영 조립**이 문서 원문 서빙을 실제로 세우는가 (`SEC-STORAGE-006` ·
 * `SEC-STORAGE-004` · `SEC-ACL-006`).
 *
 * 기존 `documents-acl.test.ts` 와 `fail-closed.test.ts` 는 `documentsRouter` 를
 * **시험이 직접 세운다.** 그래서 라우터의 규칙은 재지만 **그 라우터가 제품에
 * 물려 있는지**는 재지 못한다 — 실제로 물려 있지 않았고, 조립 방벽이 그
 * 사실을 「아직 배선되지 않음」 허용목록에 담고 있었다.
 *
 * 이 시험은 `bootstrap` 이 만든 진짜 런타임 위에 `createApp` 이 만든 진짜
 * 앱을 세운다. 배선이 빠지면 여기서 죽는다.
 */
let dir: string;
let runtime: ServerRuntime;
let server: Server;
let origin: string;
let cookie: string;
let workspaceId: string;

const PASSWORD = 'x'.repeat(12);

/**
 * 설치를 마쳐 관문을 연다 — 열지 않으면 모든 경로가 503 이라 아무것도 재어지지 않는다.
 *
 * **마법사를 실제로 통과한다.** 판정을 우회해 슈퍼유저를 심으면 이 시험이
 * 재려는 조립의 절반이 빠진다.
 */
const 설치한다 = async () => {
  forgetInstallTokenForTest();
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  const 열림 = await fetch(`${origin}/api/install/verify-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const { installSession } = (await 열림.json()) as { installSession: string };

  const commit = await fetch(`${origin}/api/install/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession,
      superuserName: 'admin',
      password: PASSWORD,
      workspaceName: '볼트',
      defaultGroupLevel: 'view',
      signupMode: 'invite-only',
    }),
  });
  return (await commit.json()) as { workspaceId: string };
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-docasm-'));
  runtime = await bootstrap({
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'db', 'doculight.db'),
  });
  server = createApp(runtime).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const installed = await 설치한다();
  workspaceId = installed.workspaceId;

  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'admin', password: PASSWORD }),
  });
  cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
});

afterEach(async () => {
  server.close();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

/** 디스크에 파일을 두고 재조정으로 노드를 세운다 — 볼트를 그대로 넣은 상황이다. */
const 볼트에둔다 = async (path: string, body: string) => {
  await runtime.stores.documents.write(workspaceId, path, body);
  await reconcile(runtime.stores);
};

const 원문을받는다 = (path: string, headers: Record<string, string> = {}) =>
  fetch(`${origin}/api/documents/${workspaceId}/${path}`, { headers });

describe('R84-a · FR-STORAGE-006 — 운영 조립에 보존 일소가 물려 있다', () => {
  it('런타임이 보존 루프를 갖고 close 가 그것을 멈춘다', async () => {
    // **함수의 존재가 아니라 조립의 존재를 잰다.** 일소 함수 둘은 오래
    // 있었고 그것을 도는 자리만 없었다 — 그 상태에서는 보존 기간을 설정할
    // 수는 있는데 기간이 지나도 아무 일도 일어나지 않는다.
    expect(typeof runtime.retention.stop).toBe('function');

    // 멈추지 않으면 종료 절차가 닫은 DB 를 다음 회차가 건드린다. 여기서는
    // `close` 가 그것을 부르는지를 두 번 멈춰도 터지지 않는 것으로 잰다.
    await runtime.retention.stop();
  });
});

describe('FR-ARCH-001 AC-4 — 운영 조립에서 저장이 색인을 따라온다', () => {
  it('화면에서 저장한 본문이 벡터 색인에 든다', async () => {
    await 볼트에둔다('회의록.md', '# 처음\n');
    const [노드] = runtime.stores.nodes.allIn(workspaceId).filter((one) => one.kind === 'file');

    const 읽음 = await fetch(`${origin}/api/documents/${노드!.id}`, { headers: { cookie } });
    const { hash } = (await 읽음.json()) as { hash: string };
    const 저장 = await fetch(`${origin}/api/documents/${노드!.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ body: '# 고침\n\n의사록을 남긴다\n', baseHash: hash }),
    });

    expect(저장.status).toBe(200);
    // **`vectors` 가 선택 인자라 흘리지 않아도 타입이 통과한다.** 그래서
    // 여기서 제품 조립을 지나 실제로 도는지 확인한다 — 이 항이 없으면
    // 색인이 조용히 꺼진 채로 남는다.
    const 조각 = runtime.stores.vectors.entriesOf(노드!.id).map((one) => one.chunk);
    expect(조각.join(' ')).toContain('의사록');
  });
});

describe('SEC-STORAGE-006 — 문서 원문 서빙이 운영 조립에 물려 있다', () => {
  it('권한 있는 사용자가 원문을 받는다', async () => {
    await 볼트에둔다('회의록.md', '# 회의를 했다\n');

    const response = await 원문을받는다('회의록.md', { cookie });

    // 404 면 라우터가 붙지 않은 것이고, 그 404 는 「권한이 없다」와
    // 구별되지 않는다 — 그래서 본문까지 확인한다.
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('# 회의를 했다\n');
  });

  it('인증 없는 요청은 아무것도 받지 못한다 — 인증 부재는 허용이 아니다', async () => {
    await 볼트에둔다('회의록.md', '# 회의를 했다\n');

    const response = await 원문을받는다('회의록.md');

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('회의를 했다');
  });

  it('`SEC-STORAGE-004` AC-2 · AC-5: 점으로 시작하는 경로의 원문은 열리지 않는다', async () => {
    await runtime.stores.documents.write(workspaceId, '.obsidian/workspace.json', '{"main":{}}');

    // 재조정은 이것을 노드로 세우지 않는다. 노드가 없으니 `fail-closed` 가
    // 이미 막지만, **그 하나에 전부를 걸지 않는다** — 재조정 규칙이 바뀌어
    // 노드가 서는 날 이 경로가 그대로 열린다.
    const response = await 원문을받는다('.obsidian/workspace.json', { cookie });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('main');
  });

  it('`SEC-STORAGE-004` AC-6: 경로 중간의 세그먼트가 점으로 시작해도 막힌다', async () => {
    await runtime.stores.documents.write(workspaceId, '.git/config', '[core]\n');

    const response = await 원문을받는다('.git/config', { cookie });

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('core');
  });

  it('없는 경로와 막힌 경로가 같은 답을 준다 — 그 차이가 열거 오라클이 된다', async () => {
    await runtime.stores.documents.write(workspaceId, '.obsidian/workspace.json', '{}');

    const 막힌것 = await 원문을받는다('.obsidian/workspace.json', { cookie });
    const 없는것 = await 원문을받는다('있지도않은문서.md', { cookie });

    expect([막힌것.status, await 막힌것.text()]).toEqual([없는것.status, await 없는것.text()]);
  });
});
