import { useEffect, useRef, useState } from 'react';

import { ApiError, type OffboardingCardBody } from '../api/client.js';
import { ConfirmGate } from '../confirm/ConfirmGate.js';

const STEP_TITLE = { suspend: '계정 비활성화', tokens: '액세스 토큰 무효화', memberships: '그룹 멤버십 제거', acl: '권한 일괄 회수' } as const;
const STATUS_LABEL = { active: '활성 계정', pending: '대기 계정', suspended: '정지 계정', rejected: '거절 계정' } as const;

export interface OffboardingCardProps {
  card?: OffboardingCardBody;
  onLoadCard?: (principalId: string) => Promise<OffboardingCardBody>;
  onSuspend?: (principalId: string) => void | Promise<void>;
  onRemoveMemberships?: (principalId: string) => void | Promise<void>;
  onLoadMemberships?: (principalId: string) => Promise<readonly { id: string; name: string }[]>;
  onRemoveMembership?: (groupId: string, principalId: string) => Promise<void>;
  onRevokeAll?: (principalId: string) => void;
  onRefresh?: () => void | Promise<void>;
  showHeading?: boolean;
  labelledBy?: string;
  membershipOutcomes?: readonly MembershipOutcome[];
  onMembershipOutcomes?: (outcomes: readonly MembershipOutcome[]) => void;
  onAuthenticationLoss?: () => void;
}

export interface MembershipOutcome {
  readonly id: string;
  readonly name: string;
  readonly state: 'accepted' | 'unconfirmed' | 'not-run';
}

