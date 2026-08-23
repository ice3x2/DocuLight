import express, { Router } from 'express';

import {
  beginInstallSession,
  commitInstall,
  requireInstallSession,
  type DefaultGroupLevel,
  type InstallStores,
} from '../../app/install/install-service.js';
import type { SignupMode } from '../../domain/auth/signup-mode.js';

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
export function installRouter(stores: InstallStores): Router {
  const router = Router();

  // 본문 파서를 이 라우터가 스스로 세운다 — 서버 조립에 두면 정적 서빙
  // 경로까지 지나고, 다른 라우터에 기대면 그쪽이 빠질 때 조용히 깨진다.
  router.use(express.json());

  // 토큰 검증 → 설치 세션 발급 (`SEC-AUTH-015` AC-1).
  router.post('/install/verify-token', (req, res) => {
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
  router.post('/install/commit', async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const installSession = body['installSession'];

    // **세션을 먼저 본다.** 뒤에 두면 세션 없는 요청이 입력 검증 결과로
    // 답을 받고, 그 차이가 곧 어떤 값이 유효한지를 알린다.
    if (typeof installSession !== 'string' || !requireInstallSession(stores, installSession)) {
      res.status(401).json({});
      return;
    }

    const outcome = await commitInstall(stores, installSession, {
      superuserName: String(body['superuserName'] ?? ''),
      password: String(body['password'] ?? ''),
      workspaceName: String(body['workspaceName'] ?? ''),
      defaultGroupLevel: body['defaultGroupLevel'] as DefaultGroupLevel,
      signupMode: body['signupMode'] as SignupMode,
    });

    if (!outcome.ok) {
      // 규칙 이름을 그대로 준다 — 설치 화면은 인증 전이라 숨길 상대가
      // 없고, 오히려 사유가 없으면 사용자가 무엇을 고칠지 모른다.
      res.status(400).json({ rule: outcome.rule });
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
