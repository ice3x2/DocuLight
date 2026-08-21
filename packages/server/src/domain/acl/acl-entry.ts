import type { PrincipalId } from '../principal/principal.js';
import type { PermissionLevel } from './level.js';

/**
 * ACL 항목 하나 — 주체 하나와 레벨 하나 (`DR-ACL-001` AC-2).
 *
 * 사용자 부여와 그룹 부여가 **같은 구조**로 기록된다 (AC-3) — `principalId`
 * 가 둘을 구별하지 않고 가리키므로, 네 종류(편집 사용자·보기 사용자·편집
 * 그룹·보기 그룹)는 두 축의 곱일 뿐 네 개의 스키마가 아니다 (AC-1).
 *
 * **거부 칸이 없다** (`CON-ACL-002` AC-2). 배제를 표현할 자리가 없으므로
 * 유효 권한이 합집합으로만 자라고, 그 위에서 단조·가환이 성립한다.
 *
 * **만료 칸이 없다** (`CON-PRINCIPAL-005` AC-2). 시간 경과만으로 권한이
 * 사라지면 판정이 시점에 의존하게 되어 같은 단조 구조가 무너진다.
 */
export interface AclEntry {
  id: string;

  /**
   * 부여 대상. 노드 ID 또는 **워크스페이스 ID** 다 — 관리 레벨이 워크스페이스
   * 계층에 걸리므로(`SEC-WORKSPACE-002` AC-4) 이 칸은 두 종류를 함께 받는다.
   * `001_init.sql` 이 여기에 외래키를 걸지 않은 이유가 그것이다.
   */
  nodeId: string;

  principalId: PrincipalId;

  level: PermissionLevel;

  /**
   * 부여자 (`SEC-ACL-009` AC-6).
   *
   * 편집 보유자가 회수할 수 있는 범위를 「자신이 부여한 것」으로 가르는
   * 근거이며(AC-5), 전파로 생긴 부여를 감사 로그에서 되짚는 실마리다
   * (`SEC-ACL-010` AC-3). 시스템이 자동으로 넣은 항목은 `null` 이다.
   */
  grantedBy: PrincipalId | null;
}
