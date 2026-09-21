import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tabs from '@radix-ui/react-tabs';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { DocumentSurface } from './DocumentSurface.js';
import { ShareModal, type ShareActionResult, type ShareQueryState } from '../acl/ShareModal.js';
import type { GrantWarning } from '../acl/GrantConfirm.js';
import type { ShareViewBody } from '../api/client.js';
import { VersionHistory } from './VersionHistory.js';
import { DOCUMENT_MENU_ITEMS } from './document-menu.js';
import { activeTab, closeTab, type SaveState, type TabState } from './tab-state.js';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../components/ui/states.js';
import { Button } from '../components/ui/button.js';
import type { AuthOwner, AuthPhase, LiveDraftRegistration } from '../auth/auth-boundary.js';
import type { RecoveryRecord } from '../auth/auth-boundary.js';

export type DocumentReadState =
  | { state: 'loading' }
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'missing' }
  | { state: 'error'; onRetry: () => void; retrying?: boolean };

const readIsRetrying = (state: DocumentReadState | undefined) => state?.state === 'error' && state.retrying === true;

const SAVE_LABEL: Record<SaveState, string> = {
  saved: '저장됨',
  saving: '저장 중',
  conflict: '충돌 — 자동 저장 중단',
  rejected: '저장 거부됨',
};

/**
 * 문서 헤더 — 브레드크럼 · 저장 상태 · `⋯` 메뉴 (`IR-SHELL-003` AC-2 · AC-4).
 *
 * 탭 스트립과 **다른 행**에 선다(AC-1). 합치면 탭이 늘어날수록 브레드크럼과
 * 저장 상태가 밀려 잘리는데(AC-3), 그 둘은 지금 무엇을 편집하고 있고 그것이
 * 저장됐는지를 알려 주는 자리라 잘리면 안 된다.
 *
 * `⋯` 메뉴의 대상은 언제나 **활성 문서**다 — 탭 스트립 쪽에 두면 어느 탭을
 * 가리키는지가 마우스 위치에 달리게 된다.
 */
