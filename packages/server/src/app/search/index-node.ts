import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { chunk } from '../../domain/search/embedding.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { SemanticStores } from './semantic-search.js';

/**
 * 벡터 인덱스를 세우는 자리 (`FR-ARCH-001` AC-4 · `MIG-AUTH-001` AC-5).
 *
 * **검색과 나눠 둔다.** 둘은 같은 벡터 공간을 쓰지만 다른 책임이고, 무엇보다
 * `CON-SHELL-002` AC-3 이 한정하는 것은 「의미 검색 **도구**」다 — 색인은
 * 도구가 아니다. 한 모듈에 있으면 색인을 세우는 자리가 검색 표면을 하나 더
 * 여는 것으로 읽혀(`test/arch/ai-boundary.test.ts`), 1.0 이행이 벡터 인덱스를
 * 다시 세우는 것이 그 경계 위반으로 잡힌다.
 *
 * 저장소 타입은 옮기지 않고 `semantic-search.ts` 에서 **타입으로만** 들인다 —
 * 같은 벡터 공간을 가리키는 이름이 둘이 되면 한쪽만 바뀐다.
 */
export async function indexNode(stores: SemanticStores, nodeId: NodeId): Promise<void> {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined || node.orphanedAt !== null) return;

  // 다시 부르면 이전 엔트리를 걷고 새로 넣는다 — 걷지 않으면 고친 문서의
  // 옛 조각이 남아, 지운 문장이 검색으로 계속 나온다.
  stores.vectors.removeNode(nodeId);

  const at = join(stores.docsRoot, node.workspaceId, stores.nodes.pathOf(nodeId));
  const body = await readFile(at, 'utf8').catch(() => undefined);
  if (body === undefined) return;

  for (const piece of chunk(body)) {
    stores.vectors.put({ nodeId, workspaceId: node.workspaceId, chunk: piece });
  }
}
