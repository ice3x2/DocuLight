import { useEffect, useId, useRef, useState } from 'react';

import { ACL레벨이름 } from '../acl/level-name.js';
import type { AuditGroupBody, AuditViewBody, ReconciliationQueueBody } from '../api/client.js';

export type AuditReadState<T> =
  | { state: 'loading'; operations?: readonly string[] }
  | { state: 'ready'; data: T }
  | { state: 'error'; onRetry: () => void; operations?: readonly string[] };

/** 감사 로그와 재조정 대기열의 읽기 전용 화면 (`IR-AUDIT-001`~`IR-AUDIT-004`). */
export function AuditLogPanel({ audit, view, onOperation, operation, queueState, queue, contextKey }: {
  audit?: AuditReadState<AuditViewBody>;
  view?: AuditViewBody;
  operation?: string;
  onOperation?: (operation: string) => void;
  queueState?: AuditReadState<ReconciliationQueueBody>;
  queue?: ReconciliationQueueBody;
  contextKey?: string;
}) {
  const 감사읽기: AuditReadState<AuditViewBody> = audit ?? (view === undefined ? { state: 'loading' } : { state: 'ready', data: view });
  const 대기열읽기: AuditReadState<ReconciliationQueueBody> | undefined = queueState ?? (queue === undefined ? undefined : { state: 'ready', data: queue });
  const [대기열보기, set대기열보기] = useState(false);
  const [필터알림, set필터알림] = useState('');
  const [펼친묶음, set펼친묶음] = useState<ReadonlySet<string>>(() => new Set());
  const 제목 = useRef<HTMLHeadingElement>(null);
  const 패널 = useRef<HTMLElement>(null);
  const 초점묶음 = useRef<string | null>(null);
  const 이전묶음순서 = useRef<readonly string[]>([]);
  const 요약요소 = useRef(new Map<string, HTMLButtonElement>());
  const 이전문맥 = useRef(contextKey);

  // @req IR-AUDIT-001
  useEffect(() => {
    if (감사읽기.state !== 'ready' || !operation || 감사읽기.data.operations.includes(operation)) return;
    onOperation?.('');
    set필터알림('선택한 조작이 더 이상 없어 전체로 돌아갔습니다.');
  }, [감사읽기, onOperation, operation]);

  useEffect(() => set펼친묶음(new Set()), [operation]);

  useEffect(() => {
    const 문맥변경 = 이전문맥.current !== contextKey;
    이전문맥.current = contextKey;
    set펼친묶음(new Set());
    if (문맥변경 && 초점묶음.current !== null) requestAnimationFrame(() => 제목.current?.focus());
    if (문맥변경) 초점묶음.current = null;
  }, [contextKey]);

  // @req IR-AUDIT-003
  useEffect(() => {
    if (감사읽기.state !== 'ready') return;
    const 현재묶음순서 = 감사읽기.data.groups.map((group) => group.rows[0]!.id);
    const 남은식별자 = new Set(현재묶음순서);
    const 제거된초점 = 초점묶음.current !== null && !남은식별자.has(초점묶음.current);
    const 제거된위치 = 제거된초점 ? 이전묶음순서.current.indexOf(초점묶음.current!) : -1;
    const 다음초점 = 제거된위치 < 0
      ? 현재묶음순서[0]
      : 이전묶음순서.current.slice(제거된위치 + 1).find((id) => 남은식별자.has(id))
        ?? [...이전묶음순서.current.slice(0, 제거된위치)].reverse().find((id) => 남은식별자.has(id))
        ?? 현재묶음순서[0];
    이전묶음순서.current = 현재묶음순서;
    set펼친묶음((was) => {
      const next = new Set([...was].filter((id) => 남은식별자.has(id)));
      return next.size === was.size ? was : next;
    });
    if (제거된초점) requestAnimationFrame(() => {
      if (다음초점 !== undefined) 요약요소.current.get(다음초점)?.focus();
      else 제목.current?.focus();
      초점묶음.current = 다음초점 ?? null;
    });
  }, [감사읽기]);

  // @req IR-AUDIT-002
  const 화면전환 = () => {
    set대기열보기((was) => !was);
    requestAnimationFrame(() => 제목.current?.focus());
  };
  // @req IR-AUDIT-003
  const 펼침변경 = (id: string, value: boolean) => {
    set펼친묶음((was) => {
      const next = new Set(was);
      if (value) next.add(id); else next.delete(id);
      return next;
    });
  };

  return (
    <section ref={패널} data-audit-panel>
      <div data-audit-header>
        <h2 ref={제목} tabIndex={-1}>{대기열보기 ? '재조정 대기열' : '감사 로그'}</h2>
        {대기열읽기 === undefined ? null : (
          <button type="button" onClick={화면전환} data-audit-switch>
            {대기열보기 ? '감사 로그' : '재조정 대기열'}
          </button>
        )}
      </div>
      {대기열보기 && 대기열읽기 !== undefined ? (
        <QueueResult query={대기열읽기} />
      ) : (
        <AuditResult
          query={감사읽기}
          operation={operation ?? ''}
          onOperation={onOperation}
          notice={필터알림}
          expanded={펼친묶음}
          onExpanded={펼침변경}
          onGroupFocus={(id) => { 초점묶음.current = id; }}
          onGroupBlur={(id) => { if (초점묶음.current === id) 초점묶음.current = null; }}
          onSummaryRef={(id, element) => {
            if (element === null) 요약요소.current.delete(id);
            else 요약요소.current.set(id, element);
          }}
        />
      )}
    </section>
  );
}

