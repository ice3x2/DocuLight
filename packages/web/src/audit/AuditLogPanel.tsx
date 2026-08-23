import { useState } from 'react';

import type { AuditGroupBody, AuditViewBody } from '../api/client.js';

/**
 * 감사 로그 (`R84`).
 *
 * 이름을 **감사 로그**로 부른다 (`CON-AUDIT-001` AC-4). 「감사 목록」이라는
 * 한정어 없는 지시어를 쓰지 않는다 — 제품에 그 이름으로 불릴 수 있는 것이
 * 셋이라(재조정 대기열 · 상속 끊김 노드 감사 목록 · 감사 로그) 한정어가
 * 빠지면 어느 것을 가리키는지 사람마다 다르게 읽는다.
 *
 * **표시는 묶음 접기이고 저장은 낱행이다** (`IR-AUDIT-003`). 접힌 줄을
 * 펼치면 낱행이 전부 보인다.
 */
export function AuditLogPanel({
  view,
  onOperation,
  operation,
}: {
  view?: AuditViewBody;
  /** 조작 필터의 현재 값. 빈 문자열이 「전체」다. */
  operation?: string;
  onOperation?: (operation: string) => void;
}) {
  if (view === undefined) return null;

  return (
    <section>
      <h2>감사 로그</h2>

      {/* 선택지가 **실제 기록 값**에서 온다 (`IR-AUDIT-001` AC-2) — 고정
          목록을 여기 적으면 새 조작이 처음 기록돼도 배포 전까지 나타나지
          않는다.

          상대 노드·대상 역할로 거르는 필터를 두지 않는다
          (`SEC-AUDIT-009` AC-2 · AC-3). 「외부로 나간 것만」 거르는 필터도
          없다 (`SEC-AUDIT-004` AC-2) — 그 필터의 결과 수가 곧 반출 건수다. */}
      <label htmlFor="audit-operation">조작</label>
      <select
        id="audit-operation"
        value={operation ?? ''}
        onChange={(event) => onOperation?.(event.target.value)}
      >
        <option value="">전체</option>
        {view.operations.map((one) => (
          <option key={one} value={one}>
            {one}
          </option>
        ))}
      </select>

      {view.groups.length === 0 ? (
        <p data-testid="audit-empty">기록된 감사 행이 없습니다.</p>
      ) : (
        <ul>
          {view.groups.map((group) => (
            <AuditGroupRow key={`${group.operation} ${group.actor} ${group.occurredAt}`} group={group} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * 접힌 한 줄. 펼치면 낱행이 보인다 (`IR-AUDIT-003` AC-2 · AC-3).
 *
 * 건수는 **열람자 스코프의 행 수 그 자체**다 (`SEC-AUDIT-011`) — 총계도
 * 분모도 「이 밖에 N건 더」도 없다. 그 차액이 곧 스코프 밖 행의 개수이기
 * 때문이다.
 */
function AuditGroupRow({ group }: { group: AuditGroupBody }) {
  const [펼침, set펼침] = useState(false);

  return (
    <li data-testid="audit-group">
      <button type="button" onClick={() => set펼침((was) => !was)}>
        {group.occurredAt} · {group.operation} · {group.actor} · {group.rows.length}건
      </button>

      {펼침 ? (
        <ul>
          {group.rows.map((row) => (
            <li key={row.id} data-testid="audit-row">
              <span>{row.target ?? '-'}</span>
              {/* 상대 노드는 서버가 이미 가려서 준다 — 화면이 가리면 API 를
                  직접 부르는 쪽에 원시 ID 가 그대로 나간다
                  (`SEC-AUDIT-008` AC-3). */}
              {row.counterpart === null ? null : <span data-testid="audit-counterpart">{row.counterpart}</span>}
              {row.beforeValue === undefined ? null : (
                <span>
                  {row.beforeValue} → {row.afterValue ?? '-'}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
