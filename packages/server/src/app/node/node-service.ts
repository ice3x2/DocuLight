import {
  requirementFor,
  satisfies,
  type Held,
} from '../../domain/acl/operation-policy.js';
import { resolveNameCollision } from '../../domain/naming/collision.js';
import { checkPathLength, joinPath, validateNodeName } from '../../domain/naming/name-validator.js';
import type { NameRule, NameViolation } from '../../domain/naming/validation-result.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NewNode, NodeRecord, NodeRepository } from '../../domain/ports/node-repository.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import {
  permissionOf,
  resolveNode,
  type AclStores,
  type Actor,
} from '../acl/permission-service.js';

/**
 * 새 이름이 들어오는 진입점들 — 생성·개명·이동·업로드
 * (`FR-WORKSPACE-004` · `FR-WORKSPACE-005`).
 *
 * 넷을 한 자리에 모은 이유는 넷이 **같은 단계**를 같은 순서로 거쳐야
 * 하기 때문이다. 파일을 나누면 나중에 한 곳에만 규칙이 추가되고 나머지는
 * 조용히 뒤처진다.
 *
 * 순서가 규칙이다 — **① 대상 확인 ② 이름 검증 ③ 자리 검증 ④ 충돌 접미사.**
 * ②와 ④는 방향이 반대다: 규칙 위반은 거부하고 이름 충돌은 거부하지 않는다.
 * 둘을 합치면 어느 한쪽이 다른 쪽의 처분을 물려받아 `R113` 이 깨지므로,
 * 검증을 통과한 이름에만 충돌 판정이 걸린다(`FR-WORKSPACE-004` AC-8).
 *
 * **거부는 던지지 않고 값으로 돌려준다** (C-13). 없는 노드·없는 워크스페이스·
 * 자기 자손으로의 이동은 전부 API 호출자가 상시 도달하는 예측 가능한
 * 분기다 — 노드 ID 는 URL 에 그대로 실리므로(`R99`) 낡은 링크가 지워진
 * 노드를 가리키는 일이 일상이다.
 */

/**
 * 요청이 거부된 이유.
 *
 * 이름 규칙(`NameRule`)에 **대상과 자리**의 사유를 더한 것이다 — 호출자가
 * 한 형태로 모든 거부를 받도록 하기 위해서다. 두 형태로 나누면 HTTP 계층이
 * 한쪽은 값으로 다른 쪽은 예외로 받게 된다.
 */
export type RejectionRule =
  | NameRule
  | 'unknown-node'
  | 'unknown-workspace'
  | 'move-into-descendant'
  | 'forbidden';

export interface Rejection {
  rule: RejectionRule;
  message: string;
  limitBytes?: number;
  actualBytes?: number;
}

/**
 * 이 진입점들이 쓰는 저장소 묶음. 넷이 같은 모양을 갖게 한다.
 *
 * `AclStores` 를 품는 이유는 조작마다 권한 판정이 걸리고(`SEC-ACL-012`)
 * 생성이 생성자에게 편집을 부여하기 때문이다(`SEC-ACL-011`). 선택 인자로
 * 두면 그것을 빠뜨린 호출이 판정 없이 통과한다.
 */
export interface NodeStores extends AclStores {
  nodes: NodeRepository;
  workspaces: WorkspaceRepository;
}

/** 아무 권한도 없는 상태. 축을 하나씩 채워 요구와 맞댄다. */
const NOTHING_HELD: Held = { parent: null, target: null, destination: null, workspace: null };

/** 만들어졌을 때의 결과. `name` 은 접미사가 붙었을 수 있는 **최종** 이름이다. */
export type Created = { ok: true; id: NodeId; name: string };

/** 자리를 옮기거나 이름을 바꿨을 때의 결과. */
export type Placed = { ok: true; name: string };

export type Rejected = { ok: false; violations: Rejection[] };

const reject = (rule: RejectionRule, message: string): Rejected => ({
  ok: false,
  violations: [{ rule, message }],
});

/**
 * 대상이 보이지 않을 때의 거절. 존재하지 않을 때와 **같은 값**이다
 * (`SEC-ACL-006` AC-1 · AC-2) — 두 사유를 가르면 그 구분이 경로 열거
 * 오라클이 된다.
 */
const unknownNode = (id: string): Rejected => reject('unknown-node', `노드 ${id} 가 없습니다.`);

/** 부모의 워크스페이스 루트 기준 상대 경로. 루트 바로 아래면 빈 문자열이다. */
function parentPathOf(nodes: NodeRepository, parentId: NodeId | null): string {
  return parentId === null ? '' : nodes.pathOf(parentId);
}

