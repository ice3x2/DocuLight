import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { isSystemGroup } from '../../domain/principal/system-groups.js';

/** 거절 사유. 예외가 아니라 값이다 — 예측 가능한 분기는 예외로 흘리지 않는다. */
export type PrincipalRule =
  | 'system-group-immutable'
  | 'member-must-be-user'
  | 'unknown-principal'
  | 'not-a-group';

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
 * 계정을 정지한다. **삭제가 아니다** (`CON-PRINCIPAL-003` AC-2).
 *
 * 레코드가 남으므로 그 계정을 행위자로 가리키는 감사 로그(AC-3)와 그 앞으로
 * 부여된 ACL 항목(AC-4)의 참조가 그대로 산다. 정지를 ACL 거부 항목으로
 * 표현하지 않는 것도 같은 이유다 — 그러면 합집합 모델이 깨진다
 * (`CON-ACL-002` AC-4).
 */
export function suspendUser(
  principals: PrincipalRepository,
  id: PrincipalId,
): PrincipalResult {
  const target = principals.findById(id);
  if (target === undefined) return reject('unknown-principal');

  principals.setStatus(id, 'suspended');
  return ok;
}
