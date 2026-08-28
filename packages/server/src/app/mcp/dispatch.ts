import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { permits } from '../../domain/acl/level.js';
import { contentHash } from '../../domain/document/content-hash.js';
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
import { semanticSearch, type SemanticStores } from '../search/semantic-search.js';
import { moveToTrash, type TrashStores } from '../trash/trash-service.js';
import {
  bodyOf,
  codeBlocksOf,
  estimateTokens,
  overlap,
  sectionsOf,
  splitFrontMatter,
  walk,
} from './readers.js';
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

export type DispatchStores = DocumentStores & TrashStores & SemanticStores & { docsRoot: string };

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
    case 'list_full_tree':
      return fullTree(stores, actor, args);
    case 'read_document':
      return readOne(stores, actor, args);
    case 'create_document':
      return createOrOverwrite(stores, actor, subject.scope, args);
    case 'delete_document':
      return deleteOne(stores, actor, subject.scope, args);
    case 'query_document':
      return queryDocument(stores, actor, args);
    case 'summarize_document':
      return summarizeDocument(stores, actor, args);
    case 'resolve_project':
      return resolveProject(stores, actor, args);
    case 'query_code_examples':
      return queryCodeExamples(stores, actor, args);
    case 'list_context_documents':
      return listContextDocuments(stores, actor, args);
    case 'search_documents':
      return searchDocuments(stores, actor, args);
    default:
      // 접두가 붙는 넷은 이름이 설정에 따라 달라지므로 꼬리로 가른다.
      if (tool.name.endsWith('_get_config')) return getConfig(args);
      if (tool.name.endsWith('_smart_search')) return smartSearch(stores, actor, args);
      if (tool.name.endsWith('_search')) return keywordSearch(stores, actor, args);
      return { ok: false, rule: 'not-implemented' };
  }
}

/** 워크스페이스와 그 아래를 재귀로. 경로만 싣고 내용은 읽지 않는다. */
function fullTree(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): ToolOutcome {
  const path = typeof args.path === 'string' && args.path !== '' ? args.path : '/';
  const maxDepth = typeof args.maxDepth === 'number' ? args.maxDepth : Number.MAX_SAFE_INTEGER;

  if (path === '/') {
    const lines = visibleWorkspacesOf(stores, actor).flatMap((one) => [
      `- ${one.workspace.name}/`,
      ...walk(stores, actor, { workspaceId: one.workspace.id, parentId: null }, 1, maxDepth),
    ]);
    return { ok: true, result: text([`# ${path}`, '', ...lines].join('\n')) };
  }

  const at = locate(stores, actor, path);
  if (at === undefined) return { ok: false, rule: 'not-found' };

  const lines = walk(
    stores,
    actor,
    { workspaceId: at.workspaceId, parentId: at.node?.id ?? null },
    0,
    maxDepth,
  );
  return { ok: true, result: text([`# ${path}`, '', ...lines].join('\n')) };
}

/**
 * 서버 설정 — **비밀값을 싣지 않는다.**
 *
 * 1.0 은 마스킹해 내보냈지만 마스킹은 자리의 존재를 알려 준다. 2.0 은 그
 * 자리를 아예 만들지 않는다: 이 도구가 도는 목적은 화면 설정을 읽는 것이고,
 * 비밀은 어느 구획으로도 나가지 않는다.
 */
function getConfig(args: Record<string, unknown>): ToolOutcome {
  const section = typeof args.section === 'string' ? args.section : 'all';
  const lines = [`# config (${section})`, '', '- ui.title: DocuLight', '- security: (비공개)'];
  return { ok: true, result: text(lines.join('\n')) };
}

/** 이름·제목·본문을 훑는 키워드 검색. */
async function keywordSearch(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    return { ok: false, rule: 'missing-argument' };
  }
  const limit = Math.min(Math.max(typeof args.limit === 'number' ? args.limit : 10, 1), 100);
  const query = args.query;

  const lines: string[] = [];
  for (const node of await visibleFiles(stores, actor)) {
    const body = await bodyOf(stores, node);
    if (overlap(query, `${node.name}\n${body}`) === 0) continue;

    lines.push(`## ${stores.nodes.pathOf(node.id)}`);
    for (const [index, line] of body.split(/\r?\n/).entries()) {
      if (overlap(query, line) > 0) lines.push(`**Line ${index + 1}**: ${line.trim()}`);
      if (lines.length >= limit * 4) break;
    }
    if (lines.length >= limit * 4) break;
  }

  return { ok: true, result: text([`# Search Results for "${query}"`, '', ...lines].join('\n')) };
}

