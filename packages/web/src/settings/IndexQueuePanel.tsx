import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '../components/ui/button.js';

export type IndexQueueErrorCode = 'read_failed' | 'parse_failed' | 'index_failed';
export interface IndexQueueSnapshot {
  counts: { pending: number; running: number; failed: number };
  total: number; limit: 100;
  items: readonly { nodeId: string; name: string; workspaceName: string; status: 'pending' | 'running' | 'failed'; requestedAt: string; errorCode?: IndexQueueErrorCode }[];
}
export type IndexQueueState = { state: 'loading' } | { state: 'ready'; snapshot: IndexQueueSnapshot } | { state: 'error' };

const statusLabel = { pending: '대기', running: '처리 중', failed: '실패' } as const;
const errorLabel = { read_failed: '파일 읽기 실패', parse_failed: '텍스트 추출 실패', index_failed: '색인 저장 실패' } as const;

export function IndexQueuePanel({ state, onRefresh, refreshRef, retryRef }: { state: IndexQueueState; onRefresh: (origin?: 'refresh' | 'retry') => void; refreshRef?: RefObject<HTMLButtonElement | null>; retryRef?: RefObject<HTMLButtonElement | null> }) {
  const headingId = useId();
  return <section data-index-queue aria-labelledby={headingId}>
    <header data-index-queue-header><div><h2 id={headingId} tabIndex={-1}>색인 대기열</h2><p>텍스트 검색 색인의 처리 상태입니다.</p></div>
      <Button ref={refreshRef} type="button" variant="secondary" disabled={state.state === 'loading'} onClick={() => onRefresh('refresh')}>새로고침</Button>
    </header>
    {state.state === 'loading' ? <p role="status">색인 상태를 불러오는 중입니다.</p> : state.state === 'error' ? <div role="alert"><p>색인 상태를 불러오지 못했습니다.</p><Button ref={retryRef} type="button" variant="secondary" onClick={() => onRefresh('retry')}>다시 불러오기</Button></div> : <>
      <div data-index-queue-summary aria-label="색인 작업 요약"><span>대기 {state.snapshot.counts.pending}</span><span>처리 중 {state.snapshot.counts.running}</span><span>실패 {state.snapshot.counts.failed}</span></div>
      {state.snapshot.total === 0 ? <p>현재 대기 중인 색인 작업이 없습니다.</p> : <>
        {state.snapshot.counts.failed > 0 ? <p data-index-queue-warning>실패한 작업은 해당 노드가 변경되거나 서버가 다시 시작될 때 다시 처리됩니다.</p> : null}
        <p data-index-queue-total>{state.snapshot.total > 100 ? `전체 ${state.snapshot.total}건 중 요청 시각 순으로 최대 100건을 표시합니다.` : `${state.snapshot.total}건`}</p>
        <div data-index-queue-table-region tabIndex={0} aria-label="색인 작업 목록"><table aria-label="색인 작업 목록"><thead><tr>{['이름','워크스페이스','상태','요청 시각','오류'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{state.snapshot.items.map((row) => <tr key={row.nodeId}><td>{row.name}</td><td>{row.workspaceName}</td><td>{statusLabel[row.status]}</td><td><time dateTime={row.requestedAt}>{new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.requestedAt))}</time></td><td>{row.status === 'failed' ? row.errorCode === undefined ? '처리 실패' : errorLabel[row.errorCode] : '—'}</td></tr>)}</tbody></table></div>
      </>}
    </>}
  </section>;
}

export function IndexQueueSurface({ load, contextKey = 'default' }: { load: () => Promise<IndexQueueSnapshot>; contextKey?: string }) {
  const [state, setState] = useState<IndexQueueState>({ state: 'loading' });
  const generation = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<'refresh' | 'retry' | null>(null);
  const activeContext = useRef(contextKey);
  useEffect(() => () => { mounted.current = false; generation.current += 1; }, []);
  useLayoutEffect(() => {
    if (activeContext.current === contextKey) return;
    activeContext.current = contextKey;
    generation.current += 1;
    inFlight.current = null;
    restoreFocus.current = null;
    setState({ state: 'loading' });
  }, [contextKey]);
  const refresh = useCallback((origin?: 'refresh' | 'retry') => {
    if (inFlight.current !== null) return;
    restoreFocus.current = origin === 'retry' || document.activeElement === retryRef.current
      ? 'retry'
      : origin === 'refresh' || document.activeElement === refreshRef.current
        ? 'refresh'
        : null;
    const mine = ++generation.current;
    setState({ state: 'loading' });
    const request = load().then(
      (snapshot) => { if (mounted.current && mine === generation.current) setState({ state: 'ready', snapshot }); },
      () => { if (mounted.current && mine === generation.current) setState({ state: 'error' }); },
    ).finally(() => { if (inFlight.current === request) inFlight.current = null; });
    inFlight.current = request;
  }, [load]);
  useEffect(() => { refresh(); }, [contextKey, refresh]);
  useLayoutEffect(() => {
    const target = restoreFocus.current;
    if (state.state === 'loading' || target === null) return;
    restoreFocus.current = null;
    if (state.state === 'error') retryRef.current?.focus();
    else refreshRef.current?.focus();
  }, [state.state]);
  return <IndexQueuePanel state={state} onRefresh={refresh} refreshRef={refreshRef} retryRef={retryRef} />;
}
