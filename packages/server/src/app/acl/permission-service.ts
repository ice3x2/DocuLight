import { effectivePermission, type Ancestry, type Requester } from '../../domain/acl/effective-permission.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import { passThroughIds, visibilityOf, type Visibility } from '../../domain/acl/visibility.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { AuditSink } from '../../domain/ports/audit-sink.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { isSuperuser, subjectIdsOf } from '../../domain/principal/subject.js';

/** 판정에 필요한 저장소 묶음. */
export interface AclStores {
  nodes: NodeRepository;
  acl: AclRepository;
  principals: PrincipalRepository;
  /**
   * 부여·회수가 남기는 자리 (`SEC-ACL-010` AC-3).
   *
   * 선택으로 두지 않는 이유는 전파를 막지 않는 대신 **추적으로 감당하겠다**는
   * 것이 이 모델의 거래이기 때문이다 — 기록이 빠지면 그 거래의 한쪽만 남는다.
   */
  audit: AuditSink;
}

/**
 * 요청을 일으킨 주체.
 *
 * `id` 와 `requester` 를 함께 갖는 이유는 둘의 쓰임이 다르기 때문이다 —
 * `requester` 는 판정의 입력이고, `id` 는 부여자·생성자로 **기록**되는 값이다
 * (`SEC-ACL-009` AC-6). 주체 집합에서 자기 ID 를 되짚게 하면 그 규칙이
 * 「배열의 첫 원소」 같은 암묵 약속 위에 서게 된다.
 */
export interface Actor {
  readonly id: PrincipalId;
  readonly requester: Requester;
}

/**
 * 한 사용자로부터 actor 를 세운다. **요청마다 다시 세운다** —
 * 그것이 그룹 멤버 변경이 다음 요청부터 반영되는 방식이고
 * (`CON-ACL-001` AC-2), 그래서 무효화할 캐시가 없다(AC-3).
 */
export function actorFor(principals: PrincipalRepository, userId: PrincipalId): Actor {
  const account = principals.findById(userId);

  // 계정 상태는 **주체 레벨 게이트**다 (`CON-ACL-002` AC-4). ACL 거부
  // 항목으로 표현하지 않는 이유는 그것이 합집합 모델을 깨기 때문이고,
  // 여기서 닫는 이유는 그래야 그 계정의 ACL 항목이 **그대로 남는다**는
  // 사실과 「지금은 못 들어온다」가 함께 성립하기 때문이다.
  //
  // 슈퍼유저 우회보다 앞선다 — 뒤에 두면 정지된 슈퍼유저가 전 워크스페이스를
  // 그대로 연다.
  if (account === undefined || account.status !== 'active') {
    return { id: userId, requester: { subjectIds: [], superuser: false } };
  }

  const groups = principals.groupsOf(userId);
  return {
    id: userId,
    requester: { subjectIds: subjectIdsOf(userId, groups), superuser: isSuperuser(groups) },
  };
}

/**
 * 대상의 상속 사슬. 노드가 아니면 워크스페이스로 본다.
 *
 * 워크스페이스인지 되묻지 않는 이유는 질의 예산 때문이다 — 되물으면 판정
 * 하나가 3회를 쓴다. 없는 ID 를 넘겨도 해가 없다: 걸리는 항목이 없어
 * `null` 이 나오고, 존재 확인은 `resolveNode` 의 몫이다.
 */
function ancestryOf(nodes: NodeRepository, id: string): Ancestry {
  const chain = nodes.chainOf(id);
  if (chain.length === 0) return { links: [], workspaceId: id };

  return {
    links: chain.map((node) => ({ id: node.id, inheritsAcl: node.inheritsAcl })),
    workspaceId: chain[0]!.workspaceId,
  };
}

/**
 * 유효 권한. 없으면 `null`.
 *
 * **질의 두 번**이다 (`CON-ACL-001` AC-4) — 사슬 하나와 항목 하나. 저장하지
 * 않으므로 무효화할 캐시가 없다(AC-3).
 */
export function permissionOf(
  stores: AclStores,
  actor: Actor,
  nodeId: string,
): PermissionLevel | null {
  const ancestry = ancestryOf(stores.nodes, nodeId);
  const scope = [...ancestry.links.map((l) => l.id), ancestry.workspaceId];
  const entries = stores.acl.entriesFor(scope, actor.requester.subjectIds);

  return effectivePermission(ancestry, entries, actor.requester);
}

/**
 * 요청자에게 **보이는** 노드. 안 보이면 `undefined` (`SEC-ACL-006`).
 *
 * 권한이 없어서 못 보는 것과 애초에 없는 것이 **같은 값**으로 돌아온다.
 * 사유를 실을 자리가 없으므로 403 을 만들 근거도, 권한 요청 버튼을 그릴
 * 근거(`SEC-ACL-016`)도 위쪽으로 새지 않는다.
 *
 * 판정 결과로 조기 반환하지 않는다 (AC-4) — 두 경우가 같은 마지막 한 줄을
 * 지난다.
 */
export function resolveNode(
  stores: AclStores,
  actor: Actor,
  nodeId: NodeId,
): NodeRecord | undefined {
  const node = stores.nodes.findById(nodeId);
  const visible = node !== undefined && permissionOf(stores, actor, nodeId) !== null;

  return visible ? node : undefined;
}

/** 트리 한 층. 숨긴 것은 아예 빠지고 경로상의 조상은 이름만 남는다. */
export interface VisibleChild {
  node: NodeRecord;
  visibility: Exclude<Visibility, 'hidden'>;
}

/**
 * 요청자에게 보이는 자식들 (`SEC-ACL-004` · `SEC-ACL-005`).
 *
 * 숨긴 노드는 목록에서 **빠진다** — 잠금 아이콘도, 비활성 항목도, 개수도
 * 남기지 않는다(`SEC-ACL-004` AC-2). 그래서 반환 타입에 `hidden` 이 없다.
 *
 * pass-through 여부는 저장된 값이 아니라 매번 계산한 것이다
 * (`CON-ACL-004` AC-1) — 자손의 부여가 늘거나 줄면 정리 작업 없이 다음
 * 호출에서 곧바로 달라진다(AC-2 · AC-4).
 */
export function visibleChildrenOf(
  stores: AclStores,
  actor: Actor,
  where: { workspaceId: string; parentId: NodeId | null },
): VisibleChild[] {
  const through = passThroughIds(
    stores.acl.grantedNodeIds(actor.requester.subjectIds),
    (id) => stores.nodes.chainOf(id).slice(1).map((n) => n.id),
  );

  const visible: VisibleChild[] = [];
  for (const node of stores.nodes.children(where)) {
    const visibility = visibilityOf({
      kind: node.kind,
      effective: permissionOf(stores, actor, node.id),
      isPassThrough: through.has(node.id),
    });
    if (visibility !== 'hidden') visible.push({ node, visibility });
  }
  return visible;
}
