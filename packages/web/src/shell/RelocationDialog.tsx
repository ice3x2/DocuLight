import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { RelocationPreview, type Relocation } from '../acl/RelocationPreview.js';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Button, Select } from '../components/ui/index.js';
import type { Grade } from '../confirm/ConfirmGate.js';

import './RelocationDialog.css';

const COPY_NOTICE = '권한에 따라 일부 항목이 제외될 수 있습니다';
const STALE_NOTICE = '접근 가능 인원이 바뀌었습니다. 확인한 뒤 다시 실행하십시오.';

export type RelocationPreviewResult =
  | { readonly kind: 'move'; readonly before: number; readonly after: number; readonly grade: 'L1' | 'L2' }
  | { readonly kind: 'copy'; readonly reachable: number; readonly grade: 'L2' };
export type RelocationWriteResult =
  | { readonly kind: 'move'; readonly name: string }
  | { readonly kind: 'copy'; readonly id: string; readonly name: string; readonly copied: number };
export type RelocationDestinationsState =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly onRetry: () => void }
  | { readonly state: 'ready'; readonly generation?: number; readonly destinations: readonly { id: string; path: string }[] };

const samePreview = (left: RelocationPreviewResult, right: RelocationPreviewResult) => {
  if (left.kind !== right.kind || left.grade !== right.grade) return false;
  return left.kind === 'move' && right.kind === 'move'
    ? left.before === right.before && left.after === right.after
    : left.kind === 'copy' && right.kind === 'copy' && left.reachable === right.reachable;
};

