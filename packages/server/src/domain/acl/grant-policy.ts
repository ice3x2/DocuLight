import type { PrincipalId } from '../principal/principal.js';
import type { AclEntry } from './acl-entry.js';
import { permits, type PermissionLevel } from './level.js';

export type GrantRule =
  | 'needs-edit-on-node'
  | 'above-own-level'
  | 'manage-is-workspace-only'
  | 'needs-manage'
  | 'not-your-grant';

/** 거절은 값이다 — 예측 가능한 분기를 예외로 흘리지 않는다. */
export type GrantDecision = { allowed: true } | { allowed: false; rule: GrantRule };

const ALLOWED: GrantDecision = { allowed: true };
const deny = (rule: GrantRule): GrantDecision => ({ allowed: false, rule });

/**
 * 넓히기 — 부여할 수 있는가 (`SEC-ACL-009` AC-1 · AC-2 · AC-3).
 *
 * **입력에 「누가 줬는가」가 없다.** 그래서 관리자가 준 편집과 편집자가 준
 * 편집이 갈리지 않고, 전파가 구조적으로 막히지 않는다(`SEC-ACL-010`
 * AC-1 · AC-2). 전파된 부여도 같은 함수를 지나므로 「자신의 레벨 이하」
 * 제한을 그대로 받는다(AC-4).
 *
 * **적용 범위를 고르는 축도 없다** (`CON-ACL-003` AC-1 · AC-2). 고를 값이
 * 있으면 화면이 언젠가 그것을 노출하므로, 값 자체를 두지 않는다.
 */
export function canGrant(input: {
  /** 실행자가 그 노드에 가진 유효 권한. 없으면 `null`. */
  actorLevel: PermissionLevel | null;
  requestedLevel: PermissionLevel;
  /** 대상이 워크스페이스 노드인가 — 관리를 받을 수 있는 유일한 계층이다. */
  targetIsWorkspace: boolean;
}): GrantDecision {
  // 관리는 워크스페이스에만 (`SEC-WORKSPACE-002` AC-1 · AC-2).
  // 실행자 레벨보다 **먼저** 본다 — 관리자가 문서에 관리를 주려는 경우의
  // 사유가 「레벨 부족」으로 나오면 그 안내를 보고 레벨을 올리려 한다.
  if (input.requestedLevel === 'admin' && !input.targetIsWorkspace) {
    return deny('manage-is-workspace-only');
  }

  if (input.actorLevel === null || !permits(input.actorLevel, 'edit')) {
    return deny('needs-edit-on-node');
  }

  // 자신의 레벨 이하만 (AC-2). 관리 부여가 관리 보유자에게만 열리는 것도
  // (AC-3) 이 한 줄에서 함께 나온다 — 규칙이 둘이면 한쪽만 바뀐다.
  if (!permits(input.actorLevel, input.requestedLevel)) {
    return deny('above-own-level');
  }

  return ALLOWED;
}

/**
 * 회수할 수 있는가 (`SEC-ACL-009` AC-5).
 *
 * 편집 보유자는 **자신이 부여한 항목만** 걷는다. `grantedBy` 가 `null` 인
 * 항목 — 생성자 자동 부여 같은 시스템 항목 — 은 아무의 것도 아니므로
 * 편집 보유자가 걷지 못한다. `null` 을 「내가 준 것」으로 읽으면 아무
 * 편집자나 생성자의 편집권을 걷어낼 수 있게 된다(`SEC-ACL-011` AC-3 은
 * 그 권능을 워크스페이스 관리 권한자에게만 준다).
 */
export function canRevoke(input: {
  actorId: PrincipalId;
  actorLevel: PermissionLevel | null;
  entry: AclEntry;
}): GrantDecision {
  if (input.actorLevel === 'admin') return ALLOWED;

  if (input.actorLevel === null || !permits(input.actorLevel, 'edit')) {
    return deny('needs-edit-on-node');
  }

  return input.entry.grantedBy === input.actorId ? ALLOWED : deny('not-your-grant');
}

/**
 * 좁히기 — 상속을 끊을 수 있는가 (`SEC-ACL-009` AC-4).
 *
 * 넓히기는 편집이 하고 좁히기는 관리만 한다. 이 **비대칭**이 요구의 전부이며,
 * 그것이 무너지면 편집 사용자가 좁히기를 실행하는 경로가 열린다.
 */
export function canBreakInheritance(actorLevel: PermissionLevel | null): GrantDecision {
  return actorLevel === 'admin' ? ALLOWED : deny('needs-manage');
}
