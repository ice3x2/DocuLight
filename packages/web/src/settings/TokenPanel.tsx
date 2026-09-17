import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { ConfirmGate } from '../confirm/ConfirmGate.js';
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  DEFAULT_TOKEN_SCOPE,
  SCOPE_LABELS,
  TOKEN_EXPIRY_CHOICES,
  type TokenIssueInput,
  type TokenRowView,
  type TokenScope,
} from './token-contract.js';

export type TokenOwner = { readonly userId: string; readonly generation: number };
export type TokenQueryState =
  | { readonly state: 'loading' }
  | { readonly state: 'error'; readonly onRetry: () => void }
  | { readonly state: 'ready'; readonly rows: readonly TokenRowView[] };
export type TokenLeaveGuard = (continueLeave: () => void) => boolean;
type Stage = 'list' | 'form' | 'issuing' | 'reveal' | 'copying' | 'discard';

/** Inline PAT lifecycle for SEC-AUTH-006/007/008/009 and IR-AUTH-003. */
export function TokenPanel({
  owner,
  query,
  rows,
  lostNotice = false,
  onLostNotice,
  onLeaveGuardChange,
  onIssue,
  onRevoke,
}: {
  owner?: TokenOwner;
  query?: TokenQueryState;
  rows?: readonly TokenRowView[];
  lostNotice?: boolean;
  onLostNotice?: (visible: boolean) => void;
  onLeaveGuardChange?: (guard: TokenLeaveGuard | null) => void;
  onIssue?: (input: TokenIssueInput) => Promise<{ token: string } | undefined>;
  onRevoke?: (id: string) => Promise<{ ok: true } | { ok: false }>;
}) {
  const prefix = useId();
  const tokenQuery = query ?? { state: 'ready' as const, rows: rows ?? [] };
  const [stage, setStage] = useState<Stage>('list');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>(DEFAULT_TOKEN_SCOPE);
  const [days, setDays] = useState(DEFAULT_TOKEN_EXPIRY_DAYS);
  const [nameError, setNameError] = useState(false);
  const [issueError, setIssueError] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [revokeError, setRevokeError] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TokenRowView | null>(null);
  const pendingLeave = useRef<(() => void) | null>(null);
  const operation = useRef(0);
  const issuePending = useRef(false);
  const copyPending = useRef(false);
  const newTokenRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const plaintextRef = useRef<HTMLTextAreaElement>(null);
  const discardContinueRef = useRef<HTMLButtonElement>(null);
  const copyActionRef = useRef<HTMLButtonElement>(null);
  const revealActionFocus = useRef(false);

  const clearSecret = (showNotice: boolean) => {
    operation.current += 1;
    pendingLeave.current = null;
    issuePending.current = false;
    copyPending.current = false;
    setPlaintext(null);
    setCopyError(false);
    setStage('list');
    onLostNotice?.(showNotice);
  };

  useEffect(() => {
    operation.current += 1;
    issuePending.current = false;
    copyPending.current = false;
    pendingLeave.current = null;
    setPlaintext(null);
    setStage('list');
    setIssueError(false);
    setCopyError(false);
    setRevokeTarget(null);
    setRevokeError(false);
  }, [owner?.generation, owner?.userId]);

  useEffect(() => {
    if (stage === 'form') nameRef.current?.focus();
    else if (stage === 'reveal') {
      if (revealActionFocus.current) copyActionRef.current?.focus();
      else plaintextRef.current?.focus();
      revealActionFocus.current = false;
    }
    else if (stage === 'discard') discardContinueRef.current?.focus();
    else if (stage === 'list') newTokenRef.current?.focus();
  }, [stage]);

  useEffect(() => {
    if (onLeaveGuardChange === undefined) return;
    if (!['issuing', 'reveal', 'copying', 'discard'].includes(stage)) {
      onLeaveGuardChange(null);
      return;
    }
    const guard: TokenLeaveGuard = (continueLeave) => {
      if (pendingLeave.current !== null) return false;
      pendingLeave.current = continueLeave;
      if (stage !== 'issuing') setStage('discard');
      return false;
    };
    onLeaveGuardChange(guard);
    return () => onLeaveGuardChange(null);
  }, [onLeaveGuardChange, stage]);

  const openForm = () => {
    setName('');
    setScope(DEFAULT_TOKEN_SCOPE);
    setDays(DEFAULT_TOKEN_EXPIRY_DAYS);
    setNameError(false);
    setIssueError(false);
    onLostNotice?.(false);
    setStage('form');
  };

  const issue = async (event?: FormEvent) => {
    event?.preventDefault();
    if (issuePending.current) return;
    if (name.trim() === '') {
      setNameError(true);
      return;
    }
    if (onIssue === undefined || owner === undefined) return;
    const attempt = ++operation.current;
    issuePending.current = true;
    setNameError(false);
    setIssueError(false);
    setStage('issuing');
    let result: { token: string } | undefined;
    try {
      result = await onIssue({ name: name.trim(), scope, expiresInDays: days });
    } catch {
      result = undefined;
    }
    if (attempt !== operation.current) return;
    issuePending.current = false;
    if (result === undefined || result.token === '') {
      setIssueError(true);
      setStage('form');
      return;
    }
    setPlaintext(result.token);
    setStage(pendingLeave.current === null ? 'reveal' : 'discard');
  };

  const copyAndClose = async () => {
    if (copyPending.current || plaintext === null) return;
    const attempt = ++operation.current;
    copyPending.current = true;
    setCopyError(false);
    setStage('copying');
    try {
      if (navigator.clipboard === undefined) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(plaintext);
    } catch {
      if (attempt === operation.current) {
        pendingLeave.current = null;
        copyPending.current = false;
        setCopyError(true);
        revealActionFocus.current = true;
        setStage('reveal');
      }
      return;
    }
    if (attempt !== operation.current) return;
    copyPending.current = false;
    clearSecret(false);
  };

  const acceptDiscard = () => {
    const continuation = pendingLeave.current;
    pendingLeave.current = null;
    clearSecret(true);
    continuation?.();
  };
  const cancelDiscard = () => {
    pendingLeave.current = null;
    revealActionFocus.current = true;
    setStage('reveal');
  };

  const confirmRevoke = async () => {
    if (revokeTarget === null || onRevoke === undefined) return;
    const attempt = ++operation.current;
    setRevokeError(false);
    const result = await onRevoke(revokeTarget.id).catch(() => ({ ok: false as const }));
    if (attempt !== operation.current) return;
    setRevokeTarget(null);
    if (!result.ok) setRevokeError(true);
  };

  const canMutate = owner !== undefined;
  return (
    <section data-token-panel data-stage={stage}>
      <h2 tabIndex={-1}>{['reveal', 'copying', 'discard'].includes(stage) ? '토큰이 발급되었습니다' : '액세스 토큰'}</h2>
      {stage === 'list' ? <>
        {lostNotice ? <p data-testid="token-lost-notice">평문은 다시 볼 수 없습니다. 필요하면 새로 발급해야 합니다.</p> : null}
        <p data-testid="token-scope-notice">MCP 클라이언트와 API 는 이 토큰으로 인증합니다. 토큰의 실제 권한은 스코프와 현재 유효 권한의 교집합입니다.</p>
        <button ref={newTokenRef} type="button" disabled={!canMutate} onClick={openForm}>새 액세스 토큰</button>
        <div aria-label="액세스 토큰 목록" data-token-list-region>
          {owner === undefined || tokenQuery.state === 'loading' ? <p role="status">토큰 목록을 불러오는 중입니다.</p> : null}
          {tokenQuery.state === 'error' ? <div role="alert"><p>토큰 목록을 불러오지 못했습니다.</p><button type="button" onClick={tokenQuery.onRetry}>다시 시도</button></div> : null}
          {tokenQuery.state === 'ready' && tokenQuery.rows.length === 0 ? <p>발급된 액세스 토큰이 없습니다.</p> : null}
          {tokenQuery.state === 'ready' && tokenQuery.rows.length > 0 ? <div tabIndex={0} aria-label="액세스 토큰 표" data-token-table-scroll><table><thead><tr><th scope="col">이름</th><th scope="col">스코프</th><th scope="col">만료일</th><th scope="col">마지막 사용</th><th scope="col">조작</th></tr></thead><tbody>
            {tokenQuery.rows.map((token) => {
              const expired = isExpired(token.expiresAt);
              const semanticStyle = {
                color: expired ? 'var(--text-secondary, rgb(85, 85, 85))' : 'var(--text-primary, rgb(18, 18, 18))',
                backgroundColor: 'var(--surface-document, rgb(255, 255, 255))',
              };
              return <tr key={token.id} data-expired={expired || undefined}><td style={semanticStyle}>{token.name}</td><td style={semanticStyle}>{SCOPE_LABELS[token.scope]}</td><td style={semanticStyle}>{date(token.expiresAt)}{expired ? ' (만료됨)' : ''}</td><td style={semanticStyle}>{token.lastUsedAt === null ? '사용 안 함' : date(token.lastUsedAt)}</td><td>{token.revokedAt === null ? <button type="button" disabled={!canMutate} onClick={() => { setRevokeError(false); setRevokeTarget(token); }}>{token.name} 폐기</button> : '폐기됨'}</td></tr>;
            })}
          </tbody></table></div> : null}
        </div>
        {revokeError ? <p role="alert">토큰을 폐기하지 못했습니다. 다시 시도하십시오.</p> : null}
        <p data-testid="token-account-notice">계정이 활성 상태가 아니게 되면 이 계정의 토큰은 전부 즉시 무효가 됩니다. 이 화면에서는 조작할 수 없습니다.</p>
      </> : null}

      {stage === 'form' || stage === 'issuing' ? <form onSubmit={(event) => { void issue(event); }} data-token-form>
        <label htmlFor={`${prefix}-name`}>이름</label><input ref={nameRef} id={`${prefix}-name`} value={name} disabled={stage === 'issuing'} aria-invalid={nameError || undefined} aria-describedby={nameError ? `${prefix}-name-error` : undefined} onChange={(event) => setName(event.target.value)} />
        {nameError ? <p id={`${prefix}-name-error`} role="alert">이름을 입력하십시오.</p> : null}
        <fieldset disabled={stage === 'issuing'}><legend>스코프</legend>{(Object.keys(SCOPE_LABELS) as TokenScope[]).map((value) => <span key={value}><input type="radio" id={`${prefix}-${value}`} name={`${prefix}-scope`} checked={scope === value} onChange={() => setScope(value)} /><label htmlFor={`${prefix}-${value}`}>{SCOPE_LABELS[value]}</label></span>)}</fieldset>
        <label htmlFor={`${prefix}-days`}>만료 기간</label><select id={`${prefix}-days`} value={days} disabled={stage === 'issuing'} onChange={(event) => setDays(Number(event.target.value))}>{TOKEN_EXPIRY_CHOICES.map((value) => <option key={value} value={value}>{value}일</option>)}</select>
        {issueError ? <p role="alert">토큰을 발급하지 못했습니다. 입력을 확인하고 다시 시도하십시오.</p> : null}
        {onIssue === undefined || owner === undefined ? <p>인증 정보를 확인하는 동안 발급할 수 없습니다.</p> : null}
        {stage === 'issuing' ? <p role="status">토큰을 발급하는 중입니다.</p> : null}
        <div data-token-actions><button type="button" disabled={stage === 'issuing'} onClick={() => setStage('list')}>취소</button><button type="submit" disabled={stage === 'issuing' || onIssue === undefined || owner === undefined}>{stage === 'issuing' ? '발급 중' : '발급'}</button></div>
      </form> : null}

      {stage === 'reveal' || stage === 'copying' || stage === 'discard' ? <div data-token-reveal>
        <label htmlFor={`${prefix}-plaintext`}>발급된 액세스 토큰</label><textarea ref={plaintextRef} id={`${prefix}-plaintext`} data-testid="token-plaintext" readOnly spellCheck={false} autoComplete="off" value={plaintext ?? ''} />
        <p>이 값은 지금 한 번만 보입니다. 닫으면 다시 볼 수 없고, 잃으면 새로 발급해야 합니다.</p>
        {stage === 'discard' ? <><p data-testid="token-close-reconfirm">아직 복사하지 않았다면 지금이 마지막입니다. 닫으면 다시 볼 수 없습니다.</p><div data-token-actions><button ref={discardContinueRef} type="button" onClick={cancelDiscard}>계속 보기</button><button type="button" onClick={acceptDiscard}>그래도 닫기</button></div></> : <>{copyError ? <p role="alert" data-testid="token-copy-failed">복사하지 못했습니다. 위의 값을 직접 선택해 복사한 뒤 닫으십시오.</p> : null}<div data-token-actions><button ref={copyActionRef} type="button" disabled={stage === 'copying'} onClick={() => { void copyAndClose(); }}>{stage === 'copying' ? '복사 중' : '복사하고 닫기'}</button><button type="button" disabled={stage === 'copying'} onClick={() => setStage('discard')}>닫기</button></div></>}
      </div> : null}

      <ConfirmGate open={revokeTarget !== null} grade="L2" title={`${revokeTarget?.name ?? ''} 를 폐기합니다`} pendingLabel="처리 중" onConfirm={confirmRevoke} onCancel={() => setRevokeTarget(null)}><p>이 토큰을 쓰던 클라이언트는 즉시 인증되지 않습니다. 되돌릴 수 없고 재발급뿐입니다.</p></ConfirmGate>
    </section>
  );
}

const date = (iso: string) => iso.slice(0, 10);
const isExpired = (iso: string) => new Date(iso).getTime() <= Date.now();
