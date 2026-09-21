import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { PrincipalRow, RevocationBody, RevocationScope, RevocationSubject } from '../api/client.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';
import { PrincipalPicker } from '../principal/PrincipalPicker.js';

export type AuditQuery<T> = { state: 'idle' } | { state: 'loading' } | { state: 'ready'; data: T } | { state: 'error'; onRetry: () => void };
export interface SubjectPlan { subject: RevocationSubject; response: RevocationBody }
export interface BulkPlan { subjects: readonly SubjectPlan[] }
export interface CompletedRevokeSubjectResult { revocation: RevocationBody; refreshFailed: boolean }
export type RevokeSubjectResult =
  | CompletedRevokeSubjectResult
  | { kind: 'blocked' };
export type SubjectOutcome =
  | { subjectId: string; state: 'completed'; result: CompletedRevokeSubjectResult }
  | { subjectId: string; state: 'unconfirmed' }
  | { subjectId: string; state: 'not-run' };

const SCOPE_NOTE: Record<RevocationScope, string> = {
  instance: '이 회수는 전 인스턴스에 적용됩니다.',
  'managed-workspaces': '이 회수는 당신이 관리하는 워크스페이스에만 적용됩니다.',
};
const SYSTEM_GROUP_NOTE = '시스템 그룹입니다. 걷힌 항목은 가입·활성화 절차로 되살아나지 않습니다.';
const LEVEL = { view: '보기', edit: '편집', admin: '관리' } as const;

function inspectPlan(plan: BulkPlan, subjects: readonly RevocationSubject[]) {
  const expected = subjects.map((subject) => subject.id);
  const actual = plan.subjects.map(({ subject }) => subject.id);
  if (new Set(expected).size !== expected.length || expected.join('\u0000') !== actual.join('\u0000')) return { valid: false, total: 0, scope: null } as const;
  const scopes = new Set(plan.subjects.map(({ response }) => response.scope));
  const entries = new Map<string, { owner: string; data: string }>();
  for (const item of plan.subjects) {
    for (const row of item.response.rows) {
      const previous = entries.get(row.entryId);
      const data = JSON.stringify(row);
      if (previous !== undefined && (previous.owner !== item.subject.id || previous.data !== data)) return { valid: false, total: 0, scope: null } as const;
      entries.set(row.entryId, { owner: item.subject.id, data });
    }
  }
  if (scopes.size !== 1) return { valid: false, total: 0, scope: null } as const;
  return { valid: true, total: entries.size, scope: [...scopes][0]! } as const;
}

function identity(plan: BulkPlan) {
  return JSON.stringify(plan.subjects.map(({ subject, response }) => ({ subjectId: subject.id, scope: response.scope, entryIds: response.rows.map((row) => row.entryId).sort() })));
}

export interface BulkRevokeProps {
  contextKey: string;
  workspaceId: string;
  subjects: readonly RevocationSubject[];
  plan: AuditQuery<BulkPlan>;
  onPick: (row: PrincipalRow) => void;
  onRemove: (id: string) => void;
  onPreview: (subjects: readonly RevocationSubject[]) => Promise<BulkPlan>;
  onRevokeSubject: (principalId: string) => Promise<RevokeSubjectResult>;
  onOffboard?: (subject: RevocationSubject) => void;
  onFlowExit?: () => void;
}

