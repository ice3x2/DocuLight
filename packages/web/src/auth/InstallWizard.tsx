import { useId, useState } from 'react';

import { ApiError } from '../api/client.js';
import { GrantWarningList, type GrantWarning } from '../acl/GrantConfirm.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { 레벨문구, type DefaultGroupLevel } from '../workspace/NewWorkspaceForm.js';

/**
 * 가입 모드 셋 (`FR-AUTH-004`).
 *
 * **서버 `domain/auth/signup-mode.ts` 의 복제다.** 패키지가 갈려 import 할
 * 수 없으므로 여기 다시 적으며, 그 사실을 적어 두어야 한쪽만 바뀐 날 이
 * 줄이 의심 대상이 된다. 값은 아래 문구 사전 하나에서만 열거한다.
 */
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

/**
 * 설치가 고르는 초기 권한의 기본값 (`SEC-AUTH-017` AC-2).
 *
 * **서버의 `DEFAULT_GROUP_LEVEL` 과 값이 같아야 하는 복제다.** 패키지가
 * 갈려 있어 import 할 수 없으므로 여기 다시 적는다 — 그 사실을 숨기지 않고
 * 적어 두어야, 한쪽만 바뀐 날 이 줄이 의심 대상이 된다.
 */
export const DEFAULT_GROUP_LEVEL: DefaultGroupLevel = 'edit';

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
/**
 * 거절 사유별 안내.
 *
 * 라우트가 정보 노출을 감수하고 `rule` 을 내주기로 한 이유가 *「사유가
 * 없으면 사용자가 무엇을 고칠지 모른다」* 였다. 그 값을 화면이 버리면 그
 * 결정이 아무 효용도 만들지 못하고 서로 다른 실패가 한 문장으로 접힌다.
 */
const 사유문구: Record<string, string> = {
  'bad-token': '설치 토큰이 올바르지 않습니다. 서버 콘솔의 값을 다시 확인하십시오.',
  'empty-password': '비밀번호를 입력하십시오.',
  'unknown-choice': '가입 모드나 초기 권한 값이 올바르지 않습니다.',
  'bad-field': '이름 · 비밀번호 · 워크스페이스 이름은 글자로 넣어 주십시오.',
  'already-installed': '이미 설치가 끝난 인스턴스입니다.',
  'commit-in-flight': '설치가 이미 진행 중입니다. 잠시 뒤 다시 확인하십시오.',
  'workspace-failed': '기본 워크스페이스를 만들지 못했습니다. 서버 로그를 확인하십시오.',
};

const 일반사유 = '설치를 마치지 못했습니다. 입력을 확인하고 다시 시도하십시오.';

const 사유로 = (error: unknown) => {
  const rule = error instanceof ApiError ? error.detail?.rule : undefined;
  return (rule === undefined ? undefined : 사유문구[rule]) ?? 일반사유;
};

