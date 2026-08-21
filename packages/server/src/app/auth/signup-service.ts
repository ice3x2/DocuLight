import { allowsSelfSignup, bornStatus, type SignupMode } from '../../domain/auth/signup-mode.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { SessionRepository } from '../../domain/ports/session-repository.js';
import type { SettingStore } from '../../domain/ports/setting-store.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { isSuperuser } from '../../domain/principal/subject.js';
import { setAccountStatus } from '../principal/principal-service.js';
import { registerAccount, type AccountRule } from './account-service.js';

/** 설정 키. 문자열을 두 곳에 적으면 한쪽 오타가 조용히 기본값을 쓴다. */
const SIGNUP_MODE_KEY = 'signup-mode';

/**
 * 설정된 적 없을 때의 가입 모드.
 *
 * 요구가 이 값을 정하지 않았으므로 선택의 근거를 적는다 — `open` 은 설정
 * 실수가 곧 공개 인스턴스가 되게 하고, `invite-only` 는 설치 직후 아무도
 * 신청할 수 없어 관리자가 그 사실을 모른 채 기다린다. 승인 모드는 신청은
 * 받되 사람이 한 번 보게 한다.
 */
const FALLBACK_MODE: SignupMode = 'approval';

export interface SignupStores {
  principals: PrincipalRepository;
  passwords: PasswordHasher;
  sessions: SessionRepository;
  settings: SettingStore;
}

export type SignupRule = AccountRule | 'needs-superuser' | 'signup-closed' | 'not-rejected' | 'unknown-account';

export type SignupOutcome = { ok: true } | { ok: false; rule: SignupRule };
export type SignupCreated = { ok: true; id: PrincipalId } | { ok: false; rule: SignupRule };

/** 슈퍼유저인가. 이 wave 의 인스턴스 조작이 전부 이 한 줄을 지난다. */
const isBoss = (stores: SignupStores, actor: PrincipalId) =>
  isSuperuser(stores.principals.groupsOf(actor));

export function currentSignupMode(stores: Pick<SignupStores, 'settings'>): SignupMode {
  const stored = stores.settings.get(SIGNUP_MODE_KEY);
  return stored === 'open' || stored === 'approval' || stored === 'invite-only'
    ? stored
    : FALLBACK_MODE;
}

/** 가입 모드를 바꾼다. 슈퍼유저만 (`FR-AUTH-004` AC-3). */
export function setSignupMode(
  stores: SignupStores,
  actor: PrincipalId,
  mode: SignupMode,
): SignupOutcome {
  if (!isBoss(stores, actor)) return { ok: false, rule: 'needs-superuser' };

  stores.settings.set(SIGNUP_MODE_KEY, mode);
  return { ok: true };
}

/**
 * 셀프 가입 신청 (`FR-AUTH-004` AC-5).
 *
 * 태어나는 상태를 여기서 판단하지 않고 `bornStatus` 에 묻는다 — 경로마다
 * 다시 판단하면 한쪽이 `active` 로 만들어 승인 절차를 통째로 건너뛴다.
 */
export async function requestSignup(
  stores: SignupStores,
  input: { name: string; password: string },
): Promise<SignupCreated> {
  const mode = currentSignupMode(stores);
  if (!allowsSelfSignup(mode)) return { ok: false, rule: 'signup-closed' };

  return registerAccount(stores, { ...input, status: bornStatus(mode) });
}

/**
 * 가입을 승인한다 (`SEC-AUTH-004` AC-1 · AC-4).
 *
 * `active` 로 바꾸는 것이 곧 default 그룹 소속이다 — 그 소속이 멤버십
 * 행이 아니라 불변식이기 때문이다(`subjectIdsOf`). 행으로 두면 승인이
 * 두 쓰기가 되고, 한쪽만 성공한 계정이 생긴다.
 */
export function approveAccount(
  stores: SignupStores,
  actor: PrincipalId,
  target: PrincipalId,
): SignupOutcome {
  if (!isBoss(stores, actor)) return { ok: false, rule: 'needs-superuser' };
  if (stores.principals.findById(target) === undefined) {
    return { ok: false, rule: 'unknown-account' };
  }

  // 상태 변경은 슈퍼유저 바닥 가드를 지나는 하나의 진입점을 쓴다.
  const changed = setAccountStatus(stores, target, 'active');
  return changed.ok ? { ok: true } : { ok: false, rule: 'unknown-account' };
}

/**
 * 거절된 계정을 재심사 대상으로 되돌린다 (`FR-AUTH-002`).
 *
 * **계정을 새로 만들지 않는다** (AC-4) — 새로 만들면 그 계정을 가리키던
 * 감사 로그가 옛 계정을 가리킨 채 남고, 거절 이력이 끊긴다.
 */
export function reopenRejected(
  stores: SignupStores,
  actor: PrincipalId,
  target: PrincipalId,
): SignupOutcome {
  if (!isBoss(stores, actor)) return { ok: false, rule: 'needs-superuser' };

  const account = stores.principals.findById(target);
  if (account === undefined) return { ok: false, rule: 'unknown-account' };
  if (account.status !== 'rejected') return { ok: false, rule: 'not-rejected' };

  const changed = setAccountStatus(stores, target, 'pending');
  return changed.ok ? { ok: true } : { ok: false, rule: 'unknown-account' };
}
