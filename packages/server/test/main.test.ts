import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/config.js';

// 진입점이 「프로세스를 띄우는 일」과 「앱을 만드는 일」을 분리해 두어야
// 라우트를 서버 없이 시험할 수 있다. 이 분리를 나중에 하려면 진입점을
// 쓰는 자리를 전부 고쳐야 한다.
describe('server entry point', () => {
  it('exports createApp without starting a listener', async () => {
    const mod = await import('../src/main.js');
    expect(typeof mod.createApp).toBe('function');
  });

  it('createApp returns an express request handler', async () => {
    const { createApp } = await import('../src/main.js');
    const app = createApp(loadConfig({}));
    expect(typeof app).toBe('function');
  });

  it('운영 기본 포트는 3399 다 — 개발과 운영에서 사용자 주소가 같아진다', () => {
    // 개발에서는 Vite 가 이 번호로 앱을 띄우고 `/api` 를 3400 으로
    // 프록시한다. 운영에서는 한 프로세스가 둘 다 올리므로 프록시가
    // 사라지고 이 번호가 그대로 사용자 주소가 된다.
    expect(loadConfig({}).port).toBe(3399);
    expect(loadConfig({ PORT: '3400' }).port).toBe(3400);
  });
});
