import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRecord } from '../../domain/ports/node-repository.js';

/**
 * 이미 읽어 둔 노드들로 조상 사슬을 엮는 자리.
 *
 * `chainOf` 를 노드마다 부르면 그것이 사슬을 **다시 질의**해 목록 크기만큼
 * 질의가 붙는다 — 그것이 `CON-ACL-001` AC-4 의 예산을 깨는 가장 흔한
 * 경로다. 목록 화면은 이미 그 노드들을 손에 들고 있으므로 메모리에서 엮는다.
 *
 * 집합 밖으로 나가면 거기서 **멈춘다.** 없는 조상을 있다고 가정하는 것보다
 * 짧은 사슬로 좁게 판정하는 편이 안전하다.
 */
export function chainIndex(nodes: readonly NodeRecord[]): (id: NodeId) => NodeRecord[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (id) => {
    const chain: NodeRecord[] = [];
    const seen = new Set<string>();
    for (let cursor: NodeId | null = id; cursor !== null; ) {
      const node = byId.get(cursor);
      if (node === undefined || seen.has(cursor)) break;
      seen.add(cursor);
      chain.push(node);
      cursor = node.parentId;
    }
    return chain;
  };
}

/**
 * 같은 노드들로 경로를 엮는 자리.
 *
 * 규칙은 `pathOf` 와 같다 — 루트부터 이름을 이어 붙인다. 워크스페이스
 * 이름은 들어가지 않는다: 워크스페이스는 트리 노드가 아니라 상속 사슬의
 * 루트이고, 이름을 경로에 섞으면 같은 이름의 최상위 디렉토리와 구별되지
 * 않는다.
 *
 * 사슬이 루트까지 닿지 못하면 `null` 이다 — 반쪽 경로를 돌려주면 화면이
 * 그것을 진짜 경로로 읽는다.
 */
export function pathIndex(nodes: readonly NodeRecord[]): (id: NodeId) => string | null {
  const chainOf = chainIndex(nodes);

  return (id) => {
    const chain = chainOf(id);
    if (chain.length === 0) return null;
    // 마지막 칸의 부모가 남아 있으면 집합 밖에서 끊긴 것이다.
    if (chain[chain.length - 1]!.parentId !== null) return null;
    return chain
      .map((node) => node.name)
      .reverse()
      .join('/');
  };
}