// @req IR-AUDIT-001
function AuditResult({ query, operation, onOperation, notice, expanded, onExpanded, onGroupFocus, onGroupBlur, onSummaryRef }: {
  query: AuditReadState<AuditViewBody>;
  operation: string;
  onOperation?: (operation: string) => void;
  notice: string;
  expanded: ReadonlySet<string>;
  onExpanded: (id: string, value: boolean) => void;
  onGroupFocus: (id: string) => void;
  onGroupBlur: (id: string) => void;
  onSummaryRef: (id: string, element: HTMLButtonElement | null) => void;
}) {
  if (query.state === 'error' && query.operations === undefined) {
    return <div role="region" aria-label="감사 로그 결과" data-audit-state><p>감사 로그를 불러오지 못했습니다.</p><button type="button" onClick={query.onRetry}>다시 불러오기</button></div>;
  }
  if (query.state === 'loading' && query.operations === undefined) {
    return <div role="region" aria-label="감사 로그 결과" aria-busy="true" data-audit-state><p>감사 로그를 불러오는 중입니다.</p></div>;
  }

  const operations = query.state === 'ready' ? query.data.operations : (query.operations ?? []);

  return <>
    <div data-audit-filter>
      <label htmlFor="audit-operation">조작</label>
      <select id="audit-operation" value={operations.includes(operation) ? operation : ''} onChange={(event) => onOperation?.(event.target.value)}>
        <option value="">전체</option>
        {operations.map((one) => <option key={one} value={one}>{one}</option>)}
      </select>
      {notice === '' ? null : <p role="status" data-audit-notice>{notice}</p>}
    </div>
    <div role="region" aria-label="감사 로그 결과" data-audit-results>
      {query.state === 'error'
        ? <><p>감사 로그를 불러오지 못했습니다.</p><button type="button" onClick={query.onRetry}>다시 불러오기</button></>
        : query.state === 'loading' ? <p aria-busy="true">감사 로그를 불러오는 중입니다.</p> : query.data.groups.length === 0 ? <p data-testid="audit-empty">기록된 감사 행이 없습니다.</p> : (
        <ul data-audit-groups>{query.data.groups.map((group) => {
          const id = group.rows[0]!.id;
          return <AuditGroupRow
            key={id}
            group={group}
            expanded={expanded.has(id)}
            onExpanded={(value) => onExpanded(id, value)}
            onFocus={() => onGroupFocus(id)}
            onBlur={() => onGroupBlur(id)}
            onSummaryRef={(element) => onSummaryRef(id, element)}
          />;
        })}</ul>
      )}
    </div>
  </>;
}

