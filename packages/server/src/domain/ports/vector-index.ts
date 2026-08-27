import type { NodeId } from '../node/node-id.js';

/**
 * 벡터 인덱스의 경계 (`SEC-STORAGE-007` · `R79`).
 *
 * **무엇을 색인하는가는 이 경계가 정하지 않는다.** 조각을 어떻게 자르고
 * 무엇을 임베딩하는지는 의미 검색을 세우는 쪽(`FR-ARCH-001`)의 몫이고,
 * 여기가 소유하는 것은 **갱신 시점과 제외 규칙**뿐이다.
 *
 * 그래서 조각을 불투명한 문자열로 둔다. 벡터 자체를 이 타입에 싣지 않는
 * 이유도 같다 — 실으면 저장 형식이 이 경계의 계약이 되어, 색인 방식을
 * 바꿀 때마다 위생 규칙까지 함께 흔들린다.
 */
export interface VectorEntry {
  readonly nodeId: NodeId;
  /** 이 엔트리가 속한 워크스페이스. 노드가 옮겨지면 함께 따라간다. */
  readonly workspaceId: string;
  /** 색인된 조각. 본문 일부이거나 요약이며 이 경계는 그 내용을 보지 않는다. */
  readonly chunk: string;
}

export interface VectorIndex {
  put(entry: VectorEntry): void;

  /**
   * 그 노드의 엔트리를 전부 지운다.
   *
   * 삭제와 **같은 처리 안에서** 불려야 한다 (AC-1). 나중에 훑어 지우는
   * 방식으로 두면 그 사이에 삭제된 문서의 본문이 검색으로 새어 나간다.
   */
  removeNode(nodeId: NodeId): void;

  /** 노드가 다른 워크스페이스로 옮겨졌다 (AC-2). */
  relocate(nodeId: NodeId, workspaceId: string): void;

  entriesOf(nodeId: NodeId): VectorEntry[];
}
