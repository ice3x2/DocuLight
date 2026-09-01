import { Router, type Request } from 'express';

import { resolveNode, type AclStores, type Actor } from '../../app/acl/permission-service.js';
import type { DocumentStore } from '../../domain/ports/document-store.js';
import { resolveServableNode } from '../guards/fail-closed.js';

/**
 * 문서 원문 라우트.
 *
 * **모든 경로가 두 관문을 거친다** — 서빙 가드(`SEC-STORAGE-006`)와 ACL
 * 판정(`SEC-ACL-006`). 하나라도 우회하는 라우트를 두면 그 자리에서 무너진다.
 *
 * 두 관문이 **같은 값**으로 거절한다. 권한 없음도, 존재하지 않음도, 점
 * 경로도 전부 404 다 — 사유를 가르면 그 구분 자체가 경로 열거 오라클이
 * 된다(`SEC-ACL-006` AC-3).
 */
export interface DocumentRouteDeps {
  stores: AclStores;
  documents: DocumentStore;
  /**
   * 이 요청을 누구로 볼 것인가. 세울 수 없으면 `undefined`.
   *
   * 선택 인자로 두지 않는 이유는 **인증 부재가 허용이 아니기** 때문이다 —
   * 빠뜨린 호출이 모든 문서를 열어 준다. `undefined` 를 돌려주면 아무것도
   * 서빙되지 않는다.
   *
   * 세션에서 주체를 세우는 것은 뒤 wave 의 몫이며(`SEC-AUTH-*`), 여기는
   * 그것이 꽂힐 자리다.
   */
  actorOf: (request: Request) => Actor | undefined;
}

export function documentsRouter({ stores, documents, actorOf }: DocumentRouteDeps): Router {
  const router = Router();

  // 와일드카드 파라미터를 쓰지 않는다. 그 문법과 파라미터 이름이 Express
  // 4 와 5 에서 다르기 때문이다. `use` 로 접두를 떼면 나머지 경로를
  // `req.path` 로 읽을 수 있고, 판이 바뀌어도 이 자리는 그대로다.
  router.use('/documents/:workspaceId', async (req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const workspaceId = req.params.workspaceId!;
    // 세그먼트별로 푼다. 통째로 풀면 `%2F` 가 구분자로 되살아나 경로가
    // 한 단계 더 갈라진다.
    const relativePath = req.path
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) => decodeURIComponent(segment))
      .join('/');

    // 점 경로는 `resolveServableNode` 안의 `isServable` 이 막는다
    // (`SEC-STORAGE-004`). 여기에 `guardDotPath` 를 한 겹 더 두어 봤으나
    // **그 호출을 무력화해도 죽는 항이 하나도 없었다**(2026-09-01 탐침) —
    // 두 판정이 같은 것을 보기 때문이다. 시험할 수 없는 방어를 두면 그것이
    // 도는지 아무도 모르고, 이 저장소는 같은 이유로 이미 한 번 방어를 뺐다
    // (`reconcile.ts` 의 2026-08-27 기록). `guardDotPath` 가 값을 하는 것은
    // 예외 허용목록이 실제로 채워질 때이며, 그 자리는 첨부 다운로드와
    // 휴지통·버전 API 가 각자 세운다.
    const actor = actorOf(req);
    const found = resolveServableNode(stores.nodes, workspaceId, relativePath);
    // 요청자를 못 세우면 그 자리에서 닫힌다. `&&` 의 왼쪽이 거짓이면
    // 오른쪽을 묻지 않는 것이 「인증 부재 = 아무 권한 없음」이다.
    const node = actor === undefined || found === undefined
      ? undefined
      : resolveNode(stores, actor, found.id);

    if (node === undefined) {
      res.sendStatus(404);
      return;
    }

    try {
      res.type('text/markdown').send(await documents.read(workspaceId, relativePath));
    } catch {
      // 레코드는 있는데 파일을 못 읽는 것은 재조정이 아직 따라오지 못한
      // 상태다. 그 사이를 열어 두지 않는다.
      res.sendStatus(404);
    }
  });

  return router;
}