function DocumentHeader({
  state,
  onSelect,
  headerRef,
}: {
  state: TabState;
  onSelect?: (id: string) => void;
  headerRef?: RefObject<HTMLElement | null>;
}) {
  const tab = activeTab(state);
  if (tab === undefined) return null;

  return (
    <header ref={headerRef} aria-label="문서 헤더" data-document-header="" tabIndex={-1}>
      <nav aria-label="브레드크럼" tabIndex={0}>
        {tab.breadcrumb.join(' / ')}
      </nav>
      <span role="status">{SAVE_LABEL[tab.save]}</span>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger aria-label={`${tab.name} 문서 메뉴`}>⋯</DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            {DOCUMENT_MENU_ITEMS.map((item) => (
              <DropdownMenu.Item key={item.id} onSelect={() => onSelect?.(item.id)}>
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  );
}

function DocumentRecoveryRecords({
  recovery,
  onDiscard,
}: {
  recovery: Readonly<Record<string, readonly RecoveryRecord[]>>;
  onDiscard?: (nodeId: string, recordId: string) => void;
}) {
  const unresolved = Object.values(recovery).some((records) => records.length > 0);
  useEffect(() => {
    if (!unresolved) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unresolved]);
  return Object.entries(recovery).flatMap(([nodeId, records]) => records.map((record, index) => (
    <section key={record.id} aria-label={`로컬 편집본 ${index + 1}`} data-document-recovery>
      <InlineNotice title="로컬 편집본 — 서버에 저장되지 않았습니다." variant="warning" />
      <textarea aria-label="로컬 편집 내용" readOnly value={record.text} />
      <button type="button" onClick={() => {
        const url = URL.createObjectURL(new Blob([record.text], { type: 'text/markdown' }));
        const link = document.createElement('a'); link.href = url; link.download = record.fileName; link.click(); URL.revokeObjectURL(url);
      }}>로컬 편집본 내려받기</button>
      <button type="button" onClick={() => onDiscard?.(nodeId, record.id)}>로컬 편집본 폐기</button>
    </section>
  )));
}

/**
 * 본문 영역 — 탭 스트립 위, 문서 헤더 아래, 그 아래 본문.
 *
 * 상태를 여기서 들고 있는 것은 wave-4 범위가 셸 골격까지이기 때문이다.
 * 에디터가 붙는 자리(`Tabs.Content` 안)는 wave-5 가 채운다.
 */
export function DocumentArea({
  state,
  onState,
  bodies = {},
  hashes = {},
  readStates = {},
  registerDraft,
  beforeDraftUnmount,
  draftOwner,
  allowsProtected,
  authorizationPhase = 'active',
  authorizationEpoch = 0,
  recovery = {},
  onDiscardRecovery,
  onSaveState,
  onSaved,
  onAuthenticationLoss,
  onTagClick,
  onOpenWikiLink,
  share,
  missing = false,
  requestedState,
}: {
  /**
   * 열린 탭들. **바깥이 소유한다.**
   *
   * 여기서 복사해 들면 정본이 둘이 된다 — 탭을 닫거나 바꾼 사실이 바깥에
   * 닿지 않아, 닫은 문서를 계속 다시 받고 우측 링크 패널이 앞 문서 것을
   * 보인다. 그 어긋남은 두 탭을 오가 보기 전까지 드러나지 않는다.
   */
  state: TabState;
  onState: (next: TabState) => void;
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. 저장 요청이 이것을 싣는다. */
  hashes?: Readonly<Record<string, string>>;
  /** Existing body queries' presentation state. This is not a second body store. */
  readStates?: Readonly<Record<string, DocumentReadState>>;
  registerDraft?: (surface: LiveDraftRegistration) => () => void;
  beforeDraftUnmount?: (surface: LiveDraftRegistration) => void;
  draftOwner?: AuthOwner;
  allowsProtected?: (owner: AuthOwner) => boolean;
  authorizationPhase?: AuthPhase;
  authorizationEpoch?: number;
  recovery?: Readonly<Record<string, readonly RecoveryRecord[]>>;
  onDiscardRecovery?: (nodeId: string, recordId: string) => void;
  onSaveState?: (nodeId: string, state: SaveState) => void;
  /** 본문 태그를 눌렀다 (`FR-EDITOR-007` AC-11). 받는 쪽은 좌측 검색 탭이다. */
  onTagClick?: (name: string) => void;
  /** 그 문서의 이 본문이 서버에 올라갔다. 서버 상태 캐시를 맞추는 자리가 쓴다. */
  onSaved?: (nodeId: string, body: string, hash: string) => void;
  onAuthenticationLoss?: () => void;
  /** 위키링크를 눌렀다 (`CON-EDITOR-002` AC-1). 그 문서를 여는 일은 셸이 한다. */
  onOpenWikiLink?: (target: string) => void;
  /**
   * 주소가 가리킨 문서에 닿지 못했다 (`SEC-ACL-006` AC-6).
   *
   * **왜 닿지 못했는지는 받지 않는다.** 없는 문서와 권한 없는 문서를
   * 구별하는 값이 이 경계를 넘는 순간, 그 값을 쓰지 않더라도 구별이
   * 가능해진 것이고 언젠가 누가 쓴다.
   */
  /**
   * 공유 화면의 배선 (`IR-ACL-002` · `IR-ACL-003`). 셸이 내려준다 —
   * 이 부품은 API 를 직접 부르지 않는다.
   */
  share?: {
    contextKey?: string;
    query?: ShareQueryState;
    onOpen?: (nodeId: string) => void;
    onGrant?: (nodeId: string, principalId: string, level: 'view' | 'edit') => Promise<ShareActionResult>;
    onRevoke?: (nodeId: string, entryId: string) => Promise<ShareActionResult>;
    onBreakInheritance?: (nodeId: string) => Promise<ShareActionResult>;
    onInheritFromParent?: (nodeId: string) => Promise<ShareActionResult>;
    refreshView?: (nodeId: string) => Promise<ShareViewBody | undefined>;
    onWarnings?: (input: { principalId?: string; entryId?: string }) => Promise<readonly GrantWarning[] | undefined>;
  };
  missing?: boolean;
  requestedState?: DocumentReadState;
}) {
  /**
   * 헤더 메뉴가 연 자리.
   *
   * 문서마다 따로 들지 않는다 — 활성 문서 하나에 대해서만 열리기 때문이다
   * (`IR-SHELL-003` AC-4).
   */
  const [panel, setPanel] = useState<string | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const requestedFocus = useRef(false);
  const [retryingNode, setRetryingNode] = useState<string | null>(null);
  const versionAllowsProtected = useCallback(
    () => draftOwner === undefined || (allowsProtected?.(draftOwner) ?? true),
    [allowsProtected, draftOwner?.generation, draftOwner?.userId],
  );
  const retryObserved = useRef(false);
  const retryFocus = useRef<{ nodeId: string; moved: boolean; cleanup?: () => void } | undefined>(undefined);

  useEffect(() => {
    if (requestedState?.state === 'loading' || requestedState?.state === 'pending' || requestedState?.state === 'error') {
      requestedFocus.current = true;
      return;
    }
    if (requestedFocus.current && state.activeId !== null) {
      requestedFocus.current = false;
      headerRef.current?.focus();
    }
  }, [requestedState, state.activeId]);

  useEffect(() => {
    const pending = retryFocus.current;
    if (pending === undefined || bodies[pending.nodeId] === undefined || readStates[pending.nodeId]?.state !== 'ready') return;
    pending.cleanup?.();
    if (!pending.moved) headerRef.current?.focus();
    retryFocus.current = undefined;
  }, [bodies, readStates]);

  useEffect(() => {
    if (retryingNode === null) return;
    const current = readStates[retryingNode];
    if (current?.state === 'loading' || current?.state === 'error' && current.retrying === true) retryObserved.current = true;
    if (current?.state === 'ready' || current?.state === 'missing' || current?.state === 'error' && current.retrying !== true && retryObserved.current) {
      setRetryingNode(null);
      retryObserved.current = false;
    }
  }, [readStates, retryingNode]);

  const retry = (nodeId: string, request: () => void) => {
    if (retryingNode === nodeId) return;
    retryObserved.current = false;
    setRetryingNode(nodeId);
    retryFocus.current?.cleanup?.();
    const pending: { nodeId: string; moved: boolean; cleanup?: () => void } = { nodeId, moved: false };
    retryFocus.current = pending;
    request();
    queueMicrotask(() => {
      if (retryFocus.current !== pending) return;
      const moved = () => { pending.moved = true; };
      window.addEventListener('pointerdown', moved, { once: true });
      window.addEventListener('keydown', moved, { once: true });
      pending.cleanup = () => {
        window.removeEventListener('pointerdown', moved);
        window.removeEventListener('keydown', moved);
      };
    });
  };
  const retainedRecovery = Object.fromEntries(
    Object.entries(recovery).filter(([nodeId]) => readStates[nodeId]?.state !== 'missing'),
  );

  const requestedPane = requestedState?.state === 'loading'
    ? <LoadingState label="문서를 불러오는 중입니다." />
    : requestedState?.state === 'pending'
      ? <LoadingState label="문서 전환 확인 중입니다." />
      : requestedState?.state === 'error'
        ? <ErrorState label="문서 오류" title="문서를 불러오지 못했습니다." description="연결 상태를 확인한 뒤 다시 시도하세요." onRetry={requestedState.onRetry} retrying={requestedState.retrying} />
        : null;

  if (state.tabs.length === 0) {
    if (requestedPane !== null) return <div data-document-area="">{requestedPane}</div>;
    // 삭제된 문서와 권한을 잃은 문서에 **같은 문구**를 준다 (`R94`). 화면
    // 설계(`03` §3.9.4)가 이 문면을 정했고 「권한이 없습니다」라고 쓰지
    // 않으며 요청 버튼도 두지 않는다(`R103-a`) — 버튼의 존재 자체가 그
    // 자리에 대상이 있다는 사실을 드러낸다.
    if (missing) return (
      <div data-document-area="">
        <EmptyState data-empty="documents" title="문서를 찾을 수 없습니다" />
        <DocumentRecoveryRecords recovery={recovery} onDiscard={onDiscardRecovery} />
      </div>
    );
    return (
      <EmptyState
        data-empty="documents"
        title="문서를 선택하세요."
        description="왼쪽 목록에서 문서를 열 수 있습니다."
      />
    );
  }

  const noSelection = state.activeId === null && !missing && requestedPane === null;
  const retainedHidden = missing || noSelection || requestedPane !== null;

  return (
    <div data-document-area="">
      {requestedPane}
      {noSelection ? (
        <EmptyState
          data-empty="documents"
          title="문서를 선택하세요."
          description="왼쪽 목록에서 문서를 고를 수 있습니다."
        />
      ) : null}
      {missing ? <EmptyState title="문서를 찾을 수 없습니다" /> : null}
      <div
        data-retained-document-host=""
        hidden={retainedHidden}
        inert={retainedHidden ? true : undefined}
        aria-hidden={retainedHidden ? true : undefined}
      >
      <Tabs.Root
        data-document-tabs=""
        value={state.activeId ?? undefined}
        onValueChange={(activeId) => onState({ ...state, activeId })}
      >
        <Tabs.List aria-label="열린 문서" data-document-tab-strip="">
          {state.tabs.map((tab) => (
            <Tabs.Trigger
              key={tab.nodeId}
              value={tab.nodeId}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
            >
              {tab.name}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <DocumentHeader
          state={state}
          headerRef={headerRef}
          onSelect={(id) => {
            // 공유를 열 때 그 노드의 권한 화면을 받아 온다 — 늘 받으면
            // 탭을 옮길 때마다 관리 전용 조회가 나간다.
            const tab = activeTab(state);
            if (id === 'share' && tab !== undefined) share?.onOpen?.(tab.nodeId);
            setPanel(id);
          }}
        />

        {state.tabs.map((tab) => (
          <Tabs.Content key={tab.nodeId} value={tab.nodeId} data-document-content="">
            <button type="button" onClick={() => onState(closeTab(state, tab.nodeId))}>
              {tab.name} 닫기
            </button>
            {panel === 'versions' && (
              <VersionHistory
                nodeId={tab.nodeId}
                currentBody={bodies[tab.nodeId] ?? ''}
                onRestored={() => setPanel(null)}
                allowsProtected={versionAllowsProtected}
                {...(draftOwner === undefined ? {} : { owner: draftOwner })}
                authorizationPhase={authorizationPhase}
                authorizationEpoch={authorizationEpoch}
              />
            )}
            {/* 문서와 디렉토리가 **같은 부품**을 쓴다 (`IR-ACL-003` AC-5).
                문서 전용 공유 화면을 따로 두면 그 AC 와 정면으로 어긋나고,
                같은 조작이 두 화면에서 다르게 동작하게 된다. */}
            <ShareModal
              nodeId={tab.nodeId}
              nodeName={tab.name}
              nodeKind="file"
              {...(share?.contextKey === undefined ? {} : { contextKey: share.contextKey })}
              open={panel === 'share'}
              onOpenChange={(next) => setPanel(next ? 'share' : null)}
              {...(share?.query === undefined ? {} : { query: share.query })}
              {...(share?.onGrant === undefined ? {} : { onGrant: (principalId: string, level: 'view' | 'edit') => share.onGrant!(tab.nodeId, principalId, level) })}
              {...(share?.onRevoke === undefined ? {} : { onRevoke: (entryId: string) => share.onRevoke!(tab.nodeId, entryId) })}
              {...(share?.onBreakInheritance === undefined ? {} : { onBreakInheritance: () => share.onBreakInheritance!(tab.nodeId) })}
              {...(share?.onInheritFromParent === undefined ? {} : { onInheritFromParent: () => share.onInheritFromParent!(tab.nodeId) })}
              refreshView={() => share?.refreshView?.(tab.nodeId) ?? Promise.resolve(undefined)}
              {...(share?.onWarnings === undefined ? {} : { onWarnings: share.onWarnings })}
            />
            {readStates[tab.nodeId]?.state === 'missing' ? (
              <>
                <EmptyState title="문서를 찾을 수 없습니다" />
                <DocumentRecoveryRecords
                  recovery={{ [tab.nodeId]: recovery[tab.nodeId] ?? [] }}
                  onDiscard={onDiscardRecovery}
                />
              </>
            ) : bodies[tab.nodeId] === undefined && (readStates[tab.nodeId]?.state === 'error' || retryingNode === tab.nodeId) ? (
              <ErrorState
                label="문서 오류"
                title="문서를 불러오지 못했습니다."
                description="연결 상태를 확인한 뒤 다시 시도하세요."
                onRetry={() => {
                  const current = readStates[tab.nodeId];
                  if (current?.state === 'error') retry(tab.nodeId, current.onRetry);
                }}
                retrying={retryingNode === tab.nodeId || readIsRetrying(readStates[tab.nodeId])}
              />
            ) : bodies[tab.nodeId] === undefined ? (
              <LoadingState label="문서를 불러오는 중입니다." />
            ) : (
            <>
            {readStates[tab.nodeId]?.state === 'error' ? (
              <InlineNotice
                title="문서를 새로 불러오지 못했습니다."
                variant="error"
                aria-busy={retryingNode === tab.nodeId || readIsRetrying(readStates[tab.nodeId]) || undefined}
              >
                편집 중인 내용은 그대로 유지됩니다.
                <Button
                  variant="secondary"
                  loading={retryingNode === tab.nodeId || readIsRetrying(readStates[tab.nodeId])}
                  onClick={() => {
                    const current = readStates[tab.nodeId];
                    if (current?.state === 'error') retry(tab.nodeId, current.onRetry);
                  }}
                >다시 시도</Button>
              </InlineNotice>
            ) : null}
            <DocumentSurface
              file={{ nodeId: tab.nodeId, name: tab.name, level: tab.level ?? null }}
              save={tab.save}
              serverBody={tab.serverBody ?? null}
              {...(bodies[tab.nodeId] === undefined ? {} : { body: bodies[tab.nodeId] })}
              {...(hashes[tab.nodeId] === undefined ? {} : { baseHash: hashes[tab.nodeId] })}
              onSaveState={(next) => onSaveState?.(tab.nodeId, next)}
              onSaved={(body, hash) => onSaved?.(tab.nodeId, body, hash)}
              {...(onAuthenticationLoss === undefined ? {} : { onAuthenticationLoss })}
              {...(onTagClick === undefined ? {} : { onTagClick })}
              {...(onOpenWikiLink === undefined ? {} : { onOpenWikiLink })}
              {...(registerDraft === undefined ? {} : { registerDraft })}
              {...(beforeDraftUnmount === undefined ? {} : { beforeDraftUnmount })}
              {...(draftOwner === undefined ? {} : { draftOwner })}
              {...(allowsProtected === undefined ? {} : { allowsProtected })}
            />
            </>
            )}
          </Tabs.Content>
        ))}
      </Tabs.Root>
      </div>
      <DocumentRecoveryRecords recovery={retainedRecovery} onDiscard={onDiscardRecovery} />
    </div>
  );
}
