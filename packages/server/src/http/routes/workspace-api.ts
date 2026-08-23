import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
  INSTANCE_SETTING_KEYS,
  readSetting,
  writeSettings,
} from '../../app/settings/instance-settings.js';
import {
  attachToDocument,
  openAttachment,
  uploadLimitBytes,
  type AttachmentStores,
} from '../../app/attachment/attachment-service.js';
import {
  addFavorite,
  listFavorites,
  removeFavorite,
  type FavoriteStores,
} from '../../app/favorite/favorite-service.js';
import { createNode } from '../../app/node/node-service.js';
import { searchPrincipals } from '../../app/principal/principal-search-service.js';
import { maySearchFor, parseScope } from '../../app/principal/search-scope.js';
import { shareView } from '../../app/acl/share-service.js';
import { offboardingCard } from '../../app/principal/offboarding-service.js';
import {
  adminlessWorkspaceIds,
  grantWarnings,
  isLastAdministrator,
} from '../../app/workspace/admin-presence.js';
import { grantPermission, revokePermission } from '../../app/acl/grant-service.js';
import {
  PERSONAL_SETTING_KEYS,
  readPersonalSetting,
  writePersonalSettings,
} from '../../app/settings/personal-settings.js';
import type { PersonalSettingStore } from '../../domain/ports/personal-setting-store.js';
import type { SessionRepository } from '../../domain/ports/session-repository.js';
import {
  groupRoster,
  removeGroupWithGrants,
  userRoster,
} from '../../app/principal/roster-service.js';
import { addGroupMember, removeFromGroup } from '../../app/principal/principal-service.js';
import { uploadNewVersion, warnsIrreversible } from '../../app/document/new-version.js';
import { noticeFor } from '../../domain/node/collision-notice.js';
import { linksOf, wikiTargets } from '../../app/document/link-service.js';
import { readDocument, saveDocument, workspaceRootOf } from '../../app/document/save-service.js';
import {
  beginEditSession,
  listVersions,
  restoreVersion,
} from '../../app/document/version-service.js';
import {
  moveToTrash,
  purgeFromTrash,
  restoreFromTrash,
  type TrashStores,
} from '../../app/trash/trash-service.js';
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
  stores: AttachmentStores &
    TrashStores &
    FavoriteStores & { personalSettings: PersonalSettingStore; sessions: SessionRepository };
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

/**
 * multipart 로 온 파일 이름.
 *
 * RFC 7578 이 정한 기본 문자셋이 US-ASCII 라 파서가 바이트를 latin-1 로
 * 읽는다 — 한글 이름이 그대로 깨진다. UTF-8 로 다시 읽어 되살린다.
 *
 * 되살릴 수 없으면 받은 그대로 쓴다. 깨진 이름이라도 있는 것이 이름 없이
 * 저장되는 것보다 낫다 — 사용자가 그것을 고칠 수 있다.
 */
