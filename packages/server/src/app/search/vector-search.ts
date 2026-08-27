import type { Actor } from '../acl/permission-service.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRepository } from '../../domain/ports/node-repository.js';
import type { VectorEntry, VectorIndex } from '../../domain/ports/vector-index.js';

/**
 * 벡터 인덱스 조회 — **존재하지 않는 노드의 엔트리를 무조건 뺀다**
 * (`SEC-STORAGE-007` AC-4 · AC-5).
 *
 * 이것이 둘째 방어다. 삭제·이동과 같은 처리 안에서 인덱스를 갱신하는 것이
 * 첫째인데, 그것만 두면 갱신이 **한 번** 실패한 순간부터 유출이 열린다.
 * 그래서 조회 시점에 대상 노드의 존재를 다시 확인한다 — 인덱스가 무엇을
 * 들고 있든 노드가 없으면 결과에 서지 않는다.
 *
 * **권한 필터는 이 자리가 아니다.** 볼 수 없는 노드를 거르는 것은 `R80`
 * 계열이 소유하며 그 필터도 함께 걸려야 한다 — 여기서 거르는 것은
 * 「없는 것」이고 그쪽이 거르는 것은 「보면 안 되는 것」이다. 둘을 한
 * 자리에 합치면 한쪽을 고칠 때 다른 쪽이 조용히 함께 바뀐다.
 */

export interface VectorSearchStores {
  nodes: NodeRepository;
  vectors: VectorIndex;
}

export function searchVectors(
  stores: VectorSearchStores,
  _actor: Actor,
  input: { nodeIds: readonly NodeId[] },
): VectorEntry[] {
  const found: VectorEntry[] = [];
  for (const nodeId of input.nodeIds) {
    // 노드를 먼저 본다. 엔트리를 읽어 온 뒤에 거르면 그 사이의 코드가
    // 이미 조각을 손에 쥔 상태가 되고, 그 자리에 로그 한 줄만 생겨도
    // 삭제된 본문이 밖으로 나간다.
    if (stores.nodes.findById(nodeId) === undefined) continue;
    found.push(...stores.vectors.entriesOf(nodeId));
  }
  return found;
}
