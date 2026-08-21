import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { INSTALL_ALLOWLIST, installGate } from '../../src/http/middleware/install-gate.js';
import { createHttpServer } from '../../src/http/server.js';

let dir: string;
let server: Server;
let origin: string;
let installed: boolean;

/** 게이트 뒤에 아무 경로나 있다고 가정하고 그 전부가 막히는지 본다. */
const BEHIND_THE_GATE = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/documents/ws-1/문서.md',
  '/api/mcp',
  '/api/healthz',
  '/api/metrics',
  '/api/무엇이든',
];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-gate-'));
  await mkdir(join(dir, 'web'), { recursive: true });
  await writeFile(join(dir, 'web', 'index.html'), '<!doctype html><title>DocuLight</title>', 'utf8');
  installed = false;

  const app = createHttpServer({
    webRoot: join(dir, 'web'),
    // 게이트가 **모든** 라우트보다 앞선다. 뒤에 두면 그 사이에 낀 라우트가
    // 열린 채 남는다.
    gate: installGate(() => installed),
    api: (await import('express')).Router().use((_req, res) => {
      res.status(200).json({ reached: true });
    }),
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-011 — 설치 완료 전에는 허용목록 4경로만 응답한다', () => {
  it('AC-1: 허용목록이 정확히 넷이다', () => {
    expect(INSTALL_ALLOWLIST).toHaveLength(4);
  });

  it('AC-2 · AC-3 · AC-4 · AC-5 · AC-6: 그 밖의 모든 경로가 차단된다', async () => {
    for (const path of BEHIND_THE_GATE) {
      const response = await fetch(`${origin}${path}`);

      expect(response.status, `${path} 가 열려 있다`).not.toBe(200);
    }
  });

  it('AC-6: 나중에 추가된 경로라도 기본이 차단이다 — 허용목록은 열거이지 예외 목록이 아니다', async () => {
    // 게이트가 「막을 것」을 열거했다면 이런 경로는 통과한다.
    const response = await fetch(`${origin}/api/앞으로-생길-경로`);

    expect(response.status).not.toBe(200);
  });

  it('AC-1: 허용목록의 네 경로는 설치 전에도 응답한다', async () => {
    for (const path of INSTALL_ALLOWLIST) {
      const response = await fetch(`${origin}${path}`);

      // 무엇을 답하든 게이트가 막지는 않는다.
      expect(response.status, `${path} 가 설치 전에 막힌다`).not.toBe(503);
    }
  });

  it('설치가 끝나면 게이트가 열린다 — 차단이 영구가 아니다', async () => {
    expect((await fetch(`${origin}/api/auth/login`)).status).not.toBe(200);

    installed = true;

    expect((await fetch(`${origin}/api/auth/login`)).status).toBe(200);
  });

  it('설치 여부를 매 요청 다시 본다 — 기동 시점에 굳히지 않는다', async () => {
    installed = true;
    expect((await fetch(`${origin}/api/무엇이든`)).status).toBe(200);

    // 슈퍼유저가 0명으로 돌아가면 다시 닫힌다(`SEC-AUTH-010` AC-1).
    installed = false;
    expect((await fetch(`${origin}/api/무엇이든`)).status).not.toBe(200);
  });
});
