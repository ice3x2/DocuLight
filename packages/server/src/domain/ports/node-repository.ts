import type { NodeId } from '../node/node-id.js';

/** 노드는 문서이거나 디렉토리다. 스키마의 `CHECK` 와 같은 두 값이다. */
export type NodeKind = 'directory' | 'file';

/** 아직 ID 가 없는 노드. ID 는 저장소가 발급한다 — 호출자가 짓지 않는다. */
export interface NewNode {
  workspaceId: string;
  /** 루트면 `null`. */
  parentId: NodeId | null;
  kind: NodeKind;
  name: string;
}

export interface NodeRecord extends NewNode {
  id: NodeId;
}

/**
 * 노드 저장소의 경계. 도메인이 소유한다.
 *
 * **경로로 조회하는 메서드를 두지 않는다.** 두면 경로가 두 번째 정본이 되어
 * `DR-STORAGE-003` 이 막으려는 사고 — 삭제 후 동명 재생성이 이전 노드의
 * 권한을 물려받는 것 — 이 되살아난다. 경로는 `pathOf` 로 **파생**될 뿐이다.
 */
export interface NodeRepository {
  /** 노드를 만들고 새로 발급한 ID 를 돌려준다. */
  create(node: NewNode): NodeId;

  /** 없으면 `undefined`. 예외를 분기로 쓰지 않는다. */
  findById(id: string): NodeRecord | undefined;

  /**
   * 부모 사슬을 거슬러 경로를 만든다.
   *
   * 경로를 칸에 담지 않는 이유가 여기 있다 — 담으면 이동·개명 때 두 곳을
   * 함께 고쳐야 하고, 한쪽만 고쳐지면 아무도 눈치채지 못한다.
   */
  pathOf(id: NodeId): string;
}
