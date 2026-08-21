import type { PrincipalStatus } from '../principal/principal.js';

/**
 * 계정이 가질 수 있는 상태 넷 (`SEC-AUTH-003` AC-1).
 *
 * `PrincipalStatus` 와 같은 값들이며 여기서 다시 열거하는 이유는 이 배열이
 * **런타임에 순회 가능한 형태**여야 하기 때문이다 — 타입은 컴파일 뒤에
 * 사라져 「넷이다」를 잴 수 없다.
 */
export const ACCOUNT_STATES: readonly PrincipalStatus[] = [
  'active',
  'pending',
  'suspended',
  'rejected',
];

/**
 * 인증을 통과할 수 있는가 (`SEC-AUTH-003` AC-2 · AC-3).
 *
 * **허용 목록이다.** 「막을 것을 열거」하면 다섯째 상태가 생겼을 때 그것이
 * 조용히 통과한다 — 새 상태는 대개 「아직 못 들어오는 상태」로 태어난다.
 *
 * 로그인과 토큰 인증이 **같은 함수**를 쓴다. 두 자리에 따로 두면 한쪽에만
 * 상태가 추가되고 다른 쪽이 뒤처진다 — 그 어긋남이 곧 정지된 계정의
 * PAT 가 사는 길이 된다(`SEC-AUTH-009`).
 */
export function canAuthenticate(status: PrincipalStatus): boolean {
  return status === 'active';
}

/**
 * 차단된 이유. 통과하는 상태에는 없다 (`FR-AUTH-001`).
 *
 * 세 문구를 하나로 합치지 않는 이유가 AC-4 다 — 「로그인할 수 없습니다」로
 * 합치면 승인을 기다리면 되는 사람과 관리자에게 문의해야 하는 사람이 같은
 * 화면을 보게 된다.
 *
 * 이 문구가 계정의 **존재**를 알려 준다는 점은 의도된 것이다. 세 상태는
 * 전부 본인이 그 계정을 만든 뒤의 상태이고, 그 사람에게 자기 계정의
 * 처지를 숨길 이유가 없다.
 */
export function blockedReason(status: PrincipalStatus): string | null {
  switch (status) {
    case 'active':
      return null;
    case 'pending':
      return '승인 대기 중';
    case 'suspended':
      return '계정이 정지됨';
    case 'rejected':
      return '가입이 거절됨';
  }
}
