import { resolve } from 'node:path';

/**
 * 런타임 설정. **여기 있는 것은 기동에 필요한 값뿐**이다.
 *
 * 런타임에 바꿀 수 있는 설정의 단일 저장소는 DB 다(`DR-SHELL-001`) — 보존
 * 기간·업로드 상한 같은 값을 여기 두면 두 곳에서 갈린다. 이 파일은 **DB 를
 * 열기 전에 알아야 하는 것**만 갖는다.
 *
 * `2.0 의 어떤 설정도 1.0 경로를 가리키지 않는다`(`R21-b`).
 */
export interface ServerConfig {
  /** 문서 본문이 사는 곳. 본문의 SSOT 다 (`R4`). */
  docsRoot: string;
  /** 메타데이터 DB 파일 (`R20`). */
  databaseFile: string;
  /** API 포트. 운영에서는 이 프로세스가 정적 산출물도 같은 오리진에 올린다 (`R33-a`). */
  port: number;
}

// 정적 산출물의 자리는 여기 없다. 그것은 운영자가 고르는 값이 아니라
// **빌드 배치**의 사실이고, 이 목록은 셋으로 닫혀 있다(`DR-SHELL-001`
// AC-2). 칸을 두면 그 값이 배포마다 달라져 「빈 화면이 뜬다」의 원인이
// 배포 환경에 따라 갈린다.

/**
 * 운영 포트.
 *
 * 개발에서는 Vite 가 이 번호로 앱을 띄우고 `/api` 를 3400 으로 프록시한다.
 * 운영에서는 한 프로세스가 정적 산출물과 API 를 함께 올리므로 그 프록시가
 * 사라지고 이 번호가 그대로 사용자 주소가 된다 — **개발과 운영에서 주소가
 * 같아진다.** 개발용 API 프로세스는 `PORT=3400` 으로 띄운다.
 */
const DEFAULT_PORT = 3399;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DOCULIGHT_DATA_DIR ?? resolve(process.cwd(), '.doculight-data');
  const parsedPort = Number(env.PORT);

  return {
    docsRoot: env.DOCULIGHT_DOCS_ROOT ?? resolve(dataDir, 'docs'),
    databaseFile: env.DOCULIGHT_DB_FILE ?? resolve(dataDir, 'doculight.db'),
    // 사전 검사로 거른다 — 잘못된 값을 파싱 예외로 흘리면 기동 실패 사유가
    // 스택트레이스에 묻힌다.
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT,
  };
}