/** 한 문서를 절로 쪼개 질의에 가까운 것부터 예산 안에서 고른다. */
async function queryDocument(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.path !== 'string' || typeof args.query !== 'string') {
    return { ok: false, rule: 'missing-argument' };
  }
  const at = locate(stores, actor, args.path);
  if (at?.node === undefined) return { ok: false, rule: 'not-found' };

  const budget = typeof args.maxTokens === 'number' ? args.maxTokens : 2000;
  const body = await bodyOf(stores, at.node);
  const ranked = sectionsOf(body)
    .map((one) => ({ ...one, score: overlap(args.query as string, one.text) }))
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  let used = 0;
  for (const section of ranked) {
    const cost = estimateTokens(section.text);
    if (used + cost > budget) continue;
    picked.push(section.text);
    used += cost;
  }

  return {
    ok: true,
    result: text([`# ${args.path}`, '', ...picked, '', `**Tokens used**: ${used} / ${budget}`].join('\n')),
  };
}

/** 전문을 읽지 않고 구조만. 제목·차례·통계다. */
async function summarizeDocument(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.path !== 'string') return { ok: false, rule: 'missing-argument' };

  const at = locate(stores, actor, args.path);
  if (at?.node === undefined) return { ok: false, rule: 'not-found' };

  const body = await bodyOf(stores, at.node);
  const { rest } = splitFrontMatter(body);
  const sections = sectionsOf(rest);

  const lines = [
    `# Document Summary: ${args.path}`,
    '',
    '## Table of Contents',
    ...sections.map((one, index) => `${index + 1}. ${one.title}`),
    '',
    '## Statistics',
    `- 문자 수: ${rest.length}`,
    `- 절 수: ${sections.length}`,
    `- 코드 블록 수: ${codeBlocksOf(rest).length}`,
    `- 추정 토큰: ${estimateTokens(rest)}`,
  ];
  return { ok: true, result: text(lines.join('\n')) };
}

/** 이름을 문서 경로로 해석한다. 완전 일치가 부분 일치보다 앞선다. */
async function resolveProject(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.name !== 'string' || args.name.trim() === '') {
    return { ok: false, rule: 'missing-argument' };
  }
  const wanted = args.name.toLowerCase();
  const limit = Math.min(Math.max(typeof args.limit === 'number' ? args.limit : 5, 1), 100);

  const scored: { path: string; score: number }[] = [];
  for (const node of await visibleFiles(stores, actor)) {
    const name = node.name.replace(/\.md$/i, '').toLowerCase();
    const score = name === wanted ? 1 : name.includes(wanted) ? 0.8 : wanted.includes(name) ? 0.75 : 0;
    if (score > 0) scored.push({ path: stores.nodes.pathOf(node.id), score });
  }

  const top = scored.sort((a, b) => b.score - a.score).slice(0, limit);
  const lines = top.map(
    (one, index) => `## ${index + 1}. ${one.path} (score: ${one.score.toFixed(2)})`,
  );
  return {
    ok: true,
    result: text([`# Project Resolution for "${args.name}"`, '', ...lines].join('\n')),
  };
}

/** 코드 펜스를 뽑아 질의에 가까운 것부터. */
async function queryCodeExamples(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.query !== 'string') return { ok: false, rule: 'missing-argument' };

  const language = typeof args.language === 'string' ? args.language.toLowerCase() : undefined;
  const budget = typeof args.maxTokens === 'number' ? args.maxTokens : 3000;
  const limit = Math.min(Math.max(typeof args.limit === 'number' ? args.limit : 10, 1), 100);

  const found: { path: string; language: string; code: string; score: number }[] = [];
  for (const node of await visibleFiles(stores, actor)) {
    const body = await bodyOf(stores, node);
    for (const block of codeBlocksOf(body)) {
      if (language !== undefined && block.language !== language) continue;
      const score = overlap(args.query, `${node.name}\n${block.code}`);
      // 1.0 과 같은 임계값이다. 이 아래는 우연한 겹침이라 실으면 잡음이 된다.
      if (score < 0.25) continue;
      found.push({ path: stores.nodes.pathOf(node.id), ...block, score });
    }
  }

  const lines: string[] = [];
  let used = 0;
  for (const one of found.sort((a, b) => b.score - a.score).slice(0, limit)) {
    const cost = estimateTokens(one.code);
    if (used + cost > budget) break;
    lines.push(`## ${one.path}`, '```' + one.language, one.code.trimEnd(), '```');
    used += cost;
  }

  return {
    ok: true,
    result: text([`# Code Examples for "${args.query}"`, '', ...lines].join('\n')),
  };
}

