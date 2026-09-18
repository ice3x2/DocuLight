import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import { ApiError, fetchGroupRoster, fetchOffboarding, removeGroupMember, setUserStatus, type OffboardingCardBody, type OffboardingSubject } from '../api/client.js';
import { OffboardingCard, type MembershipOutcome } from './OffboardingCard.js';

type ReadState = { state: 'loading' } | { state: 'unavailable' } | { state: 'error' } | { state: 'ready'; card: OffboardingCardBody };

export function OffboardingSurface({ principalId, principalName, onBack, onAcl, onAuthenticationLoss }: {
  principalId: string;
  principalName: string;
  onBack: () => void;
  onAcl?: (subject: OffboardingSubject) => void;
  onAuthenticationLoss?: () => void;
}) {
  const [read, setRead] = useState<ReadState>({ state: 'loading' });
  const [membershipOutcomes, setMembershipOutcomes] = useState<readonly MembershipOutcome[]>([]);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  const loseAuthority = () => {
    generation.current += 1;
    setMembershipOutcomes([]);
    setRead({ state: 'unavailable' });
    onAuthenticationLoss?.();
  };
  const load = async (preserve = false) => {
    const request = ++generation.current;
    if (!preserve) setRead({ state: 'loading' });
    try {
      const card = await fetchOffboarding(principalId);
      if (request === generation.current) setRead({ state: 'ready', card });
      return card;
    } catch (error) {
      if (request === generation.current && error instanceof ApiError && error.status === 401) {
        loseAuthority();
      } else if (!preserve && request === generation.current) setRead(error instanceof ApiError && error.status === 404 ? { state: 'unavailable' } : { state: 'error' });
      throw error;
    }
  };
  useLayoutEffect(() => { heading.current?.focus(); }, [principalId]);
  useEffect(() => { void load().catch(() => undefined); return () => { generation.current += 1; }; }, [principalId]);
  const loadMemberships = async (userId: string) => (await fetchGroupRoster())
    .filter((group) => !group.system && group.members.some((member) => member.id === userId))
    .map(({ id, name }) => ({ id, name }));

  return <section data-offboarding-surface aria-labelledby={headingId}>
    <header data-offboarding-surface-header><button type="button" onClick={onBack}>사용자 목록으로</button><h2 id={headingId} ref={heading} tabIndex={-1}>{read.state === 'ready' ? read.card.principalName : principalName} 오프보딩</h2><p>계정 접근을 단계별로 줄입니다. 이미 복사된 콘텐츠는 회수되지 않습니다.</p></header>
    {read.state === 'loading' ? <p role="status">오프보딩 상태를 확인하는 중…</p>
      : read.state === 'unavailable' ? <p role="alert">이 사용자를 사용할 수 없거나 접근 권한이 없습니다.</p>
      : read.state === 'error' ? <div role="alert"><p>오프보딩 상태를 확인하지 못했습니다.</p><button type="button" onClick={() => void load().catch(() => undefined)}>다시 시도</button></div>
      : <OffboardingCard card={read.card} showHeading={false} labelledBy={headingId} membershipOutcomes={membershipOutcomes} onMembershipOutcomes={setMembershipOutcomes} onLoadCard={fetchOffboarding}
          onSuspend={(id) => setUserStatus(id, 'suspended')} onLoadMemberships={loadMemberships} onRemoveMembership={removeGroupMember} onRefresh={async () => { await load(true); }} onAuthenticationLoss={loseAuthority}
          {...(onAcl === undefined ? {} : { onRevokeAll: (id: string) => onAcl({ id, name: read.card.principalName, kind: 'user', status: read.card.principalStatus, system: false }) })} />}
  </section>;
}
