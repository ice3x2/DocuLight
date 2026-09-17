// v9 keeps the small legacy table surface used by this panel.
import { flexRender } from '@tanstack/react-table';
import { getCoreRowModel, useLegacyTable, type LegacyColumnDef } from '@tanstack/react-table/legacy';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { ConfirmGate } from '../confirm/ConfirmGate.js';

export interface TrashRowView {
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  originalPath: string;
  deletedAt: string;
  deletedBy: string;
  canPurge: boolean;
}

export interface TrashLens {
  workspaceId?: string;
  scope: 'mine' | 'all';
}

export type TrashQueryState =
  | { readonly state: 'loading' }
  | { readonly state: 'ready' }
  | { readonly state: 'error'; readonly onRetry: () => void };

export type TrashActionResult = { readonly ok: true } | { readonly ok: false };

type ActionKind = 'restore' | 'purge';
type RowActionState = { readonly kind: ActionKind; readonly pending: boolean };
type RowResultState = { readonly role: 'status' | 'alert'; readonly text: string };

const ROW_HEIGHT = 40;
const OVERSCAN = 8;

/** Trash list for FR-SHELL-007, SEC-SHELL-001 and IR-SHELL-009. */
export function TrashPanel({
  contextKey = 'default',
  rows,
  query = { state: 'ready' },
  workspaces = [],
  lens = { scope: 'mine' },
  canWidenScope = false,
  onLens,
  onPurge,
  onRestore,
}: {
  contextKey?: string;
  rows: readonly TrashRowView[];
  query?: TrashQueryState;
  workspaces?: readonly { id: string; name: string }[];
  lens?: TrashLens;
  canWidenScope?: boolean;
  onLens?: (lens: TrashLens) => void;
  onPurge?: (nodeId: string) => Promise<TrashActionResult>;
  onRestore?: (nodeId: string) => Promise<TrashActionResult>;
}) {
  const [actions, setActions] = useState<Readonly<Record<string, RowActionState>>>({});
  const [results, setResults] = useState<Readonly<Record<string, RowResultState>>>({});
  const pending = useRef(new Set<string>());
  const context = useRef(contextKey);
  context.current = contextKey;
  const [message, setMessage] = useState<RowResultState | null>(null);
  const [focusAfterRemoval, setFocusAfterRemoval] = useState<readonly string[] | null>(null);
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  const [keyboardTarget, setKeyboardTarget] = useState<{ nodeId: string; action: ActionKind } | null>(null);
  const virtualApi = useRef<{ measure: () => void; scrollToIndex: (index: number, options?: { align?: 'auto' | 'center' | 'end' | 'start' }) => void } | null>(null);
  const currentRows = useRef(rows);
  currentRows.current = rows;
  const visibleAnchor = useRef<{ nodeId: string; offset: number } | null>(null);
  const adjustingAnchor = useRef(false);
  const [purgeTarget, setPurgeTarget] = useState<TrashRowView | null>(null);
  const purgeReturnRef = useRef<HTMLElement | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pending.current.clear();
    setActions({});
    setResults({});
    setMessage(null);
    setPurgeTarget(null);
    setFocusAfterRemoval(null);
    setFocusedNode(null);
    setKeyboardTarget(null);
    visibleAnchor.current = null;
    if (scroller.current !== null) scroller.current.scrollTop = 0;
  }, [contextKey]);

  const moveByKeyboard = useCallback((event: KeyboardEvent<HTMLButtonElement>, nodeId: string, action: ActionKind) => {
    if (event.key !== 'Tab') return;
    const index = rows.findIndex((row) => row.nodeId === nodeId);
    if (index < 0) return;
    let target: { nodeId: string; action: ActionKind } | undefined;
    if (event.shiftKey) {
      if (action === 'purge') target = { nodeId, action: 'restore' };
      else if (index > 0) target = { nodeId: rows[index - 1]!.nodeId, action: rows[index - 1]!.canPurge ? 'purge' : 'restore' };
    } else if (action === 'restore' && rows[index]!.canPurge) target = { nodeId, action: 'purge' };
    else if (index + 1 < rows.length) target = { nodeId: rows[index + 1]!.nodeId, action: 'restore' };
    if (target === undefined) return;
    event.preventDefault();
    setFocusedNode(target.nodeId);
    setKeyboardTarget(target);
    virtualApi.current?.scrollToIndex(rows.findIndex((row) => row.nodeId === target!.nodeId), { align: 'auto' });
  }, [rows]);

  const captureAnchor = useCallback(() => {
    if (adjustingAnchor.current) return;
    const viewport = scroller.current;
    if (viewport === null) return;
    const top = Math.max(viewport.getBoundingClientRect().top, viewport.querySelector('thead')?.getBoundingClientRect().bottom ?? 0);
    const row = Array.from(viewport.querySelectorAll<HTMLElement>('tbody tr[aria-rowindex]'))
      .find((candidate) => candidate.getBoundingClientRect().top >= top);
    const nodeId = row?.querySelector<HTMLElement>('[data-trash-node-id]')?.dataset.trashNodeId;
    if (row !== undefined && nodeId !== undefined) visibleAnchor.current = { nodeId, offset: row.getBoundingClientRect().top - top };
  }, []);

  const runAction = useCallback(async (kind: ActionKind, target: TrashRowView, ownsFocus = false) => {
    const callback = kind === 'restore' ? onRestore : onPurge;
    if (callback === undefined || pending.current.has(target.nodeId)) return false;
    pending.current.add(target.nodeId);
    const owner = context.current;
    const focused = ownsFocus || document.activeElement instanceof HTMLElement
      && document.activeElement.dataset.trashNodeId === target.nodeId;
    const at = rows.findIndex((row) => row.nodeId === target.nodeId);
    const focusCandidates = [rows[at + 1]?.nodeId, rows[at - 1]?.nodeId].filter((id): id is string => id !== undefined);
    setResults((current) => {
      const next = { ...current };
      delete next[target.nodeId];
      return next;
    });
    setActions((current) => ({ ...current, [target.nodeId]: { kind, pending: true } }));
    let result: TrashActionResult;
    try {
      result = await callback(target.nodeId);
    } catch {
      result = { ok: false };
    }
    if (context.current !== owner) return false;
    pending.current.delete(target.nodeId);
    setActions((current) => {
      const next = { ...current };
      delete next[target.nodeId];
      return next;
    });
    const outcome: RowResultState = result.ok
      ? { role: 'status', text: kind === 'restore' ? '항목을 복구했습니다.' : '항목을 영구 삭제했습니다.' }
      : { role: 'alert', text: kind === 'restore'
          ? '항목을 복구하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.'
          : '항목을 영구 삭제하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.' };
    setResults((current) => ({ ...current, [target.nodeId]: outcome }));
    if (result.ok) setMessage(outcome);
    if (result.ok && focused && !ownsFocus) setFocusAfterRemoval(focusCandidates);
    return result.ok;
  }, [onPurge, onRestore, rows]);

  const confirmPurge = useCallback(async () => {
    if (purgeTarget === null) return;
    const current = rows.find((candidate) => candidate.nodeId === purgeTarget.nodeId);
    if (current === undefined || !current.canPurge || current.originalPath !== purgeTarget.originalPath) {
      setPurgeTarget(null);
      setMessage({ role: 'status', text: '항목 상태가 변경되었습니다. 목록을 다시 불러오십시오.' });
      return;
    }
    const at = rows.findIndex((row) => row.nodeId === current.nodeId);
    const focusCandidates = [rows[at + 1]?.nodeId, rows[at - 1]?.nodeId].filter((id): id is string => id !== undefined);
    const removed = await runAction('purge', current, true);
    if (removed) {
      const nextTarget = focusCandidates
        .map((nodeId) => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-trash-action]'))
          .find((element) => element.dataset.trashNodeId === nodeId && !element.disabled))
        .find((element): element is HTMLButtonElement => element !== undefined);
      purgeReturnRef.current = nextTarget ?? document.getElementById('trash-heading');
    }
    setPurgeTarget(null);
    if (removed) window.setTimeout(() => {
      const target = focusCandidates.find((nodeId) => currentRows.current.some((row) => row.nodeId === nodeId));
      if (target === undefined) {
        document.getElementById('trash-heading')?.focus();
        return;
      }
      virtualApi.current?.scrollToIndex(currentRows.current.findIndex((row) => row.nodeId === target), { align: 'auto' });
      requestAnimationFrame(() => {
        Array.from(document.querySelectorAll<HTMLButtonElement>('[data-trash-action]'))
          .find((element) => element.dataset.trashNodeId === target && !element.disabled)?.focus();
      });
    }, 0);
  }, [purgeTarget, rows, runAction]);

  const columns = useMemo<LegacyColumnDef<TrashRowView>[]>(() => [
    { accessorKey: 'originalPath', header: '경로' },
    { accessorKey: 'workspaceName', header: '워크스페이스' },
    { accessorKey: 'deletedBy', header: '삭제자' },
    {
      accessorKey: 'deletedAt',
      header: '삭제 시각',
      cell: ({ row }) => <time dateTime={row.original.deletedAt}>{row.original.deletedAt}</time>,
    },
    {
      id: 'actions',
      header: '조작',
      cell: ({ row }) => {
        const item = row.original;
        const state = actions[item.nodeId];
        const busy = state?.pending === true;
        return <div data-trash-actions>
          <button
            type="button"
            aria-label={`${item.originalPath} 복구`}
            disabled={onRestore === undefined || busy}
            data-trash-action="restore"
            data-trash-node-id={item.nodeId}
            onFocus={() => setFocusedNode(item.nodeId)}
            onKeyDown={(event) => moveByKeyboard(event, item.nodeId, 'restore')}
            onClick={() => { void runAction('restore', item); }}
          >{busy && state.kind === 'restore' ? '복구 중…' : '복구'}</button>
          {item.canPurge ? <button
            type="button"
            aria-label={`${item.originalPath} 영구 삭제`}
            disabled={onPurge === undefined || busy}
            data-trash-action="purge"
            data-trash-node-id={item.nodeId}
            onFocus={() => setFocusedNode(item.nodeId)}
            onKeyDown={(event) => moveByKeyboard(event, item.nodeId, 'purge')}
            onClick={(event) => {
              purgeReturnRef.current = event.currentTarget;
              setPurgeTarget(item);
            }}
          >{busy && state.kind === 'purge' ? '영구 삭제 중…' : '영구 삭제'}</button> : null}
          {results[item.nodeId] === undefined ? null : <span
            data-testid={`trash-result-${item.nodeId}`}
            {...(results[item.nodeId]!.role === 'alert'
              ? { role: 'alert' }
              : { 'data-result-role': 'status' })}
          >{results[item.nodeId]!.text}</span>}
        </div>;
      },
    },
  ], [actions, moveByKeyboard, onPurge, onRestore, results, runAction]);

  const table = useLegacyTable({ data: rows as TrashRowView[], columns, getCoreRowModel: getCoreRowModel() });
  const model = table.getRowModel().rows;
  const virtual = useVirtualizer({
    count: query.state === 'ready' ? model.length : 0,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => model[index]?.original.nodeId ?? index,
    overscan: OVERSCAN,
    rangeExtractor: (range) => {
      const normal = defaultRangeExtractor(range);
      const focusedIndex = focusedNode === null ? -1 : model.findIndex((row) => row.original.nodeId === focusedNode);
      return focusedIndex < 0 ? normal : [...new Set([...normal, focusedIndex])].sort((a, b) => a - b);
    },
    measureElement: (element) => Math.max(ROW_HEIGHT, element.scrollHeight || 0),
  });
  virtualApi.current = virtual;
  const virtualRows = virtual.getVirtualItems();
  useEffect(() => { virtual.measure(); }, [rows, virtual]);
  useEffect(() => {
    const viewport = scroller.current;
    if (viewport === null || typeof ResizeObserver === 'undefined') return;
    let dpr = window.devicePixelRatio;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resizeAnchor: { nodeId: string; offset: number } | null = null;
    const reposition = () => {
      const nextDpr = window.devicePixelRatio;
      if (nextDpr === dpr) return;
      dpr = nextDpr;
      resizeAnchor ??= visibleAnchor.current;
      adjustingAnchor.current = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        const anchor = resizeAnchor;
        const index = anchor === null ? -1 : currentRows.current.findIndex((row) => row.nodeId === anchor.nodeId);
        virtualApi.current?.measure();
        virtualApi.current?.scrollToIndex(index < 0 ? 0 : index, { align: 'start' });
        const align = (remaining: number) => requestAnimationFrame(() => {
          const row = anchor === null || index < 0 ? undefined : Array.from(viewport.querySelectorAll<HTMLElement>('tbody tr[aria-rowindex]'))
            .find((candidate) => candidate.querySelector<HTMLElement>('[data-trash-node-id]')?.dataset.trashNodeId === anchor.nodeId);
          if (row !== undefined) {
            const top = Math.max(viewport.getBoundingClientRect().top, viewport.querySelector('thead')?.getBoundingClientRect().bottom ?? 0);
            viewport.scrollTop += row.getBoundingClientRect().top - top - anchor!.offset;
          }
          if (remaining > 0) { align(remaining - 1); return; }
          resizeAnchor = null;
          adjustingAnchor.current = false;
          captureAnchor();
        });
        align(30);
      }, 40);
    };
    const observer = new ResizeObserver(reposition);
    observer.observe(viewport);
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    return () => {
      observer.disconnect();
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
    };
  }, [captureAnchor, contextKey]);
  useEffect(() => {
    if (focusAfterRemoval === null) return;
    const target = focusAfterRemoval.find((nodeId) => rows.some((row) => row.nodeId === nodeId));
    if (target === undefined) {
      document.getElementById('trash-heading')?.focus();
      setFocusAfterRemoval(null);
      return;
    }
    const index = rows.findIndex((row) => row.nodeId === target);
    virtual.scrollToIndex(index, { align: 'auto' });
    requestAnimationFrame(() => {
      Array.from(document.querySelectorAll<HTMLElement>('[data-trash-action="restore"]'))
        .find((element) => element.dataset.trashNodeId === target)?.focus();
      setFocusAfterRemoval(null);
    });
  }, [focusAfterRemoval, rows, virtual]);
  useEffect(() => {
    if (keyboardTarget === null) return;
    requestAnimationFrame(() => {
      Array.from(document.querySelectorAll<HTMLElement>(`[data-trash-action="${keyboardTarget.action}"]`))
        .find((element) => element.dataset.trashNodeId === keyboardTarget.nodeId)?.focus();
      setKeyboardTarget(null);
    });
  }, [keyboardTarget, virtualRows]);
  const bottom = virtualRows.length === 0 ? 0 : Math.max(0, virtual.getTotalSize() - virtualRows[virtualRows.length - 1]!.end);

  return <section data-panel="trash" aria-labelledby="trash-heading">
    <h2 id="trash-heading" tabIndex={-1}>휴지통</h2>
    <div data-trash-toolbar>
      <label>
        워크스페이스 필터
        <select
          aria-label="워크스페이스 필터"
          value={lens.workspaceId ?? ''}
          onChange={(event) => onLens?.(event.target.value === ''
            ? { scope: lens.scope }
            : { scope: lens.scope, workspaceId: event.target.value })}
        >
          <option value="">전 워크스페이스</option>
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      </label>
      <span data-trash-scope>현재 범위: {lens.scope === 'all' ? '전체' : '본인분'}</span>
      {canWidenScope ? <button
        type="button"
        aria-pressed={lens.scope === 'all'}
        onClick={() => onLens?.({ ...(lens.workspaceId === undefined ? {} : { workspaceId: lens.workspaceId }), scope: lens.scope === 'all' ? 'mine' : 'all' })}
      >{lens.scope === 'all' ? '본인분만 보기' : '전체 보기'}</button> : null}
    </div>

    {message === null ? null : <p role={message.role}>{message.text}</p>}
    {query.state === 'loading' ? <p role="status">휴지통을 불러오는 중입니다.</p> : null}
    {query.state === 'error' ? <div role="alert"><p>휴지통을 불러오지 못했습니다.</p><button type="button" onClick={query.onRetry}>다시 불러오기</button></div> : null}
    {query.state === 'ready' && rows.length === 0 ? <p data-trash-empty>표시할 휴지통 항목이 없습니다.</p> : null}
    {query.state === 'ready' && rows.length > 0 ? <div ref={scroller} data-trash-results role="region" aria-label="휴지통 결과" onScroll={captureAnchor}>
      <table aria-rowcount={rows.length + 1}>
        <thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>
          {virtualRows.map((item) => {
            const one = model[item.index]!;
            const priorEnd = item.index === virtualRows[0]?.index ? 0 : virtualRows[virtualRows.indexOf(item) - 1]?.end ?? 0;
            const gap = Math.max(0, item.start - priorEnd);
            return <Fragment key={one.original.nodeId}>
              {gap > 0 || item === virtualRows[0] ? <tr
                aria-hidden="true"
                {...(item === virtualRows[0] ? { 'data-testid': 'trash-virtual-spacer', 'data-total-size': virtual.getTotalSize() } : {})}
                style={gap > 0 ? undefined : { display: 'none' }}
              ><td colSpan={columns.length} style={{ height: gap, padding: 0 }} /></tr> : null}
              <tr ref={(element) => { if (element !== null) virtual.measureElement(element); }} data-index={item.index} aria-rowindex={item.index + 2}>
                {one.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
              </tr>
            </Fragment>;
          })}
          {bottom > 0 ? <tr aria-hidden="true"><td colSpan={columns.length} style={{ height: bottom, padding: 0 }} /></tr> : null}
        </tbody>
      </table>
    </div> : null}

    <ConfirmGate
      open={purgeTarget !== null}
      grade="L2"
      title="선택한 항목을 영구 삭제합니다"
      description="이 항목은 복구할 수 없습니다."
      confirmLabel="영구 삭제"
      pendingLabel="영구 삭제 중…"
      restoreFocusRef={purgeReturnRef}
      onConfirm={confirmPurge}
      onCancel={() => setPurgeTarget(null)}
    >
      {purgeTarget === null ? null : <><p>{purgeTarget.originalPath}</p><p>{purgeTarget.workspaceName}</p></>}
    </ConfirmGate>
  </section>;
}
