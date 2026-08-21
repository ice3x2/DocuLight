import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalId, PrincipalStatus } from '../../domain/principal/principal.js';

/** 계정을 만들고 검증하는 데 필요한 것. */
export interface AccountStores {
  principals: PrincipalRepository;
  passwords: PasswordHasher;
}

export type AccountRule = 'name-taken' | 'empty-password';

export type AccountCreated = { ok: true; id: PrincipalId } | { ok: false; rule: AccountRule };

/**
 * 계정을 만든다.
 *
 * 상태를 **인자로 받는다**. 가입 모드마다 태어나는 상태가 다르기 때문이다
 * (`FR-AUTH-004`) — 자유 가입은 `active`, 승인 대기는 `pending`, 설치
 * 마법사의 최초 슈퍼유저는 `active`(`SEC-AUTH-010` AC-4). 기본값을 두면
 * 어느 모드가 그것을 물려받는지가 호출자마다 갈린다.
 *
 * `default` 그룹 소속은 여기서 붙이지 않는다 — 그것은 `active` 로
 * **전환되는 시점**의 일이고(`SEC-AUTH-004` AC-1), 여기서 하면 `pending`
 * 으로 태어난 계정이 그룹 ACL 을 미리 받는다(AC-2 위반).
 */
export async function registerAccount(
  stores: AccountStores,
  input: { name: string; password: string; status: PrincipalStatus },
): Promise<AccountCreated> {
  if (input.password.length === 0) {
    return { ok: false, rule: 'empty-password' };
  }

  // 같은 이름의 사용자가 이미 있으면 저장소의 유일 인덱스가 던진다.
  // 예측 가능한 분기이므로 먼저 값으로 답한다.
  if (stores.principals.list('user').some((p) => p.name === input.name)) {
    return { ok: false, rule: 'name-taken' };
  }

  const account = stores.principals.createUser(input.name);
  stores.principals.setStatus(account.id, input.status);
  stores.principals.setPasswordHash(account.id, await stores.passwords.hash(input.password));

  return { ok: true, id: account.id };
}