/**
 * 이름을 검사하고, 통과하면 형제와의 충돌을 접미사로 푼 뒤 만든다.
 *
 * **거부된 이름에 접미사를 붙여 대신 만들지 않는다** (`FR-WORKSPACE-004`
 * AC-8) — 붙이면 사용자가 요청하지 않은 이름이 디스크에 남는다.
 */
export function createNode(
  stores: NodeStores,
  actor: Actor,
  input: NewNode,
): Created | Rejected {
  const { nodes, workspaces, acl } = stores;

  // 사전 검사다. 없는 워크스페이스에 만들면 그 노드는 어느 권한 경계에도
  // 들지 않아 트리에서도 권한 계산에서도 사라진다(`FR-WORKSPACE-001` AC-1).
  if (workspaces.findById(input.workspaceId) === undefined) {
    return reject('unknown-workspace', `워크스페이스 ${input.workspaceId} 가 없습니다.`);
  }

  // 부모의 편집을 요구한다 (`SEC-ACL-012` AC-1 · AC-2). 부모가 루트면
  // 워크스페이스가 그 자리다 — 워크스페이스가 상속 체인의 루트이므로
  // (`SEC-WORKSPACE-001`) 같은 판정이 그대로 답한다.
  //
  // pass-through 디렉토리는 유효 권한이 없으므로 여기서 함께 걸린다
  // (`SEC-ACL-005` AC-4) — 별도 검사를 두지 않는 이유가 그것이다.
  const parentTarget = input.parentId ?? input.workspaceId;
  const parentLevel = permissionOf(stores, actor, parentTarget);
  if (!satisfies(requirementFor('create'), { ...NOTHING_HELD, parent: parentLevel })) {
    // 부모가 아예 보이지 않으면 존재하지 않는 것과 같은 사유를 쓴다
    // (`SEC-ACL-006`). 보이는데 편집이 없는 경우만 권한 부족으로 답한다.
    return parentLevel === null
      ? unknownNode(parentTarget)
      : reject('forbidden', '이 자리에 만들 권한이 없습니다.');
  }

  const verdict = validateNodeName(input.name, parentPathOf(nodes, input.parentId));
  if (!verdict.ok) {
    return { ok: false, violations: verdict.violations };
  }

  // 형제 **전부**와 겹치지 않게 푼다 — 보이지 않는 형제도 포함해서
  // (`SEC-ACL-007` AC-1 · AC-3). 걸러진 목록을 받으면 숨은 이름과 겹치는
  // 요청이 그대로 통과해, 흐름 차이가 그 노드의 존재를 알려준다.
  const name = resolveNameCollision(
    input.name,
    nodes.children({ workspaceId: input.workspaceId, parentId: input.parentId }).map((n) => n.name),
  );

  const id = nodes.create({ ...input, name });

  // 생성자에게 편집을 자동으로 부여한다 (`SEC-ACL-011` AC-1 · AC-2 · AC-5).
  // `grantedBy` 를 `null` 로 두는 것이 이 항목을 시스템의 것으로 만든다 —
  // 아무 편집자나 걷어내지 못하고 워크스페이스 관리 권한자만 회수한다(AC-3).
  acl.grant({ nodeId: id, principalId: actor.id, level: 'edit', grantedBy: null });

  return { ok: true, id, name };
}

/** 개명에도 같은 단계가 걸린다. 거부되면 이름도 자리도 그대로다. */
export function renameNode(
  stores: NodeStores,
  actor: Actor,
  id: NodeId,
  name: string,
): Placed | Rejected {
  // 보이지 않는 노드는 없는 노드와 **같은 값**으로 거절된다 (`SEC-ACL-006`).
  const node = resolveNode(stores, actor, id);
  if (node === undefined) {
    return unknownNode(id);
  }

  // 대상의 편집 (`SEC-ACL-012` AC-3).
  const target = permissionOf(stores, actor, id);
  if (!satisfies(requirementFor('rename'), { ...NOTHING_HELD, target })) {
    return reject('forbidden', '이 노드를 바꿀 권한이 없습니다.');
  }

  return place(stores, node, node.parentId, name);
}

/**
 * 자리를 옮긴다. 옮겨 간 자리에서 이름이 겹치면 **거부하지 않고** 접미사를
 * 붙인 채로 옮긴다 (`FR-WORKSPACE-005` AC-6).
 */
