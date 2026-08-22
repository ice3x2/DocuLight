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
    const app = createApp();
    expect(typeof app).toBe('function');
  });

  it('운영 기본 포트가 있고 환경변수가 그것을 이긴다', () => {
    // 번호와 그 사유의 정본은 `config.ts` 의 `DEFAULT_PORT` 다. 여기 다시
    // 적으면 값이 둘이 되므로, 여기서는 **기본값이 있다는 것**과 **환경변수가
    // 그것을 이긴다는 것**만 잰다.
    expect(loadConfig({}).port).toBeGreaterThan(0);
    expect(loadConfig({ PORT: '4321' }).port).toBe(4321);
    expect(loadConfig({ PORT: '이건 숫자가 아니다' }).port).toBe(loadConfig({}).port);
  });
});
