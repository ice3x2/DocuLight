/**
 * PM2 배포 구성 (`OPS-ARCH-001` AC-4 · 원장 `R33-a`).
 *
 * **2.0 용으로 새로 쓴 구성이다.** 1.0 저장소의 구성 파일을 복사하지 않았고,
 * 여기 어느 값도 1.0 경로를 가리키지 않는다(`R21-b` · `CON-ARCH-002` AC-4).
 * PM2 라는 기술 선택만 `R33-a` 에서 물려받았다.
 *
 * 이 파일은 CommonJS 다. 저장소 루트가 `"type": "module"` 이라 `.cjs`
 * 확장자가 아니면 PM2 가 `module.exports` 를 읽지 못한다.
 */
const { join } = require('node:path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'doculight',

      // 앱은 **하나**다 (`AC-2`). 정적 산출물과 API 를 한 프로세스가 같은
      // 오리진에 올리므로 프론트엔드용 앱을 따로 두지 않는다.
      script: join(root, 'packages', 'server', 'dist', 'main.js'),
      cwd: root,

      // `fork` 다. `cluster` 로 두면 워커마다 Node 프로세스가 하나씩 생겨
      // 「프로세스 1개」가 깨지고, SQLite 단일 파일에 여러 쓰기 프로세스가
      // 붙는다.
      exec_mode: 'fork',
      instances: 1,

      // 빌드 산출물을 그대로 실행한다 — 운영에서 TypeScript 를 그때그때
      // 변환하지 않는다.
      interpreter: 'node',
      node_args: [],

      env: {
        NODE_ENV: 'production',
        // 포트를 여기 적지 않는다. 정본은 `packages/server/src/config/config.ts`
        // 의 `DEFAULT_PORT` 이고 서버가 그것을 기본값으로 쓴다 — 여기 다시
        // 적으면 값이 둘이 되고 사유도 둘이 된다.
      },

      // 데이터 자리는 배포 환경이 정한다. 여기 두지 않는 이유는 저장소에
      // 박으면 배포마다 다른 값을 파일 수정으로 바꿔야 하기 때문이다 —
      // `DOCULIGHT_DATA_DIR` · `DOCULIGHT_DOCS_ROOT` · `DOCULIGHT_DB_FILE`
      // 을 배포 환경의 환경변수로 준다. 주지 않으면 `cwd` 아래
      // `.doculight-data` 가 쓰인다.

      autorestart: true,
      max_restarts: 10,
      // 기동은 사이드카 재구성과 전체 재조정을 거친다. 볼트가 크면 그
      // 스캔이 수 초 걸리므로 그 사이의 재시작 판정을 미룬다.
      min_uptime: '30s',

      merge_logs: true,
      time: true,
    },
  ],
};