// @req IR-AUDIT-002
function QueueResult({ query }: { query: AuditReadState<ReconciliationQueueBody> }) {
  if (query.state === 'error') {
    return <div role="region" aria-label="재조정 대기열 결과" data-audit-state><p>재조정 대기열을 불러오지 못했습니다.</p><button type="button" onClick={query.onRetry}>다시 불러오기</button></div>;
  }
  if (query.state === 'loading') {
    return <div role="region" aria-label="재조정 대기열 결과" aria-busy="true" data-audit-state><p>재조정 대기열을 불러오는 중입니다.</p></div>;
  }
  return <div role="region" aria-label="재조정 대기열 결과" data-audit-results><ReconciliationQueue queue={query.data} /></div>;
}

/** 재조정 항목은 현재 HTTP 계약이 준 id와 type만 읽기 전용으로 보인다. */
function ReconciliationQueue({ queue }: { queue: ReconciliationQueueBody }) {
  if (queue.items.length === 0) return <p data-testid="queue-empty">미해소 항목이 없습니다.</p>;
  return <ul data-reconciliation-list>{queue.items.map((item) => <li key={item.id} data-testid="queue-item">{item.type}</li>)}</ul>;
}

/** 서버가 준 한 묶음을 첫 낱행 ID의 안정된 React identity로 접고 편다. */
function AuditGroupRow({ group, expanded, onExpanded, onFocus, onBlur, onSummaryRef }: {
  group: AuditGroupBody;
  expanded: boolean;
  onExpanded: (value: boolean) => void;
  onFocus: () => void;
  onBlur: () => void;
  onSummaryRef: (element: HTMLButtonElement | null) => void;
}) {
  const detailId = useId();
  const summary = useRef<HTMLButtonElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  // @req IR-AUDIT-003
  const 접기전환 = () => {
    const 안에초점 = detail.current?.contains(document.activeElement) === true;
    onExpanded(!expanded);
    if (expanded && 안에초점) requestAnimationFrame(() => summary.current?.focus());
  };

  return <li
    data-testid="audit-group"
    onFocusCapture={onFocus}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onBlur(); }}
  >
    <button ref={(element) => { summary.current = element; onSummaryRef(element); }} type="button" onClick={접기전환} aria-expanded={expanded} aria-controls={detailId} data-audit-disclosure>
      <span aria-hidden="true" data-audit-chevron>{expanded ? '▾' : '▸'}</span>
      <span>{group.occurredAt}</span><span>{group.operation}</span><span>{group.actor}</span><span data-audit-count>{group.rows.length}건</span>
    </button>
    {expanded ? <div id={detailId} ref={detail} data-audit-detail>
      {group.rows.map((row) => <dl key={row.id} data-audit-row>
        <div><dt>시각</dt><dd>{row.occurredAt}</dd></div>
        <div><dt>조작</dt><dd>{row.operation}</dd></div>
        <div><dt>행위자</dt><dd>{row.actor}</dd></div>
        <div><dt>대상</dt><dd data-testid="audit-row">{row.target ?? '—'}
          {row.counterpart === null ? null : <span><b>상대 노드</b><span data-testid="audit-counterpart">{row.counterpart}</span></span>}
          {row.targetRole === undefined ? null : <span><b>대상 역할</b><span data-testid="audit-role">{row.targetRole === 'origin' ? '원본' : '사본'}</span></span>}
          {row.subject === undefined ? null : <span><b>주체</b><span data-testid="audit-subject">{row.subject}</span></span>}
          {row.level === undefined ? null : <span><b>레벨</b><span data-testid="audit-level">{ACL레벨이름(row.level)}</span></span>}
          {row.beforeValue === undefined ? null : <span><b>이전 값</b><span>{row.beforeValue}</span></span>}
          {row.afterValue === undefined ? null : <span><b>이후 값</b><span>{row.afterValue}</span></span>}
        </dd></div>
      </dl>)}
    </div> : null}
  </li>;
}
