import { validateNodeName } from '../../domain/naming/name-validator.js';
import type { NameValidation } from '../../domain/naming/validation-result.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { NewNode, NodeRepository } from '../../domain/ports/node-repository.js';

/**
 * 새 이름이 들어오는 세 진입점 — 생성·개명·업로드 (`FR-WORKSPACE-004`).
 *
 * 셋을 한 자리에 모은 이유는 셋이 같은 검증기를 경유해야 하기 때문이다.
 * 파일을 나누면 나중에 한 곳에만 규칙이 추가되고 다른 둘은 조용히 뒤처진다.
 *
 * 저장소는 이 검증을 다시 하지 않는다 — 재조정 스캔처럼 디스크에 이미
 * 있는 것을 등재하는 경로는 검증 대상이 아니라 **사실의 기록**이라,
 * 저장소가 막으면 이미 존재하는 파일을 등재할 방법이 사라진다.
 */

/** 만들어졌을 때의 결과. 거부는 검증 결과를 그대로 흘려보낸다. */
export type Created = { ok: true; id: NodeId };
export type Rejected = Extract<NameValidation, { ok: false }>;

/** 부모의 워크스페이스 루트 기준 상대 경로. 루트 바로 아래면 빈 문자열이다. */
function parentPathOf(nodes: NodeRepository, parentId: NodeId | null): string {
  return parentId === null ? '' : nodes.pathOf(parentId);
}

/**
 * 이름을 검사하고 통과할 때만 노드를 만든다.
 *
 * **거부된 이름에 접미사를 붙여 대신 만들지 않는다** (`AC-8`) — 붙이면
 * 사용자가 요청하지 않은 이름이 디스크에 남는다. 접미사는 이름이 유효한데
 * 형제와 겹칠 때만 붙는 별개 경로다(`FR-WORKSPACE-005`).
 */
export function createNode(
  nodes: NodeRepository,
  input: NewNode,
): Created | Rejected {
  const verdict = validateNodeName(input.name, parentPathOf(nodes, input.parentId));
  if (!verdict.ok) {
    return verdict;
  }
  return { ok: true, id: nodes.create(input) };
}

/** 개명에도 같은 검사가 걸린다 (`AC-2`). 거부되면 이름은 그대로다. */
export function renameNode(nodes: NodeRepository, id: NodeId, name: string): NameValidation {
  const node = nodes.findById(id);
  if (node === undefined) {
    // 있지도 않은 노드를 개명하라는 요청은 이름 규칙 위반이 아니다.
    throw new Error(`cannot rename unknown node ${id}`);
  }

  const verdict = validateNodeName(name, parentPathOf(nodes, node.parentId));
  if (verdict.ok) {
    nodes.rename(id, name);
  }
  return verdict;
}

/**
 * 업로드된 파일 이름에도 같은 검사가 걸린다 (`AC-3`).
 *
 * HTTP 업로드 라우트 자체는 뒤 wave 가 소유한다. 여기 있는 것은 그 라우트가
 * 반드시 경유해야 하는 지점이며, 우회하면 검증되지 않은 이름이 디스크에
 * 남는다.
 */
export function validateUploadedName(
  nodes: NodeRepository,
  parentId: NodeId | null,
  filename: string,
): NameValidation {
  return validateNodeName(filename, parentPathOf(nodes, parentId));
}