// @req IR-SHELL-011
export function RelocationDialog({
  kind, open, sourceName, destinations = [], destinationsState, destinationId,
  relocation, grade = 'L2', level, sourceLevel, result, contextKey = 'legacy',
  loadPreview, onExecute, onAccepted, onDestination, onConfirm, onCancel,
}: {
  kind: 'move' | 'copy'; open: boolean; sourceName: string;
  destinations?: readonly { id: string; path: string }[];
  destinationsState?: RelocationDestinationsState;
  destinationId?: string; relocation?: Relocation; grade?: Grade;
  level?: 'view' | 'edit' | 'admin'; sourceLevel?: 'view' | 'edit' | 'admin' | null;
  result?: { copied: number }; contextKey?: string;
  loadPreview?: (destinationId: string) => Promise<RelocationPreviewResult>;
  onExecute?: (destinationId: string) => Promise<RelocationWriteResult>;
  onAccepted?: (result: RelocationWriteResult) => void;
  onDestination?: (destinationId: string) => void; onConfirm?: () => void; onCancel?: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const selectId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const executeButton = useRef<HTMLButtonElement>(null);
  const confirmationCancel = useRef<HTMLButtonElement>(null);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const requestGeneration = useRef(0);
  const guard = useRef(false);
  const confirmationGuard = useRef(false);
  const previewRef = useRef<RelocationPreviewResult | undefined>(undefined);
  const destinationKeyRef = useRef<string | undefined>(undefined);
  const legacyPreview = relocation === undefined ? undefined : { ...relocation, grade: grade === 'L1' ? 'L1' : 'L2' } as RelocationPreviewResult;
  const [selectedId, setSelectedId] = useState(destinationId ?? '');
  const [preview, setPreview] = useState<RelocationPreviewResult | undefined>(legacyPreview);
  const [previewPhase, setPreviewPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>(relocation === undefined ? 'idle' : 'ready');
  const [confirmation, setConfirmation] = useState<RelocationPreviewResult | undefined>();
  const [confirmationStale, setConfirmationStale] = useState(false);
  const [pending, setPending] = useState(false);
  const [writeError, setWriteError] = useState(false);
  const [stale, setStale] = useState(false);
  const operation = kind === 'copy' ? '복사' : '이동';
  const destinationView = destinationsState ?? { state: 'ready' as const, destinations };
  const available = destinationView.state === 'ready' ? destinationView.destinations : [];
  const destinationKey = destinationView.state === 'ready'
    ? `ready:${destinationView.generation ?? 0}:${destinationView.destinations.map((destination) => destination.id).join('\u0000')}`
    : destinationView.state;
  const selectedPath = available.find((destination) => destination.id === selectedId)?.path;
  const shownRelocation: Relocation | undefined = preview === undefined ? relocation : preview.kind === 'move'
    ? { kind: 'move', before: preview.before, after: preview.after }
    : { kind: 'copy', reachable: preview.reachable };

  useEffect(() => {
    destinationKeyRef.current = destinationKey;
    requestGeneration.current += 1;
    guard.current = false;
    confirmationGuard.current = false;
    setSelectedId(destinationId ?? '');
    setPreview(legacyPreview);
    previewRef.current = legacyPreview;
    setPreviewPhase(relocation === undefined ? 'idle' : 'ready');
    setConfirmation(undefined);
    setConfirmationStale(false);
    setPending(false);
    setWriteError(false);
    setStale(false);
  }, [contextKey]);
  useEffect(() => { if (open) closeButton.current?.focus(); }, [open, contextKey]);
  useEffect(() => { if (writeError) errorSummary.current?.focus(); }, [writeError]);
  useEffect(() => {
    if (pending) return;
    if (destinationKeyRef.current === destinationKey) return;
    destinationKeyRef.current = destinationKey;
    if (selectedId === '') return;
    const selectedStillExists = destinationView.state === 'ready'
      && destinationView.destinations.some((destination) => destination.id === selectedId);
    requestGeneration.current += 1;
    guard.current = false;
    confirmationGuard.current = false;
    setPreview(undefined);
    previewRef.current = undefined;
    setPreviewPhase('idle');
    setConfirmation(undefined);
    setConfirmationStale(false);
    setWriteError(false);
    setStale(false);
    if (destinationView.state === 'ready' && !selectedStillExists) {
      setSelectedId('');
      onDestination?.('');
    } else if (destinationView.state === 'ready' && selectedStillExists) {
      const generation = requestGeneration.current;
      setPreviewPhase('loading');
      if (loadPreview === undefined) {
        setPreviewPhase('error');
      } else {
        void loadPreview(selectedId).then(
          (next) => {
            if (requestGeneration.current === generation) {
              previewRef.current = next;
              setPreview(next);
              setPreviewPhase('ready');
            }
          },
          () => { if (requestGeneration.current === generation) setPreviewPhase('error'); },
        );
      }
    }
  }, [destinationKey, selectedId, loadPreview, onDestination, pending]);

  const readPreview = async (id: string) => {
    if (loadPreview !== undefined) return loadPreview(id);
    if (preview === undefined) throw new Error('preview unavailable');
    return preview;
  };

  const choose = (id: string) => {
    if (pending) return;
    const generation = ++requestGeneration.current;
    setSelectedId(id);
    onDestination?.(id);
    setConfirmation(undefined); setConfirmationStale(false); setWriteError(false); setStale(false); setPreview(undefined); previewRef.current = undefined;
    if (id === '') { setPreviewPhase('idle'); return; }
    setPreviewPhase('loading');
    void readPreview(id).then(
      (next) => { if (requestGeneration.current === generation) { guard.current = false; previewRef.current = next; setPreview(next); setPreviewPhase('ready'); } },
      () => { if (requestGeneration.current === generation) setPreviewPhase('error'); },
    );
  };
  const retryPreview = () => choose(selectedId);

  const execute = async () => {
    const shown = previewRef.current ?? preview;
    if (guard.current || pending || selectedId === '' || previewPhase !== 'ready' || shown === undefined) return;
    const generation = requestGeneration.current;
    const intentDestinationId = selectedId;
    guard.current = true; setStale(false); setWriteError(false);
    try {
      const fresh = await readPreview(intentDestinationId);
      if (requestGeneration.current !== generation) return;
      if (!samePreview(fresh, shown)) { previewRef.current = fresh; setPreview(fresh); setPreviewPhase('ready'); setStale(true); return; }
      if (fresh.grade === 'L1') {
        if (onExecute === undefined) onConfirm?.();
        else {
          setPending(true);
          try {
            const result = await onExecute(intentDestinationId);
            if (requestGeneration.current === generation) onAccepted?.(result);
          } catch {
            if (requestGeneration.current === generation) { setPreview(undefined); setPreviewPhase('idle'); setWriteError(true); }
          } finally {
            if (requestGeneration.current === generation) setPending(false);
          }
        }
      } else {
        guard.current = false;
        setConfirmation(fresh);
      }
    } catch {
      if (requestGeneration.current === generation) {
        setPreview(undefined);
        previewRef.current = undefined;
        setPreviewPhase('error');
      }
    }
    finally { guard.current = false; }
  };

  const acceptConfirmation = async () => {
    if (confirmationGuard.current || pending || confirmation === undefined) return;
    const generation = requestGeneration.current;
    const intentDestinationId = selectedId;
    confirmationGuard.current = true;
    try {
      const fresh = await readPreview(intentDestinationId);
      if (requestGeneration.current !== generation) return;
      if (!samePreview(fresh, confirmation)) { previewRef.current = fresh; setPreview(fresh); setConfirmationStale(true); return; }
      if (onExecute === undefined) { setConfirmation(undefined); onConfirm?.(); }
      else {
        setPending(true); setWriteError(false);
        try {
          const result = await onExecute(intentDestinationId);
          if (requestGeneration.current === generation) onAccepted?.(result);
        } catch {
          if (requestGeneration.current === generation) { setConfirmation(undefined); setPreview(undefined); setPreviewPhase('idle'); setWriteError(true); }
        } finally {
          if (requestGeneration.current === generation) setPending(false);
        }
      }
    } catch { if (requestGeneration.current === generation) setConfirmationStale(true); }
    finally { confirmationGuard.current = false; }
  };
  const closeConfirmation = () => {
    if (pending) return;
    setConfirmation(undefined); setConfirmationStale(false);
    queueMicrotask(() => executeButton.current?.focus());
  };

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (confirmation !== undefined || pending) return;
      event.preventDefault(); onCancel?.(); return;
    }
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
    const first = controls[0]; const last = controls.at(-1);
    if (first === undefined || last === undefined) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  if (!open) return null;
  const actionable = destinationView.state === 'ready' && selectedPath !== undefined && selectedId !== '' && previewPhase === 'ready' && preview !== undefined && !pending && !writeError;
  const effectiveLevel = sourceLevel ?? level;

  return <>
    <div data-relocation-overlay="" />
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} data-relocation-dialog="" aria-busy={pending || undefined} onKeyDown={handleDialogKeyDown}>
      <header data-relocation-header="">
        <h2 id={titleId} data-slot="dialog-title">{sourceName} {operation}</h2>
        <Button ref={closeButton} type="button" variant="ghost" size="icon" aria-label={`${operation} 닫기`} data-relocation-close="" disabled={pending} onClick={onCancel} />
      </header>
      <div data-relocation-body="">
        <p id={descriptionId} data-relocation-source="">{sourceName}</p>
        <div data-slot="field">
          <label htmlFor={selectId}>목적지</label>
          <Select id={selectId} value={selectedId} disabled={pending || destinationView.state !== 'ready'} onChange={(event) => choose(event.target.value)}>
            <option value="">선택하세요</option>
            {available.map((destination) => <option key={destination.id} value={destination.id}>{destination.path}</option>)}
          </Select>
          {destinationView.state === 'loading' ? <p data-slot="field-description">목적지를 불러오는 중입니다.</p>
            : destinationView.state === 'error' ? <p data-slot="field-description">목적지를 불러오지 못했습니다. <Button type="button" variant="secondary" onClick={destinationView.onRetry}>목적지 다시 불러오기</Button></p>
              : available.length === 0 ? <p data-slot="field-description">제공된 목적지가 없습니다.</p>
                : selectedPath === undefined ? <p data-slot="field-description">목적지를 선택하세요.</p>
                  : <p data-slot="field-description" data-testid="selected-destination-path">{selectedPath}</p>}
        </div>
        {previewPhase === 'loading' ? <p data-relocation-help="">영향 정보를 불러오는 중입니다.</p>
          : previewPhase === 'error' ? <p role="alert" data-relocation-help="">영향 정보를 불러오지 못했습니다. <Button type="button" variant="secondary" onClick={retryPreview}>영향 정보 다시 불러오기</Button></p>
            : shownRelocation === undefined ? <p data-relocation-help="">영향 정보가 전달되지 않았습니다.</p>
              : <RelocationPreview relocation={shownRelocation} {...(effectiveLevel === null || effectiveLevel === undefined ? {} : { level: effectiveLevel })} />}
        {stale ? <p role="alert" data-testid="relocation-stale">{STALE_NOTICE}</p> : null}
        {writeError ? <p ref={errorSummary} tabIndex={-1} role="alert" data-testid="relocation-write-error">작업 결과를 확인할 수 없습니다. 자동으로 다시 실행하지 않습니다. 영향 정보를 다시 불러온 뒤 다시 실행하십시오. <Button type="button" variant="secondary" onClick={retryPreview}>영향 정보 다시 불러오기</Button></p> : null}
        {kind === 'copy' ? <p data-testid="copy-notice" data-relocation-help="">{COPY_NOTICE}</p> : null}
        {kind === 'copy' && result !== undefined ? <p role="status" data-relocation-status="">{result.copied}개 항목을 복사했습니다.</p> : null}
      </div>
      <div data-relocation-actions="">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>취소</Button>
        <Button ref={executeButton} type="button" disabled={!actionable} onClick={() => { void execute(); }}>{pending ? `${operation} 중` : operation}</Button>
      </div>
    </div>
    <AlertDialog open={confirmation !== undefined} onOpenChange={(next) => { if (!next) closeConfirmation(); }}>
      <AlertDialogContent data-grade="L2" onOpenAutoFocus={(event) => { event.preventDefault(); confirmationCancel.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); executeButton.current?.focus(); }}>
        <AlertDialogTitle>{sourceName} {operation}</AlertDialogTitle>
        <AlertDialogDescription>접근 가능 인원과 목적지를 확인한 뒤 실행하세요.</AlertDialogDescription>
        {confirmationStale ? <p role="alert" data-testid="relocation-confirmation-stale">{STALE_NOTICE}</p> : null}
        <div data-slot="alert-dialog-actions">
          <AlertDialogCancel ref={confirmationCancel} type="button" disabled={pending}>취소</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={pending || confirmationStale} onClick={() => { void acceptConfirmation(); }}>{pending ? `${operation} 중` : '실행'}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
