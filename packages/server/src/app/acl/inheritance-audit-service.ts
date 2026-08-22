import type { NodeId } from '../../domain/node/node-id.js';
import { isServable } from '../../domain/serving/servable.js';
import { chainIndex, pathIndex } from '../node/node-paths.js';
import { accessorsOf } from './accessor-service.js';
import { managedWorkspacesOf } from './admin-scope.js';
import type { AclStores, Actor } from './permission-service.js';

/** 상속이 끊긴 노드 한 줄 (`FR-ACL-005`). */
export interface BrokenInheritanceRow {
  readonly nodeId: NodeId;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly path: string;
  /**
   * **`ACL 접근자`** 수 — 상방 게이트를 뺀 값이다 (AC-4).
   *
   * `접근 가능` 을 쓰면 이 목록이 쓸모를 잃는다: 슈퍼유저와 워크스페이스
   * 관리자가 어느 노드에나 닿으므로 그 수치는 결코 0 이 되지 않고, 그러면
   * 「권한으로 닿는 사람이 아무도 없는 노드」를 이 목록에서 찾을 수 없다.
   */
  readonly aclAccessors: number;
}

export interface BrokenInheritance {
  readonly rows: readonly BrokenInheritanceRow[];
}

/**
 * 상속이 끊긴 노드를 모아 본다 (`FR-ACL-005` AC-1).
 *
 * 끊긴 노드가 쌓이면 상위 디렉토리에 부여해도 **어디까지 내려가는지 아무도
 * 예측할 수 없게 된다.** 이 목록이 그 누적을 관측하는 유일한 수단이다.
 *
 * 요청자의 ACL 항목으로 거르지 않는다 (AC-6) — 상속이 끊긴 노드는 정의상
 * 관리자 자신의 항목으로도 안 보일 수 있고, 그렇게 거르면 이 목록이 정확히
 * 필요한 자리에서 비어 버린다. 대신 관리 범위로 자른다.
 *
 * 관리 레벨이 없으면 `null` (AC-7).
 */
export function brokenInheritanceOf(stores: AclStores, actor: Actor): BrokenInheritance | null {
  const managed = managedWorkspacesOf(stores, actor);
  if (managed.length === 0) return null;

  const rows: BrokenInheritanceRow[] = [];
  for (const workspace of managed) {
    const all = stores.nodes.allIn(workspace.id);
    const pathOf = pathIndex(all);
    const chainOf = chainIndex(all);

    for (const node of all.filter((one) => !one.inheritsAcl)) {
      // 관문이 앞선다 — 휴지통·아카이브 아래의 끊긴 노드는 되돌릴 대상이
      // 아니다. 그 자리에서 상속을 되살려도 노드가 서빙되지 않는다.
      if (!isServable(chainOf(node.id))) continue;

      const path = pathOf(node.id);
      if (path === null) continue;

      rows.push({
        nodeId: node.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        path,
        // 지표는 여기서 다시 세지 않는다 — 정본이 하나여야 이 목록과
        // 공유 모달이 같은 규칙으로 센다.
        aclAccessors: accessorsOf(stores, actor, node.id)?.metrics.viaAcl ?? 0,
      });
    }
  }

  return { rows };
}
