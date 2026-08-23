import type { RequestHandler } from 'express';

import { API_PREFIX } from '../static-spa.js';

/**
 * 설치 완료 전에 응답하는 경로 넷 (`SEC-AUTH-011` AC-1).
 *
 * **허용목록이다** — 「막을 것」이 아니라 「열 것」을 적는다. 그래야
 * 나중에 추가된 경로가 기본으로 차단된다(AC-6). 차단 목록으로 두면
 * 헬스체크·메트릭처럼 무해해 보이는 경로가 열린 채 들어온다.
 *
 * 넷의 정체는 요구가 정한 그대로다: `설치 화면` · `그 정적 자산` ·
 * `토큰 검증` · `설치 커밋`. 정적 자산과 화면은 접두로 받는다 — 번들
 * 파일 이름이 빌드마다 바뀌므로 전체 경로를 미리 적을 수 없다.
 *
 * **정적 자산의 접두는 빌드가 정한다.** 여기 적힌 값이 빌드 산출물의
 * 자리와 어긋나면 화면은 껍데기만 받고 번들은 503 을 받아, 설치 화면이
 * 뜬 채로 아무것도 하지 못한다 — 그 상태는 「관문이 잘 선다」로 읽힌다.
 * 그래서 이 값을 허용목록과 대조하는 것으로는 부족하고, 실제 산출물이
 * 가리키는 경로를 두드려야 한다(`install-assembly.test.ts`).
 */
/** 설치 화면의 자리. 허용목록의 첫 항목이자 유도의 목적지다. */
export const INSTALL_SCREEN = '/install';

/**
 * 설치 전 거절의 표식 (`SEC-AUTH-010` AC-1).
 *
 * 상태 코드만으로는 「설치 전」과 「잠깐 죽었다」가 갈리지 않는다. 화면이
 * 그 둘을 같게 다루면 운영 중인 인스턴스의 재시작이 설치 화면으로 읽힌다.
 */
export const UNINSTALLED = 'uninstalled';

export const INSTALL_ALLOWLIST: readonly string[] = [
  INSTALL_SCREEN,
  '/assets',
  `${API_PREFIX}/install/verify-token`,
  `${API_PREFIX}/install/commit`,
];

/**
 * 설치 완료 전에는 허용목록 밖의 모든 요청을 막는다.
 *
 * **모든 라우트보다 앞에 선다.** 뒤에 두면 그 사이에 낀 라우트가 열린 채
 * 남고, 그런 라우트는 나중에 추가된 것이라 아무도 그 사실을 모른다.
 *
 * `installed` 를 **함수로 받는다** — 값으로 받으면 기동 시점 판정이 굳어,
 * 설치를 마친 사람이 재기동 전까지 아무것도 하지 못한다(`SEC-AUTH-010` AC-5).
 *
 * **언제 다시 세는지는 이 미들웨어가 정하지 않는다.** 그것은 함수를 주는
 * 쪽의 결정이며, 운영 조립(`main.ts` 의 `설치여부`)은 참이 된 뒤로는 다시
 * 세지 않는다 — 관문이 정적 자산까지 모든 요청에 걸리기 때문이다. 그 굳힘이
 * 안전한 근거도 그쪽에 적혀 있다.
 */
export function installGate(installed: () => boolean): RequestHandler {
  return (req, res, next) => {
    if (installed()) {
      next();
      return;
    }

    const allowed = INSTALL_ALLOWLIST.some(
      (path) => req.path === path || req.path.startsWith(`${path}/`),
    );

    if (allowed) {
      next();
      return;
    }

    // **사람은 설치 화면으로 보낸다** (`SEC-AUTH-010` AC-1). 요구는
    // 「모든 요청이 설치 화면으로 유도된다」인데 막기만 하면 운영자가
    // 서버 주소를 쳤을 때 평문 503 을 받고, 마법사가 있다는 사실 자체를
    // 알 수 없다 — 경로를 알려 주는 곳이 어디에도 없기 때문이다.
    //
    // 판정은 **HTML 을 원하는 GET 인가** 하나다. 그것이 브라우저의 첫
    // 접촉이며, API·자산 요청을 리다이렉트하면 클라이언트가 HTML 을
    // JSON 으로 읽으려다 터진다.
    if (req.method === 'GET' && (req.headers.accept ?? '').includes('text/html')) {
      res.redirect(302, INSTALL_SCREEN);
      return;
    }

    // 503 — 「지금은 이 서비스가 서지 않았다」. 404 로 답하면 설치가 끝난
    // 뒤에도 그 경로가 없는 것처럼 읽히고, 401 은 자격증명을 갖추면 열린다는
    // 뜻이 되어 사실과 다르다.
    //
    // **사유를 본문에 싣는다.** 리버스 프록시·드레이닝·과부하도 503 이라,
    // 상태 코드만으로 갈리면 운영 중인 인스턴스가 잠깐 재시작하는 동안
    // 로그인한 사용자에게 설치 화면이 뜬다 — 그 화면은 「이 인스턴스가
    // 초기화됐다」로 읽힌다.
    res.status(503).json({ state: UNINSTALLED });
  };
}
