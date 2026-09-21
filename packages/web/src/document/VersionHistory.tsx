import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthOwner, AuthPhase } from '../auth/auth-boundary.js';

import { listVersions, loadVersion, restoreVersion, type VersionRow } from '../api/client.js';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states.js';
import { Button } from '../components/ui/button.js';
import { MergeView } from './MergeView.js';

type LoadState = { state: 'blocked' } | { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: readonly VersionRow[] };
type CompareState =
  | { state: 'idle' }
  | { state: 'loading'; seq: number }
  | { state: 'error'; seq: number }
  | { state: 'ready'; seq: number; body: string };

const ALWAYS_ALLOWED = () => true;

/** @req IR-STORAGE-001 */
export function VersionHistory({ nodeId, currentBody, onRestored, allowsProtected = ALWAYS_ALLOWED, owner, authorizationPhase = 'active', authorizationEpoch = 0 }: {
  nodeId: string;
  currentBody: string;
  onRestored?: (seq: number) => void;
  allowsProtected?: () => boolean;
  owner?: AuthOwner;
  authorizationPhase?: AuthPhase;
  authorizationEpoch?: number;
}) {
  const [list, setList] = useState<LoadState>({ state: 'loading' });
  const [comparing, setComparing] = useState<CompareState>({ state: 'idle' });
  const [restoring, setRestoring] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<number | null>(null);
  const identity = useRef(0);
  const restorePending = useRef(false);
  const comparePending = useRef(new Map<number, ReturnType<typeof loadVersion>>());
  const root = useRef<HTMLElement>(null);
  const restoreRetry = useRef<HTMLButtonElement>(null);
  const isAllowed = useCallback(
    () => authorizationPhase === 'active' && allowsProtected(),
    [allowsProtected, authorizationEpoch, authorizationPhase, owner?.generation, owner?.userId],
  );

  useEffect(() => {
    if (restoreError !== null) restoreRetry.current?.focus();
  }, [restoreError]);

  const loadList = useCallback(() => {
    if (!isAllowed()) return;
    const request = ++identity.current;
    setList({ state: 'loading' });
    void listVersions(nodeId).then(
      (rows) => { if (request === identity.current && isAllowed()) setList({ state: 'ready', rows }); },
      () => { if (request === identity.current && isAllowed()) setList({ state: 'error' }); },
    );
  }, [isAllowed, nodeId]);

  useEffect(() => {
    identity.current += 1;
    setComparing({ state: 'idle' });
    comparePending.current.clear();
    restorePending.current = false;
    setRestoring(null);
    setRestoreError(null);
    if (!isAllowed()) {
      setList({ state: 'blocked' });
      return;
    }
    loadList();
    return () => { identity.current += 1; };
  }, [isAllowed, loadList]);

  const compare = useCallback((seq: number) => {
    if (!isAllowed()) return;
    const request = ++identity.current;
    setComparing({ state: 'loading', seq });
    let pending = comparePending.current.get(seq);
    if (!pending) {
      pending = loadVersion(nodeId, seq);
      comparePending.current.set(seq, pending);
      const clearPending = () => {
        if (comparePending.current.get(seq) === pending) comparePending.current.delete(seq);
      };
      void pending.then(clearPending, clearPending);
    }
    void pending.then(
      (version) => {
        if (request === identity.current && isAllowed()) setComparing({ state: 'ready', seq, body: version.body });
      },
      () => {
        if (request === identity.current && isAllowed()) setComparing({ state: 'error', seq });
      },
    );
  }, [isAllowed, nodeId]);

  const restore = useCallback(async (seq: number) => {
    if (restorePending.current || !isAllowed()) return;
    restorePending.current = true;
    setRestoring(seq);
    setRestoreError(null);
    try {
      await restoreVersion(nodeId, seq);
      if (!isAllowed()) return;
      root.current
        ?.closest('[data-document-area]')
        ?.querySelector<HTMLElement>('[data-document-header] button')
        ?.focus();
      onRestored?.(seq);
    } catch {
      if (isAllowed()) setRestoreError(seq);
    } finally {
      restorePending.current = false;
      setRestoring(null);
    }
  }, [isAllowed, nodeId, onRestored]);

  const selected = comparing.state === 'ready' ? comparing.seq : null;

  return (
    <section ref={root} data-version-history aria-label="버전 기록" aria-busy={list.state === 'loading' || undefined}>
      <h2 tabIndex={-1}>버전 기록</h2>
      {list.state === 'blocked' ? null : list.state === 'loading' ? (
        <LoadingState label="버전 기록을 불러오는 중입니다." />
      ) : list.state === 'error' ? (
        <ErrorState label="버전 기록 오류" title="버전 기록을 불러오지 못했습니다." onRetry={loadList} />
      ) : list.rows.length === 0 ? (
        <EmptyState title="보관된 버전이 없습니다." />
      ) : (
        <ul aria-label="버전 기록" data-version-list>
          {list.rows.map((row) => (
            <li key={row.seq} data-version-row data-selected={selected === row.seq || undefined}>
              <div data-version-meta>
                <strong>{row.seq}판</strong>
                <span>{row.author ? `작성자 ${row.author}` : '작성자 정보 없음'}</span>
                {row.createdAt ? <time dateTime={row.createdAt}>{row.createdAt}</time> : <span>시각 정보 없음</span>}
                {selected === row.seq && <span data-version-selected>비교 중</span>}
              </div>
              <div data-version-actions>
                <Button variant="secondary" aria-pressed={selected === row.seq} aria-busy={comparing.state === 'loading' && comparing.seq === row.seq || undefined} aria-disabled={comparing.state === 'loading' && comparing.seq === row.seq || undefined} onClick={() => compare(row.seq)}>
                  {comparing.state === 'loading' && comparing.seq === row.seq ? '불러오는 중…' : `${row.seq}판 비교`}
                </Button>
                <Button variant="ghost" loading={restoring === row.seq} disabled={restoring !== null} onClick={() => void restore(row.seq)}>
                  {restoring === row.seq ? '복원 중…' : `${row.seq}판 복원`}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div data-version-comparison aria-busy={comparing.state === 'loading' || undefined}>
        {comparing.state === 'idle' && <p>비교할 버전을 선택하세요.</p>}
        {comparing.state === 'loading' && <LoadingState label="선택한 버전을 불러오는 중입니다." />}
        {comparing.state === 'error' && <ErrorState label="버전 비교 오류" title="선택한 버전을 불러오지 못했습니다." onRetry={() => compare(comparing.seq)} />}
        {comparing.state === 'ready' && (
          <>
            <span role="status" className="dl-visually-hidden-source">{comparing.seq}판 비교 준비됨</span>
            <MergeView label="버전 비교" left={comparing.body} right={currentBody} mode="version" leftLabel={`보관된 ${comparing.seq}판`} rightLabel="현재 본문" />
            <div data-version-restore-footer>
              <span>현재 본문을 {comparing.seq}판으로 바꿉니다.</span>
              <Button variant="primary" loading={restoring === comparing.seq} disabled={restoring !== null} onClick={() => void restore(comparing.seq)}>
                {restoring === comparing.seq ? '복원 중…' : '이 버전으로 복원'}
              </Button>
            </div>
          </>
        )}
      </div>
      {restoreError !== null && (
        <div role="alert" data-version-restore-error>
          <span>버전을 복원하지 못했습니다.</span>
          <Button ref={restoreRetry} variant="secondary" onClick={() => void restore(restoreError)}>다시 시도</Button>
        </div>
      )}
    </section>
  );
}
