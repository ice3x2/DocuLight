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
export const INSTALL_ALLOWLIST: readonly string[] = [
  '/install',
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
 * `installed` 를 **함수로 받는다** — 기동 시점에 값을 굳히면 슈퍼유저가
 * 0명으로 돌아가도(`SEC-AUTH-010` AC-1) 게이트가 다시 닫히지 않는다.
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

    // 503 — 「지금은 이 서비스가 서지 않았다」. 404 로 답하면 설치가 끝난
    // 뒤에도 그 경로가 없는 것처럼 읽히고, 401 은 자격증명을 갖추면 열린다는
    // 뜻이 되어 사실과 다르다.
    res.sendStatus(503);
  };
}
