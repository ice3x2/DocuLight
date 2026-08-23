import type { Ancestry } from '../../domain/acl/effective-permission.js';
import { permits } from '../../domain/acl/level.js';
import type { NodeId } from '../../domain/node/node-id.js';
import { accessorsOf, servableAncestryOf, tallyOf } from './accessor-service.js';
import type { AccessorReport } from './accessor-service.js';
import {
  judgementScope,
  permissionOf,
  type AclStores,
  type Actor,
} from './permission-service.js';

/**
 * 이동 전후의 **접근 가능** 인원 (`FR-ACL-006`).
 *
 * 수치 둘뿐이다 — 명단을 실을 칸이 **없다** (AC-3). 있으면 그 칸이 곧
 * `SEC-ACL-015` 를 우회하는 경로가 된다. 명단이 필요한 사람은 시뮬레이션
 * 화면으로 간다(AC-4).
 *
 * 「변화 없음」에도 같은 모양으로 돌려준다 (AC-6) — 다른 모양을 쓰면 화면이
 * 그 자리에서만 분기하게 되고, 그 분기 자체가 「무언가 특별하다」는 신호가
 * 된다.
 */
export interface MovePreview {
  readonly before: number;
  readonly after: number;
}

/**
 * 옮기면 몇 명이 되는가.
 *
 * 부모가 바뀌면 상속 결과가 달라지는데 사용자는 그것을 모른다 — 폴더를
 * 정리했을 뿐인데 접근자가 늘거나 줄어 있는 것이 이 프리뷰가 없을 때
 * 벌어지는 일이다.
 *
 * 대상에 편집이 없으면 `null` — 옮길 수 없는 사람에게 낼 수치가 아니다.
 */
export function movePreview(
  stores: AclStores,
  actor: Actor,
  nodeId: NodeId,
  destinationId: NodeId | null,
): MovePreview | null {
  const level = permissionOf(stores, actor, nodeId);
  if (level === null || !permits(level, 'edit')) return null;

  const now = servableAncestryOf(stores, nodeId);
  if (now === null) return null;

  // 목적지도 **인가를 지난다.** 출발에만 문턱을 두면 아무 노드 하나에
  // 편집만 가진 사람이 임의의 ID 를 목적지로 찔러 (a) 200·404 로 존재를
  // 읽고 (b) 그 목적지의 접근 가능 인원 수를 받아 간다 — 후자는 볼 수
  // 없는 자리의 지표이므로 문턱을 통째로 우회한 것이다.
  //
  // 워크스페이스 루트(목적지 없음)는 이미 통과한 출발지의 것이라 다시
  // 묻지 않는다.
  if (destinationId !== null) {
    const destinationLevel = permissionOf(stores, actor, destinationId);
    if (destinationLevel === null || !permits(destinationLevel, 'edit')) return null;
  }

  // 이동은 워크스페이스 경계를 넘지 못한다 (`SEC-ACL-014`) — 그 제약을
  // 여기서 **강제한다.** 가정만 하면 경계를 넘는 목적지에 대해 성립하지
  // 않는 사슬을 만들어 답하게 된다.
  const destination =
    destinationId === null ? { links: [], workspaceId: now.workspaceId } : servableAncestryOf(stores, destinationId);
  if (destination === null || destination.workspaceId !== now.workspaceId) return null;

  // 「목적지 아래에 있었다면」의 사슬. **자기 자신은 그대로 맨 앞에 둔다** —
  // 옮겨도 자기 항목과 자기 상속 플래그는 따라가기 때문이다. 상속을 끊은
  // 노드가 새 부모의 항목을 받지 않는다는 사실도 그래서 따라온다.
  const after: Ancestry = {
    links: [now.links[0]!, ...destination.links],
    workspaceId: destination.workspaceId,
  };

  const entries = stores.acl.entriesOnAny([
    ...new Set([...judgementScope(now), ...judgementScope(after)]),
  ]);

  return {
    before: tallyOf(stores.principals, now, entries).roster.length,
    after: tallyOf(stores.principals, after, entries).roster.length,
  };
}

/**
 * 복사하면 몇 명이 되는가 — **목적지 기준** (`FR-ACL-002`).
 *
 * 원본 기준으로 판정하면 원본에 보기만 가진 요청자에게 수치가 감춰져
 * 「복사하는 사람에게는 수치를 안 보여준다」는 모순이 생긴다. 복사본의
 * 접근자는 목적지 상속에서 파생되므로 기준도 목적지여야 뜻이 맞고, 복사는
 * 언제나 목적지 편집을 요구하므로 이 기준이면 수치가 빠지는 경로가 없다
 * (AC-3).
 *
 * 셈은 접근자 지표의 정본을 그대로 쓴다 — 여기서 따로 세면 같은 목적지가
 * 화면마다 다른 수를 보여준다.
 */
export function copyPreview(
  stores: AclStores,
  actor: Actor,
  destinationId: string,
): AccessorReport | null {
  return accessorsOf(stores, actor, destinationId);
}
