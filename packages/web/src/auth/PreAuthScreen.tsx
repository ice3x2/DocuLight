/**
 * 인증 전 화면 (`IR-AUTH-001`).
 *
 * **모달이 아니라 전체 화면이다.** 모달은 뒤에 무언가가 있다는 뜻이고,
 * 인증 전에는 뒤에 있을 것이 없다 — 셸을 깔아 두면 사용자가 로그인 전에
 * 트리와 탭의 껍데기를 보게 되고, 그것이 「내용이 없다」로 읽힌다.
 *
 * 좌하단 기어도 여기서는 서지 않는다(AC-5) — 설정은 누구의 것인지가 정해진
 * 뒤에야 뜻이 있는데, 인증 전에는 그 「누구」가 없다.
 */
import { commitInstall, verifyInstallToken } from '../api/client.js';
import { CredentialForm } from './CredentialForm.js';
import { InstallWizard } from './InstallWizard.js';

export type PreAuthScreenId = 'login' | 'signup' | 'install';

export interface PreAuthScreenSpec {
  id: PreAuthScreenId;
  label: string;
}

export const PRE_AUTH_SCREENS: readonly PreAuthScreenSpec[] = [
  { id: 'login', label: '로그인' },
  { id: 'signup', label: '가입 신청' },
  { id: 'install', label: '설치 마법사' },
];

export function PreAuthScreen({
  screen,
  onLogin,
  onSignup,
  onScreen,
}: {
  screen: PreAuthScreenId;
  /**
   * 다른 인증 전 화면으로 건너간다.
   *
   * 길이 없으면 가입 화면은 존재해도 아무도 닿지 못한다 — 인증 전에는
   * 주소를 아는 사람만 갈 수 있는데, 그 주소를 알 방법이 화면에 없다.
   */
  onScreen?: (screen: PreAuthScreenId) => void;
  /** 로그인을 시도한다 (`IR-AUTH-001` AC-1). 거절되면 그 사유 문장이 돌아온다. */
  onLogin?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
  /** 가입을 신청한다 (`IR-AUTH-001` AC-2 · `FR-AUTH-004` AC-5). */
  onSignup?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
}) {
  const spec = PRE_AUTH_SCREENS.find((candidate) => candidate.id === screen)!;

  return (
    <main aria-label={spec.label} data-pre-auth={spec.id}>
      <h1>{spec.label}</h1>
      {spec.id === 'login' ? (
        <CredentialForm
          submitLabel="로그인"
          passwordHint="current-password"
          {...(onLogin === undefined ? {} : { onSubmit: onLogin })}
        />
      ) : null}
      {spec.id === 'login' && onScreen !== undefined ? (
        <button type="button" onClick={() => onScreen('signup')}>
          가입 신청하기
        </button>
      ) : null}
      {spec.id === 'signup' && onScreen !== undefined ? (
        <button type="button" onClick={() => onScreen('login')}>
          로그인하기
        </button>
      ) : null}
      {spec.id === 'signup' ? (
        <CredentialForm
          submitLabel="가입 신청"
          passwordHint="new-password"
          // 같은 화면에 남으므로 무엇이 됐는지 말해 준다 — 아무 말도 없으면
          // 사용자는 신청이 나갔는지 알 수 없어 다시 누른다.
          successNotice="가입을 신청했습니다. 슈퍼유저의 승인을 기다려 주십시오."
          {...(onSignup === undefined ? {} : { onSubmit: onSignup })}
        />
      ) : null}
      {spec.id === 'install' ? (
        <InstallWizard
          onVerifyToken={verifyInstallToken}
          onCommit={async (input) => {
            await commitInstall({ ...input });
            // 설치가 끝나면 관문이 열린다 — 새로 받아야 할 것이 세션이므로
            // 화면을 다시 세운다.
            window.location.assign('/');
          }}
        />
      ) : null}
    </main>
  );
}
