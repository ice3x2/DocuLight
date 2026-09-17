import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useId, useRef, useState } from 'react';

import type { GrantReceipt, PrincipalRow, ShareRow, ShareViewBody } from '../api/client.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { GrantToast } from '../confirm/GrantToast.js';
import { RevokeConfirm } from '../confirm/RevokeConfirm.js';
import {
  BROKEN_INHERITANCE_NOTICE,
  inheritanceNotice,
  type ContainerKind,
} from '../confirm/notices.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';
import { GrantWarningList, type GrantWarning } from './GrantConfirm.js';
import { ACL레벨이름 } from './level-name.js';

export type ShareQueryState =
  | { readonly state: 'loading'; readonly nodeId: string }
  | { readonly state: 'ready'; readonly nodeId: string; readonly view: ShareViewBody }
  | { readonly state: 'error'; readonly nodeId: string; readonly onRetry: () => void };

export type ShareActionResult = { readonly ok: true; readonly grantReceipt?: GrantReceipt } | { readonly ok: false };

type ActionKind = 'grant' | 'revoke' | 'inheritance';
type GateState =
  | { kind: 'grant'; principal: PrincipalRow; level: 'view' | 'edit'; view: ShareViewBody; warnings: readonly GrantWarning[] }
  | { kind: 'break'; view: ShareViewBody }
  | { kind: 'inherit'; view: ShareViewBody };

const failedText: Record<ActionKind, string> = {
  grant: '권한을 부여하지 못했습니다.',
  revoke: '권한을 회수하지 못했습니다.',
  inheritance: '상속 설정을 변경하지 못했습니다.',
};

