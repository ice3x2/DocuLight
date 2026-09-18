import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { ApiError, type ShareRow } from '../api/client.js';
import { GrantWarningList, type GrantWarning } from '../acl/GrantConfirm.js';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Button,
} from '../components/ui/index.js';

export interface WorkspaceAdminRevokeReceipt {
  workspaceId: string;
  entryId: string;
}

export interface WorkspaceAdminRevokeDialogProps {
  open: boolean;
  workspace: { id: string; name: string };
  administrator: ShareRow;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onLoadWarnings: (entryId: string) => Promise<readonly GrantWarning[]>;
  onRevoke: (workspaceId: string, entryId: string) => Promise<void>;
  onAuthenticationLoss?: () => void;
  onClose: (receipt?: WorkspaceAdminRevokeReceipt) => void;
}

type View =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; warnings: readonly GrantWarning[]; stale: boolean };

// @req IR-WORKSPACE-001
export function WorkspaceAdminRevokeDialog({
  open,
  workspace,
  administrator,
  restoreFocusRef,
  onLoadWarnings,
  onRevoke,
  onAuthenticationLoss,
  onClose,
}: WorkspaceAdminRevokeDialogProps) {
  const [visible, setVisible] = useState(open);
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState(false);
  const generation = useRef(0);
  const submitted = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const entryId = administrator.entryId;
  const contextKey = workspace.id + '\u0000' + (entryId ?? '') + '\u0000' + administrator.principalId;
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;

  const load = useCallback(async () => {
    if (entryId === null) return;
    const mine = ++generation.current;
    setView({ kind: 'loading' });
    setActionError(false);
    try {
      const warnings = await onLoadWarnings(entryId);
      if (generation.current === mine && activeContext.current === contextKey) {
        setView({ kind: 'ready', warnings, stale: false });
      }
    } catch {
      if (generation.current === mine && activeContext.current === contextKey) setView({ kind: 'error' });
    }
  }, [contextKey, entryId, onLoadWarnings]);

  useEffect(() => {
    if (!open) return;
    setVisible(true);
    submitted.current = false;
    setSubmitting(false);
    void load();
    return () => { generation.current += 1; };
  }, [load, open]);

  if (!open || !visible || entryId === null) return null;

  const close = () => {
    if (submitting) return;
    generation.current += 1;
    setVisible(false);
    onClose();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (restoreFocusRef?.current?.isConnected) restoreFocusRef.current.focus();
    }));
  };

  const submit = async () => {
    if (view.kind !== 'ready' || view.stale || checking || submitting || submitted.current) return;
    const mine = generation.current;
    const submittedContext = contextKey;
    setChecking(true);
    let refreshedWarnings: readonly GrantWarning[];
    try {
      refreshedWarnings = await onLoadWarnings(entryId);
    } catch (error) {
      if (generation.current !== mine || activeContext.current !== submittedContext) return;
      if (error instanceof ApiError && error.status === 401) {
        generation.current += 1;
        setVisible(false);
        onAuthenticationLoss?.();
        onClose();
        return;
      }
      setView({ kind: 'error' });
      return;
    } finally {
      if (generation.current === mine && activeContext.current === submittedContext) setChecking(false);
    }
    if (generation.current !== mine || activeContext.current !== submittedContext) return;
    const sameWarnings = [...refreshedWarnings].sort().join('\u0000') === [...view.warnings].sort().join('\u0000');
    if (!sameWarnings) {
      setView({ kind: 'ready', warnings: refreshedWarnings, stale: true });
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    setActionError(false);
    try {
      await onRevoke(workspace.id, entryId);
      if (generation.current === mine && activeContext.current === submittedContext) {
        onClose({ workspaceId: workspace.id, entryId });
      }
    } catch (error) {
      if (generation.current === mine && activeContext.current === submittedContext) {
        if (error instanceof ApiError && error.status === 401) {
          generation.current += 1;
          setVisible(false);
          onAuthenticationLoss?.();
          onClose();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (restoreFocusRef?.current?.isConnected) restoreFocusRef.current.focus();
          }));
          return;
        }
        submitted.current = false;
        setActionError(true);
      }
    } finally {
      if (generation.current === mine && activeContext.current === submittedContext) setSubmitting(false);
    }
  };

  return <AlertDialog open onOpenChange={(next) => { if (!next) close(); }}>
    <AlertDialogContent onOpenAutoFocus={(event) => {
      event.preventDefault();
      cancelRef.current?.focus();
    }} onCloseAutoFocus={(event) => {
      if (restoreFocusRef !== undefined) {
        event.preventDefault();
        restoreFocusRef.current?.focus();
      }
    }}>
      <AlertDialogTitle>워크스페이스 관리 권한 회수</AlertDialogTitle>
      <AlertDialogDescription>서버의 최신 경고를 확인한 뒤 직접 지정된 관리 권한을 회수합니다.</AlertDialogDescription>
      <dl className="workspace-admin-revoke-identities">
        <div><dt>워크스페이스</dt><dd>{workspace.name} <small>{workspace.id}</small></dd></div>
        <div><dt>대상</dt><dd>{administrator.principalName} <small>{administrator.principalId}</small></dd></div>
        <div><dt>권한</dt><dd>관리</dd></div>
      </dl>
      {view.kind === 'loading' ? <p role="status">회수 영향을 확인하는 중입니다.</p> : null}
      {view.kind === 'error' ? <div role="alert">
        <p>회수 영향을 확인하지 못했습니다.</p>
        <Button type="button" onClick={() => { void load(); }}>다시 확인</Button>
      </div> : null}
      {view.kind === 'ready' ? <>
        <p>이 직접 지정된 관리 권한을 회수합니다.</p>
        <GrantWarningList warnings={view.warnings} />
        {view.stale ? <div role="alert">
          <p>경고 내용이 바뀌었습니다. 새 내용을 확인하세요.</p>
          <Button type="button" onClick={() => setView({ kind: 'ready', warnings: view.warnings, stale: false })}>새 내용 확인</Button>
        </div> : null}
      </> : null}
      {actionError ? <p role="alert">관리 권한을 회수하지 못했습니다. 다시 시도하려면 영향을 새로 확인하세요.</p> : null}
      <div data-slot="alert-dialog-actions">
        <AlertDialogCancel ref={cancelRef} type="button" disabled={submitting} onClick={close}>취소</AlertDialogCancel>
        <Button type="button" variant="destructive" loading={submitting}
          disabled={view.kind !== 'ready' || view.stale || checking || submitting || actionError}
          onClick={() => { void submit(); }}>{submitting ? '회수 중…' : checking ? '다시 확인 중…' : '관리 권한 회수'}</Button>
      </div>
    </AlertDialogContent>
  </AlertDialog>;
}
