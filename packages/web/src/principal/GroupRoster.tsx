import { useEffect, useRef, useState } from 'react';

import type { RosterGroup } from '../api/client.js';
import { PrincipalPicker } from './PrincipalPicker.js';
import './GroupRoster.css';

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
  onAddMember,
}: {
  groups?: readonly RosterGroup[];
  onRemove?: (groupId: string) => void;
  onAddMember?: (groupId: string, userId: string) => void;
}) {
  const [invalidGroup, setInvalidGroup] = useState<string | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const update = () => {
      const overflows = element.scrollWidth > element.clientWidth;
      setScrollable(overflows);
      const active = document.activeElement;
      if (overflows && active instanceof HTMLElement && element.contains(active)) {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const activeRect = active.getBoundingClientRect();
        const scrollRect = element.getBoundingClientRect();
        if (activeRect.right > scrollRect.right - 4) element.scrollLeft += activeRect.right - scrollRect.right + 4;
        if (activeRect.left < scrollRect.left + 4) element.scrollLeft -= scrollRect.left - activeRect.left + 4;
      }
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [groups, onAddMember]);

  return (
    <section data-group-roster>
      <div
        ref={scrollRef}
        data-group-table-scroll
        {...(scrollable ? { 'aria-label': '그룹 표 가로 스크롤', tabIndex: 0 } : {})}
      >
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
            {groups.length === 0 ? (
              <tr><td colSpan={4} data-group-empty>표시할 그룹 항목이 없습니다.</td></tr>
            ) : groups.map((group) => (
              <tr key={group.id} data-group-id={group.id}>
                <td data-group-name>
                  <span>{group.name}</span>
                  {group.system ? <span data-testid="system-group" data-system-group>시스템 그룹</span> : null}
                </td>
                <td>
                  {group.members.length === 0 ? (
                    <p data-group-help>제공된 멤버 항목이 없습니다.</p>
                  ) : (
                    <ul data-group-members>
                      {group.members.map((member) => <li key={member.id}>{member.name}</li>)}
                    </ul>
                  )}
                  {group.system ? <p data-group-help>시스템 그룹의 멤버십은 해당 관리 규칙을 따릅니다.</p> : null}
                </td>
                <td>
                  {onAddMember === undefined ? (
                    <p data-group-help>멤버 추가 기능을 사용할 수 없습니다.</p>
                  ) : (
                    <div role="region" aria-label={`${group.name}의 멤버 추가`} data-group-picker>
                      <PrincipalPicker
                        scope={`group:${group.id}`}
                        onPick={(row) => {
                          if (row.kind !== 'user') {
                            setInvalidGroup(group.id);
                            return;
                          }
                          setInvalidGroup(null);
                          onAddMember(group.id, row.id);
                        }}
                      />
                      {invalidGroup === group.id ? <p role="status" data-group-help>그룹은 멤버로 추가할 수 없습니다.</p> : null}
                    </div>
                  )}
                </td>
                <td data-group-delete>
                  {group.system ? (
                    <p data-group-help>시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다.</p>
                  ) : (
                    <>
                      <button type="button" aria-label={`${group.name} 삭제`} disabled>삭제</button>
                      <p data-group-help>삭제 확인 기능이 연결되지 않아 여기서 삭제할 수 없습니다.</p>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
