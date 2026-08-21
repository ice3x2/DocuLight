import type { AclEntry } from '../acl/acl-entry.js';
import type { PermissionLevel } from '../acl/level.js';
import type { PrincipalId } from '../principal/principal.js';

/**
 * ACL 저장소의 경계. 도메인이 소유한다.
 *
 * **시간으로 항목을 거두는 메서드가 없다** (`CON-PRINCIPAL-005` AC-3).
 * 만료 칸을 두지 않은 것과 짝을 이룬다 — 칸이 없어도 「30일 지난 것 정리」
 * 같은 경로가 열려 있으면 같은 일이 벌어진다.
 *
 * **유효 권한을 돌려주는 메서드도 없다.** 그것은 저장소가 아니라 순수
 * 함수의 몫이다(`effectivePermission`) — 저장소가 답하기 시작하면 그 답을
 * 빠르게 하려는 압력이 곧 비정규화로 이어진다(`CON-ACL-001` AC-1).
 */
export interface AclRepository {
  /**
   * 부여한다. 같은 (노드, 주체, 레벨) 을 두 번 부여해도 항목은 하나다
   * (`DR-ACL-001` AC-4) — 합집합 모델에서 중복 항목은 결과를 바꾸지 못하고
   * 회수만 두 번 하게 만든다.
   */
  grant(grant: {
    nodeId: string;
    principalId: PrincipalId;
    level: PermissionLevel;
    grantedBy: PrincipalId | null;
  }): AclEntry;

  revoke(entryId: string): void;

  /**
   * 사슬 위 노드들에 걸린, 이 주체들의 항목 전부.
   *
   * 판정 한 번이 쓰는 **질의 하나**다 — 사슬 조회와 합쳐 요청당 2쿼리가
   * 된다(`CON-ACL-001` AC-4).
   */
  entriesFor(nodeIds: readonly string[], subjectIds: readonly PrincipalId[]): AclEntry[];

  /** 없으면 `undefined`. 회수가 실행자 레벨을 잴 노드를 알아내는 자리다. */
  findEntry(entryId: string): AclEntry | undefined;

  /** 한 노드에 걸린 항목 전부. 권한 화면과 감사가 쓴다. */
  entriesOn(nodeId: string): AclEntry[];

  /**
   * 여러 노드에 걸린 항목 전부 — 주체를 가리지 않는다.
   *
   * `entriesFor` 와 나눈 이유는 묻는 것이 다르기 때문이다. 저쪽은 「이
   * 주체가 무엇을 받았나」(판정), 이쪽은 「이 노드들에 누가 걸려 있나」
   * (부모 권한 가져오기·권한 화면). 한 메서드에 주체 인자를 선택으로 두면
   * 판정 쪽에서 그 인자를 빠뜨렸을 때 남의 항목까지 섞인다.
   */
  entriesOnAny(nodeIds: readonly string[]): AclEntry[];

  /**
   * 이 주체들이 **직접** 부여받은 노드들. pass-through 판정의 입력이다
   * (`SEC-ACL-005`).
   */
  grantedNodeIds(subjectIds: readonly PrincipalId[]): string[];
}
