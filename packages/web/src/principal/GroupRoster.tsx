import type { RosterGroup } from '../api/client.js';

/**
 * 그룹 관리 (`FR-PRINCIPAL-001` AC-2).
 *
 * 시스템 그룹도 **감추지 않는다** — 감추면 슈퍼유저가 그 그룹의 멤버를 볼
 * 수 없고, 지우기 버튼만 빼면 왜 없는지 알 수 없다. 그렇다고 표시하고
 * 버튼을 두지 않는다 (`CON-PRINCIPAL-002`).
 */
export function GroupRoster({
  groups = [],
  onRemove,
}: {
  groups?: readonly RosterGroup[];
  onRemove?: (groupId: string) => void;
}) {
  return (
    <table>
      <caption>그룹 관리</caption>
      <thead>
        <tr>
          <th scope="col">이름</th>
          <th scope="col">멤버</th>
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
