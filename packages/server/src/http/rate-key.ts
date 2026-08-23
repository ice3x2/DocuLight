import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

/** IPv6 를 묶는 폭. 한 사용자에게 대개 이 크기가 통째로 배정된다. */
const IPV6_PREFIX_BITS = 64;

/**
 * 요청 제한의 **출발지 열쇠** (`R57` · `R72-i`).
 *
 * 전역 단일 카운터를 쓰면 한 사람의 오타가 전 사용자를 잠근다 — 그것은
 * 방어가 아니라 서비스 거부다. 그래서 출발지 단위로 가른다.
 *
 * IPv6 는 **`/64` 단위로 묶는다.** 한 사용자에게 그 블록이 통째로 배정되는
 * 것이 보통이라, 주소마다 열쇠를 나누면 그 안에서 주소를 돌리는 것만으로
 * 제한이 무력화된다. 반대로 전부 묶으면 한 사람이 같은 대역의 모두를
 * 잠글 수 있으므로 `/64` 보다 넓히지 않는다.
 *
 * 주소를 못 읽으면 **하나로 묶는다** — 못 읽는 것을 무제한으로 두면 그것이
 * 곧 우회로가 된다.
 */
export function clientRateKey(address: string | undefined): string {
  const trimmed = address?.trim();
  if (trimmed === undefined || trimmed === '') return 'unknown';

  // IPv4 는 주소 그대로다 — 한 주소가 대개 한 사용자다.
  if (!trimmed.includes(':')) return trimmed;

  // IPv6 는 라이브러리가 주는 정규화를 쓴다. 직접 자르면 압축 표기(`::`)와
  // IPv4 사상 주소(`::ffff:…`)에서 같은 주소가 두 열쇠로 갈리고, 그 갈림이
  // 곧 우회로가 된다.
  //
  // **폭을 명시로 준다.** 라이브러리 기본은 `/56` 이라, 생략하면 서로 다른
  // 256 개 `/64` 가 한 버킷을 공유해 한 사용자의 오타가 같은 `/56` 안의
  // 나머지 전원을 잠근다 — 바로 위 문단이 막겠다고 적은 그 상태다.
  return ipKeyGenerator(trimmed, IPV6_PREFIX_BITS);
}

/**
 * 그 요청의 열쇠.
 *
 * **`x-forwarded-for` 를 직접 읽지 않는다.** 그 헤더는 클라이언트가 정하는
 * 값이라, 신뢰 설정 없이 읽으면 요청마다 다른 값을 붙여 매번 새 버킷을
 * 받는다 — 제한이 사실상 사라진다. 프록시 뒤에 두는 배포는
 * `app.set('trust proxy', …)` 로 그 사실을 **서버가** 선언해야 하고, 그러면
 * `req.ip` 가 이미 그 헤더를 판정한 값을 준다. 선언하지 않은 배포에서는
 * 소켓 주소가 온다. 어느 쪽이든 클라이언트가 정하지 않는다.
 */
export function rateKeyOf(request: Request): string {
  return clientRateKey(request.ip ?? request.socket.remoteAddress);
}

/** 요청 제한 창. 두 라우터가 같은 값을 쓴다 — 갈리면 한쪽만 조여진다. */
export const RATE_WINDOW_MS = 15 * 60 * 1000;

/** 로그인 시도 상한 (`SEC-AUTH-001` AC-3). */
export const LOGIN_ATTEMPTS_PER_WINDOW = 10;

/**
 * 설치 토큰 검증 시도 상한.
 *
 * 로그인보다 넉넉한 이유는 이 값이 사람이 콘솔에서 옮겨 적는 32바이트
 * 토큰이라 오타가 잦기 때문이다. 무차별 대입이 위협이 아닌 것도 같은
 * 이유다 — 이 제한이 막는 것은 인증 없이 열린 경로의 증폭이다.
 */
export const INSTALL_ATTEMPTS_PER_WINDOW = 30;
