import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config/config.js';
// **파일 상단에서 정적으로 들인다.** 시험 본문 안에서 동적으로 들이면 서버
// 조립 전체(SQLite 저장소·파일시스템 어댑터·HTTP 라우트·감시자·재조정 루프)를
// 변환하고 로드하는 비용이 그 시험 하나의 `testTimeout` 에 잡힌다 — 실측에서
// 무부하 14.8초, 부하 아래에서 20초를 넘겨 간헐 실패의 최다 원인이었다.
// 정적으로 들이면 그 비용이 vitest 의 **파일 로드 단계**로 계산되어 시험
// 타임아웃과 무관해진다. `src/main.js` 를 들이는 다른 여덟 시험 파일이 이미
// 그 형태이고 같은 사유로 죽지 않는다.
import { createApp } from '../src/main.js';

// 진입점이 「프로세스를 띄우는 일」과 「앱을 만드는 일」을 분리해 두어야
// 라우트를 서버 없이 시험할 수 있다. 이 분리를 나중에 하려면 진입점을
// 쓰는 자리를 전부 고쳐야 한다.
describe('server entry point', () => {
  it('exports createApp without starting a listener', () => {
    // 들이는 것만으로 리스너가 열리면 이 파일이 로드되는 자리에서 드러난다 —
    // `src/main.ts` 하단의 `process.argv[1]` 가드가 그 성질을 세운다.
    expect(typeof createApp).toBe('function');
  });

  it('createApp returns an express request handler', () => {
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
