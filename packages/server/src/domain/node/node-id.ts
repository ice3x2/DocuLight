import { newOpaqueId } from '../identity/opaque-id.js';

/**
 * 노드의 외부 식별자. 경로가 아니라 이것이 정본이다 (`DR-STORAGE-003`).
 *
 * 문자열 별칭인 이유는 이 값이 URL 에 그대로 실리기 때문이다(`R99`) — 감싸는
 * 타입을 두면 경계마다 풀었다 감쌌다 하는 코드가 생기고, 그 자리마다 형식이
 * 갈릴 틈이 난다.
 */
export type NodeId = string;

/**
 * 새 노드 ID 를 발급한다.
 *
 * 추측 불가능해야 하는 이유와 그 근거는 `newOpaqueId` 가 한 자리에서
 * 설명한다 — 노드만의 규칙이 아니라 밖으로 나가는 모든 식별자의 규칙이다.
 */
export function newNodeId(): NodeId {
  return newOpaqueId();
}
