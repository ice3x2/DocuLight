import { permits } from '../../domain/acl/level.js';
import { permittedUnderScope, type TokenScope } from '../../domain/auth/token-scope.js';
import type { NodeRecord } from '../../domain/ports/node-repository.js';
import {
  actorFor,
  permissionOf,
  visibleChildrenOf,
  visibleWorkspacesOf,
  type Actor,
} from '../acl/permission-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../document/save-service.js';
import { createNode } from '../node/node-service.js';
import { moveToTrash, type TrashStores } from '../trash/trash-service.js';
import type { McpTool } from './tools.js';

/**
 * MCP 도구의 실행 (`SEC-ARCH-002` · `SEC-ARCH-003`).
 *
 * **여기서 새 권한 판정을 세우지 않는다.** 목록은 `visibleChildrenOf`,
 * 열람과 저장은 `readDocument` · `saveDocument` 가 이미 소유한다 — 같은
 * 책임을 두 곳이 나눠 가지면 한쪽만 고쳐지고 그 어긋남은 조용하다.
 *
 * 1.0 은 ACL 개념 자체가 없어 걸러 낼 자리가 없었다(조사 원문 §B-2).
 * 그래서 이 축은 계약을 물려받는 것이 아니라 2.0 이 새로 세우는 것이다.
 */

/** 모든 도구가 같은 모양으로 답한다 — 1.0 계약이 텍스트 하나다. */
export interface ToolResult {
  readonly content: readonly { readonly type: 'text'; readonly text: string }[];
  readonly isError?: boolean;
}

export type ToolRule =
  | 'unknown-tool'
  | 'missing-argument'
  | 'not-found'
  | 'forbidden'
  | 'not-implemented';

export type ToolOutcome = { ok: true; result: ToolResult } | { ok: false; rule: ToolRule };

export interface McpSubjectRef {
  readonly userId: string;
  readonly scope: TokenScope;
}

export type DispatchStores = DocumentStores & TrashStores & { docsRoot: string };

const text = (body: string): ToolResult => ({ content: [{ type: 'text', text: body }] });

/**
 * 경로를 노드로 옮긴다. **없는 것과 못 보는 것을 가르지 않는다**
 * (`SEC-ACL-006` AC-5).
 *
 * 두 경우가 같은 `undefined` 로 돌아오므로 호출자에게는 사유를 실을 자리가
 * 없다. 그것이 이 함수가 판정을 안에서 끝내는 이유다 — 밖으로 내보내면
 * 그 자리에서 둘이 갈린다.
 *
 * 경로는 `/워크스페이스/그 아래 경로` 다. 1.0 은 단일 뿌리였고 2.0 은
 * 워크스페이스가 경계이므로 첫 조각이 그 이름을 받는다.
 */
function locate(
  stores: DispatchStores,
  actor: Actor,
  path: string,
): { workspaceId: string; node?: NodeRecord } | undefined {
  const parts = path.split('/').filter((one) => one !== '');
  if (parts.length === 0) return undefined;

  const [name, ...rest] = parts;
  const entry = visibleWorkspacesOf(stores, actor).find((one) => one.workspace.name === name);
  if (entry === undefined) return undefined;

  const workspaceId = entry.workspace.id;
  if (rest.length === 0) return { workspaceId };

  const wanted = rest.join('/');
  const node = stores.nodes
    .allIn(workspaceId)
    .find((one) => one.orphanedAt === null && stores.nodes.pathOf(one.id) === wanted);
  if (node === undefined) return undefined;

  // 보이지 않는 노드는 **없는 것과 같이** 돌려준다. 판정 결과로 조기
  // 반환하지 않으므로 두 경우가 같은 마지막 줄을 지난다.
  return permissionOf(stores, actor, node.id) === null ? undefined : { workspaceId, node };
}

/** 워크스페이스 하나의 한 단계를 이름 목록으로. */
function listOneLevel(
  stores: DispatchStores,
  actor: Actor,
  where: { workspaceId: string; parentId: string | null },
): string[] {
  return visibleChildrenOf(stores, actor, where).map((one) =>
    one.node.kind === 'directory' ? `${one.node.name}/` : one.node.name,
  );
}

export async function callTool(
  stores: DispatchStores,
  subject: McpSubjectRef,
  tool: McpTool,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const actor = actorFor(stores.principals, subject.userId);

  switch (tool.name) {
    case 'list_documents':
      return listDocuments(stores, actor, args);
    case 'read_document':
      return readOne(stores, actor, args);
    case 'create_document':
      return createOrOverwrite(stores, actor, subject.scope, args);
    case 'delete_document':
      return deleteOne(stores, actor, subject.scope, args);
    default:
      return { ok: false, rule: 'not-implemented' };
  }
}

function listDocuments(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): ToolOutcome {
  const path = typeof args.path === 'string' && args.path !== '' ? args.path : '/';

  // 뿌리는 워크스페이스 목록이다. 2.0 에서 경로의 첫 조각이 워크스페이스이므로
  // 그 위에는 그것들만 있다.
  if (path === '/') {
    const lines = visibleWorkspacesOf(stores, actor).flatMap((one) =>
      listOneLevel(stores, actor, { workspaceId: one.workspace.id, parentId: null }).map(
        (name) => `${one.workspace.name}/${name}`,
      ),
    );
    return { ok: true, result: text(render(path, lines)) };
  }

  const at = locate(stores, actor, path);
  if (at === undefined) return { ok: false, rule: 'not-found' };

  const parentId = at.node === undefined ? null : at.node.id;
  return {
    ok: true,
    result: text(render(path, listOneLevel(stores, actor, { workspaceId: at.workspaceId, parentId }))),
  };
}

