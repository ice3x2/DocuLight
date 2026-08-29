import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],

    /**
     * 기본 5초는 이 스위트에 좁다.
     *
     * `main.ts` 를 들이는 항은 서버 조립 전체를 변환하고 로드한다 —
     * 실측에서 `transform` 만 6~9초가 걸려 5초 경계를 넘었고, 무변경
     * 트리에서도 재현됐다. 넘어가는 것 자체보다 나쁜 것은 그 뒤다:
     * 타임아웃은 정리 단계를 건너뛰므로 남은 상태가 다음 항을 함께
     * 넘어뜨린다.
     *
     * `packages/web` 이 같은 사유로 같은 값을 쓴다. 단언은 하나도
     * 바꾸지 않는다 — 넓히는 것은 창이지 기준이 아니다.
     */
    testTimeout: 20_000,
  },
});
