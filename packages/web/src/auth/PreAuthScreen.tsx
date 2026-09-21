import { commitInstall, verifyInstallToken } from '../api/client.js';
import { Button } from '../components/ui/button.js';
import { InlineNotice } from '../components/ui/states.js';
import { CredentialForm } from './CredentialForm.js';
import { InstallWizard } from './InstallWizard.js';
import type { InstallInput } from './InstallWizard.js';

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
  onInstallVerify = verifyInstallToken,
  onInstallCommit = async (input) => { await commitInstall({ ...input }); },
  onInstallStart = () => window.location.assign('/'),
  notice,
}: {
  screen: PreAuthScreenId;
  onScreen?: (screen: PreAuthScreenId) => void;
  onLogin?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
  onSignup?: (input: { name: string; password: string }) => Promise<string | undefined | void>;
  onInstallVerify?: (token: string) => Promise<string>;
  onInstallCommit?: (input: InstallInput) => Promise<void>;
  onInstallStart?: () => void;
  notice?: string;
}) {
  const spec = PRE_AUTH_SCREENS.find((candidate) => candidate.id === screen)!;

  if (spec.id === 'install') {
    return (
      <main aria-label={spec.label} data-pre-auth={spec.id}>
        <h1>{spec.label}</h1>
        <InstallWizard
          onVerifyToken={onInstallVerify}
          onCommit={onInstallCommit}
          onStart={onInstallStart}
        />
      </main>
    );
  }

  const isLogin = spec.id === 'login';
  return (
    <main aria-label={spec.label} data-pre-auth={spec.id}>
      <section data-pre-auth-column>
        <div data-pre-auth-product>DocuLight</div>
        <h1>{spec.label}</h1>
        {notice === undefined ? null : <InlineNotice title={notice} />}
        <CredentialForm
          key={spec.id}
          formId={spec.id}
          submitLabel={isLogin ? '로그인' : '가입 신청'}
          pendingLabel={isLogin ? '로그인 중…' : '신청 중…'}
          passwordHint={isLogin ? 'current-password' : 'new-password'}
          {...(isLogin
            ? onLogin === undefined ? {} : { onSubmit: onLogin }
            : onSignup === undefined ? {} : { onSubmit: onSignup })}
          {...(isLogin
            ? {}
            : { successNotice: '가입 신청을 접수했습니다. 승인이 필요한 경우 슈퍼유저의 승인 후 로그인할 수 있습니다.' })}
        />
        {onScreen === undefined ? null : (
          <Button
            type="button"
            variant="secondary"
            data-pre-auth-alternate
            onClick={() => onScreen(isLogin ? 'signup' : 'login')}
          >
            {isLogin ? '가입 신청하기' : '로그인하기'}
          </Button>
        )}
      </section>
    </main>
  );
}
