import { Router, json, type Request } from 'express';
import multer from 'multer';

import {
  permissionOf,
  visibleChildrenOf,
  visibleWorkspacesOf,
  type Actor,
} from '../../app/acl/permission-service.js';
import { isSuperuser } from '../../domain/principal/subject.js';
import {
  attachToDocument,
  openAttachment,
  uploadLimitBytes,
  type AttachmentStores,
} from '../../app/attachment/attachment-service.js';
import { readDocument, saveDocument } from '../../app/document/save-service.js';
import { beginEditSession } from '../../app/document/version-service.js';
import { moveToTrash, purgeFromTrash, type TrashStores } from '../../app/trash/trash-service.js';
import { trashView, type TrashScope } from '../../app/trash/trash-view.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { RESOURCE_DIRECTORY } from '../../domain/attachment/resource-layout.js';

/**
 * 화면이 쓰는 API (`FR-WORKSPACE-003` · `FR-STORAGE-001` · `FR-SHELL-007` ·
 * `SEC-ATTACH-002`).
 *
 * **모든 응답이 서버가 이미 거른 것이다.** 화면은 여기서 온 목록을 그대로
 * 그리고 다시 거르지 않는다 — 두 곳이 거르면 한쪽만 규칙이 바뀐다.
 *
 * 거절의 형태가 셋뿐이다: 볼 수 없는 것은 **404**(없는 것과 같은 답 —
 * 다르면 그 차이가 존재를 알린다), 볼 수는 있으나 못 하는 것은 **403**,
 * 저장 충돌은 **409**. 그 밖의 사유를 만들지 않는다.
 */
export interface WorkspaceApiDeps {
  stores: AttachmentStores & TrashStores;
  /**
   * 이 요청을 누구로 볼 것인가. 세울 수 없으면 `undefined`.
   *
   * 선택 인자로 두지 않는 이유는 **인증 부재가 허용이 아니기** 때문이다 —
   * 빠뜨린 호출이 모든 문서를 열어 준다.
   */
  actorOf: (request: Request) => Actor | undefined;
}

/** 첨부 URL 의 접두. 문서 딥링크(`/d/`)와 **다른 자리**다. */
export const ATTACHMENT_PREFIX = '/api/attachments';

const attachmentLink = (workspaceId: string, hash: string) =>
  `${ATTACHMENT_PREFIX}/${workspaceId}/${hash}`;

/**
 * 경로·질의에서 값 하나를 뽑는다.
 *
 * 둘 다 같은 키가 여러 번 올 수 있어 배열이 되는데, 그때 첫 값만 쓴다 —
 * 배열을 그대로 넘기면 노드 ID 자리에 배열이 들어가 판정이 조용히 빗나간다.
 */
const one = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : Array.isArray(value) ? one(value[0]) : undefined;

/** 화면이 트리 한 줄을 그리는 데 필요한 값. */
interface TreeNodeBody {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  visibility: 'full' | 'pass-through';
  level: string | null;
  parentLevel: string | null;
  children: TreeNodeBody[];
}

