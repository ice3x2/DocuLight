import { useState } from 'react';

import type { RosterUser, RosterUserStatus } from '../api/client.js';

/**
 * 슈퍼유저 전용 사용자 관리 명부 (`FR-PRINCIPAL-001` AC-1 · `FR-PRINCIPAL-009`).
 *
 * **`PrincipalPicker` 를 쓰지 않는다** (`R163`). 그 부품은 부여하는 제3자
 * 에게 함의를 감추는 중립어 표기를 쓰고 `rejected` 를 아예 받지 않는데,
 * 이 화면은 슈퍼유저가 그 상태를 **직접 설정하는** 자리라 보호할 제3자가
 * 없고 거절 이력을 봐야 한다.
 *
 * 그래서 문구 매핑이 둘이다. **이 둘을 하나로 합치려는 리팩터링은 두 조항
 * 중 하나를 반드시 깨뜨린다** — 합치면 그쪽이 `거절` 을 얻거나 이쪽이
 * `비활성` 을 얻는다.
 */
const LABEL: Record<RosterUserStatus, string> = {
  active: '활성',
  pending: '대기',
  suspended: '정지',
  rejected: '거절',
};

export function UserRoster({
  users = [],
  onRegister,
}: {
  users?: readonly RosterUser[];
  /**
   * 슈퍼유저 직접 등록 (`FR-AUTH-003`).
   *
   * **명부와 같은 부품이 담는다** — 자리를 가르면 그것이 곧 두 번째
   * 화면이고, `CON-SHELL-001` 이 진입점을 하나로 묶어 둔 이유가 무너진다.
   * 슈퍼유저 판정은 카테고리 관문이 이미 했으므로 여기서 다시 하지 않는다.
   */
  onRegister?: (input: { name: string; password: string }) => void;
}) {
  const [이름, set이름] = useState('');
  const [비밀번호, set비밀번호] = useState('');
  const 보낼수있다 = 이름 !== '' && 비밀번호 !== '';

  return (
    <>
    <table>
      <caption>사용자 관리</caption>
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col">상태</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id}>
            <td>{user.name}</td>
            {/* 네 상태를 그대로 — 뭉치면 어느 계정에 무엇을 해야 하는지
                판단할 수 없다 (`FR-PRINCIPAL-009` AC-4). */}
            <td data-testid="roster-status">{LABEL[user.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>

      {/* 등록 자리는 명부가 비어 있어도 선다 — 첫 사용자를 넣을 자리가
          없으면 그 인스턴스는 설치 마법사 밖에서 사람을 못 늘린다. */}
      <label htmlFor="roster-new-name">새 사용자 이름</label>
      <input id="roster-new-name" value={이름} onChange={(event) => set이름(event.target.value)} />

      {/* 가린다 — 어깨너머로 읽히면 그 계정이 그대로 열린다. */}
      <label htmlFor="roster-new-password">임시 비밀번호</label>
      <input
        id="roster-new-password"
        type="password"
        value={비밀번호}
        onChange={(event) => set비밀번호(event.target.value)}
      />

      <button
        type="button"
        // 서버가 거절할 요청을 보내지 않는다 — 거절을 눌러 보고 아는 것과
        // 누를 수 없는 것은 사용자에게 다른 일이다.
        disabled={!보낼수있다}
        onClick={() => {
          if (!보낼수있다) return;
          onRegister?.({ name: 이름, password: 비밀번호 });
          set이름('');
          set비밀번호('');
        }}
      >
        등록
      </button>
    </>
  );
}
