import { resolveNameCollision } from '../../domain/naming/collision.js';
import { validateNodeName } from '../../domain/naming/name-validator.js';
import type { NameValidation } from '../../domain/naming/validation-result.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NewNode, NodeRepository } from '../../domain/ports/node-repository.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';

/**
 * 새 이름이 들어오는 진입점들 — 생성·개명·이동·업로드
 * (`FR-WORKSPACE-004` · `FR-WORKSPACE-005`).
 *
 * 넷을 한 자리에 모은 이유는 넷이 **같은 두 단계**를 같은 순서로 거쳐야
 * 하기 때문이다. 파일을 나누면 나중에 한 곳에만 규칙이 추가되고 나머지는
 * 조용히 뒤처진다.
 *
 * 두 단계는 방향이 **반대**다. 규칙 위반은 거부하고, 이름 충돌은 거부하지
 * 않고 접미사를 붙인다. 둘을 하나로 합치면 어느 한쪽이 다른 쪽의 처분을
 * 물려받아 `R113` 이 깨진다 — 그래서 검증이 먼저이고, 통과한 이름에만
 * 충돌 판정이 걸린다(`FR-WORKSPACE-004` AC-8).
 *
 * 저장소는 이 두 단계를 다시 하지 않는다 — 재조정 스캔처럼 디스크에 이미
 * 있는 것을 등재하는 경로는 검증 대상이 아니라 **사실의 기록**이라,
 * 저장소가 막으면 이미 존재하는 파일을 등재할 방법이 사라진다.
 */

/**
 * 이 진입점들이 쓰는 저장소 묶음.
 *
 * 하나로 묶는 이유는 넷이 같은 모양을 갖게 하기 위해서다 — 어떤 것은
 * 저장소 하나를, 어떤 것은 둘을 받으면 호출자가 매번 어느 쪽인지 확인해야
 * 한다.
 */
export interface NodeStores {
  nodes: NodeRepository;
  workspaces: WorkspaceRepository;
}

/** 만들어졌을 때의 결과. `name` 은 접미사가 붙었을 수 있는 **최종** 이름이다. */
export type Created = { ok: true; id: NodeId; name: string };

/** 자리를 옮기거나 이름을 바꿨을 때의 결과. */
export type Placed = { ok: true; name: string };

/** 거부는 검증 결과를 그대로 흘려보낸다. 문구를 다시 만들지 않는다. */
export type Rejected = Extract<NameValidation, { ok: false }>;

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
export function createNode({ nodes, workspaces }: NodeStores, input: NewNode): Created | Rejected {
  // 사전 검사다. 없는 워크스페이스를 대면 만들지 않는다 — 소속 없는 노드는
  // 어느 권한 경계에도 들지 않아 트리에서도 권한 계산에서도 사라진다
  // (`FR-WORKSPACE-001` AC-1).
  if (workspaces.findById(input.workspaceId) === undefined) {
    throw new Error(`cannot create a node in unknown workspace ${input.workspaceId}`);
  }

  const verdict = validateNodeName(input.name, parentPathOf(nodes, input.parentId));
  if (!verdict.ok) {
    return verdict;
  }

  const name = resolveNameCollision(
    input.name,
    nodes.children({ workspaceId: input.workspaceId, parentId: input.parentId }).map((n) => n.name),
  );
  return { ok: true, id: nodes.create({ ...input, name }), name };
}

/** 개명에도 같은 두 단계가 걸린다. 거부되면 이름은 그대로다. */
export function renameNode({ nodes }: NodeStores, id: NodeId, name: string): Placed | Rejected {
  const node = mustFind(nodes, id, 'rename');

  const verdict = validateNodeName(name, parentPathOf(nodes, node.parentId));
  if (!verdict.ok) {
    return verdict;
  }

  const resolved = resolveNameCollision(
    name,
    // 자기 자신을 빼지 않으면 이름을 그대로 두는 개명이 자기와 충돌한다.
    nodes.children({ workspaceId: node.workspaceId, parentId: node.parentId, except: id }).map((n) => n.name),
  );
  nodes.rename(id, resolved);
  return { ok: true, name: resolved };
}

/**
 * 자리를 옮긴다. 옮겨 간 자리에서 이름이 겹치면 **거부하지 않고** 접미사를
 * 붙인 채로 옮긴다 (`FR-WORKSPACE-005` AC-6).
 *
 * 이름 자체는 이미 검증을 통과해 만들어진 것이라 다시 검사하지 않는다.
 * 다만 결과 **경로**는 새 자리에서 달라지므로 다시 잰다.
 */
export function moveNode(
  { nodes }: NodeStores,
  id: NodeId,
  parentId: NodeId | null,
): Placed | Rejected {
  const node = mustFind(nodes, id, 'move');

  const verdict = validateNodeName(node.name, parentPathOf(nodes, parentId));
  if (!verdict.ok) {
    return verdict;
  }

  const resolved = resolveNameCollision(
    node.name,
    nodes.children({ workspaceId: node.workspaceId, parentId, except: id }).map((n) => n.name),
  );

  nodes.move(id, parentId);
  if (resolved !== node.name) {
    nodes.rename(id, resolved);
  }
  return { ok: true, name: resolved };
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
): NameValidation {
  return validateNodeName(filename, parentPathOf(nodes, parentId));
}

function mustFind(nodes: NodeRepository, id: NodeId, what: string) {
  const node = nodes.findById(id);
  if (node === undefined) {
    // 있지도 않은 노드를 다루라는 요청은 이름 규칙 위반이 아니다.
    throw new Error(`cannot ${what} unknown node ${id}`);
  }
  return node;
}
