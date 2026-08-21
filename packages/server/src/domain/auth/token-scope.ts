import { permits, type PermissionLevel } from '../acl/level.js';

/**
 * PAT 스코프 (`SEC-AUTH-008` AC-1). 둘뿐이다.
 *
 * 셋째 값을 두지 않는 이유는 스코프가 **상한만 낮추는** 축이기 때문이다 —
 * 이 축에 표현력을 더하면 그것이 권한을 **주는** 축으로 읽히기 시작한다.
 */
export type TokenScope = 'read-only' | 'read-write';

/** 요청이 하려는 것. 쓰기는 읽기를 함의하지 않는다 — 별개의 두 축이다. */
export type TokenAction = 'read' | 'write';

/**
 * 이 토큰으로 이 조작이 성립하는가.
 *
 * **교집합이다** (`SEC-AUTH-008` AC-4). 스코프가 허용하고 **동시에**
 * 실시간 유효 권한이 허용해야 통과한다 — 어느 한쪽만으로는 아무것도
 * 열리지 않는다.
 *
 * 이 순서가 요구의 전부다: 스코프는 사용자가 자기 권한을 **스스로 낮추는**
 * 수단이지 올리는 수단이 아니다. 그래서 `read-write` 스코프라도 그 노드의
 * 유효 권한이 `보기` 면 쓰기가 거부되고(AC-3), `read-only` 스코프면
 * `편집` 을 가졌어도 쓰기가 거부된다(AC-2).
 *
 * @param effective 요청 **시점**의 유효 권한. 토큰에 담긴 값이 아니라
 *   매 요청 계산된 것이어야 한다 — 담아 두면 권한 회수가 반영되지 않는다
 *   (`SEC-AUTH-002`).
 */
export function permittedUnderScope(
  scope: TokenScope,
  effective: PermissionLevel | null,
  action: TokenAction,
): boolean {
  if (effective === null) return false;

  const required: PermissionLevel = action === 'write' ? 'edit' : 'view';
  if (!permits(effective, required)) return false;

  return action === 'read' || scope === 'read-write';
}