export function workspaceApiRouter({ stores, actorOf }: WorkspaceApiDeps): Router {
  const router = Router();
  router.use(json({ limit: '1mb' }));

  // 업로드는 메모리에 받는다 — 크기 상한이 설정에서 오므로 디스크에 먼저
  // 떨구면 거부된 파일이 임시 자리에 남는다.
  const upload = multer({ storage: multer.memoryStorage() });

  /** 관문 — 주체를 세우지 못하면 아무것도 하지 않는다. */
  const actorFor = (req: Request): Actor | undefined => actorOf(req);

  router.get('/session', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const workspaces = visibleWorkspacesOf(stores, actor);
    res.json({
      superuser: isSuperuser(stores.principals.groupsOf(actor.id)),
      workspaceCount: workspaces.length,
      // 관리 권한은 워크스페이스마다 다르다 — 하나라도 있으면 그 구역이
      // 열리므로 개수로 센다.
      adminWorkspaceCount: workspaces.filter(
        (entry) => permissionOf(stores, actor, entry.workspace.id) === 'admin',
      ).length,
    });
  });

  router.get('/tree', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const subtree = (
      workspaceId: string,
      parentId: NodeId | null,
      parentLevel: string | null,
    ): TreeNodeBody[] =>
      // 가시성은 판정한 쪽이 이미 붙여 준다 — 여기서 다시 계산하면 같은
      // 사실을 두 곳이 만들게 되고, 한쪽만 규칙이 바뀐다.
      visibleChildrenOf(stores, actor, { workspaceId, parentId }).map((child) => {
        const level = permissionOf(stores, actor, child.node.id);
        return {
          id: child.node.id,
          name: child.node.name,
          kind: child.node.kind,
          visibility: child.visibility,
          level,
          parentLevel,
          children:
            child.node.kind === 'directory' ? subtree(workspaceId, child.node.id, level) : [],
        };
      });

    res.json(
      visibleWorkspacesOf(stores, actor).map((entry) => ({
        workspace: entry.workspace,
        visibility: entry.visibility,
        roots: subtree(
          entry.workspace.id,
          null,
          permissionOf(stores, actor, entry.workspace.id),
        ),
      })),
    );
  });

  router.get('/documents/:nodeId', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const read = await readDocument(stores, actor, req.params.nodeId!);
    // 볼 수 없는 것과 없는 것에 같은 답을 준다 — 다르면 그 차이가 그
    // 문서의 존재를 알린다(`SEC-ACL-006`).
    if (!read.ok) {
      res.sendStatus(404);
      return;
    }

    res.json({ body: read.body, hash: read.hash });
  });

  router.post('/documents/:nodeId/session', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const read = await readDocument(stores, actor, req.params.nodeId!);
    if (!read.ok) {
      res.sendStatus(404);
      return;
    }

    res.json({ session: beginEditSession(stores, actor, req.params.nodeId!) });
  });

  router.put('/documents/:nodeId', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const { body, baseHash, session } = req.body as {
      body?: string;
      baseHash?: string;
      session?: string;
    };
    if (typeof body !== 'string' || typeof baseHash !== 'string') {
      res.sendStatus(400);
      return;
    }

    const saved = await saveDocument(stores, actor, {
      nodeId: req.params.nodeId!,
      body,
      baseHash,
      ...(session === undefined ? {} : { session }),
    });

    if (saved.ok) {
      res.json({ hash: saved.hash });
      return;
    }
    if (saved.rule === 'conflict') {
      // 서버의 현재 본문을 함께 준다 — 그것 없이는 머지 뷰가 열리지 않는다.
      res.status(409).json({ current: saved.current });
      return;
    }
    res.sendStatus(saved.rule === 'forbidden' ? 403 : 404);
  });

  router.post('/documents/:nodeId/attachments', upload.single('file'), async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }
    if (req.file === undefined) {
      res.sendStatus(400);
      return;
    }

    const nodeId = one(req.params.nodeId);
    const node = nodeId === undefined ? undefined : stores.nodes.findById(nodeId);
    if (node === undefined || nodeId === undefined) {
      res.sendStatus(404);
      return;
    }

    const done = await attachToDocument(stores, actor, {
      nodeId,
      fileName: req.file.originalname,
      bytes: req.file.buffer,
    });

    if (!done.ok) {
      res.sendStatus(done.rule === 'forbidden' ? 403 : done.rule === 'too-large' ? 413 : 404);
      return;
    }

    res.json({
      hash: done.hash,
      // 본문에 적히는 링크와 실제로 바이트를 받는 주소를 **같은 값**으로
      // 둔다. 갈라 두면 한쪽만 고쳐져 본문의 링크가 아무것도 못 연다.
      link: attachmentLink(node.workspaceId, done.hash),
      limitBytes: uploadLimitBytes(stores),
    });
  });

  router.get('/attachments/:workspaceId/:hash', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const opened = await openAttachment(stores, actor, {
      workspaceId: req.params.workspaceId!,
      hash: req.params.hash!,
    });
    if (!opened.ok) {
      // 매 요청 판정한다 — 해시를 아는 것이 통제 수단이 아니다
      // (`SEC-ATTACH-003`).
      res.sendStatus(404);
      return;
    }

    res.type('application/octet-stream').send(opened.bytes);
  });

  router.get('/trash', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const workspaceId = one(req.query.workspaceId);
    const scope = one(req.query.scope);

    res.json(
      trashView(stores, actor, {
        ...(workspaceId === undefined ? {} : { workspaceId }),
        // 범위는 **요청**이지 권한이 아니다 — 넓혀 달라고 해도 권한이
        // 없으면 좁은 결과가 온다.
        scope: scope === 'all' ? ('all' as TrashScope) : ('mine' as TrashScope),
      }),
    );
  });

  router.delete('/nodes/:nodeId', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const done = await moveToTrash(stores, actor, req.params.nodeId!);
    res.sendStatus(done.ok ? 204 : done.rule === 'forbidden' ? 403 : 404);
  });

  router.delete('/trash/:nodeId', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const done = await purgeFromTrash(stores, actor, req.params.nodeId!);
    res.sendStatus(done.ok ? 204 : done.rule === 'forbidden' ? 403 : 404);
  });

  return router;
}

export { RESOURCE_DIRECTORY };
