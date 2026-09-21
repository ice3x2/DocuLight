import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { BrokenInheritanceBody, RestoreInheritanceOutcome, RestoreInheritancePreview } from '../api/client.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import type { AuditQuery } from './BulkRevokePanel.js';

/**
 * 고립 노드의 문구 (`IR-ACL-001` AC-6 · `FR-ACL-005` AC-5).
 *
 * 「아무도 볼 수 없습니다」 라고 쓰지 않는다 — 이 목록을 보고 있는 요청자
 * 자신이 반례라 거짓 진술이 된다. 그리고 접근 가능 수치는 어느 노드에서도
 * 0 이 될 수 없으므로(상방 게이트가 언제나 닿는다) 그 사실을 문구가 함께
 * 밝힌다.
 */
const ISOLATED =
  '권한으로 접근할 수 있는 사람이 없습니다. 지금은 워크스페이스 관리자와 슈퍼유저만 볼 수 있습니다.';

/**
 * 상속이 끊긴 노드를 모아 본다 (`FR-ACL-005`).
 *
 * **`ACL 접근자` 를 쓰고 `접근 가능` 을 쓰지 않는다** (AC-4). 이 목록의
 * 목적이 「권한으로 도달할 수 있는 사람이 없는 노드」를 찾는 것이라, 상방
 * 게이트를 포함하는 지표를 쓰면 어느 행도 0 이 되지 않아 목적이 무너진다.
 */