export function moveNode(
  stores: NodeStores,
  actor: Actor,
  id: NodeId,
  parentId: NodeId | null,
): Placed | Rejected {
  const node = resolveNode(stores, actor, id);
  if (node === undefined) {
    return unknownNode(id);
  }

  // 워크스페이스 경계를 넘는 이동은 아예 없다 (`SEC-ACL-014` AC-1) —
  // `parentId` 가 다른 워크스페이스의 노드면 자리 검사가 아니라 여기서
  // 막힌다. 대신 복사가 그 수요를 받는다(AC-2).
  if (parentId !== null) {
    const destination = stores.nodes.findById(parentId);
    if (destination !== undefined && destination.workspaceId !== node.workspaceId) {
      return unknownNode(parentId);
    }
  }

  // 대상과 목적지 **둘 다**의 편집 (`SEC-ACL-012` AC-5). 숨은 하위가 있는
  // 디렉토리면 워크스페이스 관리로 올라간다 (`SEC-ACL-013`).
  const requirement = requirementFor('move', {
    hasHiddenDescendant: hasHiddenDescendant(stores, actor, node),
  });
  const held: Held = {
    parent: null,
    target: permissionOf(stores, actor, id),
    destination: permissionOf(stores, actor, parentId ?? node.workspaceId),
    workspace: permissionOf(stores, actor, node.workspaceId),
  };
  if (!satisfies(requirement, held)) {
    // 사유에 숨은 노드의 개수·이름·경로를 담지 않는다 (`SEC-ACL-013` AC-4).
    return reject('forbidden', '이 노드를 옮길 권한이 없습니다.');
  }

  return place(stores, node, parentId, node.name);
}

/**
 * 복사한다 — 워크스페이스 경계를 **넘을 수 있는 유일한 조작**이다
 * (`SEC-ACL-014` AC-2).
 *
 * 이동과 갈라 둔 이유가 요구의 전부다. 이동은 원본을 목적지의 권한 경계로
 * 끌고 가므로 두 경계 사이에서 권한이 갈리는데, 복사는 새 노드를 만들 뿐이라
 * 그 문제가 없다 — 그래서 원본에는 **보기**면 족하고(AC-3) 목적지에만
 * 편집이 필요하다.
 *
 * 복사본의 생성자는 복사를 실행한 사용자다 (`SEC-ACL-011` AC-5) — 원본
 * 생성자를 물려주면 복사 한 번으로 남의 편집권이 새 경계 안에 생긴다.
 *
 * 본문 복제는 여기 없다 — 본문의 SSOT 는 파일시스템이고(`DR-STORAGE-001`)
 * 그 복제와 첨부·링크 처리 규칙은 `FR-ACL-001` 이 소유한다(뒤 wave).
 * 여기서 서는 것은 노드와 그 권한이다.
 */
export function copyNode(
  stores: NodeStores,
  actor: Actor,
  id: NodeId,
  destinationId: NodeId | null,
): Created | Rejected {
  const source = resolveNode(stores, actor, id);
  if (source === undefined) {
    return unknownNode(id);
  }

  const destination = destinationId === null ? undefined : stores.nodes.findById(destinationId);
  if (destinationId !== null && destination === undefined) {
    return unknownNode(destinationId);
  }
  // 목적지가 루트면 그 워크스페이스를 알 길이 없다 — 복사는 경계를 넘으므로
  // 원본의 워크스페이스를 물려받을 수 없기 때문이다.
  const workspaceId = destination?.workspaceId ?? source.workspaceId;

  const held: Held = {
    parent: null,
    target: permissionOf(stores, actor, id),
    destination: permissionOf(stores, actor, destinationId ?? workspaceId),
    workspace: null,
  };
  if (!satisfies(requirementFor('copy'), held)) {
    return reject('forbidden', '이 노드를 복사할 권한이 없습니다.');
  }

  // 자기 자신이나 자기 하위로 복사하면 사본이 다시 복사 대상이 되어
  // 끝나지 않는다. 이동과 같은 방어를 같은 자리에서 쓴다.
  if (destinationId !== null && subtreeOf(stores.nodes, source).ids.has(destinationId)) {
    return reject('move-into-descendant', '노드를 자기 자신이나 그 하위로 복사할 수 없습니다.');
  }

  return createNode(stores, actor, {
    workspaceId,
    parentId: destinationId,
    kind: source.kind,
    name: source.name,
  });
}

/**
 * 이 서브트리에 요청자가 볼 수 없는 노드가 하나라도 있는가
 * (`SEC-ACL-013` AC-1 · AC-2).
 *
 * 문서에는 하위가 없으므로 언제나 거짓이다 — 그 경우까지 순회하면 이동
 * 하나가 워크스페이스 전량을 훑는다.
 */
