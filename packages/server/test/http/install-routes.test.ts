import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { forgetInstallTokenForTest, mintInstallToken } from '../../src/app/install/install-service.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { INSTALL_ATTEMPTS_PER_WINDOW } from '../../src/http/rate-key.js';

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

describe('SEC-AUTH-012 — 토큰 추측이 제한된다', () => {
  it('AC-2: 임계값을 넘긴 토큰 검증 시도가 거부된다 — 30분 동안 무제한이면 토큰을 긁을 수 있다', async () => {
    // 설치 토큰은 관문이 **인증 없이** 여는 두 경로 뒤에 있다. 제한이
    // 없으면 그 창 동안 아무나 값을 무한히 두드릴 수 있고, 성공하면 그
    // 인스턴스의 최초 슈퍼유저가 된다.
    const statuses: number[] = [];
    for (let i = 0; i < INSTALL_ATTEMPTS_PER_WINDOW + 3; i += 1) {
      statuses.push((await post('/api/install/verify-token', { token: '틀림' })).status);
    }

    expect(statuses.filter((one) => one === 429).length, '임계값을 넘겨도 거부되지 않는다').toBeGreaterThan(0);
    // 앞쪽은 정상 판정을 받아야 한다 — 전부 429 면 첫 요청부터 막힌 것이고
    // 그것은 설치가 아예 불가능하다는 뜻이다.
    expect(statuses[0]).toBe(401);
  });
});

describe('SEC-AUTH-013 — 만료된 토큰은 거부된다', () => {
  it('AC-1: 29분에는 살아 있고 31분에는 죽는다 — 경계가 30분이다', async () => {
    const 지금 = runtime.stores.clock();
    const value = 토큰();

    // **양쪽을 다 잰다.** 만료만 재면 수명을 1분으로 줄여도 통과해,
    // 30분이라는 값 자체는 아무것도 고정되지 않는다.
    runtime.stores.clock = () => new Date(지금.getTime() + 29 * 60 * 1000);
    expect((await 세션(value)).status).toBe(200);

    runtime.stores.clock = () => new Date(지금.getTime() + 31 * 60 * 1000);
    expect((await 세션(value)).status).toBe(401);
  });
});

