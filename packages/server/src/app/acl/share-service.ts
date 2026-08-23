import { applicableChain, effectivePermission } from '../../domain/acl/effective-permission.js';
import { permits, type PermissionLevel } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId, PrincipalKind } from '../../domain/principal/principal.js';
import { accessorsOf, servableAncestryOf, type AccessorMetrics } from './accessor-service.js';
import { judgementScope, type AclStores, type Actor } from './permission-service.js';

/**
 * 공유 모달의 한 줄 (`IR-ACL-002`).
 *
 * **상속 여부와 출처를 함께 싣는다.** 직접 항목만 보이면 관리자가 그것을
 * 실효 권한으로 오해한다 — 상속·가산 모델에서 그 노드의 실제 접근자는
 * 직접 항목과 조상 항목의 합집합이다.
 */
export interface ShareRow {
  /**
   * 회수할 항목의 ID. **상속 항목에는 없다** (AC-3).
   *
   * 없는 것이 곧 읽기 전용이라는 뜻이다 — 화면이 별도 플래그를 보고
   * 버튼을 감추면 그 플래그를 안 보는 화면이 생긴다. 여기서 지우는 것이
   * 조상을 바꾸는 것인지 이 노드에서만 빼는 것인지 모호하고, 후자는
   * 거부 규칙이라 모델이 금지한다.
   */
  readonly entryId: string | null;
  readonly principalId: PrincipalId;
  readonly principalName: string;
  readonly principalKind: PrincipalKind;
  readonly level: PermissionLevel;
  readonly inherited: boolean;
  /** 상속이면 그 항목이 부여된 조상의 경로. 직접이면 `null` (AC-2). */
  readonly source: string | null;
}

/**
 * 공유 모달이 그리는 것 전부.
 *
 * `rows` 가 `null` 인 것이 「목록을 볼 자격이 없다」다 (`SEC-ACL-015`
 * AC-1). **부분 목록이나 이니셜을 실을 칸을 두지 않는다** (AC-6) — 칸이
 * 있으면 언젠가 채워진다.
 */
export interface ShareView {
  readonly metrics: AccessorMetrics;
  readonly rows: readonly ShareRow[] | null;
  /** 요청자가 이 노드에 가진 유효 권한. 화면이 부여 폼을 열지 판정한다. */
  readonly level: PermissionLevel;
}

/**
 * 이 노드의 공유 상태. 모달을 열 자격이 없으면 `null`.
 *
 * 문턱이 `편집` 인 이유는 `R70-a` 가 넓히기를 그 레벨에 열었기 때문이다 —
 * 부여할 수 있는 사람이 부여 화면을 못 열면 그 조항이 실행 경로를 잃는다.
 * 반대로 **목록**은 `관리` 를 요구한다 (`SEC-ACL-015` AC-1). 둘을 한
 * 함수에서 판정하는 이유는 같은 계산에서 나오기 때문이고, 나누면 한쪽만
 * 문턱을 갖게 된다.
 *
 * 볼 수 없는 노드와 자격 없는 노드가 같은 `null` 이다 (`SEC-ACL-006`).
 */
export function shareView(stores: AclStores, actor: Actor, nodeId: NodeId): ShareView | null {
  const report = accessorsOf(stores, actor, nodeId);
  const ancestry = servableAncestryOf(stores, nodeId);
  if (report === null || ancestry === null) return null;

  const level = effectivePermission(ancestry, stores.acl.entriesOnAny(judgementScope(ancestry)), actor.requester);
  if (level === null) return null;

  return {
    metrics: report.metrics,
    rows: permits(level, 'admin') ? rowsOf(stores, nodeId, ancestry) : null,
    level,
  };
}

/**
 * 사슬 위의 항목을 직접·상속으로 갈라 준다.
 *
 * **상속이 끊긴 위쪽은 아예 오지 않는다** — 판정이 쓰는 `applicableChain`
 * 을 그대로 쓰므로, 화면이 보는 목록과 실제 판정이 어긋날 자리가 없다.
 * 여기서 사슬을 다시 걸으면 그 둘이 갈린다.
 *
 * 워크스페이스 계층의 `관리` 항목은 끊겨도 남는다 — 그것이 상방 게이트라
 * 실제로 닿기 때문이다 (`SEC-ACL-008` AC-3). 목록에서 빼면 그 사람이
 * 어떻게 접근하는지 관리자가 알 수 없다.
 */
function rowsOf(
  stores: AclStores,
  nodeId: NodeId,
  ancestry: ReturnType<typeof servableAncestryOf> & object,
): ShareRow[] {
  const 이름 = (id: PrincipalId) => stores.principals.findById(id);
  const 경로 = (id: string): string | null => {
    if (id === ancestry.workspaceId) return stores.workspaces.findById(id)?.name ?? null;
    const chain = stores.nodes.chainOf(id);
    return chain.length === 0
      ? null
      : chain
          .map((node) => node.name)
          .reverse()
          .join('/');
  };

  const { linkIds, workspaceReached } = applicableChain(ancestry);
  const 걸리는것 = (entry: { nodeId: string; level: PermissionLevel }): boolean =>
    linkIds.includes(entry.nodeId) ||
    (entry.nodeId === ancestry.workspaceId && (workspaceReached || entry.level === 'admin'));

  return stores.acl
    .entriesOnAny(judgementScope(ancestry))
    .filter(걸리는것)
    .flatMap((entry) => {
      const principal = 이름(entry.principalId);
      if (principal === undefined) return [];

      const inherited = entry.nodeId !== nodeId;
      return [
        {
          entryId: inherited ? null : entry.id,
          principalId: entry.principalId,
          principalName: principal.name,
          principalKind: principal.kind,
          level: entry.level,
          inherited,
          source: inherited ? 경로(entry.nodeId) : null,
        },
      ];
    });
}
