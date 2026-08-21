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
    </main>
  );
}