/**
 * 목록의 표현 — **총계를 싣지 않는다** (`SEC-ARCH-002` AC-4).
 *
 * 「3건 중 1건」 같은 값이 서면 목록에서 뺀 의미가 그 자리에서 사라진다.
 * 걸러진 개수뿐 아니라 거르기 전 개수도 마찬가지다.
 */
function render(path: string, lines: readonly string[]): string {
  return [`# ${path}`, '', ...lines.map((one) => `- ${one}`)].join('\n');
}

async function readOne(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.path !== 'string') return { ok: false, rule: 'missing-argument' };

  const at = locate(stores, actor, args.path);
  if (at?.node === undefined) return { ok: false, rule: 'not-found' };

  const outcome = await readDocument(stores, actor, at.node.id);
  // `forbidden` 도 `not-found` 로 접는다. 밖에서 둘이 갈리면 그 차이가 곧
  // 존재 여부를 알려 주는 신호가 된다 (`SEC-ACL-006` AC-5).
  if (!outcome.ok) return { ok: false, rule: 'not-found' };

  return { ok: true, result: text(`# ${args.path}\n\n${outcome.body}`) };
}

async function createOrOverwrite(
  stores: DispatchStores,
  actor: Actor,
  scope: TokenScope,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.path !== 'string' || typeof args.content !== 'string') {
    return { ok: false, rule: 'missing-argument' };
  }

  const at = locate(stores, actor, args.path);
  if (at === undefined) return { ok: false, rule: 'not-found' };

  if (at.node !== undefined) {
    // **실행 자체를 막는다** (`SEC-ARCH-003`). 저장을 시도한 뒤 결과를
    // 버리는 것으로는 부족하다 — 시도가 남기는 것이 생긴다.
    if (!allowedToWrite(stores, actor, scope, at.node.id)) return { ok: false, rule: 'forbidden' };

    const current = await readDocument(stores, actor, at.node.id);
    if (!current.ok) return { ok: false, rule: 'not-found' };

    const saved = await saveDocument(stores, actor, {
      nodeId: at.node.id,
      body: args.content,
      baseHash: current.hash,
    });
    if (!saved.ok) return { ok: false, rule: 'forbidden' };
    return { ok: true, result: text(`# ${args.path}\n\n저장했다.`) };
  }

  // 새로 만드는 자리는 그 부모다 — 대상이 아직 없으므로 권한의 근거가
  // 부모에 있다.
  const segments = args.path.split('/').filter((one) => one !== '');
  const name = segments.at(-1);
  if (name === undefined) return { ok: false, rule: 'missing-argument' };

  const parentPath = `/${segments.slice(0, -1).join('/')}`;
  const parent = locate(stores, actor, parentPath);
  if (parent === undefined) return { ok: false, rule: 'not-found' };

  const anchor = parent.node?.id ?? parent.workspaceId;
  if (!allowedToWrite(stores, actor, scope, anchor)) return { ok: false, rule: 'forbidden' };

  const created = createNode(stores, actor, {
    workspaceId: parent.workspaceId,
    parentId: parent.node?.id ?? null,
    kind: 'file',
    name,
  });
  if (!created.ok) return { ok: false, rule: 'forbidden' };

  const fresh = await readDocument(stores, actor, created.id);
  if (!fresh.ok) return { ok: false, rule: 'not-found' };

  const saved = await saveDocument(stores, actor, {
    nodeId: created.id,
    body: args.content,
    baseHash: fresh.hash,
  });
  if (!saved.ok) return { ok: false, rule: 'forbidden' };

  return { ok: true, result: text(`# ${args.path}\n\n만들었다.`) };
}

async function deleteOne(
  stores: DispatchStores,
  actor: Actor,
  scope: TokenScope,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.path !== 'string') return { ok: false, rule: 'missing-argument' };

  const at = locate(stores, actor, args.path);
  if (at?.node === undefined) return { ok: false, rule: 'not-found' };
  if (!allowedToWrite(stores, actor, scope, at.node.id)) return { ok: false, rule: 'forbidden' };

  const outcome = await moveToTrash(stores, actor, at.node.id);
  if (!outcome.ok) return { ok: false, rule: 'forbidden' };

  return { ok: true, result: text(`# ${args.path}\n\n지웠다.`) };
}

/**
 * 쓸 수 있는가 — **스코프와 실시간 유효 권한의 교집합**이다.
 *
 * 판정은 `permittedUnderScope` 가 이미 소유한다 (`SEC-AUTH-008`). 여기서
 * 다시 세우면 PAT 스코프의 의미가 두 곳에 생기고, `read-only` 토큰이 한쪽
 * 경로에서만 막히게 된다.
 */
function allowedToWrite(
  stores: DispatchStores,
  actor: Actor,
  scope: TokenScope,
  nodeId: string,
): boolean {
  const level = permissionOf(stores, actor, nodeId);
  return permittedUnderScope(scope, level, 'write') && level !== null && permits(level, 'edit');
}
