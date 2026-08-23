import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrap, createApp, type ServerRuntime } from '../../src/main.js';
import { registerAccount } from '../../src/app/auth/account-service.js';
import { SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import type { ServerConfig } from '../../src/config/config.js';

let dir: string;
let config: ServerConfig;
let runtime: ServerRuntime;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-compose-'));
  config = {
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'doculight.db'),
    port: 0,
    trustProxyHops: 0,
  };
  runtime = await bootstrap(config);

  // **설치를 마친 인스턴스**를 세운다. 설치 관문이 운영 조립에 서므로
  // (`SEC-AUTH-011`) 슈퍼유저가 없으면 이 시험의 모든 경로가 503 이다 —
  // 이 시험이 재는 것은 설치 뒤의 조립이지 관문 자체가 아니다.
  const 설치자 = await registerAccount(runtime.stores, {
    name: '설치자',
    password: 'x'.repeat(10),
    status: 'active',
  });
  runtime.stores.principals.addMember(SUPERUSER_GROUP_ID, (설치자 as { ok: true; id: string }).id);
});

afterEach(async () => {
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OPS-ARCH-001 — 한 프로세스가 API 와 정적 산출물을 함께 올린다', () => {
  it('API 가 실제로 마운트된다 — 404 가 아니다', async () => {
    const app = createApp(runtime);

    const res = await request(app).get('/api/session');

    // 404 면 라우터가 안 붙은 것이다. 그때 화면은 세션을 영원히 못 받아
    // 로딩 상태에 머문다 — 앱이 통째로 안 뜬다.
    expect(res.status).not.toBe(404);
  });

  it('인증되지 않은 요청은 401 이다 — 라우터가 붙었다는 증거다', async () => {
    const app = createApp(runtime);

    expect((await request(app).get('/api/session')).status).toBe(401);
  });

  it('트리도 같은 관문을 지난다', async () => {
    const app = createApp(runtime);

    expect((await request(app).get('/api/tree')).status).toBe(401);
  });

  it('없는 API 경로는 여전히 404 다 — 포괄 핸들러가 살아 있다', async () => {
    const app = createApp(runtime);

    expect((await request(app).get('/api/no-such-thing')).status).toBe(404);
  });

  it('런타임 없이도 앱을 만들 수 있다 — 정적 산출물만 올리는 경우가 있다', () => {
    // 만들 수 있어야 정적 서빙만 시험할 수 있다. 다만 그때 API 는 없다.
    expect(() => createApp()).not.toThrow();
  });
});

describe('SEC-AUTH — 로그인 제한이 IPv6 로 우회되지 않는다', () => {
  it('같은 /64 안의 다른 주소가 같은 열쇠로 묶인다', async () => {
    const { clientRateKey } = await import('../../src/http/rate-key.js');

    // IPv6 는 한 사용자가 /64 를 통째로 쓴다 — 주소마다 열쇠를 나누면
    // 그 안에서 주소를 돌리는 것만으로 제한이 무력화된다.
    const one = clientRateKey('2001:db8:abcd:1234::1');
    const other = clientRateKey('2001:db8:abcd:1234:ffff:ffff:ffff:ffff');

    expect(one).toBe(other);
  });

  it('다른 /64 는 다른 열쇠다 — 전부 묶으면 한 사람이 모두를 잠근다', async () => {
    const { clientRateKey } = await import('../../src/http/rate-key.js');

    expect(clientRateKey('2001:db8:abcd:1234::1')).not.toBe(clientRateKey('2001:db8:abcd:9999::1'));
  });

  it('**같은 /56 안의 다른 /64** 도 갈린다 — 이 두 주소로 재지 않으면 폭이 넓어져도 통과한다', async () => {
    const { clientRateKey } = await import('../../src/http/rate-key.js');

    // 앞의 시험은 `1234` 대 `9999` 라 `/48` 부터 다르다. 그래서 묶는 폭이
    // `/56` 으로 넓어져도 통과하고, 실제로 그 상태였다 — 라이브러리 기본이
    // `/56` 이다. 이 두 주소는 `/56` 까지 같고 `/64` 에서만 갈리므로,
    // 폭이 한 칸이라도 넓어지면 여기서 죽는다.
    expect(clientRateKey('2001:db8:abcd:1200::1')).not.toBe(
      clientRateKey('2001:db8:abcd:12ff::1'),
    );
  });

  it('IPv4 는 주소 그대로다', async () => {
    const { clientRateKey } = await import('../../src/http/rate-key.js');

    expect(clientRateKey('203.0.113.7')).toBe('203.0.113.7');
    expect(clientRateKey('203.0.113.7')).not.toBe(clientRateKey('203.0.113.8'));
  });

  it('주소를 못 읽으면 하나로 묶는다 — 못 읽는 것을 무제한으로 두면 그것이 우회로다', async () => {
    const { clientRateKey } = await import('../../src/http/rate-key.js');

    expect(clientRateKey(undefined)).toBe(clientRateKey(undefined));
    expect(clientRateKey(undefined)).not.toBe(clientRateKey('203.0.113.7'));
  });
});
