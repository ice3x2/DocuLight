import type { NodeId } from '../node/node-id.js';
import type { PrincipalId } from '../principal/principal.js';

/**
 * 즐겨찾기 저장소의 경계. 도메인이 소유한다.
 *
 * **주체마다 따로다.** 노드 하나에 붙는 표식이 아니라 사람이 자기 목록을
 * 드는 것이므로, 남의 목록이 섞이면 그 문서의 존재가 새어 나간다.
 *
 * 같은 (주체, 노드) 를 두 번 더해도 줄은 하나다 — 두 줄이면 뺄 때 하나가
 * 남고, 남은 줄은 화면에서 보이지 않으므로 아무도 눈치채지 못한다.
 */
export interface FavoriteRepository {
  add(subjectId: PrincipalId, nodeId: NodeId): void;
  remove(subjectId: PrincipalId, nodeId: NodeId): void;
  /** 더한 순서대로. 목록의 순서가 사용자가 만든 순서다. */
  listOf(subjectId: PrincipalId): NodeId[];
}
