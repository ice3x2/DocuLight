import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrap, type ServerRuntime } from '../../../src/main.js';
import { forgetInstallTokenForTest } from '../../../src/app/install/install-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';

/**
 * 기동이 설치 토큰을 **실제로 낸다** (`SEC-AUTH-012` AC-1 · `SEC-AUTH-013`
 * AC-3 · `SEC-AUTH-014`).
 *
 * 토큰은 프로세스 메모리에만 살고 그것을 읽는 API 가 없다 — 그래서 기동이
 * 콘솔에 내지 않으면 **아무도 그 값을 알 수 없고**, 설치가 영원히 불가능하다.
 */

let dir: string;
let runtime: ServerRuntime | null;
let 콘솔: ReturnType<typeof vi.spyOn>;

const 기동 = async (seq = 0) => {
  runtime = await bootstrap({
    docsRoot: join(dir, `docs-${seq}`),
    databaseFile: join(dir, `db-${seq}`, 'doculight.db'),
    port: 0,
  });
  return runtime;
};

const 출력 = () => 콘솔.mock.calls.map((one: unknown[]) => String(one[0])).join('\n');

/**
 * 출력에서 **토큰 값만** 뽑는다.
 *
 * 만료 시각은 기동마다 밀리초가 달라서, 그것까지 포함해 두 출력을 견주면
 * 토큰이 상수여도 항상 달라 아무것도 재지 못한다.
 */
const 토큰값 = () => /설치 토큰: (\S+)/.exec(출력())?.[1] ?? null;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-install-console-'));
  forgetInstallTokenForTest();
  runtime = null;
  콘솔 = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  콘솔.mockRestore();
  if (runtime !== null) await runtime.close();
  forgetInstallTokenForTest();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-012 — 설치 토큰이 기동 콘솔에 나온다', () => {
  it('AC-1: 슈퍼유저가 0명이면 기동이 토큰을 낸다', async () => {
    await 기동();

    expect(출력()).toMatch(/설치 토큰/);
  });

  it('설치를 마친 인스턴스는 토큰을 내지 않는다 — 낼 이유가 없고, 내면 다시 여는 문이 된다', async () => {
    const first = await 기동(0);
    const 설치자 = await registerAccount(first.stores, {
      name: '설치자',
      password: 'x'.repeat(10),
      status: 'active',
    });
    first.stores.principals.addMember(SUPERUSER_GROUP_ID, (설치자 as { ok: true; id: string }).id);
    await first.close();
    콘솔.mockClear();

    // 같은 DB 로 다시 기동한다 — 이미 설치된 인스턴스의 재기동이다.
    runtime = await bootstrap({
      docsRoot: join(dir, 'docs-0'),
      databaseFile: join(dir, 'db-0', 'doculight.db'),
      port: 0,
    });

    expect(출력()).not.toMatch(/설치 토큰/);
  });
});

describe('SEC-AUTH-013 — 만료 시각이 절대시각으로 함께 나온다', () => {
  it('AC-3: 「30분 뒤」가 아니라 절대시각이다', async () => {
    await 기동();

    // 로그를 나중에 읽는 사람은 그 줄이 언제 찍혔는지 모른다 — 상대
    // 시간은 그 사람에게 아무것도 알려 주지 않는다.
    expect(출력()).toMatch(/만료: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('SEC-AUTH-014 — 재기동이 새 토큰을 낸다', () => {
  it('AC-1 · AC-3: 두 번째 기동의 토큰 값이 첫 번째와 다르다', async () => {
    await 기동(0);
    const 첫값 = 토큰값();
    await runtime!.close();
    runtime = null;
    콘솔.mockClear();

    await 기동(1);

    // **토큰 값만** 견준다. 출력 전체를 견주면 만료 시각의 밀리초 차이가
    // 항상 두 문자열을 다르게 만들어, 토큰이 상수여도 통과한다.
    expect(첫값).not.toBeNull();
    expect(토큰값()).not.toBeNull();
    expect(토큰값()).not.toBe(첫값);
  });
});
