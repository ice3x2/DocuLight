/**
 * 노드에 **부여할 수 있는** 레벨. 둘뿐이다.
 *
 * `admin` 이 여기 없는 것이 `SEC-WORKSPACE-002` AC-1 · AC-2 를 타입으로
 * 못박는 방법이다 — 디렉토리·문서에 관리를 부여하는 호출은 런타임이 아니라
 * 컴파일에서 막힌다. 워크스페이스만 `PermissionLevel` 전부를 받는다(AC-4).
 */
export type GrantLevel = 'view' | 'edit';

/**
 * 유효 권한으로 나올 수 있는 레벨.
 *
 * `admin` 은 부여 축이 아니라 **상방 게이트**의 결과이기도 하다 — 슈퍼유저와
 * 워크스페이스 관리 보유자가 여기로 온다(`SEC-ACL-008`).
 */
export type PermissionLevel = GrantLevel | 'admin';

/**
 * 포함 관계의 **단 하나의 정의 자리** (`SEC-ACL-002`).
 *
 * 숫자가 아니라 함수로 두는 이유는 비교가 코드 여러 곳에 흩어지면 한쪽만
 * 바뀌기 때문이다. 순서가 바뀔 일이 있다면 여기 한 줄만 바뀐다.
 */
const RANK: Readonly<Record<PermissionLevel, number>> = { view: 1, edit: 2, admin: 3 };

/** `held` 를 가진 주체가 `required` 를 요구하는 조작을 통과하는가. */
export function permits(held: PermissionLevel, required: PermissionLevel): boolean {
  return RANK[held] >= RANK[required];
}

/**
 * 합집합의 결과 — 가장 강한 것 (`CON-ACL-002` AC-1).
 *
 * 최대값이므로 **가환이고 결합적이다**. 그래서 항목의 적용 순서가 결과를
 * 바꾸지 못하고(AC-3), 항목을 더하는 것이 결코 권한을 줄이지 못한다
 * (`SEC-ACL-003` AC-3).
 *
 * 빈 목록은 `null` 이다 — 「권한 없음」은 가장 약한 레벨이 아니라 레벨의
 * **부재**다. 값으로 두면 그 값을 가진 주체와 아무 부여도 못 받은 주체를
 * 구별할 수 없게 된다.
 */
export function strongest(levels: readonly PermissionLevel[]): PermissionLevel | null {
  let best: PermissionLevel | null = null;
  for (const level of levels) {
    if (best === null || RANK[level] > RANK[best]) best = level;
  }
  return best;
}