function decodedFileName(raw: string): string {
  try {
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
}

/** 화면이 트리 한 줄을 그리는 데 필요한 값. */
interface TreeNodeBody {
  id: string;
  name: string;
  kind: 'file' | 'directory';
  visibility: 'full' | 'pass-through';
  level: string | null;
  parentLevel: string | null;
  /**
   * 새 버전을 올리면 되돌릴 수 없는가 (`FR-SHELL-008` AC-5).
   *
   * 서버가 판정해 보내는 이유는 그 판정이 「버전 보관 대상인가」와 같은
   * 사실이기 때문이다 — 화면이 확장자를 다시 보면 보관 규칙이 바뀔 때
   * 경고만 옛 규칙을 따르고, 어긋난 경고를 한 번 본 사용자는 다음 경고도
   * 믿지 않는다. 디렉토리에는 없다 — 올릴 수 없는 자리다.
   */
  overwriteIrreversible?: boolean;
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
          ...(child.node.kind === 'file'
            ? { overwriteIrreversible: warnsIrreversible(child.node.name) }
            : {}),
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

    const { body, baseHash, session, forceSnapshot } = req.body as {
      body?: string;
      baseHash?: string;
      session?: string;
      forceSnapshot?: boolean;
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
      ...(forceSnapshot === true ? { forceSnapshot: true } : {}),
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

  /**
   * 버전 목록 (`IR-STORAGE-001` AC-1 · `FR-SHELL-002` AC-3).
   *
   * 실체 경로는 **주지 않는다** — 그것을 주면 화면이 파일시스템을 알게
   * 되고, 그 순간 저장 자리를 바꿀 수 없게 된다. 본문은 별도 경로로 준다.
   */
  router.get('/documents/:nodeId/versions', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const nodeId = one(req.params.nodeId);
    if (nodeId === undefined) {
      res.sendStatus(404);
      return;
    }

    // 문서를 볼 수 없으면 그 버전 목록도 없는 것과 같다.
    const read = await readDocument(stores, actor, nodeId);
    if (!read.ok) {
      res.sendStatus(404);
      return;
    }

    res.json(
      listVersions(stores, actor, nodeId).map((version) => ({
        seq: version.seq,
        createdAt: version.createdAt,
        author: version.author,
      })),
    );
  });

  /** 한 버전의 본문. 나란히 놓으려면 그 내용이 있어야 한다. */
  router.get('/documents/:nodeId/versions/:seq', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const nodeId = one(req.params.nodeId);
    const seq = Number(one(req.params.seq));
    if (nodeId === undefined || !Number.isInteger(seq)) {
      res.sendStatus(404);
      return;
    }

    const read = await readDocument(stores, actor, nodeId);
    if (!read.ok) {
      res.sendStatus(404);
      return;
    }

    const found = listVersions(stores, actor, nodeId).find((version) => version.seq === seq);
    if (found === undefined) {
      res.sendStatus(404);
      return;
    }

    res.json({ seq: found.seq, body: await readFile(found.path, 'utf8') });
  });

  /** 그 버전으로 되돌린다 (`IR-STORAGE-001` AC-2). */
  router.post('/documents/:nodeId/versions/:seq/restore', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const nodeId = one(req.params.nodeId);
    const seq = Number(one(req.params.seq));
    if (nodeId === undefined || !Number.isInteger(seq)) {
      res.sendStatus(404);
      return;
    }

    const done = await restoreVersion(stores, actor, { nodeId, seq });
    res.sendStatus(done.ok ? 204 : done.rule === 'forbidden' ? 403 : 404);
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
      fileName: decodedFileName(req.file.originalname),
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

  /**
   * 노드를 만든다 (`FR-SHELL-003` AC-1 · `SEC-SHELL-002`).
   *
   * 이름이 겹치면 **접미사를 붙이고 안내를 준다** — 확인을 묻지 않는다.
   * 묻는 순간 그 물음 자체가 「거기 무언가 있다」를 알리고, 보이지 않는
   * 파일과의 충돌에서 그것이 곧 존재 오라클이 된다.
   */
  router.post('/nodes', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const { workspaceId, parentId, kind, name } = req.body as {
      workspaceId?: string;
      parentId?: string | null;
      kind?: 'file' | 'directory';
      name?: string;
    };
    if (typeof workspaceId !== 'string' || typeof name !== 'string') {
      res.sendStatus(400);
      return;
    }

    const created = createNode(stores, actor, {
      workspaceId,
      parentId: parentId ?? null,
      kind: kind ?? 'file',
      name,
    });

    if (!created.ok) {
      // 거절 사유를 본문에 싣지 않는다 — 사유가 갈리면 그 갈림이
      // 경로 열거 오라클이 된다(`SEC-ACL-006`).
      res.sendStatus(created.violations.some((v) => v.rule === 'forbidden') ? 403 : 400);
      return;
    }

    res.json({
      id: created.id,
      name: created.name,
      // 이름이 바뀐 사실을 안 알리면 사용자가 그 문서를 못 찾는다.
      ...(created.name === name ? {} : { notice: noticeFor(created.name) }),
    });
  });

  /**
   * 디렉토리에 파일을 올린다 (`FR-ATTACH-001` · `SEC-ATTACH-001`).
   *
   * 문서 첨부(`/documents/:id/attachments`)와 **다른 조작**이다. 그쪽은
   * 본문 안에 링크로 들어가는 자원이고 이쪽은 트리에 서는 노드다 — 권한
   * 기준도 다르다: 그쪽은 소유 문서의 편집, 이쪽은 그 디렉토리의 편집.
   *
   * 크기 상한은 **같은 값**을 쓴다 (`FR-ATTACH-006` AC-4) — 두 경로가
   * 각자 판정하면 한쪽에만 제한이 걸린다.
   */
  router.post('/nodes/:nodeId/uploads', upload.single('file'), async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }
    if (req.file === undefined) {
      res.sendStatus(400);
      return;
    }

    const parentId = one(req.params.nodeId);
    const parent = parentId === undefined ? undefined : stores.nodes.findById(parentId);
    if (parent === undefined || parentId === undefined) {
      res.sendStatus(404);
      return;
    }

    if (req.file.size > uploadLimitBytes(stores)) {
      res.sendStatus(413);
      return;
    }

    const created = createNode(stores, actor, {
      workspaceId: parent.workspaceId,
      parentId,
      kind: 'file',
      name: decodedFileName(req.file.originalname),
    });
    if (!created.ok) {
      res.sendStatus(created.violations.some((v) => v.rule === 'forbidden') ? 403 : 400);
      return;
    }

    // 노드를 만든 **뒤에** 실체를 쓴다 — 먼저 쓰면 이름 충돌 접미사를
    // 모르는 자리에 파일이 놓인다.
    const path = join(workspaceRootOf(stores, parent.workspaceId), stores.nodes.pathOf(created.id));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, req.file.buffer);

    res.json({
      id: created.id,
      name: created.name,
      ...(created.name === decodedFileName(req.file.originalname)
        ? {}
        : { notice: noticeFor(created.name) }),
    });
  });

  /**
   * 런타임 설정 (`DR-SHELL-001` · `IR-SHELL-002` AC-7).
   *
   * **슈퍼유저만** 읽고 쓴다 — 인스턴스 설정은 인스턴스의 것이고, 그 값
   * 하나가 모든 워크스페이스의 동작을 바꾼다.
   *
   * 열거에 없는 키는 거절한다. 받아 주면 오타 하나가 새 설정을 만들고,
   * 아무도 그것을 읽지 않으므로 「저장했는데 안 바뀐다」로 나타난다.
   */
  const settingsGate = (req: Request): boolean => {
    const actor = actorFor(req);
    return actor !== undefined && isSuperuser(stores.principals.groupsOf(actor.id));
  };

  router.get('/settings', (req, res) => {
    if (actorFor(req) === undefined) {
      res.sendStatus(401);
      return;
    }
    if (!settingsGate(req)) {
      res.sendStatus(403);
      return;
    }

    res.json(
      Object.fromEntries(INSTANCE_SETTING_KEYS.map((key) => [key, readSetting(stores.settings, key)])),
    );
  });

  router.put('/settings', (req, res) => {
    if (actorFor(req) === undefined) {
      res.sendStatus(401);
      return;
    }
    if (!settingsGate(req)) {
      res.sendStatus(403);
      return;
    }

    const patch = req.body as Record<string, unknown>;
    if (Object.values(patch).some((value) => typeof value !== 'string')) {
      res.sendStatus(400);
      return;
    }

    // 조합을 **통째로** 넘긴다 — 키마다 따로 쓰면 「감사를 올리고 휴지통을
    // 올린다」를 그 순서로만 할 수 있게 되고(`R154`), 오타 하나가 앞의
    // 값들만 바꿔 놓은 절반의 상태를 남긴다.
    const saved = writeSettings(stores.settings, patch as Record<string, string>);
    res.sendStatus(saved.ok ? 204 : 400);
  });

  /**
   * 즐겨찾기 (`FR-SHELL-001` AC-3 · AC-4).
   *
   * 목록은 **사람마다** 따로다 — 남의 목록이 섞이면 그 문서의 존재가
   * 새어 나간다. 빼기에는 권한을 걸지 않는다: 자기 목록에서 지우는
   * 일이고, 볼 수 없게 된 것일수록 오히려 지울 수 있어야 한다.
   */
  /**
   * 이 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3).
   *
   * **한 번에 준다.** 나누면 화면이 두 번 묻게 되고, 두 응답 사이에 본문이
   * 바뀌면 두 목록이 서로 다른 시점을 보인다.
   */
  router.get('/documents/:nodeId/links', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const links = await linksOf(stores, actor, one(req.params.nodeId)!);
    if (links === null) {
      res.sendStatus(404);
      return;
    }

    res.json(links);
  });

  /**
   * 위키링크 자동완성 후보 (`CON-EDITOR-002` AC-1).
   *
   * 거르는 일을 서버가 한다 — 전부 내려 주고 화면에서 고르게 하면 볼 수
   * 있는 문서 이름 전부가 이미 브라우저에 와 있게 된다.
   */
  /**
   * 사용자·그룹 검색 (`CON-ARCH-004` AC-4).
   *
   * **부여 대상을 함께 싣는다** (`R162`). 검색 자격을 독립 정책으로 세우지
   * 않고 그 대상에 부여를 실행할 자격에서 파생시키는 이유는, 갈리는 순간
   * `R70-a` 가 `편집` 에게 연 부여를 실행할 사람이 대상을 찾지 못하게 되기
   * 때문이다. 그래서 Phase 2 에서 위임이 깊어져도 이 규칙이 바뀌지 않는다.
   *
   * 사용자와 그룹을 한 목록으로 주는 이유는 이것을 쓰는 자리가 둘을
   * 가리지 않기 때문이다 — 권한은 주체에 붙지 종류에 붙지 않는다.
   */
  router.get('/principals', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    // 스코프가 없으면 요청 자체가 성립하지 않는다 (`R162`). 없는 대상과
    // 자격 없는 대상이 **같은 404** 를 받는다 (`R162-a` · `R94`) — 갈리면
    // 이 자리가 곧 존재 오라클이 된다.
    const scope = parseScope(one(req.query.for));
    if (scope === null || !maySearchFor(stores, actor, scope)) {
      res.sendStatus(404);
      return;
    }

    // 검색에 넘기는 것은 질의 **하나뿐**이다 — 스코프는 조작의 대상이지
    // 규칙 값이 아니며(`R162-b`), 최소 길이와 상한을 질의 문자열로 받으면
    // 화면 재량을 막기 전에 아무나 값을 바꿀 수 있는 문이 열린다
    // (`SEC-PRINCIPAL-003` AC-4).
    res.json(searchPrincipals(stores.principals, one(req.query.q) ?? ''));
  });

  /**
   * 이 요청자의 개인 설정 (`DR-SHELL-002` · `IR-SHELL-004`).
   *
   * **세 값을 한 번에 준다.** 항목마다 따로 물으면 화면이 세 번 왕복하고,
   * 그 사이에 하나만 바뀐 상태를 그리게 된다.
   *
   * 인증 없이는 없다 — 개인 설정의 키가 (사용자, 항목) 쌍이라 주체가
   * 없으면 읽을 행 자체가 정해지지 않는다.
   */
  router.get('/personal-settings', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    res.json(
      Object.fromEntries(
        PERSONAL_SETTING_KEYS.map((key) => [
          key,
          readPersonalSetting(stores.personalSettings, actor.id, key),
        ]),
      ),
    );
  });

  router.patch('/personal-settings', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    // 모르는 키·값은 예외가 아니라 **예상되는 입력**이다 — 오래된 화면이
    // 그대로 보내고, 그것을 500 으로 답하면 서버 결함처럼 읽힌다.
    const saved = writePersonalSettings(stores.personalSettings, actor.id, req.body ?? {});
    res.sendStatus(saved.ok ? 204 : 400);
  });

  /**
   * 슈퍼유저 전용 명부 (`R163` · `FR-PRINCIPAL-001`).
   *
   * **`/principals` 와 다른 문이다.** 상한이 없고 `rejected` 를 담으므로
   * 인가가 한 번 느슨해지면 그쪽보다 넓은 문이 된다 — 그래서 스코프
   * 검사(`R162`)가 이 라우트로 새지 않도록 fail-closed 를 **독립으로**
   * 박고, 자격이 없으면 없는 자리와 같은 답을 준다 (`R163-a`).
   */
  /**
   * 공유 모달이 그리는 것 (`IR-ACL-002` · `IR-ACL-003`).
   *
   * 목록은 `관리` 전용이고 수치는 `편집` 까지다 (`SEC-ACL-015`) — 그
   * 판정은 서비스가 하고 여기서 다시 재지 않는다. 자격이 없으면 없는
   * 노드와 같은 404 다.
   */
  router.get('/nodes/:nodeId/share', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const view = shareView(stores, actor, req.params.nodeId!);
    if (view === null) {
      res.sendStatus(404);
      return;
    }

    res.json(view);
  });

  /** 주체 하나에 레벨을 준다 (`IR-ACL-003` AC-3). 넓히기 문턱은 `편집` 이다. */
  router.post('/nodes/:nodeId/share', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const granted = grantPermission(stores, actor, {
      nodeId: req.params.nodeId!,
      principalId: one(req.body?.principalId) ?? '',
      level: one(req.body?.level) === 'edit' ? 'edit' : 'view',
    });
    res.sendStatus(granted.ok ? 204 : 404);
  });

  /** 직접 부여 항목을 회수한다 (`IR-ACL-003` AC-4). 상속 항목에는 ID 가 없다. */
  router.delete('/acl-entries/:entryId', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const revoked = revokePermission(stores, actor, req.params.entryId!);
    res.sendStatus(revoked.ok ? 204 : 404);
  });

  /**
   * 실행 전에 물어야 할 것 (`FR-PRINCIPAL-005` AC-2 · `FR-PRINCIPAL-008` AC-1).
   *
   * **차단이 아니라 사유 목록이다.** 둘 다 실행할 수 있는 조작이고,
   * 다만 결과가 실행자의 의도와 다를 가능성이 높은 자리다. 화면이 스스로
   * 세면 서버가 아는 것과 갈리므로 여기서 판정한다.
   */
  router.get('/grant-warnings', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const entryId = one(req.query.entryId);
    const warnings = [
      ...grantWarnings(stores, {
        ...(one(req.query.principalId) === undefined ? {} : { principalId: one(req.query.principalId)! }),
      }),
      ...(entryId !== undefined && isLastAdministrator(stores, entryId) ? ['last-administrator'] : []),
    ];

    res.json(warnings);
  });

  /**
   * 볼 수 있는 워크스페이스와 그 관리 상태 (`FR-PRINCIPAL-006` AC-1 · AC-2).
   *
   * `adminless` 를 서버가 판정해 보내는 이유는, 화면이 접근자를 세면
   * 슈퍼유저의 상방 게이트가 「관리자 있음」으로 잘못 세어지기 때문이다.
   */
  router.get('/workspaces', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const adminless = new Set(adminlessWorkspaceIds(stores));
    res.json(
      visibleWorkspacesOf(stores, actor).map((entry) => ({
        id: entry.workspace.id,
        name: entry.workspace.name,
        adminless: adminless.has(entry.workspace.id),
      })),
    );
  });

  /**
   * 오프보딩 카드 (`FR-PRINCIPAL-003`). 슈퍼유저 전용이다 — 계정 상태를
   * 다루는 흐름이라 명부와 같은 문을 쓴다 (`R163-a`).
   */
  router.get('/principals/:principalId/offboarding', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }
    if (!isSuperuser(stores.principals.groupsOf(actor.id))) {
      res.sendStatus(404);
      return;
    }

    const card = offboardingCard(stores, req.params.principalId!);
    if (card === null) {
      res.sendStatus(404);
      return;
    }

    res.json(card);
  });

  router.get('/roster/users', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const roster = userRoster(stores, actor);
    if (roster === null) {
      res.sendStatus(404);
      return;
    }

    res.json(roster);
  });

  router.get('/roster/groups', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const roster = groupRoster(stores, actor);
    if (roster === null) {
      res.sendStatus(404);
      return;
    }

    res.json(roster);
  });

  router.delete('/roster/groups/:groupId', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const removed = removeGroupWithGrants(stores, actor, req.params.groupId!);
    if (removed.ok) {
      res.sendStatus(204);
      return;
    }

    // 자격이 없거나 없는 그룹이면 같은 답 — 갈리면 그룹 ID 열거가 된다.
    res.sendStatus(removed.rule === 'system-group-immutable' ? 403 : 404);
  });

  /**
   * 그룹 멤버십 변경 (`FR-PRINCIPAL-001` AC-2).
   *
   * **슈퍼유저만** 지난다. 이 자리가 열리면 슈퍼유저 그룹에 사람을 넣는
   * 두 번째 경로가 되어 `SEC-AUTH-010` AC-2 가 걸린다.
   */
  const membership = (req: Request): 'ok' | 'unauthenticated' | 'denied' => {
    const actor = actorFor(req);
    if (actor === undefined) return 'unauthenticated';
    return isSuperuser(stores.principals.groupsOf(actor.id)) ? 'ok' : 'denied';
  };

  router.post('/roster/groups/:groupId/members', (req, res) => {
    const gate = membership(req);
    if (gate !== 'ok') {
      res.sendStatus(gate === 'unauthenticated' ? 401 : 404);
      return;
    }

    const added = addGroupMember(stores.principals, req.params.groupId!, one(req.body?.userId) ?? '');
    res.sendStatus(added.ok ? 204 : 400);
  });

  router.delete('/roster/groups/:groupId/members/:userId', (req, res) => {
    const gate = membership(req);
    if (gate !== 'ok') {
      res.sendStatus(gate === 'unauthenticated' ? 401 : 404);
      return;
    }

    const removed = removeFromGroup(stores, req.params.groupId!, req.params.userId!);
    res.sendStatus(removed.ok ? 204 : 400);
  });

  router.get('/wiki-targets', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    res.json(wikiTargets(stores, actor, one(req.query.q) ?? ''));
  });

  router.get('/favorites', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    res.json(listFavorites(stores, actor));
  });

  router.post('/favorites', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const nodeId = one((req.body as { nodeId?: unknown }).nodeId);
    if (nodeId === undefined) {
      res.sendStatus(400);
      return;
    }

    // 볼 수 없는 노드에는 없는 것과 같은 답을 준다 — 다르면 그 차이가
    // 그 문서의 존재를 알린다 (`SEC-ACL-006`).
    res.sendStatus(addFavorite(stores, actor, nodeId).ok ? 204 : 404);
  });

  router.delete('/favorites/:nodeId', (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    removeFavorite(stores, actor, one(req.params.nodeId)!);
    res.sendStatus(204);
  });

  /**
   * 새 버전 올리기 (`FR-SHELL-008` AC-2 ~ AC-4).
   *
   * 덮어쓰기의 **유일한 경로**다. 생성·업로드 흐름에는 덮어쓰기 선택지가
   * 없고(AC-1), 이름이 겹치면 접미사가 붙을 뿐이다(`SEC-SHELL-002`).
   */
  router.post('/nodes/:nodeId/new-version', upload.single('file'), async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const file = req.file;
    if (file === undefined) {
      res.sendStatus(400);
      return;
    }

    const done = await uploadNewVersion(stores, actor, {
      nodeId: one(req.params.nodeId)!,
      bytes: file.buffer,
    });
    if (done.ok) {
      res.sendStatus(204);
      return;
    }

    res.sendStatus(
      done.rule === 'forbidden'
        ? 403
        : done.rule === 'too-large'
          ? 413
          : done.rule === 'not-a-file'
            ? 400
            : 404,
    );
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

  /**
   * 휴지통에서 되돌린다 (`FR-SHELL-007`).
   *
   * 영구 삭제와 **같은 자리**에 두되 동사를 나눈다 — 되돌리기는 `편집`,
   * 영구 삭제는 `관리` 이고, 한 경로에 두면 필요 권한이 둘인 조작이 된다.
   */
  router.post('/trash/:nodeId/restore', async (req, res) => {
    const actor = actorFor(req);
    if (actor === undefined) {
      res.sendStatus(401);
      return;
    }

    const done = await restoreFromTrash(stores, actor, one(req.params.nodeId)!);
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
