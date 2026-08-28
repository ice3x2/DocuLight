/**
 * 1.0 이 남긴 계정 데이터 중 이행이 읽는 것. 도메인이 소유한다.
 *
 * 1.0 의 사용자 레코드는 열셋을 담지만(`id` · `email` · `passwordHash` ·
 * `status` · `groupId` · `userKey` · `userKeyHash` · `createdAt` ·
 * `updatedAt` · `lastLoginAt` · `failedLoginAttempts` · `failedLoginCount` ·
 * `lockedUntil`) 여기 오는 것은 **둘뿐**이다.
 *
 * **담을 칸이 없다는 것이 곧 옮기지 않는다는 것이다** (`MIG-AUTH-002`
 * AC-4). `userKey` 와 `userKeyHash` 를 이 타입에 넣어 두고 「쓰지 않는다」로
 * 지키면 언젠가 누가 쓴다 — 그 순간 1.0 전역 API Key 가 2.0 에서 성립하는
 * 자격증명이 되고, 주체 없는 공유 비밀 하나가 ACL 판정을 통째로 우회한다
 * (원장 `R58`).
 *
 * `status` 도 오지 않는다. 이행 계정은 원래 상태와 무관하게 전원 `active`
 * 이므로(AC-1) 1.0 값을 실어 오면 그것을 무시하는 코드가 어딘가에 필요해지고,
 * 무시하는 값은 언젠가 무시되지 않는다.
 */
export interface LegacyAccount {
  /** 2.0 계정 이름. 1.0 의 `email` 이 그 자리에 온다. */
  name: string;

  /** 1.0 이 만든 bcrypt 해시(`$2b$12$`, 실측). 다시 해시하지 않고 그대로 둔다. */
  passwordHash: string;
}

/**
 * 1.0 `data/users.json` 을 파싱한 값에서 이행 대상을 골라낸다.
 *
 * **던지지 않는다.** 1.0 의 계정 파일은 이 저장소가 만들지 않은 데이터이고 형식이
 * 어긋난 행 하나로 이행 전체가 멈추면, 옮길 수 있었던 나머지 계정까지 함께
 * 잃는다. 읽을 수 없는 행은 값으로 빠진다.
 */
export function legacyAccountsOf(raw: unknown): LegacyAccount[] {
  const users = (raw as { users?: unknown } | null | undefined)?.users;
  if (!Array.isArray(users)) return [];

  return users.flatMap((one) => {
    const record = one as { email?: unknown; passwordHash?: unknown };
    if (typeof record.email !== 'string' || record.email === '') return [];
    if (typeof record.passwordHash !== 'string' || record.passwordHash === '') return [];
    return [{ name: record.email, passwordHash: record.passwordHash }];
  });
}