function hasHiddenDescendant(stores: NodeStores, actor: Actor, node: NodeRecord): boolean {
  if (node.kind !== 'directory') return false;

  for (const id of subtreeOf(stores.nodes, node).ids) {
    if (id === node.id) continue;
    if (permissionOf(stores, actor, id) === null) return true;
  }
  return false;
}

/**
 * 개명과 이동이 공유하는 몸통.
 *
 * 둘을 한 함수로 모은 이유는 검사가 같기 때문이다 — 나누면 한쪽에만 검사가
 * 추가되고 다른 쪽으로 그대로 뚫린다. 실제로 자리 검사(자손·후손 경로)는
 * 이동만의 문제로 보이지만, **개명도 후손 경로를 늘린다.**
 */
function place(
  { nodes }: NodeStores,
  node: NodeRecord,
  parentId: NodeId | null,
  name: string,
): Placed | Rejected {
  const subtree = subtreeOf(nodes, node);

  // 자기 자신이나 자기 자손 아래로는 갈 수 없다. 허용하면 부모 사슬에
  // 고리가 생겨 루트에서 도달할 수 없게 되고, 경로를 파생하는 모든
  // 호출이 그 고리를 돈다.
  if (parentId !== null && subtree.ids.has(parentId)) {
    return reject(
      'move-into-descendant',
      '노드를 자기 자신이나 그 하위로 옮길 수 없습니다.',
    );
  }

  const parentPath = parentPathOf(nodes, parentId);
  const verdict = validateNodeName(name, parentPath);
  if (!verdict.ok) {
    return { ok: false, violations: verdict.violations };
  }

  // 자기 경로만 재면 부족하다 — 서브트리를 통째로 옮기거나 상위를 개명하면
  // 자손의 경로가 함께 길어지고, 그 자손은 사용자가 만들지도 않은 규칙
  // 위반을 안은 채 디스크에 남는다.
  const deepest = checkPathLength(joinPath(parentPath, name) + subtree.longestSuffix);
  if (deepest !== undefined) {
    return { ok: false, violations: [deepest] };
  }

  const resolved = resolveNameCollision(
    name,
    // 자기 자신을 빼지 않으면 이름을 그대로 두는 개명이 자기와 충돌한다.
    nodes
      .children({ workspaceId: node.workspaceId, parentId, except: node.id })
      .map((sibling) => sibling.name),
  );

  nodes.relocate(node.id, { parentId, name: resolved });
  return { ok: true, name: resolved };
}

/**
 * 노드와 그 후손, 그리고 **가장 깊은 후손까지의 경로 꼬리**.
 *
 * 꼬리는 노드 자신의 이름 **뒤부터** 센다(`/자식/손자`). 그래서 새 자리의
 * 경로에 그대로 이어 붙이면 이동 후 최장 경로가 된다.
 */
function subtreeOf(
  nodes: NodeRepository,
  root: NodeRecord,
): { ids: Set<NodeId>; longestSuffix: string } {
  const byParent = new Map<NodeId | null, NodeRecord[]>();
  for (const node of nodes.allIn(root.workspaceId)) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }

  const ids = new Set<NodeId>([root.id]);
  let longestSuffix = '';

  const walk = (id: NodeId, suffix: string): void => {
    if (suffix.length > longestSuffix.length) {
      longestSuffix = suffix;
    }
    for (const child of byParent.get(id) ?? []) {
      // 고리가 이미 있는 상태에서도 이 순회가 끝나야 한다 — 끝나지 않으면
      // 고리를 고치려는 호출조차 돌아오지 못한다.
      if (ids.has(child.id)) {
        continue;
      }
      ids.add(child.id);
      walk(child.id, `${suffix}/${child.name}`);
    }
  };
  walk(root.id, '');

  return { ids, longestSuffix };
}

/**
 * 업로드된 파일 이름에도 같은 검사가 걸린다 (`FR-WORKSPACE-004` AC-3).
 *
 * HTTP 업로드 라우트 자체는 뒤 wave 가 소유한다. 여기 있는 것은 그 라우트가
 * 반드시 경유해야 하는 지점이며, 우회하면 검증되지 않은 이름이 디스크에
 * 남는다. 충돌은 그 라우트가 `createNode` 로 넘길 때 함께 풀린다.
 */
export function validateUploadedName(
  { nodes }: NodeStores,
  parentId: NodeId | null,
  filename: string,
): { ok: true } | Rejected {
  const verdict = validateNodeName(filename, parentPathOf(nodes, parentId));
  return verdict.ok ? { ok: true } : { ok: false, violations: verdict.violations };
}

export type { NameViolation };
