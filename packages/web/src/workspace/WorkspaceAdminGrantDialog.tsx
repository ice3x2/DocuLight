import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { ApiError, type PrincipalRow, type WorkspaceAdminGrantPreview, type WorkspaceAdminGrantReceipt } from '../api/client.js';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, Button } from '../components/ui/index.js';

export interface WorkspaceAdminGrantDialogProps {
  open: boolean;
  workspace: { id: string; name: string };
  principal: PrincipalRow;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onLoad: (workspaceId: string, principalId: string) => Promise<WorkspaceAdminGrantPreview>;
  onGrant: (workspaceId: string, principalId: string, previewToken: string) => Promise<WorkspaceAdminGrantReceipt>;
  onClose: (result?: WorkspaceAdminGrantReceipt) => void;
}

type View = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; preview: WorkspaceAdminGrantPreview; stale: boolean };

// @req IR-WORKSPACE-003
export function WorkspaceAdminGrantDialog({ open, workspace, principal, restoreFocusRef, onLoad, onGrant, onClose }: WorkspaceAdminGrantDialogProps) {
  const [visible, setVisible] = useState(open);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [expired, setExpired] = useState(false);
  const generation = useRef(0);
  const submitted = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const contextKey = `${workspace.id}\u0000${principal.id}`;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;

  const load = useCallback(async (stale: boolean) => {
    const mine = ++generation.current;
    setView({ kind: 'loading' });
    setActionError(false);
    setExpired(false);
    try {
      const next = await onLoad(workspace.id, principal.id);
      if (generation.current === mine) setView({ kind: 'ready', preview: next, stale });
    } catch {
      if (generation.current === mine) setView({ kind: 'error' });
    }
  }, [onLoad, principal.id, workspace.id]);

  useEffect(() => {
    if (!open) return;
    setVisible(true);
    submitted.current = false;
    void load(false);
    return () => { generation.current += 1; };
  }, [load, open]);

  useEffect(() => {
    if (view.kind !== 'ready') return;
    const remaining = Date.parse(view.preview.expiresAt) - Date.now();
    if (remaining <= 0) { setExpired(true); return; }
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [view]);

  if (!open || !visible) return null;
  const ready = view.kind === 'ready' ? view.preview : undefined;
  const displayedWorkspace = ready?.workspace ?? workspace;
  const displayedPrincipal = ready?.principal ?? principal;
  const disabled = ready === undefined || view.kind !== 'ready' || view.stale || ready.alreadyAssigned || expired || Date.parse(ready.expiresAt) <= Date.now() || submitting;

  const close = () => {
    if (submitting) return;
    generation.current += 1;
    setVisible(false);
    onClose();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (restoreFocusRef?.current?.isConnected) restoreFocusRef.current.focus(); }));
  };
  const submit = async () => {
    if (ready !== undefined && Date.parse(ready.expiresAt) <= Date.now()) { await load(true); return; }
    if (disabled || submitted.current || ready === undefined) return;
    submitted.current = true;
    setSubmitting(true);
    setActionError(false);
    const submittedGeneration = generation.current;
    const submittedContext = contextKey;
    try {
      const receipt = await onGrant(workspace.id, principal.id, ready.previewToken);
      if (generation.current !== submittedGeneration || activeContext.current !== submittedContext) return;
      onClose(receipt);
    } catch (error) {
      if (generation.current !== submittedGeneration || activeContext.current !== submittedContext) return;
      submitted.current = false;
      if (error instanceof ApiError && error.status === 409 && error.detail?.rule === 'preview-stale') {
        setSubmitting(false);
        await load(true);
      }
      else {
        setActionError(true);
        setView({ kind: 'error' });
      }
    } finally {
      if (generation.current === submittedGeneration && activeContext.current === submittedContext) setSubmitting(false);
    }
  };

  return <AlertDialog open onOpenChange={(next) => { if (!next) close(); }}>
    <AlertDialogContent onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }} onCloseAutoFocus={(event) => {
      if (restoreFocusRef !== undefined) { event.preventDefault(); restoreFocusRef.current?.focus(); }
    }}>
      <AlertDialogTitle>워크스페이스 관리자로 지정</AlertDialogTitle>
      <AlertDialogDescription>권위 있는 현재 영향 범위를 확인한 뒤 지정하세요.</AlertDialogDescription>
      <dl className="workspace-admin-grant-identities">
        <div><dt>워크스페이스</dt><dd>{displayedWorkspace.name} <small>{displayedWorkspace.id}</small></dd></div>
        <div><dt>대상</dt><dd>{displayedPrincipal.name} <small>{displayedPrincipal.id}</small> · {displayedPrincipal.kind === 'user' ? '사용자' : '그룹'} · {displayedPrincipal.status}</dd></div>
        <div><dt>권한</dt><dd>관리</dd></div>
      </dl>
      {view.kind === 'loading' ? <p role="status">영향 범위를 확인하는 중입니다.</p> : null}
      {view.kind === 'error' ? <div role="alert"><p>{actionError ? '관리자 지정 결과를 확인하지 못했습니다.' : '영향 범위를 확인하지 못했습니다.'}</p><Button type="button" onClick={() => { void load(false); }}>다시 확인</Button></div> : null}
      {view.kind === 'ready' ? <>
        <p role="status">현재 표시 가능한 적용 하위 노드 {view.preview.visibleDescendantCount}개</p>
        <p>관리 권한은 이 워크스페이스 전체에 적용되며, 상속이 끊긴 하위 항목에도 적용됩니다.</p>
        <p>이 수치는 현재 표시 가능한 하위 항목 기준입니다. 앞으로 추가되는 항목에도 관리 권한이 적용됩니다.</p>
        {view.preview.warnings.includes('suspended-subject') ? <p role="alert">비활성 주체입니다. 다시 활성화되면 관리 권한이 적용됩니다.</p> : null}
        {view.preview.alreadyAssigned ? <p>이미 관리자로 지정되어 있습니다.</p> : null}
        {expired ? <div role="alert"><p>미리보기 유효 시간이 끝났습니다. 다시 확인하세요.</p><Button type="button" onClick={() => { void load(true); }}>다시 확인</Button></div> : null}
        {view.stale ? <div role="alert"><p>정보가 바뀌었습니다. 갱신된 내용을 확인하세요.</p><Button type="button" onClick={() => setView({ kind: 'ready', preview: view.preview, stale: false })}>갱신된 내용 확인</Button></div> : null}
      </> : null}
      <div data-slot="alert-dialog-actions">
        <AlertDialogCancel ref={cancelRef} type="button" disabled={submitting} onClick={close}>취소</AlertDialogCancel>
        <Button type="button" variant="destructive" loading={submitting} disabled={disabled} onClick={() => { void submit(); }}>{submitting ? '지정 중…' : '관리자 지정'}</Button>
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
