import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { permissionBatch, visibleWorkspacesOf, type Actor } from '../acl/permission-service.js';
import { permits } from '../../domain/acl/level.js';
import { findTags } from '../../domain/document/tag.js';
import { isVersioned } from '../../domain/document/version-layout.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';
import { parseQuery } from '../../domain/search/query.js';
import type { AttachmentRepository } from '../../domain/ports/attachment-repository.js';
import type { PdfTextExtractor } from '../../domain/ports/pdf-text.js';
import { pdfjsTextExtractor } from '../../infra/pdf/pdfjs-text.js';
import { workspaceRootOf, type DocumentStores } from './save-service.js';

/**
 * 전역 검색 (`FR-SHELL-013`).
 *
 * **결과를 소유하는 표면은 좌측 검색 탭 하나다** (AC-1) — 그래서 이 함수의
 * 반환값에 다른 표면이 쓸 만한 축을 싣지 않는다.
 *
 * 색인을 두지 않는다. 권한 필터가 **표시 직전**에 걸려야 하고
 * (`SEC-WORKSPACE-004` AC-6), 색인을 두면 그것과 권한이 어긋날 자리가
 * 생긴다. 큰 인스턴스에서는 색인이 필요해지겠지만 그때도 필터는 조회
 * 시점에 남는다.
 */

/** 검색 대상 넷 (`FR-SHELL-013` AC-5). 이 열거가 그 목록의 정본이다. */
export const SEARCH_AXES = ['name', 'body', 'tag', 'attachment'] as const;

export type SearchAxis = (typeof SEARCH_AXES)[number];

/**
 * 처음 열었을 때 켜져 있는 축 (`FR-SHELL-013` AC-6).
 *
 * 이름 하나다 — 본문·태그·첨부까지 켜 두면 첫 질의가 인스턴스 전체를
 * 읽고, 사용자는 자기가 무엇을 켰는지 모른 채 그 비용을 낸다.
 */
export const DEFAULT_AXES: readonly SearchAxis[] = ['name'];

/** 일치 지점 하나 (`FR-SHELL-013` AC-9). */
export interface SearchExcerpt {
  readonly axis: SearchAxis;
  /** 그 자리의 글자. 일치한 부분을 담는다. */
  readonly text: string;
  /**
   * PDF 본문에서 온 발췌라면 그 글자가 있던 페이지 번호 (AC-4).
   *
   * 마크다운 본문에는 페이지가 없으므로 그쪽 발췌에는 서지 않는다 — 없는
   * 값을 0 이나 1 로 채우면 읽는 쪽이 그것을 실제 페이지로 읽는다.
   */
  readonly page?: number;
}

/** 결과의 한 문서 — 머리행 하나에 발췌가 쌓인다 (AC-10). */
export interface SearchDocument {
  readonly nodeId: NodeId;
  readonly name: string;
  readonly workspaceName: string;
  readonly excerpts: readonly SearchExcerpt[];
}

/**
 * 결과.
 *
 * **거르기 전 개수나 분모를 싣지 않는다** (`FR-SHELL-013` AC-11 ·
 * `SEC-WORKSPACE-004` AC-8) — 그 차액이 곧 볼 수 없는 문서의 개수다.
 */
export interface SearchResult {
  readonly documents: readonly SearchDocument[];
}

/**
 * 검색이 쓰는 저장소.
 *
 * 첨부 경계가 함께 드는 이유는 첨부 **이름**이 네 축의 하나이기 때문이다 —
 * 첨부의 바이트는 보지 않는다.
 */
export type SearchStores = DocumentStores & {
  attachments: AttachmentRepository;
  /**
   * PDF 본문 추출기 (AC-4). 주지 않으면 기본 구현을 쓴다 — 검색이 PDF 를
   * 덮는 것은 조항이 요구하는 기본 동작이므로, 부르는 쪽이 매번 넘겨야
   * 한다면 넘기지 않은 자리에서 조항이 조용히 꺼진다.
   */
  pdf?: PdfTextExtractor;
};

/** PDF 노드인가 — 본문을 읽는 방법이 마크다운과 다르다. */
const isPdf = (name: string) => name.toLowerCase().endsWith('.pdf');

/** 발췌의 앞뒤로 남기는 글자 수. 너무 길면 목록이 본문 뷰어가 된다. */
const AROUND = 20;

