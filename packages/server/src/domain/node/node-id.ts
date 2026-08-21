import { randomUUID } from 'node:crypto';

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
 * **순차 정수를 쓰지 않는다** (`SEC-STORAGE-001`). ID 가 URL 에 노출되므로
 * 순차값이면 URL 을 훑는 것만으로 존재 여부를 재는 열거 오라클이 되고,
 * 권한 없음과 존재하지 않음을 구별하지 못하게 한 `R94` 의 취지가 URL
 * 계층에서 무너진다.
 *
 * DB 내부 기본키로 정수를 쓰는 것 자체는 금지되지 않는다 — 금지되는 것은
 * 그 값을 노드 ID 로 삼아 밖으로 내보내는 것이다.
 */
export function newNodeId(): NodeId {
  return randomUUID();
}