/** 프론트매터에 `description` 이 있는 문서만. */
async function listContextDocuments(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  const path = typeof args.path === 'string' && args.path !== '' ? args.path : '/';

  const lines: string[] = [];
  for (const node of await visibleFiles(stores, actor)) {
    const { meta } = splitFrontMatter(await bodyOf(stores, node));
    const description = meta.get('description');
    if (description === undefined) continue;
    lines.push(`- ${stores.nodes.pathOf(node.id)}: ${description}`);
  }

  return { ok: true, result: text([`# ${path}`, '', ...lines].join('\n')) };
}

/** 본문에서 글자를 찾아 앞뒤 문맥과 함께. */
async function searchDocuments(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.query !== 'string' || args.query === '') {
    return { ok: false, rule: 'missing-argument' };
  }
  const around = Math.min(Math.max(typeof args.context_chars === 'number' ? args.context_chars : 50, 10), 500);
  const perFile = Math.min(Math.max(typeof args.max_results === 'number' ? args.max_results : 10, 1), 100);
  const sensitive = args.case_sensitive === true;

  const needle = sensitive ? args.query : args.query.toLowerCase();
  const lines: string[] = [];

  for (const node of await visibleFiles(stores, actor)) {
    const body = await bodyOf(stores, node);
    const hay = sensitive ? body : body.toLowerCase();

    let from = hay.indexOf(needle);
    let count = 0;
    while (from !== -1 && count < perFile) {
      const start = Math.max(0, from - around);
      lines.push(`- ${stores.nodes.pathOf(node.id)}: ...${body.slice(start, from + needle.length + around).replace(/\r?\n/g, ' ')}...`);
      from = hay.indexOf(needle, from + needle.length);
      count += 1;
    }
  }

  return { ok: true, result: text([`# Search Results for "${args.query}"`, '', ...lines].join('\n')) };
}

/**
 * 의미 검색 (`FR-ARCH-001` AC-4).
 *
 * 거르기는 `semanticSearch` 안에서 이미 끝난다 — 여기서 다시 거르면 같은
 * 책임이 두 곳에 생기고, 여기서 안 거르면 그 함수를 믿는 것이 된다. 믿는
 * 쪽이 옳은 이유는 그 함수가 조각을 손에 쥐는 유일한 자리이기 때문이다.
 */
async function smartSearch(
  stores: DispatchStores,
  actor: Actor,
  args: Record<string, unknown>,
): Promise<ToolOutcome> {
  if (typeof args.query !== 'string' || args.query.trim() === '') {
    return { ok: false, rule: 'missing-argument' };
  }
  const limit = typeof args.limit === 'number' ? args.limit : 5;
  const hits = await semanticSearch(stores, actor, { query: args.query, limit });

  const lines = hits.map(
    (one, index) =>
      `## ${index + 1}. ${stores.nodes.pathOf(one.nodeId)} (score: ${one.score.toFixed(2)})\n\n${one.chunk}`,
  );
  return {
    ok: true,
    result: text([`# Search Results for "${args.query}"`, '', ...lines].join('\n')),
  };
}

/**
 * 호출자가 볼 수 있는 파일 노드 전부.
 *
 * 워크스페이스마다 한 단계씩 내려가며 모은다 — `visibleChildrenOf` 를 거쳐야
 * 점 이름 규칙과 ACL 이 한 자리에서 함께 걸린다.
 */
async function visibleFiles(stores: DispatchStores, actor: Actor): Promise<NodeRecord[]> {
  const found: NodeRecord[] = [];

  const descend = (workspaceId: string, parentId: string | null): void => {
    for (const child of visibleChildrenOf(stores, actor, { workspaceId, parentId })) {
      if (child.node.kind === 'directory') descend(workspaceId, child.node.id);
      else found.push(child.node);
    }
  };

  for (const one of visibleWorkspacesOf(stores, actor)) descend(one.workspace.id, null);
  return found;
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

  // **대상이 없는 것이 정상 경로다.** 새로 만드는 호출에서는 아직 그 노드가
  // 없으므로, 여기서 조기 반환하면 만들기가 언제나 실패한다.
  const at = locate(stores, actor, args.path);

  if (at?.node !== undefined) {
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

  // **빈 파일을 먼저 세운다.** `createNode` 는 노드만 만들고 파일을 만들지
  // 않는데 `saveDocument` 는 충돌 판정을 위해 디스크를 읽으므로, 파일이
  // 없으면 그 자리에서 던진다. 직접 쓰지 않고 빈 파일을 거쳐 저장 함수로
  // 보내는 이유는 권한 판정과 스냅샷이 그 함수 하나에 모여 있기 때문이다.
  const at2 = join(stores.docsRoot, parent.workspaceId, stores.nodes.pathOf(created.id));
  await mkdir(dirname(at2), { recursive: true });
  await writeFile(at2, '', 'utf8');

  const saved = await saveDocument(stores, actor, {
    nodeId: created.id,
    body: args.content,
    baseHash: contentHash(''),
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
