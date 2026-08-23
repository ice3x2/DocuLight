import { canAuthenticate } from '../../domain/auth/account-gate.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { SessionRepository } from '../../domain/ports/session-repository.js';
import type { PrincipalId, PrincipalStatus } from '../../domain/principal/principal.js';
import { isReservedActor } from '../../domain/principal/system-principals.js';
import { SUPERUSER_GROUP_ID, isSystemGroup } from '../../domain/principal/system-groups.js';

/** 거절 사유. 예외가 아니라 값이다 — 예측 가능한 분기는 예외로 흘리지 않는다. */
export type PrincipalRule =
  | 'system-group-immutable'
  | 'member-must-be-user'
  | 'unknown-principal'
  | 'not-a-group'
  | 'last-active-superuser'
  /** 예약 주체는 계정이 아니다 (`DR-AUDIT-001` AC-4 · AC-5). */
  | 'reserved-principal';

/** 슈퍼유저 바닥을 지키는 가드가 내는 사유 (`SEC-AUTH-016`). */
export type PrincipalGuardRule = Extract<PrincipalRule, 'last-active-superuser'>;

export type PrincipalResult = { ok: true } | { ok: false; rule: PrincipalRule };

const ok: PrincipalResult = { ok: true };
const reject = (rule: PrincipalRule): PrincipalResult => ({ ok: false, rule });

/**
 * 시스템 그룹은 개명할 수 없다 (`CON-PRINCIPAL-002` AC-3).
 *
 * 개명을 막는 이유는 이름이 아니라 **참조**다 — 설치 마법사와 판정 코드가
 * 이 두 그룹을 이름이 아닌 ID 로 가리키지만, 이름이 바뀌면 화면과 감사
 * 로그가 가리키는 대상이 갈린다.
 */
export function renameGroup(
  principals: PrincipalRepository,
  id: PrincipalId,
  name: string,
): PrincipalResult {
  if (isSystemGroup(id)) return reject('system-group-immutable');

  const target = principals.findById(id);
  if (target === undefined) return reject('unknown-principal');
  if (target.kind !== 'group') return reject('not-a-group');

  principals.rename(id, name);
  return ok;
}

/**
 * 시스템 그룹은 삭제할 수 없다 (`CON-PRINCIPAL-002` AC-1 · AC-2).
 *
 * 슈퍼유저 그룹이 사라지면 슈퍼유저 판정의 정본이 사라지고
 * (`DR-PRINCIPAL-001`), default 그룹이 사라지면 모든 사용자가 갖고 있던
 * 기본 권한이 한 번에 없어진다.
 */
export function removeGroup(principals: PrincipalRepository, id: PrincipalId): PrincipalResult {
  if (isSystemGroup(id)) return reject('system-group-immutable');

  const target = principals.findById(id);
  if (target === undefined) return reject('unknown-principal');
  if (target.kind !== 'group') return reject('not-a-group');

  principals.removeGroup(id);
  return ok;
}

/**
 * 그룹에 멤버를 더한다. 멤버는 사용자만이다 (`DR-PRINCIPAL-002` AC-1).
 *
 * 저장소도 같은 것을 막지만(트리거), 여기서 먼저 값으로 거절하는 이유는
 * 예측 가능한 분기를 예외로 흘리지 않기 위해서다 — 트리거는 저장소를
 * 직접 만지는 경로에 대한 마지막 방벽이다.
 */
export function addGroupMember(
  principals: PrincipalRepository,
  groupId: PrincipalId,
  memberId: PrincipalId,
): PrincipalResult {
  const group = principals.findById(groupId);
  if (group === undefined) return reject('unknown-principal');
  if (group.kind !== 'group') return reject('not-a-group');

  const member = principals.findById(memberId);
  if (member === undefined) return reject('unknown-principal');
  if (member.kind !== 'user') return reject('member-must-be-user');

  principals.addMember(groupId, memberId);
  return ok;
}

