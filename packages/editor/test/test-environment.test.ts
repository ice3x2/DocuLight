import { describe, expect, it } from 'vitest';

/**
 * 테스트 환경 자체를 지키는 방벽.
 *
 * 이 저장소가 도는 셸에는 `NODE_ENV=production` 이 박혀 있고, vitest 는
 * 그 값이 **비어 있을 때만** `test` 로 채운다. 그대로 두면 react 가
 * production 조건으로 해석돼 `import { act } from 'react'` 가 `undefined`
 * 가 되고, vendor 테스트 39건이 `act is not a function` 으로 무더기로
 * 깨진다 — **코드는 그대로인데 어느 셸에서 돌렸는지가 통과 여부를 정한다.**
 *
 * `vite.config.ts` 가 테스트 모드에서 그 값을 덮는다. 여기 있는 것은 그
 * 덮기가 사라졌을 때 **39건이 아니라 이 한 건이 먼저 말하게** 하는 장치다.
 */
describe('테스트 환경', () => {
  it('production 조건으로 해석되지 않는다 — react 의 act 가 살아 있어야 한다', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');

    const react = await import('react');
    expect(
      typeof react.act,
      'react 가 production 빌드로 해석됐다. vite.config.ts 의 NODE_ENV 덮기를 확인하라',
    ).toBe('function');
  });
});
