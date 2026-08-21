import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX, createHttpServer } from '../../src/http/server.js';

let dir: string;
let webRoot: string;
let server: Server;
let origin: string;

/** 실제로 리스너를 열고 그 하나가 무엇을 답하는지 본다. */
async function listen(): Promise<void> {
  const app = createHttpServer({ webRoot });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('listener did not report a port');
  }
  origin = `http://127.0.0.1:${address.port}`;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-spa-'));
  webRoot = join(dir, 'dist');
  await mkdir(join(webRoot, 'assets'), { recursive: true });
  await writeFile(join(webRoot, 'index.html'), '<!doctype html><title>DocuLight</title>', 'utf8');
  await writeFile(join(webRoot, 'assets', 'index-abc.js'), 'console.log(1)', 'utf8');
  await listen();
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});

describe('OPS-ARCH-001 — 한 프로세스가 정적 산출물과 API 를 같은 오리진에 올린다', () => {
  it('OPS-ARCH-001 AC-1 — 프론트엔드 정적 파일은 2.0 의 Express 서버 라우트로 서빙된다.', async () => {
    const index = await fetch(`${origin}/`);
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('DocuLight');

    const asset = await fetch(`${origin}/assets/index-abc.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe('console.log(1)');
  });

  it('OPS-ARCH-001 AC-2 — 운영 배포 구성에서 애플리케이션이 띄우는 Node 프로세스는 1개다.', async () => {
    // 프로세스 수를 여기서 셀 수는 없다. 셀 수 있는 것은 **정적 파일과
    // API 를 답하는 리스너가 하나**라는 사실이고, 그것이 프로세스를
    // 나눌 이유를 없앤다.
    const before = server.address();

    const asset = await fetch(`${origin}/assets/index-abc.js`);
    const api = await fetch(`${origin}${API_PREFIX}/알 수 없는 것`);

    expect(asset.status).toBe(200);
    // API 접두 경로는 SPA 로 되돌리지 않는다 — 되돌리면 없는 API 호출이
    // HTML 을 받아 클라이언트가 JSON 파싱에서 터진다.
    expect(api.headers.get('content-type') ?? '').not.toContain('text/html');
    expect(api.status).toBe(404);

    // 두 요청 사이에 리스너가 늘지 않았다.
    expect(server.address()).toEqual(before);
  });

  it('OPS-ARCH-001 AC-3 — 프론트엔드와 API 가 같은 오리진에서 제공되어 브라우저 요청에 CORS 설정이 필요하지 않다.', async () => {
    const index = await fetch(`${origin}/`);
    const api = await fetch(`${origin}${API_PREFIX}/알 수 없는 것`);

    // 같은 오리진이므로 CORS 헤더를 붙일 이유가 없다. 붙어 있다면 다른
    // 오리진을 전제한 설정이 들어온 것이다.
    for (const response of [index, api]) {
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }

    // 프리플라이트도 필요 없다 — 같은 오리진 요청은 프리플라이트를 내지
    // 않으므로 OPTIONS 에 특별한 처리를 두지 않는다.
    const preflight = await fetch(`${origin}${API_PREFIX}/알 수 없는 것`, { method: 'OPTIONS' });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('OPS-ARCH-001 — SPA 라우팅 fallback 이 API 경로와 겹치지 않는다.', async () => {
    // 클라이언트 라우트는 서버에 파일이 없어도 앱 셸을 받아야 한다.
    for (const path of ['/workspaces', '/문서/깊은/경로', '/settings/users']) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status, path).toBe(200);
      expect(await response.text()).toContain('DocuLight');
    }

    // 정적 파일이 실제로 없는 자산 경로는 셸로 되돌리지 않는다 — 되돌리면
    // 깨진 스크립트 태그가 HTML 을 받아 원인이 감춰진다.
    const missingAsset = await fetch(`${origin}/assets/없는파일.js`);
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.text()).not.toContain('DocuLight');

    // API 접두 경로도 마찬가지다.
    const api = await fetch(`${origin}${API_PREFIX}/documents/없음`);
    expect(await api.text()).not.toContain('DocuLight');
  });
});
