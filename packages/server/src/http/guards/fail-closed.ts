import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import { isServable } from '../../domain/serving/servable.js';

/**
 * fail-closed 서빙 가드 (`SEC-STORAGE-006` · `R55-b`).
 *
 * 권한 판정은 전부 DB 의 노드 레코드 위에서 이뤄진다. 레코드가 없는 경로를
 * 만나면 **판정할 근거가 없고**, 그 상태를 「무제한 허용」으로 읽을 여지를
 * 여기서 닫는다.
 *
 * **레코드 부재를 허용으로 해석하는 분기를 만들지 않는다** (`AC-2`) —
 * 이 함수는 통과 조건을 모두 만족했을 때만 노드를 돌려주고, 그 밖의
 * 모든 경우에 `undefined` 를 돌려준다.
 *
 * 관문 셋(점 이름·아카이브·tombstone)의 판정은 `isServable` 이 소유한다 —
 * 여기서 다시 쓰면 ACL 경로가 쓰는 판정과 갈리고, 갈리면 한쪽으로만
 * 새어 나간다.
 */
export function resolveServableNode(
  nodes: NodeRepository,
  workspaceId: string,
  relativePath: string,
): NodeRecord | undefined {
  const segments = relativePath.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) {
    return undefined;
  }

  // 경로로 조회하는 메서드를 두지 않았으므로(`DR-STORAGE-003` — 경로는
  // 파생일 뿐이다) 워크스페이스의 노드에서 파생 경로가 일치하는 것을 찾는다.
  const wanted = segments.join('/');
  const node = nodes
    .allIn(workspaceId)
    .find((candidate) => candidate.kind === 'file' && nodes.pathOf(candidate.id) === wanted);

  if (node === undefined) {
    return undefined;
  }

  return isServable(nodes.chainOf(node.id)) ? node : undefined;
}