export function InstallWizard({
  onVerifyToken,
  onCommit,
}: {
  /**
   * 토큰을 검증하고 설치 세션을 돌려준다. 거절하면 던진다.
   *
   * **선택이 아니다** — 없으면 버튼이 아무 일도 하지 않는 폼이 조용히
   * 성립하고, 타입 검사도 런타임도 그것을 알리지 않는다.
   */
  onVerifyToken: (token: string) => Promise<string>;
  onCommit: (input: InstallInput) => Promise<void>;
}) {
  const formId = useId();
  const [토큰, set토큰] = useState('');
  const [이름, set이름] = useState('');
  const [비밀번호, set비밀번호] = useState('');
  const [워크스페이스, set워크스페이스] = useState('');
  const [레벨, set레벨] = useState<DefaultGroupLevel>(DEFAULT_GROUP_LEVEL);
  const [가입모드, set가입모드] = useState<SignupMode>('approval');
  const [세션, set세션] = useState<string | null>(null);
  const [사유, set사유] = useState<string | null>(null);
  /**
   * 어느 칸이 틀렸는가.
   *
   * 사유 문구와 **따로** 둔다 — 하나로 두면 커밋 실패에도 설치 토큰 칸이
   * invalid 로 통보된다. 화면에는 「비밀번호를 입력하십시오」가 뜨는데
   * 보조기술에는 토큰 칸이 틀렸다고 들리고, 그때 사용자는 표식을 믿어
   * 맞게 넣은 토큰을 다시 친다.
   */
  const [틀린칸, set틀린칸] = useState<'token' | 'password' | null>(null);

  // 서버도 같은 규칙을 들고 있고 실행 시점에 그쪽이 정본이다. 여기서
  // 미리 보이는 것은 고르는 순간 알려 주기 위해서다.
  const 경고: GrantWarning[] = 레벨 === 'edit' && 가입모드 === 'open' ? ['open-signup-edit'] : [];

  const 제출 = async () => {
    set사유(null);
    set틀린칸(null);
    try {
      // **토큰 검증이 먼저다.** 관문을 먼저 세우고 검증을 뒤에 두면 틀린
      // 토큰으로도 확인 다이얼로그가 뜨고, 그 다이얼로그가 「곧 설치된다」로
      // 읽힌다.
      set세션(await onVerifyToken(토큰));
    } catch {
      // 거절해도 화면을 잠그지 않는다 (`SEC-AUTH-012` AC-3) — 오타 한 번에
      // 서버를 재기동해야 하는 상태가 되면 안 된다.
      //
      // **여기서는 사유 사전을 쓰지 않는다.** 토큰 검증은 틀린 토큰과 없는
      // 토큰에 같은 빈 본문을 주므로(오라클을 만들지 않으려는 결정) 실을
      // `rule` 자체가 없고, 이 단계의 실패 의미는 하나뿐이다.
      set사유(사유문구['bad-token']!);
      set틀린칸('token');
      set세션(null);
    }
  };

  const 설치 = () => {
    if (세션 === null) return;
    // **실패를 삼키지 않는다.** `void` 로 흘려보내면 400 이 처리되지 않은
    // 거절로 사라지고, 관문만 닫힌 채 사용자는 아무 답도 못 받는다 —
    // 되돌릴 수 없어 보이는 조작에서 그것이 가장 나쁘다.
    void (async () => {
      try {
        await onCommit({
          installSession: 세션,
          superuserName: 이름,
          password: 비밀번호,
          workspaceName: 워크스페이스,
          defaultGroupLevel: 레벨,
          signupMode: 가입모드,
        });
        set세션(null);
      } catch (error) {
        set사유(사유로(error));
        // 커밋 단계의 실패는 토큰과 무관하다 — 사유가 비밀번호를 지목할
        // 때만 그 칸을 표시하고, 그 밖에는 어느 칸도 표시하지 않는다.
        set틀린칸(
          (error instanceof ApiError ? error.detail?.rule : undefined) === 'empty-password'
            ? 'password'
            : null,
        );
        set세션(null);
      }
    })();
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
      <input
        id={`${formId}-token`}
        value={토큰}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={틀린칸 === 'token'}
        onChange={(e) => set토큰(e.target.value)}
      />

      <label htmlFor={`${formId}-name`}>슈퍼유저 이름</label>
      <input id={`${formId}-name`} value={이름} onChange={(e) => set이름(e.target.value)} />

      <label htmlFor={`${formId}-password`}>비밀번호</label>
      <input
        id={`${formId}-password`}
        type="password"
        aria-invalid={틀린칸 === 'password'}
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
        {/* 값을 리터럴로 다시 적지 않는다 — 사전 하나가 열거의 정본이다. */}
        {(Object.keys(모드문구) as SignupMode[]).map((one) => (
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
        {(Object.keys(레벨문구) as (keyof typeof 레벨문구)[]).map((one) => (
          <option key={one} value={one}>
            {레벨문구[one]}
          </option>
        ))}
      </select>

      <GrantWarningList warnings={경고} />
      {/* **보조기술에 통보한다.** 관문도 안 뜨고 문단만 조용히 붙으면
          스크린리더 사용자는 버튼이 죽었다고 읽는다 — 이 화면은 인증 전
          유일한 진입점이고 되돌릴 수 없는 조작을 다룬다. */}
      {사유 === null ? null : (
        <p role="alert" data-testid="install-error">
          {사유}
        </p>
      )}

      <button type="submit">설치</button>

      {/* 부여 내용을 **한 관문**에 함께 싣는다 (`FR-CONFIRM-019` AC-2).
          적용 하위 노드 수는 싣지 않는다 (AC-4) — 갓 만든 워크스페이스에는
          하위가 없어 0 이 실패로 읽힌다. 대신 지연 효과를 고지한다(AC-5). */}
      <ConfirmGate
        open={세션 !== null}
        grade="L2"
        title={`${워크스페이스 || '기본 워크스페이스'} 를 만들고 권한을 부여합니다`}
        onConfirm={설치}
        onCancel={() => set세션(null)}
      >
        {/* **지연 효과 고지를 붙이지 않는다.** 그 문구는 「지금은 아무 일도
            일어나지 않는다」인데 설치는 즉시·비가역이다 — 붙이면 관문이
            거짓을 말한다. `FR-CONFIRM-019` AC-5 는 워크스페이스 생성
            다이얼로그의 것이며, 그쪽은 부여가 실제로 나중에 발화한다. */}
        <p data-testid="install-immediate">
          확인하면 즉시 실행되며 되돌릴 수 없습니다.
        </p>
        <p data-testid="install-summary">
          슈퍼유저 {이름 || '-'} · 기본 그룹 초기 권한 {레벨문구[레벨]} · 가입 모드{' '}
          {모드문구[가입모드]}
        </p>
        <GrantWarningList warnings={경고} />
      </ConfirmGate>
    </form>
  );
}
