/**
 * 주체 — 사용자와 그룹. 둘을 한 종류로 다루는 이유는 ACL 이 둘을 구별하지
 * 않고 가리키기 때문이다(`CON-PRINCIPAL-001` AC-3 — 그룹 전용 권한 축이
 * 없다). 축이 하나면 판정도 한 자리에서 끝난다.
 */
export type PrincipalId = string;

export type PrincipalKind = 'user' | 'group';

/**
 * 계정 상태. **삭제가 없다** (`CON-PRINCIPAL-003` AC-1) — 지운 계정을
 * 가리키는 감사 로그와 ACL 항목이 고아가 되기 때문이다.
 *
 * `pending`·`rejected` 는 가입 승인 흐름의 자리이며 그 흐름 자체는 뒤
 * wave 가 소유한다. 여기서는 열거만 고정한다.
 */
export type PrincipalStatus = 'pending' | 'active' | 'suspended' | 'rejected';

/**
 * 사용자와 그룹이 **같은 칸**을 갖는다 (`CON-PRINCIPAL-001` AC-2 · AC-3).
 *
 * 등급 칸도 슈퍼유저 플래그 칸도 없다 (`DR-PRINCIPAL-001` AC-2) — 두면
 * 그룹 멤버십과 갈리고, 갈린 값은 아무도 눈치채지 못한다.
 */
export interface PrincipalRecord {
  id: PrincipalId;
  kind: PrincipalKind;
  name: string;
  status: PrincipalStatus;
}
