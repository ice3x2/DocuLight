import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { NodeRecord } from '../../domain/ports/node-repository.js';
import { visibleChildrenOf, type Actor } from '../acl/permission-service.js';
import type { SemanticStores } from '../search/semantic-search.js';

/**
 * 1.0 의 읽기 도구들이 하던 일 (`FR-ARCH-001` AC-1 · AC-2).
 *
 * 물려받는 것은 **도구 계약과 화면이 제공하던 동작**이지 구현이 아니다.
 * 1.0 의 소스를 옮겨 온 파일이 이 패키지에 없고(AC-3), 각 도구는 2.0 의
 * 저장소와 ACL 위에서 새로 선다.
 *
 * 모든 도구가 마크다운 문자열 하나로 답한다 — 1.0 의 열다섯 도구가 전부
 * `{content:[{type:'text', text}]}` 였으므로 그 모양도 계약이다.
 */

export type ReaderStores = SemanticStores;

/** 노드 아래를 재귀로 훑되 **보이는 것만** 든다. */
export function walk(
  stores: ReaderStores,
  actor: Actor,
  where: { workspaceId: string; parentId: string | null },
  depth: number,
  maxDepth: number,
): string[] {
  if (depth > maxDepth) return [];

  const lines: string[] = [];
  for (const child of visibleChildrenOf(stores, actor, where)) {
    const pad = '  '.repeat(depth);
    const directory = child.node.kind === 'directory';
    lines.push(`${pad}- ${child.node.name}${directory ? '/' : ''}`);
    if (directory) {
      lines.push(
        ...walk(
          stores,
          actor,
          { workspaceId: where.workspaceId, parentId: child.node.id },
          depth + 1,
          maxDepth,
        ),
      );
    }
  }
  return lines;
}

/** 문서 본문. 없으면 빈 글자 — 파일이 아직 없는 노드가 있을 수 있다. */
export async function bodyOf(stores: ReaderStores, node: NodeRecord): Promise<string> {
  const at = join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(node.id));
  return readFile(at, 'utf8').catch(() => '');
}

/** 프론트매터를 걷어 낸 본문과 그 안의 값들. */
export function splitFrontMatter(body: string): { meta: Map<string, string>; rest: string } {
  const meta = new Map<string, string>();
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(body);
  if (match === null) return { meta, rest: body };

  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    meta.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
  }
  return { meta, rest: body.slice(match[0].length) };
}

/** 헤딩으로 자른 절들. 각 절은 제목과 본문을 함께 든다. */
export function sectionsOf(body: string): { title: string; text: string }[] {
  const parts = body.split(/(?=^#{1,6}\s)/m).filter((one) => one.trim() !== '');
  return parts.map((part) => {
    const first = part.split(/\r?\n/, 1)[0] ?? '';
    return { title: first.replace(/^#{1,6}\s*/, '').trim(), text: part };
  });
}

/**
 * 질의와 글자가 겹치는 정도. 0 에서 1 사이.
 *
 * 의미가 아니라 표기가 겹치는 정도다 — 그 한계는
 * `domain/search/embedding.ts` 가 적어 둔 것과 같다.
 */
export function overlap(query: string, text: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter((one) => one !== '');
  if (terms.length === 0) return 0;

  const flat = text.toLowerCase();
  const hit = terms.filter((one) => flat.includes(one)).length;
  return hit / terms.length;
}

/** 글자 수로 토큰을 어림한다. 1.0 도 정확한 토크나이저를 쓰지 않았다. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** 코드 펜스를 뽑는다. 언어가 있으면 함께. */
export function codeBlocksOf(body: string): { language: string; code: string }[] {
  const blocks: { language: string; code: string }[] = [];
  const pattern = /```([A-Za-z0-9+#-]*)\r?\n([\s\S]*?)```/g;

  let match = pattern.exec(body);
  while (match !== null) {
    blocks.push({ language: (match[1] ?? '').toLowerCase(), code: match[2] ?? '' });
    match = pattern.exec(body);
  }
  return blocks;
}
