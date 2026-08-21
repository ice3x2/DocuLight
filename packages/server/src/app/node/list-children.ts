import { isHiddenName } from '../../domain/naming/hidden-name-rule.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';

/**
 * 트리에 **보이는** 자식들 (`SEC-STORAGE-004` AC-1).
 *
 * 점으로 시작하는 항목만 빠진다. md 아닌 파일도 트리에 보이는 것이
 * 원칙이므로(`R47`) 확장자로 거르지 않는다.
 *
 * 저장소가 아니라 여기서 거르는 이유 — 이름 충돌 판정은 **보이지 않는
 * 항목과도** 겹치면 안 된다(`R113`). 저장소가 걸러 주면 숨은 이름과
 * 겹치는 요청이 통과해, 흐름 차이가 그 항목의 존재를 알려주게 된다.
 */
export function listChildren(
  nodes: NodeRepository,
  where: { workspaceId: string; parentId: NodeId | null },
): NodeRecord[] {
  return nodes
    .children(where)
    // 휴지통에 들어간 노드는 트리에 없다 (`FR-STORAGE-005`). 노드 행은
    // 남아 있으므로 여기서 걸러 주지 않으면 지운 항목이 목록에 뜬다.
    //
    // 충돌 판정이 이 함수를 쓰지 않는 것이 여기서도 중요하다 — 휴지통에
    // 든 이름은 그 자리를 비웠으므로 새 노드가 같은 이름을 써도 된다.
    .filter((node) => node.trashedAt === null && !isHiddenName(node.name));
}
