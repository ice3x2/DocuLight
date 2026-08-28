import { legacyAccountsOf } from '../../domain/migration/legacy-accounts.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/** 계정 이행이 필요로 하는 것. 주체 저장소 하나뿐이다. */
export interface AccountMigrationStores {
  principals: PrincipalRepository;
}

/**
 * 1.0 계정을 2.0 으로 옮긴다 (`MIG-AUTH-002` AC-1 · AC-2 · AC-3).
 *
 * **일회성 도구다** (`MIG-AUTH-001` AC-3). 제품 조립에 상시로 걸지 않으므로
 * 이 함수를 부르는 자리는 이행 진입점 하나뿐이다.
 *
 * 비밀번호를 다시 해시하지 않는다 — 1.0 의 `$2b$` 해시를 그대로 두는 것이
 * 사용자가 비밀번호를 새로 만들지 않아도 되는 이유이고(AC-3 · 원장 `R57`),
 * 평문이 없으니 다시 해시할 방법도 없다.
 *
 * `default` 그룹 소속을 여기서 심지 않는다 (AC-2). 그 소속은 멤버십 행이
 * 아니라 불변식이고(`subjectIdsOf`) `active` 계정에만 효력이 있으므로
 * (`R60-a`), 상태를 `active` 로 두는 것이 곧 소속을 성립시키는 것이다.
 * 행을 따로 심으면 같은 사실을 두 곳이 나눠 갖게 되어 한쪽만 어긋난다.
 *
 * **두 번 돌려도 계정이 늘지 않는다.** 이행은 한 번 하는 일이지만 도중에
 * 끊길 수 있고, 그때 다시 부르는 것이 정상 복구 경로다.
 *
 * @returns 이 호출이 새로 만든 계정의 ID. 이미 있던 이름은 빠진다.
 */
export function migrateAccounts(
  stores: AccountMigrationStores,
  legacyUsersJson: unknown,
): PrincipalId[] {
  const taken = new Set(stores.principals.list('user').map((one) => one.name));

  return legacyAccountsOf(legacyUsersJson).flatMap((account) => {
    if (taken.has(account.name)) return [];
    taken.add(account.name);

    const created = stores.principals.createUser(account.name);
    stores.principals.setStatus(created.id, 'active');
    stores.principals.setPasswordHash(created.id, account.passwordHash);

    return [created.id];
  });
}
