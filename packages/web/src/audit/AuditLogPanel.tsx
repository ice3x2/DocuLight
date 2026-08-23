import { useState } from 'react';

import type { AuditGroupBody, AuditViewBody, ReconciliationQueueBody } from '../api/client.js';

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
  queue,
}: {
  view?: AuditViewBody;
  /** 조작 필터의 현재 값. 빈 문자열이 「전체」다. */
  operation?: string;
  onOperation?: (operation: string) => void;
  /** 재조정 대기열 (`IR-AUDIT-002`). 이 패널의 **두 번째 화면**이다. */
  queue?: ReconciliationQueueBody;
}) {
  // 대기열을 이 패널 안에서 전환한다 (`IR-AUDIT-002` AC-1). 카테고리를
  // 하나 더 만들지 않는 이유는 `R24-a` 의 구역·카테고리 구성이 요구이기
  // 때문이고(AC-3 · AC-4), 감사 로그 표에 섞지 않는 이유는 한 표에 성질이
  // 다른 두 줄이 서면 조작 필터가 무엇을 거르는지 흐려지기 때문이다(AC-2).
  const [대기열보기, set대기열보기] = useState(false);
  // 두 화면 중 어느 쪽인가. 대기열이 오지 않았으면 전환 자체가 없다.
  const 대기열 = 대기열보기 ? queue : undefined;

  if (view === undefined) return null;

  return (
    <section>
      <h2>감사 로그</h2>

      {queue === undefined ? null : (
        <button type="button" onClick={() => set대기열보기((was) => !was)}>
          {대기열보기 ? '감사 로그' : '재조정 대기열'}
        </button>
      )}

      {대기열 === undefined ? (
        <>
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
                // 조작·행위자·시각으로 식별하지 않는다 — 묶음 경계가 상관
                // 키로 옮겨진 뒤(`IR-AUDIT-003` AC-8) 그 셋이 똑같은 두 묶음이
                // 정상적으로 생기고, 그러면 펼친 줄의 자리에 다른 조작의
                // 낱행이 그려진다.
                //
                // 상관 키를 쓰지 않는 것은 그 값이 응답에 오지 않기 때문이며
                // (AC-6), 첫 낱행의 id 로 충분하다 — 낱행은 묶음 하나에만
                // 속하므로 그 값이 곧 묶음의 유일한 이름이다.
                <AuditGroupRow key={group.rows[0]!.id} group={group} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <ReconciliationQueue queue={대기열} />
      )}
    </section>
  );
}

/**
 * 재조정 대기열 (`IR-AUDIT-002` · `SEC-AUDIT-007`).
 *
 * 미해소 항목만 온다 — 해소는 새 감사 행으로 남으므로(`REL-AUDIT-002`)
 * 해소된 것을 여기 다시 세우면 같은 사실이 두 곳에 서게 된다.
 */
function ReconciliationQueue({ queue }: { queue: ReconciliationQueueBody }) {
  if (queue.items.length === 0) {
    return <p data-testid="queue-empty">미해소 항목이 없습니다.</p>;
  }

  return (
    <ul>
      {queue.items.map((item) => (
        <li key={item.id} data-testid="queue-item">
          {item.type}
        </li>
      ))}
    </ul>
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
              {/* 대상 역할을 **보인다** (`SEC-AUDIT-001` AC-1 · AC-2) —
                  경계를 넘는 복사는 두 행이 모두 조작=복사라, 역할이 없으면
                  「나갔다」와 「들어왔다」가 화면에서 같아진다.
                  보이는 것과 축이 되는 것은 다르다 — 거르거나 정렬하거나
                  세는 자리는 두지 않는다 (`SEC-AUDIT-009` AC-3~AC-5). */}
              {row.targetRole === undefined ? null : (
                <span data-testid="audit-role">{row.targetRole === 'origin' ? '원본' : '사본'}</span>
              )}
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