export async function search(
  stores: SearchStores,
  actor: Actor,
  input: { query: string; axes: readonly SearchAxis[] },
): Promise<SearchResult> {
  const parsed = parseQuery(input.query);
  if (!parsed.ok || input.axes.length === 0) return { documents: [] };
  const groups = parsed.groups.map((group) => group.map((term) => term.toLowerCase()));

  const on = new Set(input.axes);
  const documents: SearchDocument[] = [];

  for (const entry of visibleWorkspacesOf(stores, actor)) {
    for (const node of servableIn(stores, actor, entry.workspace.id)) {
      const excerpts = await matchesOf(stores, node, groups, on);
      if (excerpts.length > 0) {
        documents.push({
          nodeId: node.id,
          name: node.name,
          workspaceName: entry.workspace.name,
          excerpts,
        });
      }
    }
  }

  return { documents };
}

/**
 * 그 워크스페이스에서 요청자가 볼 수 있는 노드들.
 *
 * `visibleMarkdown` 을 쓰지 않는 이유는 이름 축이 **비-md 노드까지** 덮기
 * 때문이다 (`FR-SHELL-013` AC-3) — 그쪽은 md 만 돌려준다.
 */
function servableIn(
  stores: SearchStores,
  actor: Actor,
  workspaceId: string,
): { id: NodeId; name: string; path: string; workspaceId: string }[] {
  const all = stores.nodes.allIn(workspaceId);
  const byId = new Map(all.map((node) => [node.id, node]));

  const chainOf = (id: NodeId) => {
    const chain = [];
    for (let cursor: NodeId | null = id; cursor !== null; ) {
      const node = byId.get(cursor);
      if (node === undefined) break;
      chain.push(node);
      cursor = node.parentId;
    }
    return chain;
  };

  // **관문이 권한보다 먼저 선다** — 휴지통에 든 것과 점 이름 아래의 것은
  // 이름·상태 축이라 슈퍼유저에게도 거부되어야 한다.
  const candidates = all.filter((node) => node.kind === 'file' && isServable(chainOf(node.id)));
  if (candidates.length === 0) return [];

  const level = permissionBatch(stores, actor, candidates.map((node) => node.id), workspaceId);

  return candidates
    .filter((node) => {
      const held = level(node.id);
      return held !== null && permits(held, 'view');
    })
    .map((node) => ({
      id: node.id,
      name: node.name,
      workspaceId,
      path: chainOf(node.id)
        .map((one) => one.name)
        .reverse()
        .join('/'),
    }));
}

/** 그 노드의 일치 지점들. 하나도 없으면 결과에 서지 않는다. */
async function matchesOf(
  stores: SearchStores,
  node: { id: NodeId; name: string; path: string; workspaceId: string },
  groups: readonly (readonly string[])[],
  on: ReadonlySet<SearchAxis>,
): Promise<SearchExcerpt[]> {
  type Match = { excerpt: SearchExcerpt; identity: string; sourceOrder: number; matchLength: number };
  const terms = [...new Set(groups.flat())];
  const hits = new Map(terms.map((term) => [term, [] as Match[]]));
  const add = (term: string, excerpt: SearchExcerpt, identity: string, sourceOrder: number) =>
    hits.get(term)!.push({ excerpt, identity, sourceOrder, matchLength: term.length });

  if (on.has('name')) {
    const name = node.name.toLowerCase();
    for (const term of terms) {
      const at = name.indexOf(term);
      if (at !== -1) add(term, { axis: 'name', text: node.name }, `name:${at}`, at);
    }
  }

  if (on.has('attachment')) {
    for (const [attachmentAt, one] of stores.attachments.listOf(node.id).entries()) {
      const name = one.originalName.toLowerCase();
      for (const term of terms) {
        const at = name.indexOf(term);
        if (at !== -1)
          add(term, { axis: 'attachment', text: one.originalName }, `attachment:${attachmentAt}:${at}`, 1_000_000 + attachmentAt * 10_000 + at);
      }
    }
  }

  // PDF 는 **본문 축의 확장**이다 (AC-4) — 다섯째 축이 아니다. 태그 축은
  // 타지 않는다: 태그는 마크다운 문법이고 PDF 에는 그 문법이 없다.
  if (on.has('body') && isPdf(node.name)) {
    for (const [term, match] of await pdfExcerpts(stores, node, terms))
      add(term, match.excerpt, match.identity, match.sourceOrder);
    return matchedExcerpts(groups, hits);
  }

  // 본문을 읽는 두 축은 함께 판정한다 — 축마다 파일을 다시 읽으면 같은
  // 문서를 두 번 읽는다.
  if (on.has('body') || on.has('tag')) {
    const body = isVersioned(node.name) ? await bodyOf(stores, node) : '';
    const tags = on.has('tag') ? findTags(body).map((tag) => tag.toLowerCase()) : [];

    for (const term of terms) {
      for (const [tagAt, tag] of tags.entries()) {
        const at = tag.indexOf(term);
        if (at !== -1) add(term, { axis: 'tag', text: `#${term}` }, `tag:${tagAt}:${at}`, 2_000_000 + tagAt * 10_000 + at);
      }
      if (on.has('body'))
        for (const match of bodyMatches(body, term))
          add(term, match.excerpt, `body:${match.start}`, 3_000_000 + match.start);
    }
  }

  return matchedExcerpts(groups, hits);
}

