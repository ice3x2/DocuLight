import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import {
  beginInstallSession,
  commitInstall,
  requireInstallSession,
  type DefaultGroupLevel,
  type InstallStores,
} from '../../app/install/install-service.js';
import { SIGNUP_MODES } from '../../domain/auth/signup-mode.js';
import { rateKeyOf, INSTALL_ATTEMPTS_PER_WINDOW, RATE_WINDOW_MS } from '../rate-key.js';

/**
 * 설치 두 경로 (`SEC-AUTH-012` · `SEC-AUTH-015`).
 *
 * **허용목록이 여는 자리가 여기다** (`install-gate.ts` 의 `INSTALL_ALLOWLIST`).
 * 관문이 열어 준 경로에 라우트가 없으면 404 가 되고, 그러면 관문만 서고
 * 통과할 문이 없어 새 인스턴스가 아무것도 하지 못한다.
 *
 * **판정을 여기 다시 적지 않는다.** 토큰 수명·세션 요구·토큰 소진은 전부
 * `install-service.ts` 의 것이고 이 라우터는 그것을 HTTP 로 옮기기만 한다 —
 * 두 곳에 적으면 한쪽만 고쳐진다.
 */
/**
 * 그 값이 열거 안에 있는가.
 *
 * **타입은 런타임에 아무것도 막지 않는다.** HTTP 경계는 타입이 사라지는
 * 자리이고, 여기서 다시 세우지 않으면 `as` 캐스팅이 아무 문자열이나
 * 통과시킨다 — 인증 없는 이 경로에서는 그것이 곧 `default` 그룹에 최상위
 * 권한을 주는 문이 된다 (`GrantLevel` 이 `admin` 을 뺀 이유가
 * `SEC-WORKSPACE-002` 다).
 */
const 열거안에 = <T extends string>(값: unknown, 열거: readonly T[]): 값 is T =>
  typeof 값 === 'string' && (열거 as readonly string[]).includes(값);

/** 설치가 고를 수 있는 초기 권한. `없음` 은 레벨이 아니라 항목의 부재다. */
const GROUP_LEVELS: readonly DefaultGroupLevel[] = ['none', 'view', 'edit'];

export function installRouter(stores: InstallStores): Router {
  const router = Router();

  // 본문 파서를 여기 두지 않는다 — 경로 없이 붙는 라우터의 `use` 는 그
  // 라우터를 지나는 **모든** 요청에 걸려 `/api/*` 전체를 덮고, 먼저 선
  // 파서가 `req._body` 를 세우면 뒤따르는 파서의 한도 설정이 죽는다.
  // 파서는 `apiRouter` 가 한 번만 세운다.

  // **토큰 검증에도 같은 제한이 걸린다** (`SEC-AUTH-012` Rationale · `R57`).
  // 256비트 토큰이라 무차별 대입이 위협은 아니지만, 이 경로는 인증 없이
  // 열려 있어 제한이 없으면 그 자체가 증폭 표면이다. 단위는 로그인과 같은
  // 출발지이며 그 판정을 다시 적지 않는다.
  const limiter = rateLimit({
    windowMs: RATE_WINDOW_MS,
    limit: INSTALL_ATTEMPTS_PER_WINDOW,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateKeyOf,
    validate: { keyGeneratorIpFallback: false },
  });

  // 토큰 검증 → 설치 세션 발급 (`SEC-AUTH-015` AC-1).
  router.post('/install/verify-token', limiter, (req, res) => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') {
      res.status(401).json({});
      return;
    }

    const outcome = beginInstallSession(stores, token);
    // 틀린 토큰과 없는 토큰이 **같은 답**을 받는다 — 갈리면 그 차이가
    // 「토큰이 살아 있는가」를 알린다.
    if (!outcome.ok) {
      res.status(401).json({});
      return;
    }

    res.status(200).json({ installSession: outcome.installSession });
  });

  // 설치 커밋 (`SEC-AUTH-015` AC-3 · AC-4).
  router.post('/install/commit', limiter, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const installSession = body['installSession'];

    // **세션을 먼저 본다.** 뒤에 두면 세션 없는 요청이 입력 검증 결과로
    // 답을 받고, 그 차이가 곧 어떤 값이 유효한지를 알린다.
    if (typeof installSession !== 'string' || !requireInstallSession(stores, installSession)) {
      res.status(401).json({});
      return;
    }

    const defaultGroupLevel = body['defaultGroupLevel'];
    const signupMode = body['signupMode'];
    if (!열거안에(defaultGroupLevel, GROUP_LEVELS) || !열거안에(signupMode, SIGNUP_MODES)) {
      res.status(400).json({ rule: 'unknown-choice' });
      return;
    }

    // **문자열도 검사한다.** `String(...)` 강제 형변환은 객체를
    // `"[object Object]"` 라는 이름으로, 숫자를 비밀번호로 통과시킨다 —
    // 400 을 받아야 할 요청이 200 을 받는 것이고, 바로 위 문단이 열거에
    // 대해 세운 규칙과 어긋난다.
    const superuserName = body['superuserName'];
    const password = body['password'];
    const workspaceName = body['workspaceName'];
    if (
      typeof superuserName !== 'string' ||
      typeof password !== 'string' ||
      typeof workspaceName !== 'string'
    ) {
      // **열거 오류와 갈라 답한다.** 하나로 접으면 `password: 123` 을 보낸
      // 요청이 「가입 모드를 고치라」는 안내를 받고, 사용자는 맞는 칸을
      // 고치게 된다 — 사유를 내주기로 한 이유가 바로 그 반대다.
      res.status(400).json({ rule: 'bad-field' });
      return;
    }

    const outcome = await commitInstall(stores, installSession, {
      superuserName,
      password,
      workspaceName,
      defaultGroupLevel,
      signupMode,
    });

    if (!outcome.ok) {
      // 규칙 이름을 그대로 준다 — 설치 화면은 인증 전이라 숨길 상대가
      // 없고, 오히려 사유가 없으면 사용자가 무엇을 고칠지 모른다.
      //
      // 「아직 돌고 있다」만 409 다. 400 으로 답하면 「입력이 틀렸다」로
      // 읽히는데 이 요청의 입력에는 아무 문제가 없다 — 다시 보내면 된다.
      res.status(outcome.rule === 'commit-in-flight' ? 409 : 400).json({ rule: outcome.rule });
      return;
    }

    res.status(200).json({
      superuserId: outcome.superuserId,
      workspaceId: outcome.workspaceId,
      warnings: outcome.warnings,
    });
  });

  return router;
}
