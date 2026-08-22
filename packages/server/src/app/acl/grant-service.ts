import { canBreakInheritance, canGrant, canRevoke, type GrantRule } from '../../domain/acl/grant-policy.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import {
  ancestryOf,
  inheritedSources,
  permissionOf,
  type AclStores,
  type Actor,
} from './permission-service.js';

/**
 * 감사 로그의 조작 이름. 하위체계를 `operation` 에 밀어 넣지 않는 규칙
 * (`R139-b`) 아래에서 ACL 축의 이름을 여기 한 자리에 둔다.
 */
export const ACL_GRANT = 'acl.grant';
export const ACL_REVOKE = 'acl.revoke';

export type GrantFailure = GrantRule | 'unknown-target' | 'unknown-entry';

export type GrantOutcome = { ok: true; entryId: string } | { ok: false; rule: GrantFailure };
export type PlainOutcome = { ok: true } | { ok: false; rule: GrantFailure };

/**
 * 대상이 워크스페이스 노드인가.
 *
 * 노드 테이블에 없으면 워크스페이스다 — 두 계층이 서로 다른 테이블에
 * 살기 때문에 이 판정에 별도 표식이 필요 없다.
 */
function targetIsWorkspace(stores: AclStores, nodeId: string): boolean {
  return stores.nodes.findById(nodeId) === undefined;
}

/**
 * 넓히기 (`SEC-ACL-009` · `SEC-WORKSPACE-003`).
 *
 * 실행자의 레벨은 **그 노드에서** 잰다. 그래서 워크스페이스에 관리를 가진
 * 주체는 그 워크스페이스의 세 계층 어디서나 부여할 수 있고
 * (`SEC-WORKSPACE-003` AC-1 · AC-4), 다른 워크스페이스에서는 레벨이
 * `null` 이라 거부된다(AC-3) — 경계를 따로 검사하지 않아도 판정이 그것을
 * 이미 담고 있다.
 */
export function grantPermission(
  stores: AclStores,
  actor: Actor,
  grant: { nodeId: string; principalId: PrincipalId; level: PermissionLevel },
): GrantOutcome {
  const decision = canGrant({
    actorLevel: permissionOf(stores, actor, grant.nodeId),
    requestedLevel: grant.level,
    targetIsWorkspace: targetIsWorkspace(stores, grant.nodeId),
  });
  if (!decision.allowed) return { ok: false, rule: decision.rule };

  const entry = stores.acl.grant({ ...grant, grantedBy: actor.id });

  // 전파를 막지 않는 대신 추적한다 (`SEC-ACL-010` AC-3). 편집자가 준 편집을
  // 받은 주체가 다시 부여해도 그 행이 **자기 이름으로** 남는다 — 부여자를
  // 항목과 감사 양쪽에 적는 이유는 항목이 회수되면 사라지기 때문이다.
  stores.audit.append({
    operation: ACL_GRANT,
    actor: actor.id,
    nodeId: grant.nodeId,
    subjectId: grant.principalId,
    level: grant.level,
  });

  return { ok: true, entryId: entry.id };
}

/** 회수 (`SEC-ACL-009` AC-5). */
export function revokePermission(
  stores: AclStores,
  actor: Actor,
  entryId: string,
): PlainOutcome {
  // 회수 대상 항목을 먼저 찾는다 — 어느 노드의 것인지 알아야 실행자의
  // 레벨을 그 노드에서 잴 수 있다.
  const entry = stores.acl.findEntry(entryId);
  if (entry === undefined) return { ok: false, rule: 'unknown-entry' };

  const decision = canRevoke({
    actorId: actor.id,
    actorLevel: permissionOf(stores, actor, entry.nodeId),
    entry,
  });
  if (!decision.allowed) return { ok: false, rule: decision.rule };

  stores.acl.revoke(entryId);
  stores.audit.append({
    operation: ACL_REVOKE,
    actor: actor.id,
    nodeId: entry.nodeId,
    subjectId: entry.principalId,
    level: entry.level,
  });
  return { ok: true };
}