export function BulkRevokePanel({ contextKey, workspaceId, subjects, plan: current, onPick, onRemove, onPreview, onRevokeSubject, onOffboard, onFlowExit }: BulkRevokeProps) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ next?: string; previous?: string } | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const renderedContext = useRef(contextKey);
  if (renderedContext.current !== contextKey) {
    renderedContext.current = contextKey;
    generation.current += 1;
  }
  const [gatePlan, setGatePlan] = useState<BulkPlan | null>(null);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<readonly SubjectOutcome[]>([]);
  const contractReady = contextKey !== undefined && current !== undefined && onPick !== undefined && onRemove !== undefined && onPreview !== undefined && onRevokeSubject !== undefined;
  const checked = contractReady && current.state === 'ready' ? inspectPlan(current.data, subjects) : null;
  const subjectKey = subjects.map((subject) => subject.id).join('\u0000');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; };
  }, []);
  useEffect(() => {
    generation.current += 1;
    setGatePlan(null);
    setOpening(false);
    setMessage(null);
    setOutcomes([]);
  }, [contextKey, workspaceId, subjectKey]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    pendingFocus.current = null;
    const target = (pending.next === undefined ? undefined : removeRefs.current.get(pending.next))
      ?? (pending.previous === undefined ? undefined : removeRefs.current.get(pending.previous))
      ?? sectionRef.current?.querySelector<HTMLInputElement>('[aria-label="사용자·그룹 검색"]');
    target?.focus();
  }, [subjectKey]);

  const isCurrent = (request: number) => mounted.current && generation.current === request && renderedContext.current === contextKey;
  const openGate = async () => {
    if (subjects.length === 0 || current.state !== 'ready' || checked?.valid !== true || checked.total === 0 || opening) return;
    const request = generation.current;
    setOpening(true);
    setMessage(null);
    try {
      const fresh = await onPreview(subjects);
      if (!isCurrent(request)) return;
      const inspection = inspectPlan(fresh, subjects);
      if (!inspection.valid || inspection.total === 0) {
        if (isCurrent(request)) setMessage('완전한 미리보기를 불러오지 못했습니다. 미리보기를 새로고침하세요.');
        return;
      }
      if (isCurrent(request)) setGatePlan(fresh);
    } catch {
      if (isCurrent(request)) setMessage('미리보기를 불러오지 못했습니다. 다시 시도하세요.');
    } finally {
      if (isCurrent(request)) setOpening(false);
    }
  };
  const execute = async () => {
    if (gatePlan === null) return;
    const request = generation.current;
    const frozen = gatePlan;
    try {
      const fresh = await onPreview(frozen.subjects.map(({ subject }) => subject));
      if (!isCurrent(request)) return;
      if (identity(fresh) !== identity(frozen) || !inspectPlan(fresh, subjects).valid) {
        if (!isCurrent(request)) return;
        setGatePlan(null);
        if (!isCurrent(request)) return;
        setMessage('미리보기가 변경되었습니다. 갱신된 내용을 다시 확인하세요.');
        return;
      }
      const ids = frozen.subjects.map(({ subject }) => subject.id);
      const next: SubjectOutcome[] = [];
      for (let index = 0; index < ids.length; index += 1) {
        const subjectId = ids[index]!;
        try {
          const result = await onRevokeSubject(subjectId);
          if (!isCurrent(request)) return;
          if (!('revocation' in result)) return;
          next.push({ subjectId, state: 'completed', result });
        } catch {
          if (!isCurrent(request)) return;
          next.push({ subjectId, state: 'unconfirmed' });
          for (const remaining of ids.slice(index + 1)) next.push({ subjectId: remaining, state: 'not-run' });
          break;
        }
      }
      if (!isCurrent(request)) return;
      setOutcomes(next);
      if (!isCurrent(request)) return;
      setGatePlan(null);
      onFlowExit?.();
    } catch {
      if (!isCurrent(request)) return;
      setGatePlan(null);
      if (isCurrent(request)) setMessage('미리보기를 확인하지 못해 회수를 실행하지 않았습니다.');
    }
  };
  const removeSubject = (id: string) => {
    const index = subjects.findIndex((subject) => subject.id === id);
    pendingFocus.current = {
      ...(subjects[index + 1] === undefined ? {} : { next: subjects[index + 1]!.id }),
      ...(subjects[index - 1] === undefined ? {} : { previous: subjects[index - 1]!.id }),
    };
    onRemove(id);
  };
  const gateInspection = gatePlan === null ? null : inspectPlan(gatePlan, subjects);
  const confirmedTotal = useMemo(() => outcomes.reduce((total, outcome) => outcome.state === 'completed' ? total + outcome.result.revocation.rows.length : total, 0), [outcomes]);

  if (!contractReady) return <section className="acl-audit-section"><p role="alert">회수 상태를 사용할 수 없습니다.</p></section>;

  return <section ref={sectionRef} className="acl-audit-section" aria-labelledby="bulk-revoke-heading">
    <h2 id="bulk-revoke-heading">주체 단위 권한 회수</h2>
    <PrincipalPicker scope={`workspace:${workspaceId}`} onPick={onPick} />
    {subjects.length === 0 ? <p>회수할 사용자 또는 그룹을 선택하세요.</p> : <ul className="acl-subject-list" data-testid="revocation-subjects">{subjects.map((subject) => <li key={subject.id}>
      <span>{subject.name} · {subject.kind === 'user' ? '사용자' : '그룹'}</span>
      {subject.system === true ? <span data-testid="system-group-notice">{SYSTEM_GROUP_NOTE}</span> : null}
      {subject.kind === 'user' && onOffboard !== undefined ? <button type="button" aria-label="오프보딩 열기" data-offboarding-principal-id={subject.id} onClick={() => onOffboard(subject)}>오프보딩</button> : null}
      <button ref={(node) => { if (node === null) removeRefs.current.delete(subject.id); else removeRefs.current.set(subject.id, node); }} type="button" aria-label={`${subject.name} 제거`} onClick={() => removeSubject(subject.id)}>선택에서 제거</button>
    </li>)}</ul>}
    {current.state === 'idle' ? <p role="status">회수할 주체를 선택하세요.</p> : null}
    {current.state === 'loading' ? <p role="status">회수 영향을 확인하는 중…</p> : null}
    {current.state === 'error' ? <div role="alert"><p>회수 영향을 확인하지 못했습니다.</p><button type="button" onClick={current.onRetry}>미리보기 다시 시도</button></div> : null}
    {current.state === 'ready' && checked?.valid === false ? <p role="alert">미리보기가 선택 주체와 일치하지 않습니다. 미리보기를 새로고침하세요.</p> : null}
    {current.state === 'ready' && checked?.valid === true ? <><p data-testid="revocation-scope">{SCOPE_NOTE[checked.scope]}</p>{current.data.subjects.map(({ subject, response }) => <details key={subject.id} open data-testid={`revocation-group-${subject.id}`}>
      <summary>{subject.name} · {response.rows.length}건</summary>
      {response.rows.length === 0 ? <p>회수할 ACL 항목이 없습니다.</p> : <div className="acl-table-scroll"><table><caption>{subject.name}에게서 걷힐 항목</caption><thead><tr><th>워크스페이스</th><th>경로</th><th>레벨</th><th>부여자</th><th>부여 시각</th></tr></thead><tbody>{response.rows.map((item) => <tr key={item.entryId}><td>{item.workspaceName}</td><td>{item.path ?? '워크스페이스 전체'}</td><td>{LEVEL[item.level]}</td><td>{item.grantedBy ?? '시스템'}</td><td>{item.grantedAt}</td></tr>)}</tbody></table></div>}
    </details>)}</> : null}
    {message === null ? null : <p role="alert">{message}</p>}
    <button ref={actionRef} type="button" disabled={subjects.length === 0 || opening || current.state !== 'ready' || checked?.valid !== true || checked.total === 0} onClick={() => { void openGate(); }}>{opening ? '미리보기 확인 중…' : '권한 전부 회수'}</button>
    {outcomes.length === 0 ? null : <div><p>확정 합계 {confirmedTotal}건</p><ul aria-label="회수 실행 결과">{outcomes.map((outcome) => <li key={outcome.subjectId} data-subject-id={outcome.subjectId} data-outcome-state={outcome.state}>{subjects.find((item) => item.id === outcome.subjectId)?.name ?? outcome.subjectId}: {outcome.state === 'completed' ? <><span>완료 · 실제 {outcome.result.revocation.rows.length}건</span>{outcome.result.revocation.rows.length === 0 ? null : <ul>{outcome.result.revocation.rows.map((item) => <li key={item.entryId}>{item.path ?? item.workspaceName}</li>)}</ul>}{outcome.result.refreshFailed ? <p role="alert">회수는 완료되었지만 화면 새로고침에 실패했습니다.</p> : null}</> : outcome.state === 'unconfirmed' ? '결과 확인 필요' : '실행하지 않음'}</li>)}</ul></div>}
    <ConfirmGate open={gatePlan !== null} grade="L3" title="선택한 주체의 권한을 회수합니다" token={gateInspection === null ? null : String(gateInspection.total)} restoreFocusRef={actionRef} onConfirm={execute} onCancel={() => { setGatePlan(null); onFlowExit?.(); }}>{gatePlan === null || gateInspection === null ? null : <><p data-testid="revocation-tally">주체 {gatePlan.subjects.length}개 · 항목 {gateInspection.total}건</p><ul>{gatePlan.subjects.map(({ subject }) => <li key={subject.id}>{subject.name} · {subject.kind === 'user' ? '사용자' : '그룹'}</li>)}</ul><p>{SCOPE_NOTE[gateInspection.scope!]}</p></>}</ConfirmGate>
  </section>;
}
