import { describe, expect, it } from 'vitest';

/**
 * 테스트 환경 자체를 지키는 방벽 — `packages/editor` 와 같은 이유다.
 *
 * 이 저장소가 도는 셸에 `NODE_ENV=production` 이 박혀 있어, 덮기가 사라지면
 * react 가 production 조건으로 해석돼 `act` 가 `undefined` 가 된다. 그러면
 * 렌더링 시험이 무더기로 깨지고, **코드는 그대로인데 어느 셸에서 돌렸는지가
 * 통과 여부를 정한다.**
 */
describe('테스트 환경', () => {
  it('production 조건으로 해석되지 않는다', async () => {
    expect(process.env.NODE_ENV).not.toBe('production');

    const react = await import('react');
    expect(
      typeof react.act,
      'react 가 production 빌드로 해석됐다. vite.config.ts 의 NODE_ENV 덮기를 확인하라',
    ).toBe('function');
  });
});