/**
 * 좁히기 — 상속을 끊는다 (`SEC-ACL-009` AC-4).
 *
 * 부모의 항목을 **복사하지 않는다** (`SEC-ACL-003` AC-5). 복사가 필요하면
 * `inheritFromParent` 를 따로 부른다(AC-6) — 한 버튼 뒤에 두 조작을 숨기면
 * 「좁혔다고 착각하는」 상황이 되살아난다.
 */
export function breakInheritance(stores: AclStores, actor: Actor, nodeId: NodeId): PlainOutcome {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined) return { ok: false, rule: 'unknown-target' };

  const decision = canBreakInheritance(permissionOf(stores, actor, nodeId));
  if (!decision.allowed) return { ok: false, rule: decision.rule };

  stores.nodes.setInheritance(nodeId, false);
  return { ok: true };
}

/**
 * 상속으로 되돌린다 (`FR-ACL-005` AC-2 · AC-3).
 *
 * 끊기와 **같은 문턱**이다 — 상속 플래그를 만지는 두 방향이 한 자리에
 * 있어야 한쪽만 조용히 열리는 일이 없다. 되돌리기는 조상의 항목을 다시
 * 닿게 하므로 넓히기이고, 그래서 좁히기와 같은 관리 레벨을 요구한다.
 *
 * **부모 항목을 복사해 오지 않는다.** 그것은 `inheritFromParent` 라는 다른
 * 조작이다 — 한 버튼 뒤에 둘을 묶으면 되돌린 뒤 부모에서 회수해도 사본이
 * 남아 권한이 조용히 유지된다.
 */
export function restoreInheritance(stores: AclStores, actor: Actor, nodeId: NodeId): PlainOutcome {
  const node = stores.nodes.findById(nodeId);
  if (node === undefined) return { ok: false, rule: 'unknown-target' };

  const decision = canBreakInheritance(permissionOf(stores, actor, nodeId));
  if (!decision.allowed) return { ok: false, rule: decision.rule };

  stores.nodes.setInheritance(nodeId, true);
  return { ok: true };
}

/**
 * 부모 권한 가져오기 — 상속 끊기와 **별개 조작**이다 (`SEC-ACL-003` AC-6).
 *
 * 끊긴 노드가 조상에게서 받던 것을 자기 항목으로 굳힌다. 넓히기이므로
 * 좁히기와 같은 관리 레벨을 요구한다 — 이 조작이 만드는 항목의 범위가
 * 조상 전체이기 때문이다.
 */
export function inheritFromParent(
  stores: AclStores,
  actor: Actor,
  nodeId: NodeId,
): PlainOutcome {
  const chain = stores.nodes.chainOf(nodeId);
  if (chain.length === 0) return { ok: false, rule: 'unknown-target' };

  const decision = canBreakInheritance(permissionOf(stores, actor, nodeId));
  if (!decision.allowed) return { ok: false, rule: decision.rule };

  // 조상 목록을 손으로 조립하지 않는다 — 「자기 포함」과 「워크스페이스
  // 포함」 두 축이 자리마다 갈리면 권한이 조용히 달라진다.
  const ancestry = ancestryOf(stores, nodeId);
  if (ancestry === undefined) return { ok: false, rule: 'unknown-target' };

  for (const entry of stores.acl.entriesOnAny(inheritedSources(ancestry))) {
    // 관리는 워크스페이스에만 산다 (`SEC-WORKSPACE-002`) — 내려 붙이면
    // 문서에 관리 항목이 생긴다. 편집으로 낮춰 옮긴다.
    const level = entry.level === 'admin' ? 'edit' : entry.level;
    stores.acl.grant({ nodeId, principalId: entry.principalId, level, grantedBy: actor.id });

    // 이것도 부여다 (`SEC-ACL-010` AC-3). 한 번의 조작이 여러 항목을
    // 만든다고 해서 기록이 면제되지 않는다 — 오히려 그래서 되짚을 근거가
    // 더 필요하다. 주체와 레벨을 함께 적지 않으면 여기 남는 여러 행이
    // 서로 구별되지 않아, 같은 행이 여러 번 찍힌 것과 다르지 않게 된다.
    stores.audit.append({
      operation: ACL_GRANT,
      actor: actor.id,
      nodeId,
      subjectId: entry.principalId,
      level,
    });
  }
  return { ok: true };
}