describe('SEC-AUTH-012 — 거절 사유가 **그 문자열 그대로** 전선을 탄다', () => {
  it('빈 비밀번호는 400 과 `empty-password` 를 받는다 — 화면의 사전이 이 값에 물려 있다', async () => {
    const { body } = await 세션(토큰());

    const response = await 설치(body.installSession, { password: '' });

    // 이 값은 `packages/web` 의 설치 마법사가 문구를 고를 때 쓰는 열쇠다.
    // 두 꾸러미는 서로를 import 하지 않으므로 이름이 바뀌어도 컴파일이
    // 막아 주지 않는다 — 생산하는 쪽에서 못박아야 그 변경이 여기서 죽는다.
    expect([response.status, ((await response.json()) as { rule?: string }).rule]).toEqual([
      400,
      'empty-password',
    ]);
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

describe('SEC-WORKSPACE-002 · SEC-AUTH-017 — 라우트가 열거를 경계에서 다시 세운다', () => {
  it('관리 레벨은 설치로도 부여되지 않는다 — 타입은 런타임에 아무것도 막지 않는다', async () => {
    const 열림 = await 세션(토큰());

    // `GrantLevel` 이 admin 을 빼는 것은 관리를 워크스페이스에만 두기
    // 위해서다. HTTP 경계는 그 타입이 사라지는 자리이므로 여기서 다시
    // 세우지 않으면 인증 없는 요청이 default 그룹에 최상위 권한을 준다.
    const 결과 = await 설치(열림.body.installSession, { defaultGroupLevel: 'admin' });

    expect(결과.status).toBe(400);
    expect(runtime.stores.principals.membersOf(SUPERUSER_GROUP_ID)).toHaveLength(0);
  });

  it('알 수 없는 가입 모드도 거부된다 — 읽는 쪽 폴백이 있어도 저장은 남는다', async () => {
    const 열림 = await 세션(토큰());

    const 결과 = await 설치(열림.body.installSession, { signupMode: '없는모드' });

    expect(결과.status).toBe(400);
  });

  it('열거 안의 값은 그대로 통과한다 — 거부만 재면 아무것도 못 받는 검사가 통과한다', async () => {
    const 열림 = await 세션(토큰());

    expect((await 설치(열림.body.installSession, { defaultGroupLevel: 'none' })).status).toBe(200);
  });
});

describe('SEC-AUTH-012 · SEC-AUTH-015 — 거절 사유가 실제 사유와 일치한다', () => {
  it('타입이 틀린 칸은 열거 오류가 아니라 그 사실대로 답한다', async () => {
    const { body } = await 세션(토큰());

    // `password: 123` 에 「가입 모드나 초기 권한 값이 올바르지 않습니다」를
    // 답하면 사용자는 엉뚱한 칸을 고친다. 사유를 내주기로 한 이유가
    // 「무엇을 고칠지 알려 준다」이므로, 틀린 사유는 사유가 없는 것보다 나쁘다.
    const response = await 설치(body.installSession, { password: 123 });

    expect([response.status, ((await response.json()) as { rule?: string }).rule]).toEqual([
      400,
      'bad-field',
    ]);
  });

  it('진행 중인 커밋의 패자는 「이미 설치됨」이 아니라 「진행 중」을 받는다', async () => {
    const { body } = await 세션(토큰());
    const session = body.installSession;

    // 선행 요청이 뒤에서 실패하면 인스턴스는 설치되지 않은 상태로 남는다.
    // 그때 패자에게 「이미 설치가 끝났습니다」를 답하면 운영자는 성공했다고
    // 믿고 창을 닫는다 — 그 인스턴스에는 아무도 들어갈 수 없다.
    const [a, b] = await Promise.all([
      설치(session, { superuserName: '먼저' }),
      설치(session, { superuserName: '나중' }),
    ]);
    const 진 = a.status === 200 ? b : a;

    expect([진.status, ((await 진.json()) as { rule?: string }).rule]).toEqual([
      409,
      'commit-in-flight',
    ]);
  });

  it('설치 커밋에도 요청 제한이 걸린다 — 관문이 인증 없이 여는 나머지 한 경로다', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < INSTALL_ATTEMPTS_PER_WINDOW + 3; i += 1) {
      statuses.push((await 설치(undefined)).status);
    }

    expect(statuses.filter((one) => one === 429).length, '커밋 경로가 무제한이다').toBeGreaterThan(0);
  });
});

describe('동시 설치가 성립하지 않는다 — 더블클릭이 슈퍼유저 둘을 만들면 안 된다', () => {
  it('같은 세션으로 두 요청을 동시에 보내면 하나만 성립한다', async () => {
    const 열림 = await 세션(토큰());
    const session = 열림.body.installSession;

    // 두 검사(설치 여부·세션)는 동기이고 그 뒤 해싱이 양보한다. 그 틈에
    // 들어온 두 번째 요청이 같은 검사를 모두 통과하던 자리다.
    //
    // **이름을 다르게 준다.** 같은 이름으로 두 번 보내면 `name-taken` 이
    // 두 번째를 거절해, 진행 중 가드를 통째로 걷어내도 이 시험이 통과한다
    // — 그 상태를 실측으로 확인했다. 그때 재고 있던 것은 이름 중복이지
    // 동시성이 아니었다.
    const [a, b] = await Promise.all([
      설치(session, { superuserName: '먼저' }),
      설치(session, { superuserName: '나중' }),
    ]);

    expect([a.status, b.status].filter((one) => one === 200)).toHaveLength(1);
    expect(runtime.stores.principals.membersOf(SUPERUSER_GROUP_ID)).toHaveLength(1);
  });
});