function matchedExcerpts(
  groups: readonly (readonly string[])[],
  hits: ReadonlyMap<string, readonly { excerpt: SearchExcerpt; identity: string; sourceOrder: number; matchLength: number }[]>,
): SearchExcerpt[] {
  const matchedTerms = new Set(
    groups.filter((group) => group.every((term) => (hits.get(term)?.length ?? 0) > 0)).flat(),
  );
  if (matchedTerms.size === 0) return [];
  const found = new Map<string, { excerpt: SearchExcerpt; sourceOrder: number; matchLength: number }>();
  for (const term of matchedTerms)
    for (const match of hits.get(term) ?? []) {
      const previous = found.get(match.identity);
      if (previous === undefined || match.matchLength > previous.matchLength) found.set(match.identity, match);
    }
  return [...found.values()].sort((left, right) => left.sourceOrder - right.sourceOrder).map((match) => match.excerpt);
}

/**
 * PDF 의 일치 지점마다 **그 글자가 있던 페이지 번호를 함께** 싣는다 (AC-4).
 *
 * 페이지를 하나로 이어 붙이지 않는 이유가 그것이다 — 이어 붙이면 번호를
 * 되찾을 수 없고, 조항이 요구하는 것은 본문이 걸리는 것만이 아니라 그
 * 자리가 몇 쪽인지다.
 */
async function pdfExcerpts(
  stores: SearchStores,
  node: { path: string; workspaceId: string },
  terms: readonly string[],
): Promise<[string, { excerpt: SearchExcerpt; identity: string; sourceOrder: number }][]> {
  let bytes: Uint8Array;
  try {
    // `Buffer` 를 그대로 넘기지 않는다 — 하위 타입이라 타입 검사는 통과하지만
    // 추출기가 그것을 거절하면 아래 계약대로 빈 배열이 되어, 조항이 조용히
    // 꺼진 채 시험만 초록이 된다.
    bytes = new Uint8Array(
      await readFile(join(workspaceRootOf(stores, node.workspaceId), node.path)),
    );
  } catch {
    return [];
  }

  const extractor = stores.pdf ?? pdfjsTextExtractor;
  const found: [string, { excerpt: SearchExcerpt; identity: string; sourceOrder: number }][] = [];
  for (const one of await extractor.extract(bytes)) {
    for (const term of terms)
      for (const match of bodyMatches(one.text, term))
        found.push([
          term,
          {
            excerpt: { ...match.excerpt, page: one.page },
            identity: `body:${one.page}:${match.start}`,
            sourceOrder: 3_000_000 + one.page * 100_000 + match.start,
          },
        ]);
  }
  return found;
}

/** 본문의 일치 지점마다 앞뒤를 조금 붙여 잘라 낸다 (`FR-SHELL-013` AC-9). */
function bodyMatches(body: string, wanted: string): { excerpt: SearchExcerpt; start: number }[] {
  const found: { excerpt: SearchExcerpt; start: number }[] = [];
  const haystack = body.toLowerCase();

  for (let at = haystack.indexOf(wanted); at !== -1; at = haystack.indexOf(wanted, at + wanted.length)) {
    found.push({
      start: at,
      excerpt: {
        axis: 'body',
        text: body.slice(Math.max(0, at - AROUND), at + wanted.length + AROUND).trim(),
      },
    });
  }
  return found;
}

async function bodyOf(
  stores: SearchStores,
  node: { path: string; workspaceId: string },
): Promise<string> {
  try {
    return await readFile(join(workspaceRootOf(stores, node.workspaceId), node.path), 'utf8');
  } catch {
    // 실체가 없는 노드는 재조정이 아직 닿지 않은 상태다 — 본문이 없을 뿐
    // 검색 전체를 실패시킬 일이 아니다.
    return '';
  }
}