// @req IR-PRINCIPAL-001
export function OffboardingCard({ card, onLoadCard, onSuspend, onRemoveMemberships, onLoadMemberships, onRemoveMembership, onRevokeAll, onRefresh, showHeading = true, labelledBy, membershipOutcomes: ownedMembershipOutcomes, onMembershipOutcomes, onAuthenticationLoss }: OffboardingCardProps) {
  const suspendButton = useRef<HTMLButtonElement>(null);
  const membershipButton = useRef<HTMLButtonElement>(null);
  const refreshButton = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const suspendStep = useRef<HTMLLIElement>(null);
  const membershipStep = useRef<HTMLLIElement>(null);
  const membershipOutcomesRegion = useRef<HTMLDivElement>(null);
  const currentCard = useRef(card);
  const openingSuspend = useRef(false);
  const openingMemberships = useRef(false);
  const mutatingSuspend = useRef<string | null>(null);
  const mutatingMemberships = useRef<string | null>(null);
  const lastMutation = useRef<'suspend' | 'memberships'>('suspend');
  const [suspendSnapshot, setSuspendSnapshot] = useState<OffboardingCardBody>();
  const [membershipPlan, setMembershipPlan] = useState<readonly { id: string; name: string }[]>();
  const [localMembershipOutcomes, setLocalMembershipOutcomes] = useState<readonly MembershipOutcome[]>([]);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [opening, setOpening] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  useEffect(() => { currentCard.current = card; }, [card]);
  useEffect(() => { openingSuspend.current = false; openingMemberships.current = false; }, [card?.principalId]);
  if (card === undefined) return null;
  const membershipOutcomes = ownedMembershipOutcomes ?? localMembershipOutcomes;
  const setMembershipOutcomes = (outcomes: readonly MembershipOutcome[]) => {
    setLocalMembershipOutcomes(outcomes);
    onMembershipOutcomes?.(outcomes);
  };

  const steps = new Map(card.steps.map((step) => [step.id, step]));
  const acl = steps.get('acl');
  const memberships = steps.get('memberships');
  const openSuspend = async () => {
    if (openingSuspend.current) return;
    openingSuspend.current = true;
    setOpening(true); setMessage(undefined);
    try {
      const fresh = onLoadCard === undefined ? card : await onLoadCard(card.principalId);
      if (fresh.principalStatus === 'suspended') {
        setMessage('이 계정은 이미 비활성화되었습니다. 최신 상태를 새로 고치십시오.');
        return;
      }
      setSuspendSnapshot(fresh);
    }
    catch (error) { if (error instanceof ApiError && error.status === 401) onAuthenticationLoss?.(); else setMessage('현재 계정 상태를 확인하지 못했습니다. 다시 시도하십시오.'); }
    finally { openingSuspend.current = false; setOpening(false); }
  };
  const executeSuspend = async () => {
    if (suspendSnapshot === undefined || mutatingSuspend.current === card.principalId) return;
    const mutationPrincipal = card.principalId;
    mutatingSuspend.current = mutationPrincipal;
    try {
    let fresh: OffboardingCardBody;
    try { fresh = onLoadCard === undefined ? suspendSnapshot : await onLoadCard(card.principalId); }
    catch (error) { setSuspendSnapshot(undefined); if (error instanceof ApiError && error.status === 401) onAuthenticationLoss?.(); else setMessage('현재 계정 상태를 확인하지 못했습니다. 다시 시도하십시오.'); return; }
    if (fresh.principalId !== suspendSnapshot.principalId || fresh.principalName !== suspendSnapshot.principalName || fresh.principalStatus !== suspendSnapshot.principalStatus
      || currentCard.current?.principalId !== suspendSnapshot.principalId) {
      setSuspendSnapshot(undefined); setMessage('계정 상태가 바뀌었습니다. 최신 상태를 다시 확인하십시오.'); return;
    }
    try {
      await onSuspend?.(card.principalId);
    } catch (error) {
      setSuspendSnapshot(undefined);
      if (error instanceof ApiError && error.status === 401) { onAuthenticationLoss?.(); return; }
      setMessage(error instanceof ApiError && error.status === 409 && error.detail?.rule === 'last-active-superuser'
        ? '활성 슈퍼유저가 최소 한 명 남아 있어야 합니다.'
        : '계정 비활성화 결과를 확인하지 못했습니다. 최신 상태를 다시 확인하십시오.');
      setTimeout(() => messageRef.current?.focus(), 50);
      return;
    }
    setSuspendSnapshot(undefined);
    lastMutation.current = 'suspend';
    try {
      await onRefresh?.();
      setTimeout(() => suspendStep.current?.focus(), 50);
    }
    catch {
      setRefreshNeeded(true);
      setMessage('계정 비활성화 요청은 수락됐지만 최신 상태를 확인하지 못했습니다.');
      setTimeout(() => refreshButton.current?.focus(), 50);
    }
    } finally { if (mutatingSuspend.current === mutationPrincipal) mutatingSuspend.current = null; }
  };
  const loadMembershipPlan = async () => onLoadMemberships === undefined
    ? (memberships?.groups ?? []).map((name, index) => ({ id: `legacy:${index}`, name }))
    : onLoadMemberships(card.principalId);
  const openMemberships = async () => {
    if (openingMemberships.current) return;
    openingMemberships.current = true;
    setMessage(undefined);
    try {
      const plan = await loadMembershipPlan();
      if (plan.length === 0) { setMessage('제거할 일반 그룹 멤버십이 없습니다. 상태를 새로 고치십시오.'); return; }
      const projected = [...(memberships?.groups ?? [])].sort((a, b) => a.localeCompare(b));
      const observed = plan.map(({ name }) => name).sort((a, b) => a.localeCompare(b));
      if (JSON.stringify(projected) !== JSON.stringify(observed)) {
        setMessage('그룹 멤버십이 바뀌었습니다. 최신 목록을 다시 확인하십시오.');
        return;
      }
      setMembershipPlan(plan);
    } catch (error) { if (error instanceof ApiError && error.status === 401) onAuthenticationLoss?.(); else setMessage('현재 그룹 멤버십을 확인하지 못했습니다. 다시 시도하십시오.'); }
    finally { openingMemberships.current = false; }
  };
  const executeMemberships = async () => {
    if (membershipPlan === undefined || mutatingMemberships.current === card.principalId) return;
    const mutationPrincipal = card.principalId;
    mutatingMemberships.current = mutationPrincipal;
    try {
    const frozenPlan = membershipPlan;
    setMembershipPlan(undefined);
    let fresh: readonly { id: string; name: string }[];
    try { fresh = await loadMembershipPlan(); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) onAuthenticationLoss?.();
      else setMessage('현재 그룹 멤버십을 확인하지 못했습니다. 새 확인 단계에서 다시 시도하십시오.');
      return;
    }
    const identity = (rows: readonly { id: string; name: string }[]) => JSON.stringify(rows.map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name)));
    if (identity(fresh) !== identity(frozenPlan)) {
      setMessage('그룹 멤버십이 바뀌었습니다. 최신 목록을 다시 확인하십시오.'); return;
    }
    if (onRemoveMembership === undefined) {
      await onRemoveMemberships?.(card.principalId); setMembershipOutcomes(frozenPlan.map(({ id, name }) => ({ id, name, state: 'accepted' as const })));
    } else {
      const outcomes: MembershipOutcome[] = [];
      for (let index = 0; index < frozenPlan.length; index += 1) {
        const group = frozenPlan[index]!;
        try { await onRemoveMembership(group.id, card.principalId); outcomes.push({ ...group, state: 'accepted' }); }
        catch (error) {
          if (error instanceof ApiError && error.status === 401) { onAuthenticationLoss?.(); return; }
          outcomes.push({ ...group, state: 'unconfirmed' });
          for (const rest of frozenPlan.slice(index + 1)) outcomes.push({ ...rest, state: 'not-run' });
          break;
        }
      }
      setMembershipOutcomes(outcomes);
    }
    lastMutation.current = 'memberships';
    try {
      await onRefresh?.();
      setTimeout(() => membershipOutcomesRegion.current?.focus(), 50);
    }
    catch {
      setRefreshNeeded(true);
      setMessage('그룹 제거 결과는 보존됐지만 최신 상태를 확인하지 못했습니다.');
      setTimeout(() => refreshButton.current?.focus(), 50);
    }
    } finally { if (mutatingMemberships.current === mutationPrincipal) mutatingMemberships.current = null; }
  };
  const retryRefresh = async () => {
    try {
      await onRefresh?.();
      setRefreshNeeded(false); setMessage(undefined);
      setTimeout(() => (lastMutation.current === 'suspend' ? suspendStep.current : membershipStep.current)?.focus(), 50);
    } catch {
      setMessage('최신 상태를 확인하지 못했습니다. 다시 시도하십시오.');
      setTimeout(() => refreshButton.current?.focus(), 50);
    }
  };
  const statusFor = (id: keyof typeof STEP_TITLE, done: boolean) => {
    if (id === 'tokens' && card.principalStatus !== 'active') return done ? '자동 차단 완료' : '자동 차단';
    if (done) return '완료';
    if (id === 'suspend') return `${STATUS_LABEL[card.principalStatus]} · 비활성화 필요`;
    if (id === 'tokens') return card.principalStatus === 'active' ? '계정 비활성화 시 자동 차단' : '자동 차단';
    if (id === 'memberships') return `${memberships?.groups?.length ?? 0}개 일반 그룹 남음`;
    return `${acl?.remaining ?? 0}건 남음`;
  };

  return <section aria-labelledby={showHeading ? 'offboarding-heading' : labelledBy} data-offboarding-card aria-busy={opening || undefined}>
    {showHeading ? <header data-offboarding-header><h2 id="offboarding-heading" tabIndex={-1}>{card.principalName} 오프보딩</h2><p>서버의 현재 상태에서 다시 계산한 네 단계입니다. 완료 표시는 별도로 저장하지 않습니다.</p></header> : null}
    {message === undefined ? null : <p ref={messageRef} tabIndex={-1} role="alert" data-offboarding-message>{message}{refreshNeeded ? <> <button ref={refreshButton} type="button" onClick={() => { void retryRefresh(); }}>상태 새로 고침 다시 시도</button></> : null}</p>}
    <ol data-offboarding-steps>{card.steps.map((step, index) => <li ref={step.id === 'suspend' ? suspendStep : step.id === 'memberships' ? membershipStep : undefined} tabIndex={step.id === 'suspend' || step.id === 'memberships' ? -1 : undefined} key={step.id} data-testid="offboarding-step" data-step={step.id} data-done={step.done ? 'true' : 'false'}>
      <span data-offboarding-number>{index + 1}</span>
      <span data-offboarding-copy><strong data-step-title>{STEP_TITLE[step.id]}</strong><small>{statusFor(step.id, step.done)}</small></span>
      <span data-offboarding-action>
        {step.id === 'suspend' && !step.done ? <button ref={suspendButton} type="button" disabled={opening} onClick={() => { void openSuspend(); }}>{opening ? '현재 상태 확인 중…' : '계정 비활성화'}</button> : null}
        {step.id === 'tokens' ? <span aria-label="별도 조작 없음">자동</span> : null}
        {step.id === 'memberships' && !step.done ? <button ref={membershipButton} type="button" onClick={() => { void openMemberships(); }}>그룹 멤버십 제거</button> : null}
        {step.id === 'acl' && !step.done ? onRevokeAll === undefined ? <span data-offboarding-unavailable>권한 회수 연결을 사용할 수 없음</span> : <button type="button" onClick={() => onRevokeAll(card.principalId)}>권한 일괄 회수 ({acl?.remaining ?? 0}건)</button> : null}
        {step.done ? <span data-offboarding-complete>완료</span> : null}
      </span>
    </li>)}</ol>
    <ConfirmGate open={suspendSnapshot !== undefined} grade="L2" title={`${card.principalName} 계정을 비활성화합니다`} description="이 계정의 모든 세션과 액세스 토큰 인증이 즉시 중단됩니다." restoreFocusRef={refreshNeeded ? refreshButton : suspendButton} onConfirm={executeSuspend} onCancel={() => setSuspendSnapshot(undefined)} />
    <ConfirmGate open={membershipPlan !== undefined} grade="L2" title={`${card.principalName} 을 일반 그룹에서 제거합니다`} restoreFocusRef={refreshNeeded ? refreshButton : membershipButton} onConfirm={executeMemberships} onCancel={() => setMembershipPlan(undefined)}>
      <p>시스템 그룹은 이 단계의 제거 대상이 아닙니다.</p><ul data-testid="offboarding-groups">{(membershipPlan ?? []).map((group) => <li key={group.id}>{group.name}</li>)}</ul>
    </ConfirmGate>
    {membershipOutcomes.length === 0 ? null : <div ref={membershipOutcomesRegion} role="region" aria-label="그룹 제거 결과" tabIndex={-1} data-offboarding-outcomes aria-live="polite"><h3>그룹 제거 결과</h3><ul>{membershipOutcomes.map((outcome) => <li key={outcome.id} data-outcome-state={outcome.state}>{outcome.name} ({outcome.id}): {outcome.state === 'accepted' ? '제거 요청 수락' : outcome.state === 'unconfirmed' ? '결과 확인 필요' : '실행하지 않음'}</li>)}</ul></div>}
    {acl?.done === true ? <p data-testid="offboarding-acl-done">권한 회수 완료</p> : null}
  </section>;
}