/**
 * 이 조작이 슈퍼유저 바닥을 무너뜨리는가 (`SEC-AUTH-016`).
 *
 * **결과 상태로 판정한다** (AC-5). 「멤버 제거」·「상태 전환」 같은 조작을
 * 열거하지 않는 이유가 그것이다 — 열거하면 열거되지 않은 경로가 조용히
 * 통과하고, 그 경로는 대개 나중에 추가된다.
 *
 * 세는 것은 **`active` 인 멤버**다 (AC-2~AC-4). 멤버 수만 보면 정지된
 * 슈퍼유저가 바닥을 떠받치는 것으로 읽혀, 아무도 들어올 수 없는 인스턴스가
 * 만들어진다.
 *
 * @param after 조작이 끝난 뒤의 상태를 흉내 내는 함수. 실제로 쓰기 전에
 *   그 결과를 세어 보는 것이 이 가드의 방식이다.
 */
function wouldEmptySuperusers(
  principals: PrincipalRepository,
  after: (id: PrincipalId) => { inGroup: boolean; status: PrincipalStatus | undefined },
): boolean {
  const members = principals.membersOf(SUPERUSER_GROUP_ID);

  const isActive = (status: PrincipalStatus | undefined) =>
    status !== undefined && canAuthenticate(status);

  const before = members.filter((id) => isActive(principals.findById(id)?.status)).length;

  // **이미 0명이면 이 조작이 0으로 만든 것이 아니다.** 그 상태를 막으면
  // 설치 전(슈퍼유저가 아직 없는) 인스턴스에서 모든 상태 변경이 잠긴다 —
  // 요구가 금지하는 것은 「0으로 **만드는**」 조작이다.
  if (before === 0) return false;

  const remaining = members.filter((id) => {
    const next = after(id);
    return next.inGroup && isActive(next.status);
  });

  return remaining.length === 0;
}

export interface GuardedStores {
  principals: PrincipalRepository;
  /** 정지가 세션도 함께 끊는다 — 남기면 「살아 있는 세션 목록」이 사실과 어긋난다. */
  sessions: SessionRepository;
}

/**
 * 그룹에서 멤버를 뺀다. 슈퍼유저 바닥을 무너뜨리면 거절한다.
 */
export function removeFromGroup(
  stores: GuardedStores,
  groupId: PrincipalId,
  userId: PrincipalId,
): PrincipalResult {
  if (
    groupId === SUPERUSER_GROUP_ID &&
    wouldEmptySuperusers(stores.principals, (id) => ({
      inGroup: id !== userId,
      status: stores.principals.findById(id)?.status,
    }))
  ) {
    return reject('last-active-superuser');
  }

  stores.principals.removeMember(groupId, userId);
  return ok;
}

/**
 * 계정 상태를 바꾼다. 슈퍼유저 바닥을 무너뜨리면 거절한다.
 *
 * `suspendUser` 와 나누지 않고 이것 하나를 둔다 — 상태를 바꾸는 자리가
 * 둘이면 한쪽만 가드를 갖게 되고, 가드 없는 쪽이 곧 우회 경로가 된다.
 */
export function setAccountStatus(
  stores: GuardedStores,
  userId: PrincipalId,
  status: PrincipalStatus,
): PrincipalResult {
  // 예약 주체는 **명시적으로** 거절한다 (`DR-AUDIT-001` AC-4 · AC-5).
  // 계정 행이 없어 `unknown-principal` 로 떨어지는 것에 기대면, 그 우연은
  // 언젠가 같은 ID 의 행이 생기는 순간 사라진다.
  if (isReservedActor(userId)) return reject('reserved-principal');

  const account = stores.principals.findById(userId);
  if (account === undefined) return reject('unknown-principal');

  if (
    wouldEmptySuperusers(stores.principals, (id) => ({
      inGroup: true,
      status: id === userId ? status : stores.principals.findById(id)?.status,
    }))
  ) {
    return reject('last-active-superuser');
  }

  stores.principals.setStatus(userId, status);

  // 열린 상태가 아니게 됐으면 그 계정의 세션을 함께 끊는다.
  // 인증 단계가 상태를 다시 보므로 판정은 이미 닫혀 있지만, 행을 남기면
  // 「살아 있는 세션」 목록이 사실과 어긋난다.
  if (!canAuthenticate(status)) stores.sessions.removeAllFor(userId);

  return ok;
}
