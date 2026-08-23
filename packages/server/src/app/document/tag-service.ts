import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Actor } from '../acl/permission-service.js';
import { findTags } from '../../domain/document/tag.js';
import { compareNames } from '../../domain/naming/name-order.js';
import { visibleMarkdown, type VisibleDocument } from './link-service.js';
import { workspaceRootOf, type DocumentStores } from './save-service.js';

/**
 * 태그 탭의 색인 (`FR-SHELL-009` · `FR-SHELL-011`).
 *
 * 우측 태그 탭은 **색인**을 소유하고 좌측 검색 탭이 **결과**를 소유한다
 * (`FR-SHELL-010`) — 그래서 여기서 문서 목록을 돌려주지 않는다. 돌려주면
 * 같은 물음에 답하는 자리가 둘이 되고, 그 둘은 같은 필터를 두 번 쓴다.
 */

/**
 * 개수 옆에 **항상 같은 문구**로 붙는 기준 (`FR-SHELL-009` AC-6).
 *
 * 조건에 따라 갈리는 문구를 쓰면 그 갈림이 곧 숨은 항목의 존재를 알린다.
 * 단위가 `출현 문서 수` 이지 `출현 횟수` 가 아니라는 것도 이 문구가 든다 —
 * 한 문서에 같은 태그가 열 번 나와도 그 문서는 1 이다.
 */
export const TAG_COUNT_BASIS = '내가 볼 수 있는 문서 기준 출현 문서 수';

/** 목록의 한 줄. **문서 목록을 싣지 않는다** — 그것은 검색 탭의 것이다. */
export interface TagRow {
  readonly name: string;
  /** 그 태그를 단 문서 중 요청자가 볼 수 있는 것의 개수. */
  readonly documents: number;
}

export interface TagIndex {
  readonly tags: readonly TagRow[];
  /** 개수의 기준. 언제나 같은 값이다. */
  readonly basis: string;
}

/**
 * 이 요청자가 볼 수 있는 태그들 (`FR-SHELL-009`).
 *
 * **집계 원천 자체에 권한 필터가 걸린다** (AC-3) — 개수만 거르면 이름이
 * 남고, 그 이름이 곧 볼 수 없는 문서의 존재를 알린다.
 *
 * 필터는 **조회 시점**에 걸린다 (`SEC-WORKSPACE-004` AC-6). 색인을 따로
 * 두지 않는 이유가 그것이다 — 권한이 바뀐 뒤 첫 조회부터 반영되어야 하고,
 * 색인을 두면 그것과 권한이 어긋날 자리가 생긴다.
 */
export async function tagIndex(
  stores: DocumentStores,
  actor: Actor,
  /** 범위 선택기 (AC-2). 비면 접근 가능한 전 워크스페이스다. */
  scope: { workspaceId?: string },
): Promise<TagIndex> {
  const documents = visibleMarkdown(stores, actor).filter(
    (one) => scope.workspaceId === undefined || one.node.workspaceId === scope.workspaceId,
  );

  const counts = new Map<string, number>();
  for (const one of documents) {
    // `findTags` 가 중복을 이미 접으므로 문서마다 한 태그는 한 번만 는다
    // (AC-5). 여기서 다시 접지 않는 이유는 접는 자리가 둘이면 규칙이
    // 갈리기 때문이다.
    for (const name of findTags(await bodyOf(stores, one))) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return {
    tags: [...counts]
      .map(([name, documents_]) => ({ name, documents: documents_ }))
      .sort((a, b) => compareNames(a.name, b.name)),
    basis: TAG_COUNT_BASIS,
  };
}

/**
 * 그 문서의 본문. 없으면 빈 문자열이다.
 *
 * 실체가 없는 노드는 재조정이 아직 닿지 않은 상태다 — 태그가 없을 뿐
 * 목록 전체를 실패시킬 일이 아니다.
 */
async function bodyOf(stores: DocumentStores, one: VisibleDocument): Promise<string> {
  try {
    return await readFile(join(workspaceRootOf(stores, one.node.workspaceId), one.path), 'utf8');
  } catch {
    return '';
  }
}
