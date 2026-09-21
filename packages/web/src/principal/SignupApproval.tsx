import { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';

import type { RosterUser, RosterUserStatus } from '../api/client.js';
import { Button } from '../components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.js';
import { principalActionResultIsCurrent, principalRequestOwnerKey, type PrincipalAction, type PrincipalActionResult, type PrincipalRequestContext, type RosterRead, type SignupModeRead } from './request-contract.js';

/**
 * 가입 승인 (`SEC-AUTH-004` · `FR-AUTH-002` · 설계서 `04` §2.10).
 *
 * **사용자 관리와 다른 화면이다.** 설계가 별도 카테고리로 둔 이유는 조작이
 * 동질적(승인 또는 거절 둘뿐)이고 대상이 사용자 전체가 아니라 대기 건수로
 * 한정되기 때문이다 — 같은 자리에 두면 그 구분이 사라지고, 명부 테이블에
 * 상태마다 다른 버튼이 붙어 어느 계정에 무엇을 할 수 있는지 읽기 어려워진다.
 *
 * **거절됨 탭에서 바로 승인하지 않는다.** `R60-b` 가 정한 경로는
 * `rejected → pending → active` 이며, 건너뛰면 거절 이력이 아무 데도 남지 않는다.
 */
const 가입모드문구: Readonly<Record<string, string>> = {
  open: '현재 자유 가입 모드라 승인 대기가 발생하지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
  approval: '아직 들어온 가입 신청이 없습니다.',
  'invite-only': '현재 슈퍼유저 직접 등록 모드라 가입 신청을 받지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
};

/** 모드를 모를 때. **원인을 지어내지 않는다** — 틀린 원인은 없는 원인보다 나쁘다. */
const 모드를모를때 = '승인 대기 중인 계정이 없습니다.';

export function SignupApproval({
  users = [],
  roster,
  signupMode,
  signupModeQuery,
  requestContext,
  onApprove,
  onReopen,
  onStatus,
}: {
  users?: readonly RosterUser[];
  roster?: RosterRead;
  /** 지금 가입 모드 (`FR-AUTH-004`). 빈 대기열의 **원인**이 여기서 갈린다. */
  signupMode?: string;
  signupModeQuery?: SignupModeRead;
  requestContext?: PrincipalRequestContext;
  /** 가입 승인 (`SEC-AUTH-004` AC-1). */
  onApprove?: PrincipalAction<[userId: string]>;
  /** 거절된 계정을 재심사 대상으로 (`FR-AUTH-002`). */
  onReopen?: PrincipalAction<[userId: string]>;
  /** 상태를 직접 바꾼다. 이 화면에서는 거절이 이 자리를 쓴다 (`R60`). */
  onStatus?: PrincipalAction<[userId: string, status: RosterUserStatus]>;
}) {
  const [탭, set탭] = useState('pending');
  const [알림, set알림] = useState<{ text: string; rejectedId?: string; refreshFailed?: boolean } | null>(null);
  const [재조정필요, set재조정필요] = useState(false);
  type PendingAction = 'approve' | 'reject' | 'reopen' | 'undo';
  const [pendingActions, setPendingActions] = useState<ReadonlyMap<string, PendingAction>>(() => new Map());
  const 작업중 = useRef(new Set<string>());
  const actionGenerations = useRef(new Map<string, number>());
  const ambiguousSnapshot = useRef<{ revision?: number; users?: readonly RosterUser[] } | null>(null);
  const 패널 = useRef<HTMLDivElement>(null);
  const 빈제목 = useRef<HTMLHeadingElement>(null);
  const context = requestContext ?? { principalId: 'legacy', authGeneration: 0, categoryGeneration: 0, queryGeneration: 0 };
  const ownerKey = principalRequestOwnerKey(context);
  const currentContext = useRef(context);
  currentContext.current = context;
  const 읽기 = roster ?? { state: 'ready' as const, users };
  const 현재명부 = 읽기.state === 'ready' ? 읽기.users : [];
  const 모드읽기 = signupModeQuery ?? (signupMode === undefined ? { state: 'loading' as const } : { state: 'ready' as const, mode: signupMode });
  const 대기 = 현재명부.filter((one) => one.status === 'pending');
  const 거절 = 현재명부.filter((one) => one.status === 'rejected');
  useEffect(() => {
    const ambiguous = ambiguousSnapshot.current;
    if (!재조정필요 || 읽기.state !== 'ready' || ambiguous === null) return;
    const newerRevision = 읽기.revision !== undefined && ambiguous.revision !== undefined && 읽기.revision > ambiguous.revision;
    const newLegacySnapshot = 읽기.revision === undefined && ambiguous.revision === undefined && 읽기.users !== ambiguous.users;
    if (!newerRevision && !newLegacySnapshot) return;
    ambiguousSnapshot.current = null;
    set재조정필요(false);
  }, [재조정필요, 읽기]);
  useEffect(() => {
    작업중.current.clear();
    actionGenerations.current.clear();
    setPendingActions(new Map());
    set알림(null);
    set재조정필요(false);
  }, [ownerKey]);

  const 초점을복원한다 = (trigger: HTMLElement | undefined, order: readonly string[], id: string, 떠난초점: () => boolean, 끝낸다: () => void) => {
    const 복원 = () => {
      if (trigger === undefined || trigger.isConnected || 떠난초점() || 패널.current?.isConnected !== true) { 끝낸다(); return; }
      const rows = [...패널.current.querySelectorAll<HTMLElement>('[data-principal-account-id]')];
      const byId = (candidate: string) => rows.find((row) => row.dataset.principalAccountId === candidate)?.querySelector<HTMLElement>('button:not(:disabled)');
      const at = order.indexOf(id);
      for (const candidate of order.slice(at + 1)) {
        const next = byId(candidate);
        if (next != null) { next.focus(); 끝낸다(); return; }
      }
      for (const candidate of order.slice(0, Math.max(at, 0)).reverse()) {
        const previous = byId(candidate);
        if (previous != null) { previous.focus(); 끝낸다(); return; }
      }
      const tab = 패널.current.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (tab !== null) tab.focus();
      else 빈제목.current?.focus();
      끝낸다();
    };
    if (패널.current?.isConnected === true) 복원();
    else requestAnimationFrame(복원);
  };

  const 실행한다 = async (
    id: string,
    expected: RosterUserStatus,
    action: PrincipalAction<[string]> | undefined,
    success: string,
    pendingAction: PendingAction,
    rejectedId?: string,
    trigger?: HTMLElement,
  ) => {
    if (action === undefined || 작업중.current.has(id) || !현재명부.some((one) => one.id === id && one.status === expected)) return;
    const order = 현재명부.filter((one) => one.status === expected).map((one) => one.id);
    let 떠난초점 = document.activeElement !== trigger;
    const 초점이동 = (event: FocusEvent) => {
      if (trigger?.isConnected === true && event.target !== trigger) 떠난초점 = true;
    };
    document.addEventListener('focusin', 초점이동);
    작업중.current.add(id);
    setPendingActions((current) => new Map(current).set(id, pendingAction));
    const capturedContext = context;
    const capturedAction = (actionGenerations.current.get(id) ?? 0) + 1;
    actionGenerations.current.set(id, capturedAction);
    let result: PrincipalActionResult;
    try { result = await action(id); } catch { result = { ok: false, kind: 'uncertain' }; }
    const isCurrent = principalActionResultIsCurrent(capturedContext, currentContext.current, result) && actionGenerations.current.get(id) === capturedAction;
    작업중.current.delete(id);
    setPendingActions((current) => { const next = new Map(current); next.delete(id); return next; });
    if (!isCurrent) { document.removeEventListener('focusin', 초점이동); return; }
    if (!result.ok && result.kind === 'stale') { document.removeEventListener('focusin', 초점이동); return; }
    if (result?.ok === true) set알림({ text: success, ...(rejectedId === undefined ? {} : { rejectedId }), refreshFailed: result.refreshFailed });
    else {
      ambiguousSnapshot.current = {
        ...(읽기.revision === undefined ? {} : { revision: 읽기.revision }),
        ...(읽기.state === 'ready' ? { users: 읽기.users } : {}),
      };
      set재조정필요(true);
      set알림({ text: '요청을 완료하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.' });
    }
    초점을복원한다(trigger, order, id, () => 떠난초점, () => document.removeEventListener('focusin', 초점이동));
  };

  const 거절한다 = async (id: string, trigger?: HTMLElement) => {
    if (onStatus === undefined || 작업중.current.has(id) || !현재명부.some((one) => one.id === id && one.status === 'pending')) return;
    const order = 대기.map((one) => one.id);
    let 떠난초점 = document.activeElement !== trigger;
    const 초점이동 = (event: FocusEvent) => {
      if (trigger?.isConnected === true && event.target !== trigger) 떠난초점 = true;
    };
    document.addEventListener('focusin', 초점이동);
    작업중.current.add(id);
    setPendingActions((current) => new Map(current).set(id, 'reject'));
    const capturedContext = context;
    const capturedAction = (actionGenerations.current.get(id) ?? 0) + 1;
    actionGenerations.current.set(id, capturedAction);
    let result: PrincipalActionResult;
    try { result = await onStatus(id, 'rejected'); } catch { result = { ok: false, kind: 'uncertain' }; }
    const isCurrent = principalActionResultIsCurrent(capturedContext, currentContext.current, result) && actionGenerations.current.get(id) === capturedAction;
    작업중.current.delete(id);
    setPendingActions((current) => { const next = new Map(current); next.delete(id); return next; });
    if (!isCurrent) { document.removeEventListener('focusin', 초점이동); return; }
    if (!result.ok && result.kind === 'stale') { document.removeEventListener('focusin', 초점이동); return; }
    if (result?.ok === true) set알림({ text: '가입을 거절했습니다.', rejectedId: id, refreshFailed: result.refreshFailed });
    else {
      ambiguousSnapshot.current = {
        ...(읽기.revision === undefined ? {} : { revision: 읽기.revision }),
        ...(읽기.state === 'ready' ? { users: 읽기.users } : {}),
      };
      set재조정필요(true);
      set알림({ text: '요청을 완료하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.' });
    }
    초점을복원한다(trigger, order, id, () => 떠난초점, () => document.removeEventListener('focusin', 초점이동));
  };

  const 알림노드 = 알림 === null ? null : (
    <div role="status" aria-label="알림">
      <p>{알림.text}</p>
      {알림.rejectedId === undefined ? null : (
        <Button
          variant="secondary"
          aria-label="실행취소"
          aria-busy={pendingActions.get(알림.rejectedId) === 'undo'}
          disabled={!현재명부.some((one) => one.id === 알림.rejectedId && one.status === 'rejected') || pendingActions.has(알림.rejectedId)}
          onClick={() => void 실행한다(알림.rejectedId!, 'rejected', onReopen, '재심사 대상으로 되돌렸습니다.', 'undo')}
        >{pendingActions.get(알림.rejectedId) === 'undo' ? '실행취소 중' : '실행취소'}</Button>
      )}
      {알림.rejectedId !== undefined && 알림.refreshFailed ? <p>목록을 새로 불러와야 실행취소할 수 있습니다.</p> : null}
      {재조정필요 && 읽기.state === 'ready' && 읽기.onRetry !== undefined ? <Button variant="secondary" onClick={읽기.onRetry}>목록 새로 불러오기</Button> : null}
    </div>
  );

  if (읽기.state !== 'ready') return (
    <section data-principal-panel="approval" aria-label="가입 승인">
      <h2 data-principal-title>가입 승인</h2>
      {읽기.state === 'loading' ? <p role="status">가입 승인 목록을 불러오는 중입니다.</p> : <div role="alert">가입 승인 목록을 불러오지 못했습니다. <Button variant="secondary" onClick={읽기.onRetry}>가입 승인 목록 다시 불러오기</Button></div>}
      {알림노드}
    </section>
  );

  return (
    <Tabs.Root ref={패널} value={탭} onValueChange={set탭} data-principal-panel="approval">
      <h2 ref={빈제목} tabIndex={-1} data-principal-title>가입 승인</h2>
      {모드읽기.state === 'error' ? <div role="alert">가입 모드를 불러오지 못했습니다. <Button variant="secondary" onClick={모드읽기.onRetry}>가입 모드 다시 불러오기</Button></div> : null}
      {/* 건수를 이름에 실어 둔다 (`R139-f`) — 열어 보지 않고도 할 일이
          있는지 알 수 있어야 한다. */}
      <Tabs.List aria-label="가입 승인 목록" data-principal-tabs>
        <Tabs.Trigger value="pending">대기 중 ({대기.length})</Tabs.Trigger>
        <Tabs.Trigger value="rejected">거절됨 ({거절.length})</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="pending">
        {대기.length === 0 ? (
          <p role="note" aria-label="빈 상태 안내" data-principal-empty>
            {모드읽기.state === 'ready' ? (가입모드문구[모드읽기.mode] ?? 모드를모를때) : 모드를모를때}
          </p>
        ) : (
          <div data-principal-table-wrap>
            <Table>
              <caption>승인 대기</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">이름</TableHead>
                  <TableHead scope="col">조작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {대기.map((user) => (
                  <TableRow key={user.id} data-principal-account-id={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell><div data-principal-row-actions>
                    {onApprove === undefined ? null : (
                      <Button variant="secondary" aria-label={`${user.name} 승인`} aria-busy={pendingActions.get(user.id) === 'approve'} disabled={재조정필요 || pendingActions.has(user.id)} onClick={(event) => void 실행한다(user.id, 'pending', onApprove, '가입을 승인했습니다.', 'approve', undefined, event.currentTarget)}>
                        {pendingActions.get(user.id) === 'approve' ? '승인 중' : '승인'}
                      </Button>
                    )}
                    {onStatus === undefined ? null : (
                      <Button variant="destructive" aria-label={`${user.name} 거절`} aria-busy={pendingActions.get(user.id) === 'reject'} disabled={재조정필요 || pendingActions.has(user.id)} onClick={(event) => void 거절한다(user.id, event.currentTarget)}>
                        {pendingActions.get(user.id) === 'reject' ? '처리 중' : '거절'}
                      </Button>
                    )}
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Tabs.Content>

      <Tabs.Content value="rejected">
        {거절.length === 0 ? (
          <p role="note" aria-label="빈 상태 안내" data-principal-empty>
            거절된 계정이 없습니다.
          </p>
        ) : (
          <div data-principal-table-wrap>
            <Table>
              <caption>거절됨</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">이름</TableHead>
                  <TableHead scope="col">조작</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {거절.map((user) => (
                  <TableRow key={user.id} data-principal-account-id={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>
                    {onReopen === undefined ? null : (
                      <Button variant="secondary" aria-label={`${user.name} 재심사`} aria-busy={pendingActions.get(user.id) === 'reopen'} disabled={재조정필요 || pendingActions.has(user.id)} onClick={(event) => void 실행한다(user.id, 'rejected', onReopen, '재심사 대상으로 되돌렸습니다.', 'reopen', undefined, event.currentTarget)}>
                        {pendingActions.get(user.id) === 'reopen' ? '재심사 중' : '재심사'}
                      </Button>
                    )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Tabs.Content>
      {알림노드}
    </Tabs.Root>
  );
}
