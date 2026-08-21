import { describe, expect, it } from 'vitest';

// 스캐폴드 단계의 계약. 진입점이 「프로세스를 띄우는 일」과 「앱을 만드는 일」을
// 분리해 두어야 뒤 Task 가 서버를 띄우지 않고 앱만 테스트할 수 있다.
// 이 분리를 나중에 하려면 진입점을 쓰는 자리를 전부 고쳐야 한다.
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
});
