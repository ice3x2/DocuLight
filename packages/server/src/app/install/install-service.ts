import { actorFor, type AclStores } from '../acl/permission-service.js';
import { registerAccount } from '../auth/account-service.js';
import type { Clock } from '../auth/login-service.js';
import { createWorkspaceAs } from '../workspace/create-workspace.js';
import type { GrantLevel } from '../../domain/acl/level.js';
import { newSecretToken, secretTokenEquals } from '../../domain/auth/secret-token.js';
import type { SignupMode } from '../../domain/auth/signup-mode.js';
import { canAuthenticate } from '../../domain/auth/account-gate.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../domain/principal/system-groups.js';

/** 설치 토큰의 수명 (`SEC-AUTH-013` AC-1). */
export const INSTALL_TOKEN_MINUTES = 30;

/** 기본 워크스페이스에 대한 default 그룹의 초기 권한 (`SEC-AUTH-017` AC-1). */
export type DefaultGroupLevel = GrantLevel | 'none';

export interface InstallStores extends AclStores {
  passwords: PasswordHasher;
  files: WorkspaceFiles;
  clock: Clock;
  /** 콘솔에 한 줄 낸다. 함수로 받는 이유는 시험이 stdout 을 가로채지 않게 하기 위해서다. */
  announce: (line: string) => void;
}

/**
 * 살아 있는 설치 토큰. **프로세스 메모리에만 산다** (`SEC-AUTH-014` AC-6).
 *
 * DB 나 파일에 두지 않는 것이 「재기동이 유일한 복구 경로」(AC-7)를 만드는
 * 방법이다 — 어딘가에 남으면 그것을 읽는 경로가 곧 재발급 API 가 된다.
 *
 * 모듈 수준 상태를 두는 것은 대개 나쁘지만 여기서는 그것이 요구다: 이
 * 값의 수명이 **프로세스의 수명**이어야 한다.
 */
let liveToken: { value: string; expiresAt: number } | null = null;

/**
 * 새 설치 토큰을 만들어 콘솔에 낸다. **기동 경로가 부른다.**
 *
 * 요청을 받아 이것을 부르는 진입점을 두지 않는다 (`SEC-AUTH-014` AC-4) —
 * 두면 인증 없이 설치를 다시 여는 문이 된다.
 *
 * 다시 부르면 이전 값이 죽는다(AC-1) — 살아 있는 토큰은 언제나 하나다.
 */
export function mintInstallToken(stores: InstallStores): string {
  const value = newSecretToken();
  const expiresAt = stores.clock().getTime() + INSTALL_TOKEN_MINUTES * 60 * 1000;
  liveToken = { value, expiresAt };

  // 만료를 **절대시각**으로 낸다 (`SEC-AUTH-013` AC-3) — 「30분 뒤」는
  // 언제 출력됐는지를 모르면 쓸모가 없고, 로그를 나중에 읽는 사람은
  // 그 시점을 모른다.
  stores.announce(
    `설치 토큰: ${value}\n만료: ${new Date(expiresAt).toISOString()}`,
  );

  return value;
}

/** 살아 있고 만료되지 않은 토큰과 일치하는가 (`SEC-AUTH-012` AC-2). */
export function verifyInstallToken(stores: InstallStores, presented: string): boolean {
  if (liveToken === null || presented.length === 0) return false;
  if (stores.clock().getTime() >= liveToken.expiresAt) return false;

  return secretTokenEquals(presented, liveToken.value);
}

/**
 * 설치가 끝났는가 (`SEC-AUTH-010` AC-1 · AC-5).
 *
 * **`active` 인 슈퍼유저가 있는가**로 판정한다. 「멤버가 0명인가」만 보면
 * 정지된 슈퍼유저만 남은 인스턴스가 설치된 것으로 읽혀, 아무도 들어올 수
 * 없는 상태에서 설치 화면도 뜨지 않는다.
 */
