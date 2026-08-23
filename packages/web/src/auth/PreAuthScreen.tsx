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

export function PreAuthScreen({ screen }: { screen: PreAuthScreenId }) {
  const spec = PRE_AUTH_SCREENS.find((candidate) => candidate.id === screen)!;

  return (
    <main aria-label={spec.label} data-pre-auth={spec.id}>
      <h1>{spec.label}</h1>
      {/* 설치만 화면 본체가 있다 — 로그인·가입은 아직 자리표다. 그 둘의
          배선은 이 wave 의 범위 밖이며 조립 방벽 시험이 그 사실을 고정한다. */}
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
