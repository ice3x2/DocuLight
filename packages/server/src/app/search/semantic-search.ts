import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { permits } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { VectorEntry, VectorIndex } from '../../domain/ports/vector-index.js';
import { chunk, embed, similarity } from '../../domain/search/embedding.js';
import { permissionOf, type AclStores, type Actor } from '../acl/permission-service.js';
import { searchVectors } from './vector-search.js';

/**
 * 의미 검색 (`FR-ARCH-001` AC-4 · `SEC-ARCH-002` AC-2 · AC-3).
 *
 * **신규 작성물이다.** 1.0 의 semantic 경로는 동작한 적이 없어(`R21-a`)
 * 옮겨 올 구현이 없다. 무엇을 색인하고 어떻게 자를지는 이 계층이 정하며,
 * 벡터 인덱스 경계는 그것을 불투명한 문자열로만 받는다.
 */

export interface SemanticStores extends AclStores {
  vectors: VectorIndex;
  docsRoot: string;
}

export interface SemanticHit {
  readonly nodeId: NodeId;
  readonly workspaceId: string;
  readonly chunk: string;
  readonly score: number;
}

/**
 * 노드 하나를 색인한다.
 *
 * 다시 부르면 이전 엔트리를 걷고 새로 넣는다 — 걷지 않으면 고친 문서의
 * 옛 조각이 남아, 지운 문장이 검색으로 계속 나온다.
 */
export async function indexNode(stores: SemanticStores, nodeId: NodeId): Promise<void> {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined || node.orphanedAt !== null) return;

  stores.vectors.removeNode(nodeId);

  const at = join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(nodeId));
  const body = await readFile(at, 'utf8').catch(() => undefined);
  if (body === undefined) return;

  for (const piece of chunk(body)) {
    stores.vectors.put({ nodeId, workspaceId: node.workspaceId, chunk: piece });
  }
}

/**
 * 질의에 가까운 조각을 돌려준다.
 *
 * **거르기가 점수 매기기보다 앞이다** (`SEC-ARCH-002` AC-2 · AC-3). 뒤에
 * 두면 볼 수 없는 조각이 잠시라도 후보 목록에 실리고, 그 목록을 손에 쥔
 * 코드가 로그 한 줄만 남겨도 본문이 밖으로 나간다. 노드 ID 만 거르고 조각을
 * 그대로 두는 것도 같은 이유로 안 된다 — 결과 목록에서는 사라졌는데 발췌에는
 * 남는 상태가 된다.
 */
export async function semanticSearch(
  stores: SemanticStores,
  actor: Actor,
  input: { query: string; limit?: number },
): Promise<SemanticHit[]> {
  const wanted = embed(input.query);
  if (wanted.size === 0) return [];

  const limit = Math.min(Math.max(input.limit ?? 5, 1), 100);
  const hits: SemanticHit[] = [];

  for (const entry of visibleEntries(stores, actor)) {
    const score = similarity(wanted, embed(entry.chunk));
    if (score <= 0) continue;
    hits.push({ nodeId: entry.nodeId, workspaceId: entry.workspaceId, chunk: entry.chunk, score });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * 호출자가 볼 수 있는 엔트리만.
 *
 * 두 방어가 함께 걸린다. 없는 노드의 조각을 빼는 것은 `searchVectors` 가
 * 소유하고(`SEC-STORAGE-007` AC-4), 살아 있지만 볼 수 없는 문서를 빼는 것이
 * 이 함수의 몫이다(`SEC-ARCH-002` AC-2). 다른 두 축이라 한 자리에 합치면
 * 한쪽을 고칠 때 다른 쪽이 조용히 함께 바뀐다.
 */
function* visibleEntries(stores: SemanticStores, actor: Actor): Generator<VectorEntry> {
  const decided = new Map<string, boolean>();

  for (const workspace of stores.workspaces.list()) {
    const nodeIds = stores.nodes.allIn(workspace.id).map((one) => one.id);

    // **존재 확인은 여기서 하지 않는다.** 없는 노드의 엔트리를 빼는 것은
    // `searchVectors` 가 소유한 둘째 방어이며(`SEC-STORAGE-007` AC-4),
    // 여기서 다시 세우면 같은 책임이 두 곳에 생겨 한쪽만 고쳐진다.
    for (const entry of searchVectors(stores, actor, { nodeIds })) {
      let allowed = decided.get(entry.nodeId);
      if (allowed === undefined) {
        const level = permissionOf(stores, actor, entry.nodeId);
        allowed = level !== null && permits(level, 'view');
        decided.set(entry.nodeId, allowed);
      }
      if (allowed) yield entry;
    }
  }
}
