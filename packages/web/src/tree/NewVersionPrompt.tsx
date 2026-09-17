import { useEffect, useRef, useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import { Button } from '../components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog.js';
import { InlineNotice } from '../components/ui/states.js';
import type { TreeNodeView } from './tree-contract.js';

export type NewVersionOutcome =
  | { status: 'success' }
  | { status: 'rejected'; reason?: 'forbidden' | 'too-large' }
  | { status: 'unknown' }
  | { status: 'refresh-failed'; retryRefresh?: () => Promise<NewVersionOutcome> };
export type NewVersionResult = NewVersionOutcome | { status: 'refreshing'; completion: Promise<NewVersionOutcome> };

/** 새 버전 올리기의 파일 선택과 binary L2 확인 (`FR-SHELL-008`, `FR-CONFIRM-010`, `IR-SHELL-010`). */
export function NewVersionPrompt({ node, onPick, onRetryRefresh, onCancel }: {
  node: TreeNodeView;
  onPick: (file: File) => Promise<NewVersionResult>;
  onRetryRefresh?: () => Promise<NewVersionOutcome>;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const attempt = useRef(0);
  const accepted = useRef(false);
  const focusAfterResult = useRef(false);
  const warns = node.overwriteIrreversible === true;
  const [selected, setSelected] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [outcome, setOutcome] = useState<NewVersionOutcome | null>(null);

  useEffect(() => {
    setSelected(null);
    setConfirming(false);
    setPending(false);
    setRefreshing(false);
    setOutcome(null);
    attempt.current += 1;
    accepted.current = false;
    focusAfterResult.current = false;
    if (input.current !== null) input.current.value = '';
  }, [node.id]);

  useEffect(() => {
    if (!focusAfterResult.current || pending || outcome === null) return;
    focusAfterResult.current = false;
    if (outcome.status === 'success') close.current?.focus();
    else if (retry.current !== null) retry.current.focus();
    else result.current?.focus();
  }, [outcome, pending]);

  const run = async (file: File) => {
    if (pending) return;
    const current = ++attempt.current;
    focusAfterResult.current = true;
    setPending(true);
    setOutcome(null);
    const next = await onPick(file).catch(() => ({ status: 'unknown' as const }));
    if (current !== attempt.current) return;
    if (next === undefined) {
      setPending(false);
      setOutcome({ status: 'unknown' });
      return;
    }
    if (next.status === 'refreshing') {
      setRefreshing(true);
      const completed = await next.completion;
      if (current !== attempt.current) return;
      setRefreshing(false);
      setPending(false);
      setOutcome(completed);
      return;
    }
    setPending(false);
    setOutcome(next);
  };

  const retryRefresh = async () => {
    const action = outcome?.status === 'refresh-failed' ? outcome.retryRefresh ?? onRetryRefresh : undefined;
    if (action === undefined || pending) return;
    const current = ++attempt.current;
    focusAfterResult.current = true;
    setPending(true);
    setRefreshing(true);
    const next = await action();
    if (current !== attempt.current) return;
    setPending(false);
    setRefreshing(false);
    setOutcome(next);
  };

  const failed = outcome?.status === 'rejected' || outcome?.status === 'unknown';
  const refreshFailed = outcome?.status === 'refresh-failed';
  const done = outcome?.status === 'success';

  return (
    <Dialog defaultOpen onOpenChange={(open) => { if (!open && !confirming) onCancel(); }}>
      <DialogContent data-new-version-prompt aria-busy={pending ? 'true' : undefined} onCloseAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>새 버전 올리기</DialogTitle>
        <DialogDescription>대상 파일: {node.name}</DialogDescription>
        {warns ? <InlineNotice variant="warning" title="되돌릴 수 없는 교체">
          {node.name} 은(는) 버전으로 보관되지 않습니다. 새 버전을 올리면 지금 내용을 되돌릴 수 없습니다.
        </InlineNotice> : null}
        <label data-new-version-file-field>
          <span>새 버전 파일</span>
          <input ref={input} type="file" aria-label={`${node.name} 새 버전 파일`} disabled={pending || done} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file === undefined) return;
            setSelected(file);
            if (!warns) void run(file);
            else accepted.current = false;
          }} />
        </label>
        {selected === null ? null : <p data-selected-file-name>{selected.name}</p>}
        <div data-new-version-actions>
          {!done && !refreshFailed ? <Button variant="secondary" disabled={pending} onClick={onCancel}>그만두기</Button> : null}
          {warns && !done && !refreshFailed ? <Button ref={confirmButton} disabled={selected === null || pending} onClick={() => setConfirming(true)}>새 버전 올리기</Button> : null}
        </div>

        {pending || outcome !== null ? <div
          ref={result}
          role={failed || refreshFailed ? 'alert' : 'status'}
          aria-label={failed || refreshFailed ? '새 버전 업로드 오류' : '새 버전 업로드 상태'}
          tabIndex={-1}
          data-new-version-result
        >
          {pending ? (refreshing ? '새 버전은 올라갔고 화면 정보를 새로 고치는 중입니다.' : '새 버전을 올리는 중입니다.') : null}
          {outcome?.status === 'rejected' ? (outcome.reason === 'forbidden' ? '권한이 없어 새 버전을 올리지 못했습니다.' : outcome.reason === 'too-large' ? '파일이 너무 커서 새 버전을 올리지 못했습니다.' : '새 버전을 올리지 못했습니다.') : null}
          {outcome?.status === 'unknown' ? '업로드 완료 여부를 확인하지 못했습니다.' : null}
          {refreshFailed ? '새 버전은 올라갔지만 화면을 새로 고치지 못했습니다.' : null}
          {done ? '새 버전을 올렸습니다.' : null}
          {failed ? <Button ref={retry} onClick={() => {
            if (selected === null) return;
            if (warns) { accepted.current = false; setConfirming(true); }
            else void run(selected);
          }}>다시 시도</Button> : null}
          {refreshFailed ? <Button ref={retry} onClick={() => void retryRefresh()}>화면 새로고침 다시 시도</Button> : null}
          {done ? <Button ref={close} onClick={onCancel}>닫기</Button> : null}
        </div> : null}

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent aria-modal="true" onCloseAutoFocus={(event) => { event.preventDefault(); confirmButton.current?.focus(); }}>
            <AlertDialogTitle>기존 파일을 교체하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>대상 파일: {node.name}. 선택한 파일: {selected?.name}. 지금 내용은 되돌릴 수 없습니다.</AlertDialogDescription>
            <div data-slot="alert-dialog-actions">
              <AlertDialogCancel autoFocus>돌아가기</AlertDialogCancel>
              <AlertDialogAction asChild><Button variant="destructive" onClick={() => {
                if (selected === null || accepted.current) return;
                accepted.current = true;
                setConfirming(false);
                void run(selected);
              }}>교체하기</Button></AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
