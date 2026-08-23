import { useId, useState } from 'react';

import { PrincipalPicker } from '../principal/PrincipalPicker.js';
import { GrantConfirm, type GrantWarning } from '../acl/GrantConfirm.js';
import type { PrincipalRow } from '../api/client.js';

/** `default` 그룹의 초기 권한 (`FR-PRINCIPAL-007`). */
export type DefaultGroupLevel = 'none' | 'view' | 'edit';

const 레벨문구: Record<DefaultGroupLevel, string> = {
  none: '없음',
  view: '보기',
  edit: '편집',
};

/**
 * 워크스페이스 생성 폼 (`FR-PRINCIPAL-007` · `SEC-WORKSPACE-001`).
 *
 * **기본값이 `없음` 이다** (AC-2). 반대로 두면 「깜빡한 것」과 「전원
 * 공개로 정한 것」이 같은 조작이 되고, 그 차이는 나중에 누가 문서를 열어
 * 봐야만 드러난다.
 *
 * 관리자를 **만들기 전에** 고른다 — 만들고 나서 지정하게 하면 관리자 없는
 * 워크스페이스가 그 사이에 존재하고, 그 상태에서 실패하면 아무도 손댈 수
 * 없는 워크스페이스가 영구히 남는다.
 */
export function NewWorkspaceForm({
  signupMode,
  onCreate,
}: {
  /** 인스턴스의 가입 모드. `open` 이면 `편집` 선택에 경고가 붙는다 (AC-5). */
  signupMode?: 'open' | 'approval' | 'invite-only';
  onCreate?: (input: { name: string; administratorId: string; defaultGroupLevel: DefaultGroupLevel }) => void;
}) {
  const formId = useId();
  const [이름, set이름] = useState('');
  const [관리자, set관리자] = useState<PrincipalRow | null>(null);
  const [레벨, set레벨] = useState<DefaultGroupLevel>('none');
  const [확인대기, set확인대기] = useState(false);

  // 사유가 하나뿐이라 화면이 판정할 수 있는 자리다 — 서버도 같은 규칙을
  // 들고 있고(`grantWarnings`), 실행 시점에 그쪽이 정본이다. 여기서 미리
  // 보이는 것은 고르는 순간 알려 주기 위해서다.
  const 경고: GrantWarning[] = 레벨 === 'edit' && signupMode === 'open' ? ['open-signup-edit'] : [];

  const 만들기 = () => {
    if (관리자 === null) return;
    onCreate?.({ name: 이름, administratorId: 관리자.id, defaultGroupLevel: 레벨 });
    set확인대기(false);
  };

  return (
    <form
      aria-label="새 워크스페이스"
      onSubmit={(event) => {
        event.preventDefault();
        if (경고.length > 0) {
          set확인대기(true);
          return;
        }
        만들기();
      }}
    >
      <label htmlFor={`${formId}-name`}>이름</label>
      <input id={`${formId}-name`} value={이름} onChange={(event) => set이름(event.target.value)} />

      <label htmlFor={`${formId}-admin`}>워크스페이스 관리자</label>
      {/* 아직 워크스페이스가 없으므로 스코프가 노드일 수 없다 — 이 조작을
          실행할 수 있는 것은 슈퍼유저뿐이고(`SEC-WORKSPACE-001`), 그
          자격이 곧 그룹 스코프의 자격이다 (`R162`). */}
      <PrincipalPicker scope="group:superuser" onPick={set관리자} />

      <label htmlFor={`${formId}-level`}>기본 그룹 초기 권한</label>
      <select
        id={`${formId}-level`}
        value={레벨}
        onChange={(event) => set레벨(event.target.value as DefaultGroupLevel)}
      >
        {(['none', 'view', 'edit'] as const).map((one) => (
          <option key={one} value={one}>
            {레벨문구[one]}
          </option>
        ))}
      </select>

      <button type="submit" disabled={관리자 === null}>
        만들기
      </button>

      {확인대기 ? (
        <GrantConfirm warnings={경고} onConfirm={만들기} onCancel={() => set확인대기(false)} />
      ) : null}
    </form>
  );
}
