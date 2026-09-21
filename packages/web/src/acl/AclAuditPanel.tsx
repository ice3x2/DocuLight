import * as Tabs from '@radix-ui/react-tabs';
import { useLayoutEffect, useRef } from 'react';

import type {
  BrokenInheritanceBody,
  PrincipalRow,
  RevocationSubject,
  SimulationBody,
} from '../api/client.js';
import { BulkRevokePanel } from './BulkRevokePanel.js';
import type { AuditQuery, BulkPlan, RevokeSubjectResult } from './BulkRevokePanel.js';
import { InheritanceAuditPanel } from './InheritanceAuditPanel.js';
import { SimulationPanel } from './SimulationPanel.js';

/**
 * 설정 모달의 `권한 감사` 카테고리 (`IR-SHELL-002`).
 *
 * 셋을 한 구역에 모은 이유는 셋 다 **관리 레벨 전용**이고 셋 다 「지금 이
 * 권한이 왜 이런가」를 답하기 때문이다 — 흩어 두면 관리자가 세 곳을
 * 오가며 같은 물음을 세 번 묻게 된다.
 *
 * 넷째 탭은 만들지 않는다 (원장 `G15` 판정). 넓히기를 모아 보는 일은
 * `감사 로그` 카테고리가 이미 한다 — 조작 필터가 실제 기록 값에서
 * 파생하므로(`IR-AUDIT-001`) `acl.grant` 를 고르면 그 목록이 곧 선다.
 * 여기 넷째를 세우면 같은 자료에 진입점이 둘이 되고, 이 구역을 세 카드로
 * 못박은 `R24-a` 의 전량 목록도 함께 고쳐야 한다.
 */
export interface AclAuditProps {
  /**
   * 주체 검색의 부여 자격 근거 (`R162`). **없으면 검색칸을 두지 않는다** —
   * 스코프 없는 검색칸은 그 자체가 명부로 가는 경로다.
   */
  managedScope?: ManagedSearchScope;
  contextKey?: string;
  revocationPlan?: AuditQuery<BulkPlan>;
  /** 고른 주체들 — 다건이다 (`FR-CONFIRM-020`). */
  subjects?: readonly RevocationSubject[];
  simulationSubject?: PrincipalRow | null;
  simulationQuery?: AuditQuery<SimulationBody>;
  inheritanceQuery?: AuditQuery<BrokenInheritanceBody>;
  onRevokePick?: (row: PrincipalRow) => void;
  onRevokeReplace?: (rows: readonly RevocationSubject[]) => void;
  onRevokeRemove?: (principalId: string) => void;
  onPreviewRevocation?: (subjects: readonly RevocationSubject[]) => Promise<BulkPlan>;
  onRevokeSubject?: (principalId: string) => Promise<RevokeSubjectResult>;
  onSimulatePick?: (row: PrincipalRow) => void;
  onRestore?: (nodeId: string) => void;
  onOffboard?: (subject: RevocationSubject) => void;
  onRevokeFlowExit?: () => void;
}

export type ManagedSearchScope =
  | { state: 'unavailable' }
  | { state: 'loading' }
  | { state: 'ready'; workspaceId: string; authorityScope?: 'instance' | 'managed-workspaces' }
  | { state: 'empty'; authorityScope?: 'instance' | 'managed-workspaces' }
  | { state: 'error'; onRetry: () => void };

function ScopeState({ scope, onRetryStart }: { scope: Exclude<ManagedSearchScope, { state: 'ready' }>; onRetryStart: () => void }) {
  if (scope.state === 'unavailable') return <p role="alert" tabIndex={-1} data-scope-focus>관리 범위 정보를 사용할 수 없습니다.</p>;
  if (scope.state === 'loading') return <p role="status" tabIndex={-1} data-scope-focus>관리 범위를 확인하는 중…</p>;
  if (scope.state === 'error') return <div role="alert"><p>관리 범위를 확인하지 못했습니다.</p><button type="button" data-scope-retry onClick={() => { onRetryStart(); scope.onRetry(); }}>관리 범위 다시 시도</button></div>;
  return <p data-testid="audit-no-workspace" tabIndex={-1} data-scope-focus>관리 권한이 있는 워크스페이스가 없습니다.</p>;
}

