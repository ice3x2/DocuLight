import { effectivePermission, type Ancestry } from '../../domain/acl/effective-permission.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { isServable } from '../../domain/serving/servable.js';
import { chainIndex, pathIndex } from '../node/node-paths.js';
import { managedWorkspacesOf } from './admin-scope.js';
import { actorFor, type AclStores, type Actor } from './permission-service.js';

/**
 * 시뮬레이션 결과의 한 줄.
 *
 * **못 보는 노드도 줄을 갖는다.** 빼 버리면 「왜 못 보는가」의 답이 목록의
 * *부재*가 되어, 그 노드가 존재하지 않는 경우와 구별되지 않는다 — 이 화면이
 * 존재하는 이유가 바로 그 물음이므로 그렇게 두면 화면이 자기 목적을 잃는다.
 */
export interface SimulatedNode {
  readonly nodeId: NodeId;
  readonly workspaceId: string;
  readonly workspaceName: string;
  /** 워크스페이스 루트 기준 경로. */
  readonly path: string;
  /** 그 주체의 유효 권한. 못 보면 `null` (`FR-ACL-004` AC-6). */
  readonly level: PermissionLevel | null;
  /** 어디서 왔나 (AC-5). 못 보면 `null`. */
  readonly source: 'direct' | 'inherited' | null;
}

export interface Simulation {
  readonly subjectId: PrincipalId;
  readonly nodes: readonly SimulatedNode[];
}

/**
 * *"왜 저 사람이 저 문서를 못 보는가"* 를 답한다 (`FR-ACL-004`).
 *
 * 완전 숨김 아래에서는 관리자도 자기 권한 밖 노드를 트리에서 볼 수 없다.
 * 이 화면은 **상방 게이트를 실제로 행사**해야만 성립한다 — 요청자의 ACL
 * 항목으로 결과를 거르면 정확히 필요한 자리에서 목록이 비어 버린다.
 *
 * 저장하지 않는다 (AC-3). 조회 시점의 항목으로 매번 계산하므로 갱신할
 * 색인도 무효화할 캐시도 없다.
 *
 * 관리 레벨이 없으면 `null` — 이 화면은 관리 전용이다.
 */
export function simulate(
  stores: AclStores,
  actor: Actor,
  subjectId: PrincipalId,
): Simulation | null {
  const managed = managedWorkspacesOf(stores, actor);
  if (managed.length === 0) return null;

  // 대상 주체의 판정 입력을 **요청마다 다시 세운다.** 저장된 스냅샷을 쓰면
  // 그룹 멤버 변경이나 계정 정지가 이 화면에만 늦게 반영된다 — 그리고
  // 계정 게이트가 항목보다 앞선다는 사실도 여기서 함께 따라온다.
  const subject = actorFor(stores.principals, subjectId).requester;

  const nodes: SimulatedNode[] = [];
  for (const workspace of managed) {
    const all = stores.nodes.allIn(workspace.id);
    const pathOf = pathIndex(all);
    const chainOf = chainIndex(all);
    const entries = stores.acl.entriesOnAny([workspace.id, ...all.map((node) => node.id)]);
    const onNode = new Set(
      entries
        .filter((entry) => subject.subjectIds.includes(entry.principalId))
        .map((entry) => entry.nodeId),
    );

    for (const node of all) {
      // 관문이 앞선다 — 휴지통·아카이브·점 이름 아래의 노드는 진단
      // 화면에도 세우지 않는다. 세우면 그 자리가 존재를 드러내는 두 번째
      // 표면이 된다.
      const chain = chainOf(node.id);
      if (!isServable(chain)) continue;

      const ancestry: Ancestry = {
        links: chain.map((step) => ({ id: step.id, inheritsAcl: step.inheritsAcl })),
        workspaceId: workspace.id,
      };
      const path = pathOf(node.id);
      if (path === null) continue;

      const level = effectivePermission(ancestry, entries, subject);
      nodes.push({
        nodeId: node.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        path,
        level,
        source: sourceOf(level, onNode.has(node.id)),
      });
    }
  }

  return { subjectId, nodes };
}

/**
 * 직접 부여인가 상속인가 (AC-5).
 *
 * 그 노드에 자기 앞 항목이 **있으면** 직접이다. 상속으로도 함께 닿는
 * 경우가 있지만 그때도 직접이 답이다 — 사람이 이 칸을 보는 이유는
 * 「여기서 걷으면 되는가」를 묻기 위해서이고, 그 답은 항목의 존재가 정한다.
 */
const sourceOf = (
  level: PermissionLevel | null,
  hasOwnEntry: boolean,
): 'direct' | 'inherited' | null => {
  if (level === null) return null;
  return hasOwnEntry ? 'direct' : 'inherited';
};
