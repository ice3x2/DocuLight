import type { PrincipalId, PrincipalKind, PrincipalRecord, PrincipalStatus } from '../principal/principal.js';

/**
 * 주체 저장소의 경계. 도메인이 소유한다.
 *
 * **사용자를 지우는 메서드가 없다** (`CON-PRINCIPAL-003` AC-1). 열어 두고
 * 「안 쓴다」로 지키면 언젠가 누가 부른다 — 그 순간 그 계정을 행위자로
 * 가리키는 감사 로그와 그 앞으로 부여된 ACL 항목이 고아가 된다. 비활성화는
 * `setStatus(id, 'suspended')` 하나뿐이다.
 */
export interface PrincipalRepository {
  createUser(name: string): PrincipalRecord;
  createGroup(name: string): PrincipalRecord;

  /** 없으면 `undefined`. 예외를 분기로 쓰지 않는다. */
  findById(id: PrincipalId): PrincipalRecord | undefined;

  list(kind: PrincipalKind): PrincipalRecord[];

  rename(id: PrincipalId, name: string): void;

  /** 그룹만 지운다 — 사용자를 지우는 자리는 이 포트에 없다. */
  removeGroup(id: PrincipalId): void;

  setStatus(id: PrincipalId, status: PrincipalStatus): void;

  /**
   * 멤버는 사용자만이다 (`DR-PRINCIPAL-002` AC-1 · AC-2). 그룹을 넘기면
   * 저장소가 던진다 — 앱 계층의 검사만으로는 「칸이 없다」가 아니라
   * 「지금은 아무도 안 쓴다」에 그친다.
   */
  addMember(groupId: PrincipalId, userId: PrincipalId): void;

  removeMember(groupId: PrincipalId, userId: PrincipalId): void;

  /** 사용자가 **직접** 속한 그룹. 그룹의 그룹은 없다. */
  groupsOf(userId: PrincipalId): PrincipalId[];

  membersOf(groupId: PrincipalId): PrincipalId[];
}