export function InheritanceAuditPanel({
  query,
  contextKey,
  onLoadRestorePreview,
  onRestoreInheritance,
  onRefresh,
}: {
  query: AuditQuery<BrokenInheritanceBody>;
  contextKey?: string;
  onLoadRestorePreview?: (nodeId: string) => Promise<RestoreInheritancePreview>;
  onRestoreInheritance?: (nodeId: string, revision: string) => Promise<RestoreInheritanceOutcome>;
  onRefresh?: () => Promise<unknown>;
}) {
  const current = query;
  const [preview, setPreview] = useState<RestoreInheritancePreview | null>(null);
  const [previewOwner, setPreviewOwner] = useState<number | null>(null);
  const [loadingNode, setLoadingNode] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ role: 'status' | 'alert'; text: string } | null>(null);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const actionButtons = useRef(new Map<string, HTMLButtonElement>());
  const [focusAfterSuccess, setFocusAfterSuccess] = useState<{ nodeId: string; index: number } | null>(null);
  const previousContext = useRef(contextKey);
  const ownerGeneration = useRef(0);
  const renderedContext = useRef(contextKey);
  if (renderedContext.current !== contextKey) {
    renderedContext.current = contextKey;
    ownerGeneration.current += 1;
  }
  const visiblePreview = previewOwner === ownerGeneration.current ? preview : null;

  useEffect(() => {
    if (previousContext.current === contextKey) return;
    previousContext.current = contextKey;
    setPreview(null);
    setPreviewOwner(null);
    setLoadingNode(null);
    setNotice(null);
    setCompleted(new Set());
    setFocusAfterSuccess(null);
  }, [contextKey]);

  useEffect(() => () => { ownerGeneration.current += 1; }, []);

  useLayoutEffect(() => {
    if (focusAfterSuccess === null || current.state !== 'ready' || current.data.rows.some((row) => row.nodeId === focusAfterSuccess.nodeId)) return;
    const next = current.data.rows[focusAfterSuccess.index] ?? current.data.rows[focusAfterSuccess.index - 1];
    (next === undefined ? heading.current : actionButtons.current.get(next.nodeId))?.focus();
    setFocusAfterSuccess(null);
  }, [current, focusAfterSuccess]);

  const open = async (nodeId: string, button: HTMLButtonElement) => {
    if (onLoadRestorePreview === undefined || loadingNode !== null || completed.has(nodeId)) return;
    trigger.current = button;
    const generation = ownerGeneration.current;
    setLoadingNode(nodeId);
    setNotice(null);
    try {
      const loaded = await onLoadRestorePreview(nodeId);
      if (generation !== ownerGeneration.current) return;
      if (loaded.nodeId !== nodeId || (loaded.kind === 'directory' && loaded.applicableDescendants === null) || loaded.revision.length === 0) {
        throw new Error('incomplete preview');
      }
      setPreviewOwner(generation);
      setPreview(loaded);
    } catch {
      if (generation !== ownerGeneration.current) return;
      setNotice({ role: 'alert', text: '상속 복원 영향을 확인하지 못했습니다. 다시 시도하세요.' });
    } finally {
      if (generation === ownerGeneration.current) setLoadingNode(null);
    }
  };

  const execute = async () => {
    const accepted = visiblePreview;
    if (accepted === null || onLoadRestorePreview === undefined || onRestoreInheritance === undefined) return;
    const generation = ownerGeneration.current;
    let fresh: RestoreInheritancePreview;
    try {
      fresh = await onLoadRestorePreview(accepted.nodeId);
      if (generation !== ownerGeneration.current) return;
    } catch {
      if (generation !== ownerGeneration.current) return;
      setPreview(null);
      setNotice({ role: 'alert', text: '현재 영향을 다시 확인하지 못했습니다. 복원하지 않았습니다.' });
      return;
    }
    if (fresh.revision !== accepted.revision) {
      setPreview(null);
      setNotice({ role: 'alert', text: '영향이 변경되었습니다. 새 미리보기를 다시 열어 확인하세요.' });
      return;
    }
    const outcome = await onRestoreInheritance(accepted.nodeId, accepted.revision);
    if (generation !== ownerGeneration.current) return;
    setPreview(null);
    if (outcome.status === 'completed') {
      setCompleted((was) => new Set(was).add(accepted.nodeId));
      if (current.state === 'ready') setFocusAfterSuccess({ nodeId: accepted.nodeId, index: current.data.rows.findIndex((row) => row.nodeId === accepted.nodeId) });
      try {
        await onRefresh?.();
        if (generation !== ownerGeneration.current) return;
        setNotice({ role: 'status', text: '상속을 복원했습니다.' });
      } catch {
        if (generation !== ownerGeneration.current) return;
        setNotice({ role: 'status', text: '상속을 복원했지만 목록을 새로 불러오지 못했습니다. 목록만 다시 시도하세요.' });
      }
    } else if (outcome.status === 'unconfirmed') {
      setNotice({ role: 'alert', text: '요청 결과를 확인할 수 없습니다. 현재 상태를 새로 조회하세요.' });
      void onRefresh?.().catch(() => undefined);
    } else {
      setNotice({ role: 'alert', text: '상속을 복원하지 못했습니다. 새 미리보기를 확인하세요.' });
    }
  };

  if (current.state === 'idle') return <p>상속 끊김 감사를 아직 조회하지 않았습니다.</p>;
  if (current.state === 'loading') return <p role="status">상속 끊김을 확인하는 중…</p>;
  if (current.state === 'error') return <div role="alert"><p>상속 끊김을 확인하지 못했습니다.</p><button type="button" onClick={current.onRetry}>상속 감사 다시 시도</button></div>;
  if (current.data.rows.length === 0) return <><h3 ref={heading} tabIndex={-1} className="sr-only">상속 끊김 목록</h3>{notice === null ? null : notice.role === 'alert' ? <p role="alert">{notice.text}</p> : <p role="status">{notice.text}</p>}<p data-testid="broken-empty">상속이 끊긴 노드가 없습니다.</p></>;

  const rows = (items: RestoreInheritancePreview['retainedDirectAcl']) => items.length === 0
    ? <p>없음</p>
    : <ul>{items.map((row, index) => <li key={`${row.principalId}:${row.level}:${row.source ?? 'direct'}:${index}`}>{row.principalName} · {row.principalKind === 'user' ? '사용자' : '그룹'} · {row.level === 'view' ? '보기' : row.level === 'edit' ? '편집' : '관리'}{row.source === null ? null : ` · ${row.source}`}</li>)}</ul>;

  return (<>
    <h3 ref={heading} tabIndex={-1} className="sr-only">상속 끊김 목록</h3>
    {notice === null ? null : notice.role === 'alert' ? <p role="alert">{notice.text}</p> : <p role="status">{notice.text}</p>}
    <ul className="acl-inheritance-list">
      {current.data.rows.map((row) => (
        <li key={row.nodeId} data-testid={`broken-row-${row.nodeId}`}>
          <span>{row.workspaceName}</span>
          <span>{row.path}</span>
          <span>ACL 접근자 {row.aclAccessors}명</span>
          {row.aclAccessors === 0 ? <span>{ISOLATED}</span> : null}
          <p>{onLoadRestorePreview === undefined ? '상속 변경의 영향을 확인할 수 없습니다.' : '복원 전에 현재 영향을 확인합니다.'}</p>
          <button type="button" ref={(element) => { if (element === null) actionButtons.current.delete(row.nodeId); else actionButtons.current.set(row.nodeId, element); }} disabled={onLoadRestorePreview === undefined || completed.has(row.nodeId) || loadingNode !== null} onClick={(event) => { void open(row.nodeId, event.currentTarget); }}>
            {loadingNode === row.nodeId ? '영향 확인 중…' : `${row.path} 상속으로 되돌리기`}
          </button>
        </li>
      ))}
    </ul>
    <ConfirmGate open={visiblePreview !== null} grade="L2" title="상속으로 되돌리기" confirmLabel="상속 복원" pendingLabel="복원 중…" restoreFocusRef={trigger} onConfirm={execute} onCancel={() => { setPreview(null); setPreviewOwner(null); }}>
      {visiblePreview === null ? null : <div className="inheritance-restore-preview">
        <dl><dt>워크스페이스</dt><dd>{visiblePreview.workspace.name}</dd><dt>경로</dt><dd>{visiblePreview.path}</dd><dt>종류</dt><dd>{visiblePreview.kind === 'directory' ? '디렉터리' : '파일'}</dd></dl>
        <section><h3>유지되는 직접 권한</h3>{rows(visiblePreview.retainedDirectAcl)}</section>
        <section><h3>복원 후 들어오는 부모 권한</h3>{rows(visiblePreview.incomingParentAcl)}</section>
        <p>직접 부여한 권한은 유지됩니다.</p>
        {visiblePreview.kind === 'directory' ? <><p>적용 하위 노드 {visiblePreview.applicableDescendants}개</p><p>상속된 변경은 적용 가능한 하위 노드에도 전달됩니다.</p><p>상속이 끊긴 하위 노드에는 전달되지 않습니다.</p></> : null}
      </div>}
    </ConfirmGate>
  </>);
}
