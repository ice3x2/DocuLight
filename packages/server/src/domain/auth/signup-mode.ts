/**
 * 가입 모드 3종 (`FR-AUTH-004` AC-1).
 *
 * - `open` — 자유 가입. 신청하면 곧바로 `active` 다.
 * - `approval` — 가입 요청 + 슈퍼유저 승인. `pending` 으로 태어난다(AC-5).
 * - `invite-only` — 슈퍼유저 직접 등록. 신청 경로 자체가 없다.
 *
 * 값이 셋으로 닫혀 있어야 하는 이유는 이 값이 **계정이 태어나는 상태**를
 * 정하기 때문이다 — 넷째 값이 생기면 그 상태가 어디서 정해지는지가
 * 호출자마다 갈린다.
 */
export type SignupMode = 'open' | 'approval' | 'invite-only';

export const SIGNUP_MODES: readonly SignupMode[] = ['open', 'approval', 'invite-only'];

/**
 * 이 모드에서 가입한 계정이 태어나는 상태.
 *
 * 한 자리에 두는 이유가 중요하다 — 가입 경로마다 이 판단을 다시 하면
 * 한쪽이 `active` 로 만들어 승인 절차를 통째로 건너뛴다.
 */
export function bornStatus(mode: SignupMode): 'active' | 'pending' {
  return mode === 'open' ? 'active' : 'pending';
}

/** 셀프 가입 경로가 열려 있는가. `invite-only` 는 슈퍼유저만 만든다. */
export function allowsSelfSignup(mode: SignupMode): boolean {
  return mode !== 'invite-only';
}
