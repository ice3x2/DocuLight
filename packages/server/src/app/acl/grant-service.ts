import { canBreakInheritance, canGrant, canRevoke, type GrantRule } from '../../domain/acl/grant-policy.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { permissionOf, type AclStores, type Actor } from './permission-service.js';

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

  const ancestors = [...chain.slice(1).map((n) => n.id), chain[0]!.workspaceId];
  for (const entry of stores.acl.entriesOnAny(ancestors)) {
    // 관리는 워크스페이스에만 산다 (`SEC-WORKSPACE-002`) — 내려 붙이면
    // 문서에 관리 항목이 생긴다. 편집으로 낮춰 옮긴다.
    stores.acl.grant({
      nodeId,
      principalId: entry.principalId,
      level: entry.level === 'admin' ? 'edit' : entry.level,
      grantedBy: actor.id,
    });
  }
  return { ok: true };
}
