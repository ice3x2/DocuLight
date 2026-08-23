import type { RosterGroup } from '../api/client.js';
import { PrincipalPicker } from './PrincipalPicker.js';

/**
 * 그룹 관리 (`FR-PRINCIPAL-001` AC-2).
 *
 * 시스템 그룹도 **감추지 않는다** — 감추면 슈퍼유저가 그 그룹의 멤버를 볼
 * 수 없고, 지우기 버튼만 빼면 왜 없는지 알 수 없다. 그렇다고 표시하고
 * 버튼을 두지 않는다 (`CON-PRINCIPAL-002`).
 *
 * 멤버 추가는 `PrincipalPicker` 를 쓴다 (`CON-PRINCIPAL-006` AC-1). 여기에
 * 자체 검색칸을 두면 열거 상한이 이 화면에서만 빠진다. 검색칸이 그룹마다
 * 서는 이유는 **어느 그룹에 넣는지**를 화면이 표현해야 하기 때문이다 —
 * 하나만 두면 대상 그룹이 어딘가 다른 상태에 숨는다.
 */
export function GroupRoster({
  groups = [],
  onRemove,
  onAddMember,
}: {
  groups?: readonly RosterGroup[];
  onRemove?: (groupId: string) => void;
  onAddMember?: (groupId: string, userId: string) => void;
}) {
  return (
    <table>
      <caption>그룹 관리</caption>
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col">멤버</th>
          <th scope="col">멤버 추가</th>
          <th scope="col">삭제</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <tr key={group.id}>
            <td>
              {group.name}
              {group.system ? <span data-testid="system-group">시스템 그룹</span> : null}
            </td>
            <td>{group.members.map((member) => member.name).join(', ')}</td>
            <td>
              <PrincipalPicker
                scope={`group:${group.id}`}
                onPick={(row) => onAddMember?.(group.id, row.id)}
              />
            </td>
            <td>
              {group.system ? null : (
                <button type="button" onClick={() => onRemove?.(group.id)}>
                  {group.name} 삭제
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
