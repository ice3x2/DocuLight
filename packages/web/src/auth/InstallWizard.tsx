import { useId, useState } from 'react';

import { GrantWarningList, type GrantWarning } from '../acl/GrantConfirm.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import type { DefaultGroupLevel } from '../workspace/NewWorkspaceForm.js';

/** 가입 모드 셋 (`FR-AUTH-004`). */
export type SignupMode = 'open' | 'approval' | 'invite-only';

/**
 * 설치가 서버에 보내는 것 전부.
 *
 * `installSession` 은 **토큰 검증이 준 값**이다 — 화면이 지어내지 않는다
 * (`SEC-AUTH-015` AC-2 · AC-4).
 */
export interface InstallInput {
  installSession: string;
  superuserName: string;
  password: string;
  workspaceName: string;
  defaultGroupLevel: DefaultGroupLevel;
  signupMode: SignupMode;
}

const 레벨문구: Record<DefaultGroupLevel, string> = {
  none: '없음',
  view: '보기',
  edit: '편집',
};

const 모드문구: Record<SignupMode, string> = {
  open: '자유 가입',
  approval: '승인 후 가입',
  'invite-only': '초대 전용',
};

/**
 * 설치 마법사 (`SEC-AUTH-010` · `SEC-AUTH-012` · `SEC-AUTH-015` ·
 * `SEC-AUTH-017` · `FR-CONFIRM-019` AC-6).
 *
 * **한 화면이다.** 단계를 나누지 않는 이유는 어느 요구도 단계 구성을 정하지
 * 않기 때문이고, 나누면 그 경계가 곧 「클라이언트가 조작하는 상태」가 된다 —
 * 서버는 설치 세션 하나로 판정하므로 화면이 단계를 들 이유가 없다.
 *
 * 초기 권한의 기본값은 `편집` 이다 (`SEC-AUTH-017` AC-2). 새 워크스페이스
 * 생성 폼의 기본값(`없음`)과 **다르다** — 그쪽은 이미 사람이 있는 인스턴스에
 * 워크스페이스를 더하는 조작이고, 이쪽은 그 인스턴스를 처음 세우는 조작이라
 * 아무도 못 들어오는 상태로 끝나면 안 된다.
 */
export function InstallWizard({
  onVerifyToken,
  onCommit,
}: {
  /** 토큰을 검증하고 설치 세션을 돌려준다. 거절하면 던진다. */
  onVerifyToken?: (token: string) => Promise<string>;
  onCommit?: (input: InstallInput) => Promise<void>;
}) {
  const formId = useId();
  const [토큰, set토큰] = useState('');
  const [이름, set이름] = useState('');
  const [비밀번호, set비밀번호] = useState('');
  const [워크스페이스, set워크스페이스] = useState('');
  const [레벨, set레벨] = useState<DefaultGroupLevel>('edit');
  const [가입모드, set가입모드] = useState<SignupMode>('approval');
  const [세션, set세션] = useState<string | null>(null);
  const [사유, set사유] = useState<string | null>(null);

  // 서버도 같은 규칙을 들고 있고 실행 시점에 그쪽이 정본이다. 여기서
  // 미리 보이는 것은 고르는 순간 알려 주기 위해서다.
  const 경고: GrantWarning[] = 레벨 === 'edit' && 가입모드 === 'open' ? ['open-signup-edit'] : [];

  const 제출 = async () => {
    set사유(null);
    try {
      // **토큰 검증이 먼저다.** 관문을 먼저 세우고 검증을 뒤에 두면 틀린
      // 토큰으로도 확인 다이얼로그가 뜨고, 그 다이얼로그가 「곧 설치된다」로
      // 읽힌다.
      const 받은세션 = (await onVerifyToken?.(토큰)) ?? null;
      set세션(받은세션);
    } catch {
      // 거절해도 화면을 잠그지 않는다 (`SEC-AUTH-012` AC-3) — 오타 한 번에
      // 서버를 재기동해야 하는 상태가 되면 안 된다.
      set사유('설치 토큰이 올바르지 않습니다. 서버 콘솔의 값을 다시 확인하십시오.');
      set세션(null);
    }
  };

  const 설치 = () => {
    if (세션 === null) return;
    void onCommit?.({
      installSession: 세션,
      superuserName: 이름,
      password: 비밀번호,
      workspaceName: 워크스페이스,
      defaultGroupLevel: 레벨,
      signupMode: 가입모드,
    });
    set세션(null);
  };

  return (
    <form
      aria-label="설치 마법사"
      onSubmit={(event) => {
        event.preventDefault();
        void 제출();
      }}
    >
      <label htmlFor={`${formId}-token`}>설치 토큰</label>
      {/* 값은 서버 콘솔에만 나온다 (`SEC-AUTH-014` AC-6) — 읽는 API 를 두면
          그것이 곧 인증 없이 설치를 다시 여는 문이 된다. */}
      <input id={`${formId}-token`} value={토큰} onChange={(e) => set토큰(e.target.value)} />

      <label htmlFor={`${formId}-name`}>슈퍼유저 이름</label>
      <input id={`${formId}-name`} value={이름} onChange={(e) => set이름(e.target.value)} />

      <label htmlFor={`${formId}-password`}>비밀번호</label>
      <input
        id={`${formId}-password`}
        type="password"
        value={비밀번호}
        onChange={(e) => set비밀번호(e.target.value)}
      />

      <label htmlFor={`${formId}-workspace`}>기본 워크스페이스 이름</label>
      <input
        id={`${formId}-workspace`}
        value={워크스페이스}
        onChange={(e) => set워크스페이스(e.target.value)}
      />

      <label htmlFor={`${formId}-signup`}>가입 모드</label>
      <select
        id={`${formId}-signup`}
        value={가입모드}
        onChange={(e) => set가입모드(e.target.value as SignupMode)}
      >
        {(['open', 'approval', 'invite-only'] as const).map((one) => (
          <option key={one} value={one}>
            {모드문구[one]}
          </option>
        ))}
      </select>

      <label htmlFor={`${formId}-level`}>기본 그룹 초기 권한</label>
      <select
        id={`${formId}-level`}
        value={레벨}
        onChange={(e) => set레벨(e.target.value as DefaultGroupLevel)}
      >
        {(['none', 'view', 'edit'] as const).map((one) => (
          <option key={one} value={one}>
            {레벨문구[one]}
          </option>
        ))}
      </select>

      <GrantWarningList warnings={경고} />
      {사유 === null ? null : <p data-testid="install-error">{사유}</p>}

      <button type="submit">설치</button>

      {/* 부여 내용을 **한 관문**에 함께 싣는다 (`FR-CONFIRM-019` AC-2).
          적용 하위 노드 수는 싣지 않는다 (AC-4) — 갓 만든 워크스페이스에는
          하위가 없어 0 이 실패로 읽힌다. 대신 지연 효과를 고지한다(AC-5). */}
      <ConfirmGate
        open={세션 !== null}
        grade="L2"
        title={`${워크스페이스 || '기본 워크스페이스'} 를 만들고 권한을 부여합니다`}
        delayedEffect
        onConfirm={설치}
        onCancel={() => set세션(null)}
      >
        <p data-testid="install-summary">
          슈퍼유저 {이름 || '-'} · 기본 그룹 초기 권한 {레벨문구[레벨]} · 가입 모드{' '}
          {모드문구[가입모드]}
        </p>
        <GrantWarningList warnings={경고} />
      </ConfirmGate>
    </form>
  );
}