/** Node-bound sharing surface for IR-ACL-001/002/003 and SEC-ACL-015. */
export function ShareModal({
  nodeId,
  nodeName,
  nodeKind = 'file',
  contextKey = 'default',
  open,
  onOpenChange,
  query,
  view,
  refreshView,
  onWarnings,
  onGrant,
  onRevoke,
  onBreakInheritance,
  onInheritFromParent,
}: {
  nodeId: string;
  nodeName: string;
  nodeKind?: 'file' | ContainerKind;
  contextKey?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  query?: ShareQueryState;
  /** Compatibility input for existing isolated callers; application wiring uses query. */
  view?: ShareViewBody;
  refreshView?: () => Promise<ShareViewBody | undefined>;
  onWarnings?: (input: { principalId?: string; entryId?: string }) => Promise<readonly GrantWarning[] | undefined>;
  onGrant?: (principalId: string, level: 'view' | 'edit') => Promise<ShareActionResult>;
  onRevoke?: (entryId: string) => Promise<ShareActionResult>;
  onBreakInheritance?: () => Promise<ShareActionResult>;
  onInheritFromParent?: () => Promise<ShareActionResult>;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const operation = useRef(0);
  const revokePreparation = useRef<object | null>(null);
  const [selected, setSelected] = useState<PrincipalRow | null>(null);
  const [level, setLevel] = useState<'view' | 'edit'>('view');
  const [gate, setGate] = useState<GateState | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ row: ShareRow; warnings: readonly GrantWarning[]; targetKind: 'file' | ContainerKind } | null>(null);
  const [pending, setPending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<{ kind: ActionKind; ok: boolean; subject?: string; entryId?: string; principalId?: string; requestedLevel?: 'view' | 'edit'; identityUnavailable?: boolean; cannotRevoke?: boolean; revokeFailed?: boolean; targetKind?: 'file' | ContainerKind } | null>(null);

  const resolved: ShareQueryState = query ?? (view === undefined
    ? { state: 'loading', nodeId }
    : { state: 'ready', nodeId, view });
  const ready = resolved.state === 'ready' && resolved.nodeId === nodeId ? resolved.view : undefined;
  const unavailable = resolved.nodeId !== nodeId;

  useEffect(() => {
    operation.current += 1;
    revokePreparation.current = null;
    setSelected(null);
    setGate(null);
    setRevokeTarget(null);
    setPending(false);
    setPreparing(false);
    setResult(null);
  }, [nodeId, contextKey]);

  useEffect(() => {
    if (open !== false) return;
    operation.current += 1;
    revokePreparation.current = null;
    setGate(null);
    setRevokeTarget(null);
    setPending(false);
    setPreparing(false);
    setResult(null);
  }, [open]);

  const safeAction = async (kind: ActionKind, callback: (() => Promise<ShareActionResult>) | undefined, subject?: string, deferResult = false) => {
    if (callback === undefined || pending) return undefined;
    const generation = operation.current;
    setPending(true);
    setResult(null);
    let outcome: ShareActionResult | undefined;
    try {
      outcome = await callback();
    } catch {
      outcome = { ok: false };
    }
    if (operation.current !== generation) return undefined;
    if (deferResult && outcome?.ok === true) return outcome;
    setPending(false);
    const ok = outcome?.ok === true;
    setResult({ kind, ok, ...(subject === undefined ? {} : { subject }) });
    return outcome;
  };

  const warningsFor = async (input: { principalId?: string; entryId?: string }) => {
    if (onWarnings === undefined) return [] as readonly GrantWarning[];
    try {
      return await onWarnings(input);
    } catch {
      return undefined;
    }
  };

  const freshView = async () => {
    if (refreshView === undefined) return ready;
    try {
      return await refreshView();
    } catch {
      return undefined;
    }
  };

  const supersedeOperation = () => {
    operation.current += 1;
    revokePreparation.current = null;
    setPending(false);
    setPreparing(false);
    setGate(null);
    setRevokeTarget(null);
  };

  const resolveGrantMetadata = async (principalId: string, subject: string, requestedLevel: 'view' | 'edit', generation: number) => {
    const current = refreshView === undefined ? undefined : await freshView();
    if (operation.current !== generation) return false;
    const matches = current?.rows?.filter((row) => !row.inherited && row.principalId === principalId && row.level === requestedLevel && row.entryId !== null) ?? [];
    const authoritative = matches.length === 1 ? matches[0] : undefined;
    setPending(false);
    setResult({ kind: 'grant', ok: true, subject, principalId, requestedLevel, targetKind: current?.nodeKind ?? ready?.nodeKind ?? nodeKind, ...(current?.rows === null ? { identityUnavailable: true } : {}), ...(authoritative?.entryId === undefined || authoritative.entryId === null ? {} : { entryId: authoritative.entryId }) });
    return true;
  };

  const grantNow = async (principal: PrincipalRow, grantLevel: 'view' | 'edit') => {
    const outcome = await safeAction('grant', onGrant === undefined ? undefined : () => onGrant(principal.id, grantLevel), principal.name, true);
    if (outcome?.ok) {
      const generation = operation.current;
      if (outcome.grantReceipt !== undefined) {
        setPending(false);
        setResult({ kind: 'grant', ok: true, subject: principal.name, targetKind: ready?.nodeKind ?? nodeKind, ...(outcome.grantReceipt.canRevoke ? { entryId: outcome.grantReceipt.entryId } : { cannotRevoke: true }) });
      } else if (!await resolveGrantMetadata(principal.id, principal.name, grantLevel, generation)) return false;
      setSelected(null);
    }
    return outcome?.ok === true;
  };

  const startGrant = async () => {
    if (ready === undefined || selected === null || pending || preparing) return;
    const generation = operation.current;
    setPreparing(true);
    const captured = selected;
    const capturedLevel = level;
    const warnings = await warningsFor({ principalId: captured.id });
    if (operation.current !== generation) return;
    if (warnings === undefined) {
      setPreparing(false);
      setResult({ kind: 'grant', ok: false });
      return;
    }
    const requiresL2 = captured.kind === 'group' || captured.status === 'suspended' || ready.nodeKind !== 'file';
    if (!requiresL2) {
      setPreparing(false);
      await grantNow(captured, capturedLevel);
      return;
    }
    const current = await freshView();
    if (operation.current !== generation) return;
    if (current === undefined) {
      setPreparing(false);
      setResult({ kind: 'grant', ok: false });
      return;
    }
    setPreparing(false);
    setGate({ kind: 'grant', principal: captured, level: capturedLevel, view: current, warnings });
  };

  const startInheritance = async (kind: 'break' | 'inherit') => {
    if (pending) return;
    const generation = operation.current;
    const current = await freshView();
    if (operation.current !== generation) return;
    if (current === undefined) {
      setResult({ kind: 'inheritance', ok: false });
      return;
    }
    setGate({ kind, view: current });
  };

  const confirmGate = async () => {
    const captured = gate;
    if (captured === null) return;
    const generation = operation.current;
    const latest = await freshView();
    if (operation.current !== generation) return;
    if (latest === undefined) {
      setResult({ kind: captured.kind === 'grant' ? 'grant' : 'inheritance', ok: false });
      return;
    }
    if (latest.reached !== captured.view.reached || latest.nodeKind !== captured.view.nodeKind) {
      setGate({ ...captured, view: latest });
      return;
    }
    const outcome = captured.kind === 'grant'
      ? await grantNow(captured.principal, captured.level)
      : await safeAction(
          'inheritance',
          captured.kind === 'break' ? onBreakInheritance : onInheritFromParent,
        );
    const ok = typeof outcome === 'boolean' ? outcome : outcome?.ok === true;
    if (ok) setGate(null);
  };

  const revoke = async (row: ShareRow, targetKind: 'file' | ContainerKind) => {
    if (row.entryId === null) return;
    const generation = operation.current;
    const receiptResult = row.principalId === '' && result?.kind === 'grant' ? result : undefined;
    const outcome = await safeAction('revoke', onRevoke === undefined ? undefined : () => onRevoke(row.entryId!), row.principalName);
    if (operation.current !== generation) return;
    const ok = outcome?.ok === true;
    if (!ok && receiptResult !== undefined && operation.current === generation) {
      setResult({ ...receiptResult, revokeFailed: true });
    }
    if (ok || targetKind === 'file') setRevokeTarget(null);
  };

  const startRevoke = async (row: ShareRow) => {
    if (row.entryId === null || pending || revokePreparation.current !== null) return;
    const preparation = {};
    revokePreparation.current = preparation;
    const receiptResult = row.principalId === '' && result?.kind === 'grant' ? result : undefined;
    setPreparing(true);
    const generation = operation.current;
    const warnings = await warningsFor({ entryId: row.entryId });
    if (revokePreparation.current === preparation) revokePreparation.current = null;
    if (operation.current !== generation) return;
    setPreparing(false);
    if (warnings === undefined) {
      setResult(receiptResult === undefined ? { kind: 'revoke', ok: false } : { ...receiptResult, revokeFailed: true });
      return;
    }
    setRevokeTarget({ row, warnings, targetKind: result?.targetKind ?? ready?.nodeKind ?? nodeKind });
  };

  const close = (next: boolean) => {
    if (!next) {
      operation.current += 1;
      revokePreparation.current = null;
      setGate(null);
      setRevokeTarget(null);
      setResult(null);
      setPending(false);
      setPreparing(false);
    }
    onOpenChange?.(next);
  };

  return (
    <Dialog.Root {...(open === undefined ? {} : { open })} {...(onOpenChange === undefined ? {} : { onOpenChange: close })}>
      {open === undefined ? <Dialog.Trigger aria-label={`${nodeName} 공유`}>공유</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay data-share-overlay />
        <Dialog.Content data-share-dialog aria-labelledby={titleId} onOpenAutoFocus={(event) => {
          event.preventDefault();
          (ready === undefined ? heading.current : document.querySelector<HTMLElement>('[data-share-dialog] [aria-label="사용자·그룹 검색"]'))?.focus();
        }}>
          <header data-share-header>
            <Dialog.Title ref={heading} tabIndex={-1} id={titleId}>
              {nodeName} 공유{nodeKind === 'directory' ? ' (디렉토리)' : ''}
            </Dialog.Title>
            <Dialog.Description>이 노드의 직접 권한과 상속 권한을 확인하고 변경합니다.</Dialog.Description>
            <Dialog.Close aria-label="공유 닫기">×</Dialog.Close>
          </header>
          <div data-share-body>
            {unavailable || resolved.state === 'loading' ? <p role="status">공유 정보를 불러오는 중입니다.</p> : null}
            {!unavailable && resolved.state === 'error' ? <div role="alert">
              <p>공유 정보를 불러오지 못했습니다.</p>
              <button type="button" onClick={resolved.onRetry}>다시 시도</button>
            </div> : null}
            {ready === undefined ? null : <>
              <p data-testid="share-metrics">접근 가능 {ready.metrics.reachable}명</p>
              {ready.nodeKind === 'file' ? null : <p>선택한 컨테이너 자체에 접근할 수 있는 주체 수입니다.</p>}
              {ready.nodeKind === 'file' ? null : <>
                <p data-testid="inheritance-notice">{inheritanceNotice(ready.nodeKind)}</p>
                <p data-testid="broken-inheritance-notice">{BROKEN_INHERITANCE_NOTICE}</p>
              </>}

              <section data-share-grant>
                <PrincipalPicker scope={`node:${nodeId}`} onPick={(principal) => { supersedeOperation(); setSelected(principal); }} onSelectionInvalidated={() => { supersedeOperation(); setSelected(null); }} />
                {selected === null ? null : <p data-testid="selected-principal">
                  {selected.name} · {selected.kind === 'user' ? '사용자' : '그룹'} · {selected.status === 'active' ? '활성' : selected.status === 'pending' ? '대기' : '비활성'}
                </p>}
                <label htmlFor={`${titleId}-level`}>권한</label>
                <select id={`${titleId}-level`} value={level} onChange={(event) => {
                  supersedeOperation();
                  setLevel(event.target.value === 'edit' ? 'edit' : 'view');
                }}>
                  <option value="view">보기</option>
                  <option value="edit">편집</option>
                </select>
                <button type="button" disabled={selected === null || pending || preparing} onClick={() => { void startGrant(); }}>
                  {(pending || preparing) && result === null ? '추가 중…' : '추가'}
                </button>
              </section>

              {ready.level === 'admin' && ready.nodeKind !== 'workspace' ? <button type="button" data-testid="break-inheritance" onClick={() => { void startInheritance('break'); }}>상속 끊기</button> : null}
              {ready.level === 'admin' && ready.nodeKind !== 'workspace' && !ready.inheritsAcl ? <button type="button" data-testid="inherit-from-parent" onClick={() => { void startInheritance('inherit'); }}>부모 권한 가져오기</button> : null}

              {ready.rows === null ? null : <div data-share-roster role="list" aria-label="공유 대상">
                <section aria-labelledby={`${titleId}-direct`}>
                  <h3 id={`${titleId}-direct`}>직접 부여</h3>
                  <ul>{ready.rows.filter((row) => !row.inherited).map((row) => <ShareEntry key={row.entryId ?? row.principalId} row={row} onRevoke={() => { void startRevoke(row); }} />)}</ul>
                </section>
                {ready.nodeKind === 'workspace' ? null : <section aria-labelledby={`${titleId}-inherited`}>
                  <h3 id={`${titleId}-inherited`}>상속됨 · 읽기 전용</h3>
                  <ul>{ready.rows.filter((row) => row.inherited).map((row) => <ShareEntry key={`${row.principalId}@${row.source}`} row={row} />)}</ul>
                </section>}
                {ready.rows.length === 0 ? <p>표시할 권한 항목이 없습니다.</p> : null}
              </div>}
            </>}
              {result?.ok && result.kind === 'grant' && result.subject !== undefined ? <>
                <GrantToast subjectName={result.subject} disabled={pending || preparing} {...(result.identityUnavailable ? { limitation: '현재 권한에서는 회수 대상을 확인할 수 없습니다.' } : result.cannotRevoke ? { limitation: '현재 권한으로는 이 항목을 회수할 수 없습니다.' } : {})} {...(result.entryId === undefined ? {} : { entryId: result.entryId, onRevoke: (entryId: string) => { void startRevoke({ entryId, principalId: '', principalName: result.subject!, principalKind: 'user', level: 'view', inherited: false, source: null }); } })} />
                {result.entryId === undefined && !result.identityUnavailable && result.principalId !== undefined && result.requestedLevel !== undefined && refreshView !== undefined ? <button type="button" disabled={pending} onClick={() => { const generation = operation.current; setPending(true); void resolveGrantMetadata(result.principalId!, result.subject!, result.requestedLevel!, generation); }}>회수 대상 다시 확인</button> : null}
                {result.revokeFailed ? <p role="alert">권한을 회수하지 못했습니다. 다시 시도하십시오.</p> : null}
              </> : null}
              {result !== null && !result.ok ? <p role="alert">{failedText[result.kind]} 다시 시도하십시오.</p> : null}
          </div>

          <ConfirmGate
            open={gate !== null}
            grade={gate?.kind === 'break' && gate.view.nodeKind === 'directory' ? 'L3' : 'L2'}
            title={gate?.kind === 'grant'
              ? `${nodeName} 에 ${gate.principal.name} 권한을 부여합니다`
              : gate?.kind === 'break'
                ? `${nodeName} 의 상속을 끊습니다`
                : `${nodeName} 에 부모의 권한을 가져옵니다`}
            {...(gate?.kind === 'break' && gate.view.nodeKind === 'directory' ? { token: String(gate.view.reached) } : {})}
            {...(gate?.view.nodeKind !== 'file' ? { counts: { reached: gate?.view.reached } } : {})}
            onConfirm={confirmGate}
            onCancel={() => setGate(null)}
          >
            {gate?.kind === 'grant' ? <>
              <p>{gate.principal.name} · {gate.principal.kind === 'user' ? '사용자' : '그룹'}</p>
              <p>요청 권한: {gate.level === 'view' ? '보기' : '편집'}</p>
              {gate.view.nodeKind === 'file' ? null : <p>적용 하위 {gate.view.reached}개</p>}
              <GrantWarningList warnings={gate.warnings} />
            </> : null}
          </ConfirmGate>

          <RevokeConfirm
            open={revokeTarget !== null}
            targetKind={revokeTarget?.targetKind ?? nodeKind}
            subjectName={revokeTarget?.row.principalName ?? ''}
            forceConfirm={(revokeTarget?.warnings.length ?? 0) > 0}
            onConfirm={async () => { if (revokeTarget !== null) await revoke(revokeTarget.row, revokeTarget.targetKind); }}
            onCancel={() => setRevokeTarget(null)}
          >
            <GrantWarningList warnings={revokeTarget?.warnings ?? []} />
          </RevokeConfirm>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ShareEntry({ row, onRevoke }: { row: ShareRow; onRevoke?: () => void }) {
  return <li data-inherited={row.inherited ? 'true' : 'false'}>
    <span>{row.principalName}</span>
    <span>{row.principalKind === 'user' ? '사용자' : '그룹'}</span>
    <span>{ACL레벨이름(row.level)}</span>
    {row.entryId === null
      ? <span data-testid="share-source">{row.source === null ? '상속됨' : `${row.source} 에서 상속`}</span>
      : <button type="button" onClick={onRevoke}>{row.principalName} 회수</button>}
  </li>;
}
