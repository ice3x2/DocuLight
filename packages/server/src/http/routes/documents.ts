import { Router } from 'express';

import type { DocumentStore } from '../../domain/ports/document-store.js';
import type { NodeRepository } from '../../domain/ports/node-repository.js';
import { resolveServableNode } from '../guards/fail-closed.js';

/**
 * 문서 원문 라우트.
 *
 * **모든 경로가 가드를 먼저 거친다** (`SEC-STORAGE-006`). 가드를 우회하는
 * 라우트를 하나라도 두면 fail-closed 가 그 자리에서 무너진다.
 *
 * 거부의 응답 **형태**는 이 라우트가 정하지 않는다 — 404 통일은 `R94` 가
 * 소유한다. 여기서 하는 것은 거부라는 사실뿐이다.
 */
export interface DocumentRouteDeps {
  nodes: NodeRepository;
  documents: DocumentStore;
}

export function documentsRouter({ nodes, documents }: DocumentRouteDeps): Router {
  const router = Router();

  // 와일드카드 파라미터를 쓰지 않는다. 그 문법과 파라미터 이름이 Express
  // 4 와 5 에서 다른데 이 패키지는 지금 런타임 4 에 타입 5 를 물고 있어,
  // 어느 쪽에 맞춰 써도 다른 쪽이 깨진다. `use` 로 접두를 떼면 나머지
  // 경로를 `req.path` 로 읽을 수 있고 두 판에서 같게 동작한다.
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

    const node = resolveServableNode(nodes, workspaceId, relativePath);
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
