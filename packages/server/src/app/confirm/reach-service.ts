import { visibleChildrenOf, type AclStores, type Actor } from '../acl/permission-service.js';

/**
 * 이 컨테이너에 준 부여가 **상속으로 실제 도달하는** 하위 노드 수
 * (`FR-CONFIRM-012`).
 *
 * 세는 것이 무엇인지가 이 함수의 전부다.
 *
 * **요청자에게 보이는 것만 센다** (AC-4). 도달 집합이 요청자 가시 집합의
 * 부분집합이므로 이 수치는 존재 오라클이 아니다 — 보이지 않는 노드를
 * 세면 그 차이가 곧 숨은 노드의 개수가 된다.
 *
 * **상속이 끊긴 가지는 통째로 빠진다** (AC-3). 끊은 노드 자신에게도 이
 * 부여는 닿지 않고, 그 아래는 더더욱 닿지 않는다. 끊긴 노드만 빼고 그
 * 아래를 세면 실행자가 실제보다 넓은 영향을 보고 판단한다.
 *
 * **수 하나만 돌려준다** (`SEC-CONFIRM-003`). 분모나 미도달 건수를 실을
 * 자리를 두지 않으므로 「24 / 30」도 「적용되지 않는 항목 N개」도 만들
 * 수 없다 — 그 차액이 곧 보이지 않는 서브트리의 크기다.
 */
export function reachedDescendants(stores: AclStores, actor: Actor, containerId: string): number {
  const workspaceId = stores.nodes.findById(containerId)?.workspaceId ?? containerId;

  const below = (parentId: string | null): number =>
    visibleChildrenOf(stores, actor, { workspaceId, parentId }).reduce((count, child) => {
      // 이 노드가 상속을 끊었으면 여기서 멈춘다 — 자신도 아래도 닿지 않는다.
      if (!child.node.inheritsAcl) return count;
      return count + 1 + (child.node.kind === 'directory' ? below(child.node.id) : 0);
    }, 0);

  const target = stores.nodes.findById(containerId);
  if (target === undefined) return below(null);
  return target.kind === 'directory' ? below(containerId) : 0;
}
