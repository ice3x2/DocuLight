import { actorFor, type AclStores } from '../acl/permission-service.js';
import { registerAccount } from '../auth/account-service.js';
import type { Clock } from '../auth/login-service.js';
import { addGroupMember } from '../principal/principal-service.js';
import { createWorkspaceAs } from '../workspace/create-workspace.js';
import type { GrantLevel } from '../../domain/acl/level.js';
import { newSecretToken, secretTokenEquals } from '../../domain/auth/secret-token.js';
import type { SignupMode } from '../../domain/auth/signup-mode.js';
import { canAuthenticate } from '../../domain/auth/account-gate.js';
import type { PasswordHasher } from '../../domain/ports/password-hasher.js';
import type { WorkspaceFiles } from '../../domain/ports/workspace-files.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import { SUPERUSER_GROUP_ID } from '../../domain/principal/system-groups.js';

/** 설치 토큰의 수명 (`SEC-AUTH-013` AC-1). */
export const INSTALL_TOKEN_MINUTES = 30;

/** 기본 워크스페이스에 대한 default 그룹의 초기 권한 (`SEC-AUTH-017` AC-1). */
export type DefaultGroupLevel = GrantLevel | 'none';

/**
 * 그 선택의 기본값 (`SEC-AUTH-017` AC-2).
 *
 * 화면이 아니라 여기 두는 이유는 기본값이 **요구사항**이기 때문이다 —
 * 화면에 두면 그 화면을 다시 만들 때 값이 갈리고, 갈린 사실을 아무도
 * 알아채지 못한다.
 */
export const DEFAULT_GROUP_LEVEL: DefaultGroupLevel = 'edit';

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
 * 토큰 검증으로 발급된 설치 세션 (`SEC-AUTH-015` AC-1).
 *
 * 토큰과 **따로** 두는 이유가 AC-2 다 — 이후 요청이 토큰 자체를 다시
 * 들고 오게 하면 그 값이 매 요청 네트워크를 오가고, 한 번만 쓰이도록
 * 설계된 값이 상시 자격증명이 된다.
 *
 * 토큰과 같은 수명을 쓴다. 세션이 토큰보다 오래 살면 만료된 토큰으로
 * 시작한 설치가 계속 진행되어 30분 제한이 무의미해진다.
 */
let liveInstallSession: { value: string; expiresAt: number } | null = null;

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
  // 새 토큰은 이전 세션도 죽인다 — 남기면 옛 토큰으로 시작한 설치가
  // 새 토큰이 나온 뒤에도 계속된다.
  liveInstallSession = null;

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

export type InstallSessionOutcome =
  | { ok: true; installSession: string }
  | { ok: false; rule: 'bad-token' };

/**
 * 토큰을 검증하고 설치 세션을 발급한다 (`SEC-AUTH-015` AC-1).
 *
 * 이 함수가 곧 「토큰 검증」 엔드포인트의 몸통이며, 허용목록 넷 중 하나가
 * 이것을 부른다.
 */
export function beginInstallSession(
  stores: InstallStores,
  presented: string,
): InstallSessionOutcome {
  if (!verifyInstallToken(stores, presented)) return { ok: false, rule: 'bad-token' };

  const value = newSecretToken();
  liveInstallSession = { value, expiresAt: liveToken?.expiresAt ?? 0 };

  return { ok: true, installSession: value };
}

/**
 * 이 설치 세션이 유효한가 (`SEC-AUTH-015` AC-2 · AC-4).
 *
 * 토큰 검증 이후의 **모든** 설치 요청이 이것을 지난다. 진입 시점에만
 * 검사하면 클라이언트가 단계 전환 상태를 조작해 다음 단계로 건너뛴다.
 */
export function requireInstallSession(stores: InstallStores, presented: string): boolean {
  if (liveInstallSession === null || presented.length === 0) return false;
  if (stores.clock().getTime() >= liveInstallSession.expiresAt) return false;

  return secretTokenEquals(presented, liveInstallSession.value);
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
  installSession: string,
  input: {
    superuserName: string;
    password: string;
    workspaceName: string;
    defaultGroupLevel: DefaultGroupLevel;
    signupMode: SignupMode;
  },
): Promise<InstallOutcome> {
  if (isInstalled(stores)) return { ok: false, rule: 'already-installed' };

  // **설치 세션을 요구한다** (`SEC-AUTH-015` AC-3). 토큰을 그대로 받지
  // 않는 이유는 그 값이 한 번만 쓰이도록 설계됐기 때문이다 — 커밋까지
  // 들고 다니게 하면 상시 자격증명이 된다.
  if (!requireInstallSession(stores, installSession)) return { ok: false, rule: 'bad-token' };

  const account = await registerAccount(stores, {
    name: input.superuserName,
    password: input.password,
    // 최초 슈퍼유저는 생성 즉시 `active` 다 (`SEC-AUTH-010` AC-4) —
    // 승인해 줄 사람이 아직 없으므로 `pending` 으로 태어나면 영원히 갇힌다.
    status: 'active',
  });
  if (!account.ok) return { ok: false, rule: 'empty-password' };

  // 편입도 기록한다 (`OBS-AUDIT-003` AC-2). 빠뜨리면 「누가 슈퍼유저가
  // 됐나」의 **최초** 사건만 이력에서 사라지고 그 뒤의 편입은 전부 남는다.
  // 행위자는 자기 자신이다 — 설치 시점에 다른 주체가 없다.
  addGroupMember(stores.principals, SUPERUSER_GROUP_ID, account.id, {
    audit: stores.audit,
    actor: account.id,
  });

  // 배우는 편입 **뒤에** 세운다 — `actorFor` 가 그 시점의 소속을 담으므로
  // 앞에 세우면 슈퍼유저가 아닌 배우가 워크스페이스를 만들려 든다.
  const installer = actorFor(stores.principals, account.id);

  // default 초기 권한도 **워크스페이스 생성이 부여한다** (`OBS-AUDIT-005`
  // AC-10). 여기서 저장소를 직접 만지면 같은 책임이 두 곳에 갈리고, 감사
  // 행을 남기는 쪽은 한 곳뿐이라 이쪽 부여만 조용히 무기록이 된다.
  const workspace = await createWorkspaceAs(
    { ...stores, files: stores.files },
    installer,
    {
      name: input.workspaceName,
      administratorId: account.id,
      ...(input.defaultGroupLevel === 'none' ? {} : { defaultGroupLevel: input.defaultGroupLevel }),
    },
  );
  if (!workspace.ok) return { ok: false, rule: 'workspace-failed' };

  stores.settings.set('signup-mode', input.signupMode);

  // 토큰과 세션이 **함께** 소진된다 — 슈퍼유저가 실제로 선 뒤다.
  // 세션만 남기면 그것이 설치를 다시 여는 두 번째 문이 된다.
  liveToken = null;
  liveInstallSession = null;

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
  liveInstallSession = null;
}
