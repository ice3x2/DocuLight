import {
  effectivePermission,
  type AncestorLink,
  type Ancestry,
  type Requester,
} from '../../domain/acl/effective-permission.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import { passThroughIds, visibilityOf, type Visibility } from '../../domain/acl/visibility.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { AuditSink } from '../../domain/ports/audit-sink.js';
import type { NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { isSuperuser, subjectIdsOf } from '../../domain/principal/subject.js';
import { isServable } from '../../domain/serving/servable.js';
import { listChildren } from '../node/list-children.js';

/** 판정에 필요한 저장소 묶음. */
export interface AclStores {
  nodes: NodeRepository;
  acl: AclRepository;
  principals: PrincipalRepository;
  /**
   * 사슬의 루트가 실재하는지 되묻는 자리 (`ancestryOf`).
   *
   * 없으면 「사슬이 비었다 = 워크스페이스다」로 읽게 되고, 그러면 지운 노드
   * ID 가 상속 체인의 루트로 격상된다.
   */
  workspaces: WorkspaceRepository;
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
 * 대상의 상속 사슬. 노드도 워크스페이스도 아니면 `undefined`.
 *
 * **사슬이 비었다는 것만으로 워크스페이스로 단정하지 않는다.** 그렇게
 * 읽으면 지운 노드 ID 가 상속 체인의 루트로 격상되어, 그 ID 를 가리키는
 * 판정이 열린다. 실재하는 워크스페이스일 때만 그렇게 본다.
 *
 * 되묻는 질의는 **사슬이 비었을 때만** 붙는다. 노드 판정은 첫 질의에서
 * 사슬을 얻으므로 `CON-ACL-001` AC-4 의 2회 예산이 그대로 유지된다.
 */
export function ancestryOf(stores: AclStores, id: string): Ancestry | undefined {
  const chain = stores.nodes.chainOf(id);
  if (chain.length > 0) {
    return {
      links: chain.map((node) => ({ id: node.id, inheritsAcl: node.inheritsAcl })),
      workspaceId: chain[0]!.workspaceId,
    };
  }

  return stores.workspaces.findById(id) === undefined
    ? undefined
    : { links: [], workspaceId: id };
}

/**
 * 판정이 훑을 범위 — 자기 자신과 조상들, 그리고 워크스페이스.
 *
 * 아래 셋은 같은 `Ancestry` 에서 나오지만 담는 것이 다르다. 세 표현을 각각
 * 이름 붙여 한 번씩만 정의하는 이유는, 손으로 `slice(1)` 을 붙이던 자리가
 * 세 곳으로 늘면서 「자기 포함」과 「워크스페이스 포함」 두 축이 조용히
 * 갈렸기 때문이다.
 */
export function judgementScope(ancestry: Ancestry): string[] {
  return [...ancestry.links.map((link) => link.id), ancestry.workspaceId];
}

/** 물려받을 원천 — 조상들과 워크스페이스. 자기 것은 이미 자기 것이다. */
export function inheritedSources(ancestry: Ancestry): string[] {
  return [...ancestry.links.slice(1).map((link) => link.id), ancestry.workspaceId];
}

/**
 * 트리 위의 조상들만. 워크스페이스는 트리 노드가 아니므로 빠진다 —
 * pass-through 는 트리에 이름이 뜨는 노드를 가리키는 개념이다.
 */
export function treeAncestors(ancestry: Ancestry): string[] {
  return ancestry.links.slice(1).map((link) => link.id);
}

/**
 * 여러 노드를 **한꺼번에** 판정한다. 질의는 대상 수와 무관하게 두 번이다.
 *
 * 이것이 `CON-ACL-001` AC-4 의 문면이다 — 「질의 2회와 노드 수 N 에 대한
 * 메모리 순회 O(N)」. 노드마다 `permissionOf` 를 부르면 O(N) 이 메모리가
 * 아니라 **질의** 쪽으로 옮겨 붙어 그 예산이 깨진다.
 *
 * 사슬을 합집합으로 한 번에 받아 `parentId` 로 메모리에서 다시 엮는다.
 * 같은 조상을 공유하는 형제들이 그 조상을 한 번만 읽는다.
 */
export function permissionBatch(
  stores: AclStores,
  actor: Actor,
  nodeIds: readonly string[],
  workspaceId: string,
): (nodeId: string) => PermissionLevel | null {
  const chain = stores.nodes.chainsOf(nodeIds);
  const byId = new Map(chain.map((node) => [node.id, node]));

  const ancestryFor = (id: string): Ancestry => {
    const links: AncestorLink[] = [];
    const visited = new Set<string>();
    for (let cursor: string | null = id; cursor !== null; ) {
      const node: NodeRecord | undefined = byId.get(cursor);
      // 사슬 밖이면 거기서 멈춘다. 합집합에 없는 것은 이 배치가 읽지
      // 않은 것이고, 없는 조상을 있다고 가정하는 것보다 좁게 판정하는
      // 편이 안전하다.
      if (node === undefined || visited.has(cursor)) break;
      visited.add(cursor);
      links.push({ id: node.id, inheritsAcl: node.inheritsAcl });
      cursor = node.parentId;
    }
    return { links, workspaceId };
  };

  const scope = new Set<string>([workspaceId, ...chain.map((node) => node.id)]);
  const entries = stores.acl.entriesFor([...scope], actor.requester.subjectIds);

  return (nodeId) => effectivePermission(ancestryFor(nodeId), entries, actor.requester);
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
  const ancestry = ancestryOf(stores, nodeId);
  // 노드도 워크스페이스도 아닌 ID 는 판정 대상이 아니다. 슈퍼유저 우회도
  // 여기서는 열리지 않는다 — 우회는 실재하는 대상에 대한 것이다.
  if (ancestry === undefined) return null;

  const entries = stores.acl.entriesFor(judgementScope(ancestry), actor.requester.subjectIds);

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
  const chain = stores.nodes.chainOf(nodeId);

  // 관문이 권한보다 **앞선다.** 점 이름·아카이브·tombstone 은 권한 축이
  // 아니므로 관리자에게도 같은 거부가 걸린다 — 뒤에 두면 슈퍼유저에게
  // `.obsidian/workspace.json` 이 열린다.
  const visible = isServable(chain) && permissionOf(stores, actor, nodeId) !== null;

  return visible ? chain[0] : undefined;
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
  // `listChildren` 을 거친다. 저장소를 직접 부르면 점 이름 규칙
  // (`SEC-STORAGE-004` AC-1)이 이 목록에서만 빠져, ACL 은 보면서 예약
  // 네임스페이스는 못 보는 두 번째 트리가 생긴다.
  const children = listChildren(stores.nodes, where);
  const granted = stores.acl.grantedNodeIds(actor.requester.subjectIds);

  // 자식들과 부여받은 노드들의 사슬을 **한 번에** 받는다. 판정과
  // pass-through 가 같은 합집합을 쓰므로 질의가 층 크기에 비례해 늘지
  // 않는다 (`CON-ACL-001` AC-4).
  const scope = [...children.map((node) => node.id), ...granted];
  const levelOf = permissionBatch(stores, actor, scope, where.workspaceId);

  const ancestorsFromBatch = stores.nodes.chainsOf(granted);
  const byId = new Map(ancestorsFromBatch.map((node) => [node.id, node]));
  const through = passThroughIds(granted, (id) => {
    const ancestors: string[] = [];
    const seen = new Set<string>();
    for (let cursor = byId.get(id)?.parentId ?? null; cursor !== null; ) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      ancestors.push(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
    return ancestors;
  });

  const visible: VisibleChild[] = [];
  for (const node of children) {
    const visibility = visibilityOf({
      kind: node.kind,
      effective: levelOf(node.id),
      isPassThrough: through.has(node.id),
    });
    if (visibility !== 'hidden') visible.push({ node, visibility });
  }
  return visible;
}
