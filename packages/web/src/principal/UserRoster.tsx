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

export function UserRoster({ users = [] }: { users?: readonly RosterUser[] }) {
  return (
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
  );
}