export function isInstalled(stores: InstallStores): boolean {
  return stores.principals
    .membersOf(SUPERUSER_GROUP_ID)
    .some((id) => {
      const account = stores.principals.findById(id);
      return account !== undefined && canAuthenticate(account.status);
    });
}

export type InstallRule =
  | 'already-installed'
  | 'bad-token'
  | 'empty-password'
  | 'workspace-failed';

export type InstallOutcome =
  | { ok: true; superuserId: PrincipalId; workspaceId: string; warnings: string[] }
  | { ok: false; rule: InstallRule };

/**
 * 설치를 커밋한다 — 최초 슈퍼유저와 기본 워크스페이스를 함께 세운다.
 *
 * 토큰은 **이 함수가 성공할 때만** 소진된다 (`SEC-AUTH-012` AC-5). 실패가
 * 토큰을 태우면 오타 한 번에 서버를 재기동해야 한다(AC-3 위반).
 */
export async function commitInstall(
  stores: InstallStores,
  token: string,
  input: {
    superuserName: string;
    password: string;
    workspaceName: string;
    defaultGroupLevel: DefaultGroupLevel;
    signupMode: SignupMode;
  },
): Promise<InstallOutcome> {
  if (isInstalled(stores)) return { ok: false, rule: 'already-installed' };
  if (!verifyInstallToken(stores, token)) return { ok: false, rule: 'bad-token' };

  const account = await registerAccount(stores, {
    name: input.superuserName,
    password: input.password,
    // 최초 슈퍼유저는 생성 즉시 `active` 다 (`SEC-AUTH-010` AC-4) —
    // 승인해 줄 사람이 아직 없으므로 `pending` 으로 태어나면 영원히 갇힌다.
    status: 'active',
  });
  if (!account.ok) return { ok: false, rule: 'empty-password' };

  stores.principals.addMember(SUPERUSER_GROUP_ID, account.id);

  const installer = actorFor(stores.principals, account.id);
  const workspace = await createWorkspaceAs(
    { ...stores, files: stores.files },
    installer,
    { name: input.workspaceName, administratorId: account.id },
  );
  if (!workspace.ok) return { ok: false, rule: 'workspace-failed' };

  // default 그룹의 초기 권한 (`SEC-AUTH-017` AC-3). `없음` 은 항목을
  // **만들지 않는** 것이지 레벨이 아니다 — 「권한 없음」은 값이 아니라 부재다.
  if (input.defaultGroupLevel !== 'none') {
    stores.acl.grant({
      nodeId: workspace.workspace.id,
      principalId: DEFAULT_GROUP_ID,
      level: input.defaultGroupLevel,
      grantedBy: null,
    });
  }

  stores.settings.set('signup-mode', input.signupMode);

  // 토큰은 여기서 소진된다 — 슈퍼유저가 실제로 선 뒤다.
  liveToken = null;

  return {
    ok: true,
    superuserId: account.id,
    workspaceId: workspace.workspace.id,
    warnings: warningsFor(input.signupMode, input.defaultGroupLevel),
  };
}

/**
 * 조합 경고 (`SEC-AUTH-017` AC-4).
 *
 * 자유 가입과 `편집` 을 함께 고르면 **아무나 가입해서 아무거나 고칠 수
 * 있다.** 그 둘이 각각은 합리적인 선택이라 따로 보면 눈에 띄지 않는다.
 *
 * 다른 조합에는 붙이지 않는다 — 경고가 상시로 뜨면 아무도 읽지 않는다.
 */
function warningsFor(mode: SignupMode, level: DefaultGroupLevel): string[] {
  if (mode === 'open' && level === 'edit') {
    return [
      '자유 가입 모드에서 default 그룹에 편집을 주면 가입한 누구나 기본 워크스페이스의 문서를 고칠 수 있습니다.',
    ];
  }
  return [];
}

/** 시험이 프로세스 상태를 격리할 수 있게 하는 자리. 프로덕션 경로는 부르지 않는다. */
export function forgetInstallTokenForTest(): void {
  liveToken = null;
}