export function AclAuditPanel({
  managedScope,
  contextKey,
  revocationPlan,
  subjects,
  simulationSubject,
  simulationQuery,
  inheritanceQuery,
  onRevokePick,
  onRevokeRemove,
  onPreviewRevocation,
  onRevokeSubject,
  onSimulatePick,
  onOffboard,
  onRevokeFlowExit,
}: AclAuditProps) {
  const scope: ManagedSearchScope = managedScope ?? { state: 'unavailable' };
  const root = useRef<HTMLDivElement>(null);
  const moveFocusAfterRetry = useRef(false);
  const invalidatedFocusOwner = useRef<HTMLElement | null>(null);
  const scopeIdentity = scope.state === 'ready'
    ? `${contextKey ?? ''}:${scope.authorityScope ?? ''}:${scope.workspaceId}`
    : `${contextKey ?? ''}:${scope.state}`;
  const renderedScopeIdentity = useRef(scopeIdentity);
  if (renderedScopeIdentity.current !== scopeIdentity) {
    const active = document.activeElement;
    invalidatedFocusOwner.current = active instanceof HTMLElement && root.current?.contains(active) === true
      ? active
      : null;
    renderedScopeIdentity.current = scopeIdentity;
  }
  useLayoutEffect(() => {
    const activeWasRemoved = invalidatedFocusOwner.current !== null && !invalidatedFocusOwner.current.isConnected;
    if (!moveFocusAfterRetry.current && !activeWasRemoved) return;
    moveFocusAfterRetry.current = false;
    invalidatedFocusOwner.current = null;
    root.current?.querySelector<HTMLElement>('[aria-label="사용자·그룹 검색"], [data-scope-retry], [data-scope-focus], h2')?.focus();
  }, [scope.state, scopeIdentity]);
  const revokeContextKey = scope.state === 'ready' && contextKey !== undefined && subjects !== undefined
    ? JSON.stringify([contextKey, scope.state, scope.workspaceId, subjects.map((subject) => subject.id)])
    : undefined;
  const revokeContractReady = revokeContextKey !== undefined
    && subjects !== undefined
    && revocationPlan !== undefined
    && onRevokePick !== undefined
    && onRevokeRemove !== undefined
    && onPreviewRevocation !== undefined
    && onRevokeSubject !== undefined;
  const simulationContractReady = simulationSubject !== undefined
    && simulationQuery !== undefined
    && onSimulatePick !== undefined;
  return (
    <Tabs.Root ref={root} defaultValue="revoke" className="acl-audit">
      <Tabs.List aria-label="권한 감사" className="acl-audit-tabs">
        <Tabs.Trigger value="revoke">권한 회수</Tabs.Trigger>
        <Tabs.Trigger value="simulate">유효 권한 시뮬레이션</Tabs.Trigger>
        <Tabs.Trigger value="inheritance">상속 끊김</Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="revoke">
        {scope.state !== 'ready' ? (
          <ScopeState scope={scope} onRetryStart={() => { moveFocusAfterRetry.current = document.activeElement?.hasAttribute('data-scope-retry') === true; }} />
        ) : !revokeContractReady ? (
          <p role="alert">회수 상태를 사용할 수 없습니다.</p>
        ) : (
          <BulkRevokePanel
            contextKey={revokeContextKey!}
            pickerContextKey={contextKey!}
            workspaceId={scope.workspaceId}
            subjects={subjects}
            plan={revocationPlan}
            onPick={onRevokePick}
            onRemove={onRevokeRemove}
            onPreview={onPreviewRevocation}
            onRevokeSubject={onRevokeSubject}
            {...(onOffboard === undefined ? {} : { onOffboard })}
            {...(onRevokeFlowExit === undefined ? {} : { onFlowExit: onRevokeFlowExit })}
          />
        )}
      </Tabs.Content>

      <Tabs.Content value="simulate">
        {scope.state !== 'ready' ? (
          <ScopeState scope={scope} onRetryStart={() => { moveFocusAfterRetry.current = document.activeElement?.hasAttribute('data-scope-retry') === true; }} />
        ) : !simulationContractReady ? (
          <p role="alert">시뮬레이션 상태를 사용할 수 없습니다.</p>
        ) : (
          <SimulationPanel
            contextKey={contextKey ?? ''}
            workspaceId={scope.workspaceId}
            selectedSubject={simulationSubject}
            query={simulationQuery}
            onPick={onSimulatePick}
          />
        )}
      </Tabs.Content>

      <Tabs.Content value="inheritance">
        {/* 이 탭만 주체를 고르지 않는다 — 목록이 이미 관리 범위로 잘려 온다. */}
        {inheritanceQuery === undefined
          ? <p role="alert">상속 감사 상태를 사용할 수 없습니다.</p>
          : <InheritanceAuditPanel query={inheritanceQuery} />}
      </Tabs.Content>
    </Tabs.Root>
  );
}
