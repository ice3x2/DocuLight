import type { NodeKind } from '../ports/node-repository.js';
import type { PermissionLevel } from './level.js';

/**
 * 트리에서의 가시성. **셋으로 닫혀 있다.**
 *
 * 넷째 값을 두지 않는 것이 `SEC-ACL-004` AC-2 를 지키는 방법이다 — 잠금
 * 아이콘·비활성 항목·개수 표시는 전부 「숨긴 것을 대신 나타내는」 넷째 값이고,
 * 그 값이 존재하면 표시 계층이 언젠가 그것을 쓴다.
 *
 * 권한 축과 **다른 축**이다 (`CON-ACL-004` AC-3) — 「통과」를 권한 레벨로
 * 신설했다면 `permits` 로 비교되어 「통과 이상」 같은 판정이 생긴다.
 */
export type Visibility = 'full' | 'pass-through' | 'hidden';

/**
 * 한 노드의 가시성. 저장하지 않고 매번 계산한다 (`CON-ACL-004` AC-1).
 *
 * 문서는 `isPassThrough` 가 참이어도 숨긴다 — 파일이 pass-through 로 새면
 * 「이름만 보이되 못 여는 문서」가 생기고, 그것이 바로 `SEC-ACL-004` 가
 * 기각한 잠금 아이콘 방식이다.
 */
export function visibilityOf(node: {
  kind: NodeKind;
  effective: PermissionLevel | null;
  isPassThrough: boolean;
}): Visibility {
  if (node.effective !== null) return 'full';
  if (node.kind === 'directory' && node.isPassThrough) return 'pass-through';
  return 'hidden';
}

/**
 * 접근 가능한 자손을 가진 조상들 (`SEC-ACL-005` AC-1).
 *
 * 부여받은 노드의 **조상만** 모은다. 그래서 조상의 형제는 들어오지 않고
 * (AC-2), 부여받은 노드 자신도 들어오지 않는다 — 자신이 섞이면 「이름만
 * 보이는 것」과 「열 수 있는 것」이 한 집합에 뒤섞인다.
 *
 * 저장하지 않으므로 입력이 줄면 결과가 곧바로 줄고(`CON-ACL-004` AC-2),
 * 늘면 곧바로 는다(AC-4). 사이에 정리 작업이 없다.
 *
 * @param grantedNodeIds 요청자의 주체 집합이 **직접** 부여받은 노드들.
 *   상속으로 닿는 노드는 넣지 않는다 — 그것들은 조상이 이미 `full` 이므로
 *   pass-through 가 될 이유가 없다.
 */
export function passThroughIds(
  grantedNodeIds: readonly string[],
  ancestorsOf: (id: string) => readonly string[],
): Set<string> {
  const through = new Set<string>();
  for (const id of grantedNodeIds) {
    for (const ancestor of ancestorsOf(id)) through.add(ancestor);
  }
  return through;
}
