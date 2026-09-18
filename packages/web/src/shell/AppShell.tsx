import * as Tabs from '@radix-ui/react-tabs';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';

import { DocumentArea } from '../document/DocumentArea.js';
import { PasswordChangeForm } from '../auth/PasswordChangeForm.js';
import { FavoritesView, type Favorite } from '../favorites/FavoritesView.js';
import { LinkPanel, type LinkRowView } from '../links/LinkPanel.js';
import { SearchPanel, type SearchPanelState } from '../search/SearchPanel.js';
import type { SearchAxis } from '../search/search-axes.js';
import { TagPanel } from '../search/TagPanel.js';
import type { SaveState, TabState } from '../document/tab-state.js';
import { DocumentTree, type Naming } from '../tree/DocumentTree.js';
import type { UploadRequest } from '../attachment/upload-contract.js';
import { EmptyState as AccessEmptyState } from '../tree/EmptyState.js';
import { NewVersionPrompt, type NewVersionResult } from '../tree/NewVersionPrompt.js';
import { RelocationDialog } from './RelocationDialog.js';
import { InstanceSettings } from '../settings/InstanceSettings.js';
import { WorkspaceManagementPanel, type WorkspaceAdministratorState, type WorkspaceQueryState, type WorkspaceRenameResult } from '../workspace/WorkspaceList.js';
import type { WorkspaceCreateInput } from '../workspace/NewWorkspaceForm.js';
import type { WorkspaceCreateBody } from '../api/client.js';
import {
  PersonalSettings,
  type ThemeLoadState,
  type ThemeSaveState,
} from '../settings/PersonalSettings.js';
import type { EditorPreferenceLoadState, EditorPreferenceSaveStates } from '../settings/editor-preferences.js';
import { TokenPanel, type TokenLeaveGuard, type TokenOwner, type TokenQueryState } from '../settings/TokenPanel.js';
import type { TokenIssueInput, TokenRowView } from '../settings/token-contract.js';
import { AclAuditPanel, type AclAuditProps } from '../acl/AclAuditPanel.js';
import { ShareModal, type ShareActionResult, type ShareQueryState } from '../acl/ShareModal.js';
import type { GrantWarning } from '../acl/GrantConfirm.js';
import { AuditLogPanel, type AuditReadState } from '../audit/AuditLogPanel.js';
import type {
  AuditViewBody,
  ReconciliationQueueBody,
  SearchDocumentBody,
  ShareViewBody,
  TagIndexBody,
} from '../api/client.js';
import { GroupRoster } from '../principal/GroupRoster.js';
import { UserRoster } from '../principal/UserRoster.js';
import { SignupApproval } from '../principal/SignupApproval.js';
import { TrashPanel, type TrashActionResult, type TrashLens, type TrashQueryState, type TrashRowView } from '../trash/TrashPanel.js';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/states.js';
import { Button } from '../components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog.js';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../components/ui/alert-dialog.js';
import type { RosterGroup, RosterUser, RosterUserStatus } from '../api/client.js';
import { containerFor, destinationsFor, nodeById } from '../tree/tree-contract.js';
import type { TreeNodeView, WorkspaceTreeView } from '../tree/tree-contract.js';
import {
  LEFT_TABS,
  RIGHT_TABS,
  visibleCategories,
  type ShellTab,
  type Viewer,
} from './shell-contract.js';

export type ShellPanelState =
  | { state: 'ready' }
  | { state: 'loading' }
  | { state: 'error'; message: string; onRetry?: () => void };

function ReplaceConfirmation({ request, restoreFocus }: { request: { name: string; accept: () => void; cancel: () => void }; restoreFocus: HTMLElement | null }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const invoker = useRef<HTMLElement | null>(
    restoreFocus ?? (typeof document === 'undefined' ? null : document.activeElement instanceof HTMLElement ? document.activeElement : null),
  );
  const activated = useRef(false);
  const composing = useRef(false);

  useLayoutEffect(() => { activated.current = false; }, [request]);

  const restoreInvoker = () => {
    const returnTarget = invoker.current;
    if (returnTarget?.isConnected) returnTarget.focus();
    else document.querySelector<HTMLElement>('[data-document-header] [tabindex="0"]')?.focus();
  };

  const cancel = () => {
    if (activated.current) return;
    activated.current = true;
    request.cancel();
    requestAnimationFrame(restoreInvoker);
  };
  const accept = () => {
    if (activated.current || composing.current) return;
    activated.current = true;
    request.accept();
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) cancel(); }}>
      <AlertDialogContent
        data-replace-confirmation
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(restoreInvoker); }}
        onCompositionStartCapture={() => { composing.current = true; }}
        onCompositionEndCapture={() => { composing.current = false; }}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <AlertDialogTitle>편집 중인 문서</AlertDialogTitle>
        <AlertDialogDescription>
          지금 문서에 저장되지 않은 편집이 남아 있습니다. {request.name} 을(를) 열면 그 편집이 사라집니다.
        </AlertDialogDescription>
        <div data-slot="alert-dialog-actions">
          <AlertDialogCancel ref={cancelRef} type="button" onClick={cancel}>머무르기</AlertDialogCancel>
          <Button variant="destructive" onClick={accept}>그래도 열기</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FocusRestoreBoundary({
  identity,
  fallback,
  children,
}: {
  identity: string;
  fallback: RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  const heldFocus = useRef(false);

  useLayoutEffect(() => () => {
    if (!heldFocus.current) return;
    queueMicrotask(() => {
      const active = document.activeElement;
      if (active === null || active === document.body || !active.isConnected) fallback.current?.focus();
    });
  }, [fallback, identity]);

  return (
    <div
      data-panel-focus-boundary
      onFocusCapture={() => { heldFocus.current = true; }}
      onBlurCapture={(event) => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) {
          heldFocus.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

/**
 * 사이드바 하나 — 탭 줄과 그 아래 본문.
 *
 * 좌우가 **같은 부품**을 쓴다. 옵시디언과 같은 구조라는 것이 요구이고
 * (`FR-SHELL-001` · `FR-SHELL-004`), 둘을 따로 만들면 한쪽에만 손이 가서
 * 구조가 갈린다. 다른 것은 탭 목록과 이름표뿐이다.
 *
 * Radix 를 쓰는 이유는 `CON-ARCH-004` AC-2 가 그것을 지목하기 때문이며,
 * 부수 효과로 탭의 키보드 이동과 `role`·`aria-*` 배선이 함께 온다 —
 * 직접 만들면 그것들이 빠진 채로 「동작은 한다」가 된다.
 */
function Sidebar({
  label,
  tabs,
  side,
  active,
  onActivate,
  footer,
  focusTarget,
  busyTabs = [],
  children,
}: {
  label: string;
  tabs: readonly ShellTab[];
  side: 'left' | 'right';
  /**
   * 지금 열린 탭. 주어지면 **바깥이 소유한다.**
   *
   * 좌측이 그렇다 — 본문의 태그를 눌러도 검색 탭이 열려야 하므로
   * (`FR-EDITOR-007` AC-11), 탭 상태가 이 안에만 있으면 그 경로가 닿지
   * 못한다. 우측은 아직 밖에서 여는 자리가 없어 안에서 든다.
   */
  active?: string;
  onActivate?: (tabId: string) => void;
  footer?: React.ReactNode;
  focusTarget?: { tabId: string; ref: RefObject<HTMLButtonElement | null> };
  busyTabs?: readonly string[];
  children?: (tab: ShellTab) => React.ReactNode;
}) {
  const first = tabs[0]!;

  return (
    <aside aria-label={label} data-side={side}>
      <Tabs.Root
        {...(active === undefined ? { defaultValue: first.id } : { value: active })}
        onValueChange={onActivate}
        orientation="horizontal"
      >
        <Tabs.List aria-label={label}>
          {tabs.map((tab) => (
            <Tabs.Trigger
              ref={focusTarget?.tabId === tab.id ? focusTarget.ref : undefined}
              key={tab.id}
              value={tab.id}
              onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
            >
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {tabs.map((tab) => (
          // 고른 탭의 본문만 DOM 에 남긴다 — 전부 렌더해 두고 숨기면
          // 「교체된다」(AC-2)가 화면에서만 참이고 접근성 트리에서는 거짓이다.
          <Tabs.Content key={tab.id} value={tab.id} aria-busy={busyTabs.includes(tab.id) || undefined}>
            {children?.(tab) ?? <p>{tab.label}</p>}
          </Tabs.Content>
        ))}
      </Tabs.Root>
      {footer}
    </aside>
  );
}

/**
 * 설정 모달 (`CON-SHELL-001`).
 *
 * 관리 기능으로 가는 **유일한** 진입점이다(AC-1) — 「관리자 화면」 버튼을
 * 따로 두면 그것이 두 번째 진입점이 되고, 두 진입점은 곧 서로 다른 것을
 * 보여 주게 된다.
 */
function SettingsModal({
  viewer,
  trash = [],
  trashQuery,
  trashContextKey,
  workspaces = [],
  trashLens,
  personalSettings = {},
  tokens = [],
  tokenOwner,
  tokenQuery,
  onIssueToken,
  onRevokeToken,
  userRoster = [],
  groupRoster = [],
  aclAudit,
  audit,
  auditLog,
  queueState,
  queue,
  auditContextKey,
  auditOperation,
  onAuditOperation,
  onTrashLens,
  onTrashPurge,
  onTrashRestore,
  onPersonalSetting,
  themeLoadState,
  themeSaveState,
  editorLoadState,
  editorSaveStates,
  onGroupRemove,
  onGroupAddMember,
  onRegisterUser,
  signupMode,
  onApproveUser,
  onReopenUser,
  onUserStatus,
  onLogout,
  onPasswordChange,
  workspaceManagement,
}: {
  viewer: Viewer;
  trash?: readonly TrashRowView[];
  trashQuery?: TrashQueryState;
  trashContextKey?: string;
  workspaces?: readonly { id: string; name: string }[];
  trashLens?: TrashLens;
  /** 이 사용자의 개인 설정 (`DR-SHELL-002`). 없는 항목은 기본값으로 그린다. */
  personalSettings?: Readonly<Record<string, string>>;
  /** 이 사용자의 PAT 목록 (`SEC-AUTH-007` AC-1). 본인 것만 온다. */
  tokens?: readonly TokenRowView[];
  tokenOwner?: TokenOwner;
  tokenQuery?: TokenQueryState;
  /** PAT 를 발급한다. **평문을 돌려주고**, 그 값은 화면 밖으로 나가지 않는다. */
  onIssueToken?: (input: TokenIssueInput) => Promise<{ token: string } | undefined>;
  /** PAT 를 폐기한다 (`SEC-AUTH-007` AC-2). 화면이 L2 확인을 먼저 받는다. */
  onRevokeToken?: (id: string) => Promise<{ ok: true } | { ok: false }>;
  /** 슈퍼유저 전용 명부 (`R163`). 슈퍼유저가 아니면 비어 있다. */
  userRoster?: readonly RosterUser[];
  groupRoster?: readonly RosterGroup[];
  /** 권한 감사 구역이 그릴 것 (`FR-ACL-003`~`FR-ACL-005`). */
  aclAudit?: AclAuditProps;
  /** 감사 로그 (`R84`). 관리 범위가 없으면 안 온다. */
  audit?: AuditReadState<AuditViewBody>;
  auditLog?: AuditViewBody;
  /** 재조정 대기열 (`IR-AUDIT-002`). 감사 로그와 같은 자격으로 온다. */
  queueState?: AuditReadState<ReconciliationQueueBody>;
  queue?: ReconciliationQueueBody;
  auditContextKey?: string;
  /** 감사 로그의 조작 필터 (`IR-AUDIT-001`). 빈 문자열이 「전체」다. */
  auditOperation?: string;
  onAuditOperation?: (operation: string) => void;
  onTrashLens?: (lens: TrashLens) => void;
  onTrashPurge?: (nodeId: string) => Promise<TrashActionResult>;
  onTrashRestore?: (nodeId: string) => Promise<TrashActionResult>;
  onPersonalSetting?: (key: string, value: string) => void;
  themeLoadState?: ThemeLoadState;
  themeSaveState?: ThemeSaveState;
  editorLoadState?: EditorPreferenceLoadState;
  editorSaveStates?: EditorPreferenceSaveStates;
  onGroupRemove?: (groupId: string) => void;
  onGroupAddMember?: (groupId: string, userId: string) => void;
  /** 슈퍼유저 직접 등록 (`FR-AUTH-003`). */
  onRegisterUser?: (input: { name: string; password: string }) => void;
  /** 지금 가입 모드 (`FR-AUTH-004`). 빈 대기열의 원인이 여기서 갈린다. */
  signupMode?: string;
  /** 가입 승인 (`SEC-AUTH-004` AC-1). */
  onApproveUser?: (userId: string) => void;
  /** 거절된 계정의 재심사 (`FR-AUTH-002`). */
  onReopenUser?: (userId: string) => void;
  /** 계정 상태 전환 (`R112-d`). */
  onUserStatus?: (userId: string, status: RosterUserStatus) => void;
  /** 이 브라우저의 세션을 끊는다 (`SEC-AUTH-019` AC-1). */
  onLogout?: () => void | Promise<void>;
  /** 자기 비밀번호를 바꾼다 (`SEC-AUTH-018` AC-1). 거절되면 규칙 코드가 돌아온다. */
  onPasswordChange?: (input: {
    current: string;
    next: string;
  }) => Promise<string | undefined | void>;
  workspaceManagement?: {
    managed: WorkspaceQueryState;
    all: WorkspaceQueryState;
    administrators: WorkspaceAdministratorState;
    selectedId?: string;
    onSelect: (workspaceId: string) => void;
    onRename: (workspaceId: string, name: string) => Promise<WorkspaceRenameResult>;
    onCreate?: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateBody>;
    onLoadCreationWarnings?: (input: Pick<WorkspaceCreateInput, 'administratorId' | 'defaultGroupLevel'>) => Promise<readonly GrantWarning[]>;
    creationStatus?: { kind: 'success' | 'refresh-error'; message: string };
    onRetryCreationRefresh?: () => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('editor');
  const [비밀번호폼, set비밀번호폼] = useState(false);
  const [tokenLostNotice, setTokenLostNotice] = useState(false);
  const tokenLeaveGuard = useRef<TokenLeaveGuard | null>(null);
  const titleId = useId();
  const selectedWorkspaceContext = workspaceManagement?.selectedId === undefined ? undefined : [
    ...(workspaceManagement.managed.state === 'ready' ? workspaceManagement.managed.rows : []),
    ...(workspaceManagement.all.state === 'ready' ? workspaceManagement.all.rows : []),
  ].find((workspace) => workspace.id === workspaceManagement.selectedId);
  useEffect(() => {
    setTokenLostNotice(false);
    tokenLeaveGuard.current = null;
  }, [tokenOwner?.generation, tokenOwner?.userId]);
  // 보이지 않는 카테고리는 **그리지 않는다.** 트리 컨텍스트 메뉴는 반대로
  // 비활성으로 남기는데(`FR-SHELL-003` AC-3), 그것은 권한을 얻으면 열리는
  // 조작이기 때문이다. 여기 감춰지는 것들은 권한 자체를 못 얻는 자리다 —
  // 비활성으로 보여 주면 그것이 언젠가 열릴 것처럼 읽힌다.
  const categories = visibleCategories(viewer);
  const selectionRevoked = !categories.some((category) => category.id === selectedCategory);
  const sectionLabels = {
    personal: '개인',
    workspace: '워크스페이스 관리',
    instance: '인스턴스',
  } as const;

  return (
    <Dialog open={open} onOpenChange={(next) => {
      const change = () => { setOpen(next); if (next) setSelectedCategory('editor'); };
      if (!next && tokenLeaveGuard.current !== null) { tokenLeaveGuard.current(change); return; }
      change();
    }}>
      {/* 좌하단 기어가 자리다 (`IR-SHELL-002` AC-1) — 어디에 있어도 되는
          버튼이면 사용자가 매번 찾아야 한다. */}
      <div data-shell="settings-corner">
        <DialogTrigger aria-label="설정">⚙</DialogTrigger>
      </div>

      <DialogContent
        data-settings-dialog
        aria-labelledby={titleId}
        onEscapeKeyDown={(event) => {
          if (tokenLeaveGuard.current !== null) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (tokenLeaveGuard.current !== null) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-settings-dialog] [role="tab"][data-state="active"]')?.focus());
        }}
      >
          <header data-settings-header>
            <div>
              <DialogTitle id={titleId}>설정</DialogTitle>
              <DialogDescription>왼쪽에서 설정 항목을 선택하세요.</DialogDescription>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="설정 닫기">×</Button>
            </DialogClose>
          </header>

          {/* 좌측 카테고리 — 관리 기능이 전부 이 목록 안에 든다(AC-2). */}
          <Tabs.Root value={selectedCategory} onValueChange={(category) => {
            const change = () => setSelectedCategory(category);
            if (tokenLeaveGuard.current !== null) { tokenLeaveGuard.current(change); return; }
            change();
          }} orientation="vertical" data-settings-layout>
            <Tabs.List
              aria-label="설정 카테고리"
              data-settings-navigation
              onKeyDown={(event) => {
                if (event.key !== 'Home' && event.key !== 'End') return;
                event.preventDefault();
                const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
                tabs[event.key === 'Home' ? 0 : tabs.length - 1]?.focus();
              }}
            >
              {categories.map((category) => (
                <Fragment key={category.id}>
                {category.id === 'editor' || category.id === 'workspace' || category.id === 'users' ? (
                  <h2>{sectionLabels[category.section]}</h2>
                ) : null}
                <Tabs.Trigger aria-label={category.label} value={category.id} onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}>
                  {category.label}
                  {/* 미해소 건수 배지 (`IR-AUDIT-002` AC-5~AC-7). Phase 1 에
                      알림 체계가 없어(`R110-a`) 이것이 통지 수단이다.
                      **총계도 분모도 싣지 않는다** — 자기 몫과 총계의 차액이
                      곧 다른 워크스페이스의 규모를 알린다 (`R141-b`). */}
                  {category.id === 'audit-log' && (queueState !== undefined || queue !== undefined) ? (
                    <span
                      data-testid="queue-badge"
                      aria-label={queueState?.state === 'loading'
                        ? '미해소 항목 불러오는 중'
                        : queueState?.state === 'error'
                          ? '미해소 항목을 불러오지 못함'
                          : `미해소 항목 ${queueState?.state === 'ready' ? queueState.data.items.length : queue!.items.length}개`}
                    >
                      {queueState?.state === 'loading' ? '…' : queueState?.state === 'error' ? '!' : queueState?.state === 'ready' ? queueState.data.items.length : queue!.items.length}
                    </span>
                  ) : null}
                </Tabs.Trigger>
                </Fragment>
              ))}
            </Tabs.List>

            <div data-settings-content>
            {selectionRevoked ? (
              <div role="status" data-settings-unavailable>
                <p>선택한 설정을 더 이상 사용할 수 없습니다.</p>
                <Button type="button" variant="secondary" onClick={() => setSelectedCategory('editor')}>
                  에디터로 이동
                </Button>
              </div>
            ) : categories.map((category) => (
              <Tabs.Content key={category.id} value={category.id} tabIndex={-1}>
                {/* 휴지통만 내용을 갖는다 — 나머지 카테고리는 그것을
                    소유한 요구가 서는 자리에서 채워진다. */}
                {category.id === 'trash' ? (
                  <TrashPanel
                    contextKey={trashContextKey}
                    rows={trash}
                    query={trashQuery ?? { state: 'ready' }}
                    workspaces={workspaces}
                    // 관리 권한이 어디에도 없으면 범위 토글이 서지 않는다
                    // (`FR-SHELL-007` AC-5) — 눌러도 결과가 그대로다.
                    canWidenScope={viewer.adminWorkspaceCount > 0}
                    {...(trashLens === undefined ? {} : { lens: trashLens })}
                    {...(onTrashLens === undefined ? {} : { onLens: onTrashLens })}
                    {...(onTrashPurge === undefined ? {} : { onPurge: onTrashPurge })}
                    {...(onTrashRestore === undefined ? {} : { onRestore: onTrashRestore })}
                  />
                ) : category.id === 'workspace' || category.id === 'all-workspaces' ? (
                  <WorkspaceManagementPanel
                    mode={category.id === 'workspace' ? 'managed' : 'all'}
                    query={category.id === 'workspace' ? workspaceManagement?.managed ?? { state: 'loading' } : workspaceManagement?.all ?? { state: 'loading' }}
                    administratorSearchEnabled={selectedCategory === category.id}
                    {...(workspaceManagement?.selectedId === undefined ? {} : { selectedId: workspaceManagement.selectedId })}
                    {...(workspaceManagement === undefined ? {} : { onSelect: workspaceManagement.onSelect, onRename: workspaceManagement.onRename, administrators: workspaceManagement.administrators })}
                    {...(category.id !== 'all-workspaces' || workspaceManagement === undefined ? {} : {
                      onCreate: workspaceManagement.onCreate,
                      onLoadCreationWarnings: workspaceManagement.onLoadCreationWarnings,
                      creationStatus: workspaceManagement.creationStatus,
                      onRetryCreationRefresh: workspaceManagement.onRetryCreationRefresh,
                    })}
                  />
                ) : category.id === 'instance' ? (
                  <InstanceSettings />
                ) : category.id === 'editor' || category.id === 'appearance' ? (
                  // 두 카테고리가 담는 것은 `IR-SHELL-004` 가 정한 셋뿐이다.
                  // 목록을 여기서 손으로 적지 않는 이유는, 적는 순간 계약과
                  // 화면이 두 벌이 되어 한쪽만 고쳐지기 때문이다.
                  <PersonalSettings
                    category={category.id}
                    values={personalSettings}
                    {...(themeLoadState === undefined ? {} : { themeLoadState })}
                    {...(themeSaveState === undefined ? {} : { themeSaveState })}
                    {...(editorLoadState === undefined ? {} : { editorLoadState })}
                    {...(editorSaveStates === undefined ? {} : { editorSaveStates })}
                    {...(onPersonalSetting === undefined ? {} : { onPick: onPersonalSetting })}
                  />
                ) : category.id === 'tokens' ? (
                  // 이 카테고리는 계약(`shell-contract.ts`)에만 있고 본문이
                  // 없었다 — 탭을 누르면 `<p>액세스 토큰</p>` 한 줄이 섰다.
                  // 배열에만 있고 렌더되지 않으면 그 조작은 제품에 없는
                  // 것이라는 `IR-SHELL-002` VE-3 의 선례가 이 자리다.
                  <TokenPanel
                    {...(tokenOwner === undefined ? {} : { owner: tokenOwner })}
                    {...(tokenQuery === undefined ? { rows: tokens } : { query: tokenQuery })}
                    lostNotice={tokenLostNotice}
                    onLostNotice={setTokenLostNotice}
                    onLeaveGuardChange={(guard) => { tokenLeaveGuard.current = guard; }}
                    {...(onIssueToken === undefined ? {} : { onIssue: onIssueToken })}
                    {...(onRevokeToken === undefined ? {} : { onRevoke: onRevokeToken })}
                  />
                ) : category.id === 'account' ? (
                  // 계정 카테고리가 담기로 확정된 두 조작 (`IR-SHELL-002` AC-3).
                  <>
                    {/* 폼은 눌렀을 때 편다 — 늘 펴 두면 설정을 열 때마다
                        비밀번호 입력이 서서, 그 자리가 무엇을 하는 곳인지가
                        「지금 무언가를 요구받고 있다」로 읽힌다. */}
                    <button type="button" onClick={() => set비밀번호폼(true)}>
                      비밀번호 변경
                    </button>
                    {비밀번호폼 ? (
                      <PasswordChangeForm
                        {...(onPasswordChange === undefined ? {} : { onSubmit: onPasswordChange })}
                      />
                    ) : null}
                    <button type="button" onClick={() => void onLogout?.()}>
                      로그아웃
                    </button>
                  </>
                ) : category.id === 'users' ? (
                  // 여기에 `PrincipalPicker` 를 두지 않는다 (`R163`). 그
                  // 부품은 `rejected` 를 아예 받지 않고 `suspended` 를
                  // 중립어로 적는데, 이 화면은 원장 `R112-d` 로 네 상태를
                  // 그대로 표시해야 한다.
                  <UserRoster
                    users={userRoster}
                    {...(onRegisterUser === undefined ? {} : { onRegister: onRegisterUser })}
                    {...(onApproveUser === undefined ? {} : { onApprove: onApproveUser })}
                    {...(onReopenUser === undefined ? {} : { onReopen: onReopenUser })}
                    {...(onUserStatus === undefined ? {} : { onStatus: onUserStatus })}
                  />
                ) : category.id === 'signup-approval' ? (
                  // 명부와 **다른 화면**이다 (설계서 `04` §2.10) — 조작이
                  // 동질적이고 대상이 대기 건수로 한정되기 때문이다.
                  <SignupApproval
                    users={userRoster}
                    {...(signupMode === undefined ? {} : { signupMode })}
                    {...(onApproveUser === undefined ? {} : { onApprove: onApproveUser })}
                    {...(onReopenUser === undefined ? {} : { onReopen: onReopenUser })}
                    {...(onUserStatus === undefined ? {} : { onStatus: onUserStatus })}
                  />
                ) : category.id === 'groups' ? (
                  <GroupRoster
                    groups={groupRoster}
                    {...(onGroupRemove === undefined ? {} : { onRemove: onGroupRemove })}
                    {...(onGroupAddMember === undefined ? {} : { onAddMember: onGroupAddMember })}
                  />
                ) : category.id === 'audit-log' ? (
                  // 이름을 **감사 로그**로 부른다 (`CON-AUDIT-001` AC-4).
                  <AuditLogPanel
                    {...(selectedWorkspaceContext === undefined ? {} : {
                      workspaceContext: {
                        id: selectedWorkspaceContext.id,
                        name: selectedWorkspaceContext.name,
                      },
                    })}
                    {...(audit === undefined ? {} : { audit })}
                    {...(auditLog === undefined ? {} : { view: auditLog })}
                    {...(queueState === undefined ? {} : { queueState })}
                    {...(queue === undefined ? {} : { queue })}
                    {...(auditContextKey === undefined ? {} : { contextKey: auditContextKey })}
                    {...(auditOperation === undefined ? {} : { operation: auditOperation })}
                    {...(onAuditOperation === undefined ? {} : { onOperation: onAuditOperation })}
                  />
                ) : category.id === 'acl-audit' ? (
                  // 셋을 여기 모은다 — 흩어 두면 관리자가 같은 물음을 세
                  // 곳에서 세 번 묻게 된다.
                  <AclAuditPanel {...(aclAudit ?? {})} />
                ) : (
                  <p>{category.label}</p>
                )}
              </Tabs.Content>
            ))}
            </div>
          </Tabs.Root>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 로그인 후 화면의 골격 — 좌측 사이드바 · 본문 · 우측 사이드바.
 *
 * 이 컴포넌트는 **자리만 잡는다.** 각 자리의 내용(트리·검색·백링크…)은
 * 그것을 소유한 요구가 서는 자리에서 채워진다 — 여기서 함께 만들면 셸의
 * 구조와 그 안의 기능이 한 파일에서 얽혀 어느 쪽을 고쳐도 다른 쪽이 흔들린다.
 */
export function AppShell({
  viewer,
  workspaces = [],
  documents = { tabs: [], activeId: null },
  missingDocument = false,
  favorites = [],
  treeState = { state: 'ready' },
  favoritesState = { state: 'ready' },
  links = { outgoing: [], backlinks: [] },
  linksState = { state: 'ready' },
  notice,
  bodies = {},
  hashes = {},
  searchResults = [],
  searchState,
  searchAxes,
  onSearchAxes,
  trash = [],
  trashQuery,
  trashContextKey,
  trashLens,
  personalSettings = {},
  tokens = [],
  tokenOwner,
  tokenQuery,
  onIssueToken,
  onRevokeToken,
  userRoster = [],
  groupRoster = [],
  aclAudit,
  audit,
  auditLog,
  queueState,
  queue,
  auditContextKey,
  tags,
  tagsState = { state: 'ready' },
  tagScope,
  onTagScope,
  auditOperation,
  onAuditOperation,
  onTrashLens,
  onTrashPurge,
  onTrashRestore,
  onPersonalSetting,
  themeLoadState,
  themeSaveState,
  editorLoadState,
  editorSaveStates,
  onGroupRemove,
  onGroupAddMember,
  onRegisterUser,
  signupMode,
  onApproveUser,
  onReopenUser,
  onUserStatus,
  query = '',
  onQuery,
  onOpen,
  onUpload,
  onCreateNote,
  onCreate,
  onFavorite,
  onUnfavorite,
  onLogout,
  onPasswordChange,
  workspaceManagement,
  onDelete,
  onRename,
  onRelocate,
  share,
  onNewVersion,
  onNoticeDismiss,
  confirmReplace,
  onSaveState,
  onSaved,
  onDocuments,
}: {
  viewer: Viewer;
  workspaces?: readonly WorkspaceTreeView[];
  documents?: TabState;
  /** 주소가 가리킨 문서에 닿지 못했다 (`SEC-ACL-006` AC-6). 문서 영역이 그린다. */
  missingDocument?: boolean;
  favorites?: readonly Favorite[];
  treeState?: ShellPanelState;
  favoritesState?: ShellPanelState;
  /** 노드 ID → 서버에서 받아 온 본문. 아직 안 온 것은 없다. */
  bodies?: Readonly<Record<string, string>>;
  /** 노드 ID → 그 본문의 기준 해시. */
  hashes?: Readonly<Record<string, string>>;
  /** 검색 결과. 서버가 이미 거르고 발췌까지 만든 것이다 (`FR-SHELL-013`). */
  searchResults?: readonly SearchDocumentBody[];
  searchState?: SearchPanelState;
  /** 켜진 검색 대상 (`FR-SHELL-013` AC-6 · AC-7). 되살리는 일은 바깥의 것이다. */
  searchAxes?: readonly SearchAxis[];
  onSearchAxes?: (axes: readonly SearchAxis[]) => void;
  /** 활성 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3). */
  links?: { outgoing: readonly LinkRowView[]; backlinks: readonly LinkRowView[] };
  linksState?: ShellPanelState;
  /** 휴지통 행. 서버가 행마다 권한을 붙여 준다. */
  trash?: readonly TrashRowView[];
  trashQuery?: TrashQueryState;
  trashContextKey?: string;
  /**
   * 방금 조작에 대한 서버의 안내 (`SEC-SHELL-002` AC-3).
   *
   * **문구를 서버가 준다.** 화면이 지으면 보이는 충돌과 보이지 않는 충돌의
   * 문구가 갈리고, 그 차이 자체가 존재 오라클이 된다.
   */
  notice?: string;
  /** 휴지통 목록을 좁혀 보는 조건 (`FR-SHELL-007` AC-4 · AC-5). */
  trashLens?: TrashLens;
  onTrashLens?: (lens: TrashLens) => void;
  /** 그 항목을 영구 삭제한다 (`SEC-SHELL-001`). 버튼은 서버 판정을 따라 그려진다. */
  onTrashPurge?: (nodeId: string) => Promise<TrashActionResult>;
  /** 그 항목을 되돌린다 (`FR-SHELL-007`). */
  onTrashRestore?: (nodeId: string) => Promise<TrashActionResult>;
  /**
   * 이 사용자의 개인 설정 (`IR-SHELL-004` · `DR-SHELL-002`).
   *
   * 정본은 서버의 (사용자, 항목) 행이다 — 셸이 값을 들고 있으면 화면과
   * 서버가 갈리고, 갈린 뒤에는 새로고침해야 어느 쪽이 옳은지 알 수 있다.
   */
  personalSettings?: Readonly<Record<string, string>>;
  onPersonalSetting?: (key: string, value: string) => void;
  themeLoadState?: ThemeLoadState;
  themeSaveState?: ThemeSaveState;
  editorLoadState?: EditorPreferenceLoadState;
  editorSaveStates?: EditorPreferenceSaveStates;
  /**
   * 이 사용자의 PAT 목록 (`SEC-AUTH-006` · `SEC-AUTH-007`).
   *
   * **평문 칸이 없다.** 목록은 발급 뒤 언제든 다시 받을 수 있는 값이고,
   * 평문은 발급 응답에만 실린다 (`SEC-AUTH-006` AC-2).
   */
  tokens?: readonly TokenRowView[];
  tokenOwner?: TokenOwner;
  tokenQuery?: TokenQueryState;
  onIssueToken?: (input: TokenIssueInput) => Promise<{ token: string } | undefined>;
  onRevokeToken?: (id: string) => Promise<{ ok: true } | { ok: false }>;
  /** 슈퍼유저 전용 명부 (`R163`). 슈퍼유저가 아니면 서버가 주지 않는다. */
  userRoster?: readonly RosterUser[];
  groupRoster?: readonly RosterGroup[];
  onGroupRemove?: (groupId: string) => void;
  onGroupAddMember?: (groupId: string, userId: string) => void;
  /** 슈퍼유저 직접 등록 (`FR-AUTH-003`). */
  onRegisterUser?: (input: { name: string; password: string }) => void;
  /** 지금 가입 모드 (`FR-AUTH-004`). 빈 대기열의 원인이 여기서 갈린다. */
  signupMode?: string;
  /** 가입 승인 (`SEC-AUTH-004` AC-1). */
  onApproveUser?: (userId: string) => void;
  /** 거절된 계정의 재심사 (`FR-AUTH-002`). */
  onReopenUser?: (userId: string) => void;
  /** 계정 상태 전환 (`R112-d`). */
  onUserStatus?: (userId: string, status: RosterUserStatus) => void;
  /**
   * 권한 감사 구역이 그릴 것 (`FR-ACL-003`~`FR-ACL-005`).
   *
   * 셸이 데이터를 만들지 않는다 — 이 구역은 관리 범위로 잘린 것을 서버가
   * 이미 주므로, 여기서 다시 거르면 두 곳이 같은 규칙을 갖게 된다.
   */
  aclAudit?: AclAuditProps;
  /** 감사 로그 (`R84`). 관리 범위가 없으면 안 온다. */
  audit?: AuditReadState<AuditViewBody>;
  auditLog?: AuditViewBody;
  /** 재조정 대기열 (`IR-AUDIT-002`). 감사 로그와 같은 자격으로 온다. */
  queueState?: AuditReadState<ReconciliationQueueBody>;
  queue?: ReconciliationQueueBody;
  auditContextKey?: string;
  /** 태그 색인 (`FR-SHELL-009`). 서버가 이미 거르고 정렬한 것이다. */
  tags?: TagIndexBody;
  tagsState?: ShellPanelState;
  /** 태그 탭의 범위. 빈 문자열이 「전체」다. */
  tagScope?: string;
  onTagScope?: (workspaceId: string) => void;
  /** 감사 로그의 조작 필터 (`IR-AUDIT-001`). */
  auditOperation?: string;
  onAuditOperation?: (operation: string) => void;
  /** 좌측 검색 탭의 질의. 태그 클릭도 이 값을 채운다. */
  query?: string;
  onQuery?: (query: string) => void;
  onOpen?: (node: TreeNodeView, inNewTab: boolean) => void;
  onUpload?: (request: UploadRequest) => void;
  onCreateNote?: () => void;
  /**
   * 고른 자리에 새 노드를 만든다 (`FR-SHELL-016`).
   *
   * `parentId` 가 `null` 이면 그 워크스페이스의 루트다 — 서버의 `POST /nodes`
   * 가 부모를 그렇게 받으므로 화면이 여기서 이미 그 모양으로 넘긴다.
   */
  onCreate?: (
    workspaceId: string,
    parentId: string | null,
    kind: 'file' | 'directory',
    name: string,
  ) => void | Promise<string | undefined>;
  /** 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4). */
  onFavorite?: (nodeId: string) => void;
  /** 즐겨찾기에서 뺀다 (`FR-SHELL-001` AC-5). 목록과 트리 메뉴가 같은 것을 부른다. */
  onUnfavorite?: (nodeId: string) => void;
  /** 이 브라우저의 세션을 끊는다 (`SEC-AUTH-019` AC-1). */
  onLogout?: () => void | Promise<void>;
  /** 자기 비밀번호를 바꾼다 (`SEC-AUTH-018` AC-1). */
  onPasswordChange?: (input: {
    current: string;
    next: string;
  }) => Promise<string | undefined | void>;
  workspaceManagement?: {
    managed: WorkspaceQueryState;
    all: WorkspaceQueryState;
    administrators: WorkspaceAdministratorState;
    selectedId?: string;
    onSelect: (workspaceId: string) => void;
    onRename: (workspaceId: string, name: string) => Promise<WorkspaceRenameResult>;
    onCreate?: (input: WorkspaceCreateInput) => Promise<WorkspaceCreateBody>;
    onLoadCreationWarnings?: (input: Pick<WorkspaceCreateInput, 'administratorId' | 'defaultGroupLevel'>) => Promise<readonly GrantWarning[]>;
    creationStatus?: { kind: 'success' | 'refresh-error'; message: string };
    onRetryCreationRefresh?: () => void;
  };
  onDelete?: (nodeId: string) => void;
  onRename?: (nodeId: string, name: string) => void | Promise<string | undefined>;
  onRelocate?: (nodeId: string, kind: 'move' | 'copy', destinationId: string) => void;
  /**
   * 공유 화면의 배선 (`IR-ACL-002` · `IR-ACL-003`).
   *
   * 여섯을 낱개 소품으로 늘어놓지 않고 묶는다 — `AclAuditPanel` 이 쓰는
   * 방식과 같다. 낱개로 두면 하나를 빠뜨린 호출이 타입을 통과한다.
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
  /** 그 파일에 새 버전을 올린다 (`FR-SHELL-008` AC-2). */
  onNewVersion?: (node: TreeNodeView, file: File) => Promise<NewVersionResult>;
  /** 안내를 닫았다. 문구를 바깥이 들고 있으므로 지우는 것도 바깥이 한다. */
  onNoticeDismiss?: () => void;
  /**
   * 활성 탭을 교체하기 전에 받아야 할 확인 (`FR-SHELL-012` AC-3 · AC-4).
   *
   * 값이 있으면 대화상자가 선다 — 없으면 안 선다. 상태를 바깥이 들고
   * 있는 이유는 무엇을 열려 했는지도 바깥이 알기 때문이다.
   */
  confirmReplace?: { name: string; accept: () => void; cancel: () => void };
  onSaveState?: (nodeId: string, state: SaveState) => void;
  /** 그 문서의 이 본문이 서버에 올라갔다 — 서버 상태 캐시를 맞추는 자리가 쓴다. */
  onSaved?: (nodeId: string, body: string, hash: string) => void;
  /** 열린 탭이 바뀌었다 — 닫기·전환이 이 길로 바깥에 닿는다. */
  onDocuments?: (next: TabState) => void;
}) {
  /**
   * 좌측에서 열린 탭.
   *
   * 여기서 드는 이유는 이 탭을 여는 자리가 **둘**이기 때문이다 — 탭을
   * 직접 누르는 것과 본문 태그를 누르는 것(`FR-EDITOR-007` AC-11).
   */
  const [leftTab, setLeftTab] = useState(LEFT_TABS[0]!.id);
  const favoritesTab = useRef<HTMLButtonElement>(null);
  const [rightTab, setRightTab] = useState(RIGHT_TABS[0]!.id);
  const replaceInvoker = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (confirmReplace !== undefined) return;
    const rememberPointer = (event: PointerEvent) => {
      if (event.target instanceof HTMLElement) replaceInvoker.current = event.target.closest<HTMLElement>('button, [href], [tabindex]');
    };
    const rememberKey = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof HTMLElement) replaceInvoker.current = event.target.closest<HTMLElement>('button, [href], [tabindex]');
    };
    document.addEventListener('pointerdown', rememberPointer, true);
    document.addEventListener('keydown', rememberKey, true);
    return () => {
      document.removeEventListener('pointerdown', rememberPointer, true);
      document.removeEventListener('keydown', rememberKey, true);
    };
  }, [confirmReplace]);
  const rightTabTrigger = useRef<HTMLButtonElement>(null);
  /** 새 버전을 올릴 대상. 골라 둔 뒤 확인과 파일 고르기가 이어진다. */
  const [overwriting, setOverwriting] = useState<TreeNodeView | null>(null);
  const newVersionFocusSequence = useRef(0);
  const [newVersionFocusRequest, setNewVersionFocusRequest] = useState<{ nodeId: string; sequence: number }>();
  const closeNewVersion = useCallback(() => {
    if (overwriting === null) return;
    newVersionFocusSequence.current += 1;
    setNewVersionFocusRequest({ nodeId: overwriting.id, sequence: newVersionFocusSequence.current });
    setOverwriting(null);
  }, [overwriting]);
  /**
   * 지금 이름을 정하는 자리 (`FR-SHELL-015` AC-1 · `FR-SHELL-016` AC-3).
   *
   * 개명과 만들기가 **한 상태**다 — 둘 다 트리 안에서 이름 한 줄을 받는
   * 같은 일이고, 따로 들면 둘이 동시에 열리는 상태를 표현할 수 있게 된다.
   */
  const [naming, setNaming] = useState<Naming | null>(null);
  const [namingError, setNamingError] = useState<string | undefined>();
  const [namingPending, setNamingPending] = useState(false);
  const namingAttempt = useRef(0);
  const namingRequestPending = useRef(false);
  /** 옮기거나 복사하는 중인 노드와 그 조작 (`FR-SHELL-015` AC-2 · AC-4). */
  const [relocating, setRelocating] = useState<{
    node: TreeNodeView;
    kind: 'move' | 'copy';
  } | null>(null);
  /** 고른 목적지. 다이얼로그가 제어 상태로 받으므로 여기서 든다. */
  const [destinationId, setDestinationId] = useState('');
  /** 공유 화면을 연 노드 (`IR-ACL-002`). */
  const [sharing, setSharing] = useState<TreeNodeView | null>(null);

  // **정체가 흔들리면 안 된다.** 이 둘은 편집기 확장 묶음에 들어가는데,
  // 렌더마다 새로 만들면 그때마다 편집기가 통째로 재구성되어 커서·되돌리기
  // 이력이 사라지고, 한글 조합 중이면 그 글자가 깨진다.
  const searchFor = useCallback(
    (text: string) => {
      setLeftTab('search');
      onQuery?.(text);
    },
    [onQuery],
  );

  /**
   * 태그 이름 하나로 검색한다 (`FR-EDITOR-007` AC-11).
   *
   * 태그를 누르는 자리는 둘이다 — 본문의 칩과 우측 태그 탭의 줄. 둘 다
   * `#` 없는 이름을 건네므로 질의를 짓는 자리도 **하나여야 한다.** 각자
   * 지으면 한쪽만 고쳐지고 같은 태그가 서로 다른 결과를 낸다.
   */
  const searchForTag = useCallback((name: string) => searchFor(`#${name}`), [searchFor]);

  /**
   * 위키링크를 눌렀다 (`CON-EDITOR-002` AC-1).
   *
   * 이름으로 찾는다 — 본문에 적히는 것이 이름뿐이기 때문이다. 못 찾으면
   * **아무 일도 하지 않는다**: 아직 없는 문서를 눌렀을 뿐이고, 그 자리에서
   * 새로 만들면 오타 하나가 문서를 만든다.
   */
  const openByName = useCallback(
    (target: string) => {
      const found = workspaces
        .flatMap((entry) => entry.roots)
        .find((node) => node.name.replace(/\.[^.]+$/, '') === target || node.name === target);
      if (found !== undefined) onOpen?.(found, false);
    },
    [workspaces, onOpen],
  );

  return (
    <div data-shell="root">
      <Sidebar
        label="좌측 사이드바"
        tabs={LEFT_TABS}
        side="left"
        active={leftTab}
        onActivate={setLeftTab}
        busyTabs={[
          ...(treeState.state === 'loading' ? ['tree'] : []),
          ...(favoritesState.state === 'loading' ? ['favorites'] : []),
        ]}
        focusTarget={{ tabId: 'favorites', ref: favoritesTab }}
        footer={
          <SettingsModal
            viewer={viewer}
            trash={trash}
            {...(trashQuery === undefined ? {} : { trashQuery })}
            {...(trashContextKey === undefined ? {} : { trashContextKey })}
            workspaces={workspaces.map((entry) => entry.workspace)}
            {...(trashLens === undefined ? {} : { trashLens })}
            {...(onTrashLens === undefined ? {} : { onTrashLens })}
            {...(onTrashPurge === undefined ? {} : { onTrashPurge })}
            {...(onTrashRestore === undefined ? {} : { onTrashRestore })}
            personalSettings={personalSettings}
            {...(themeLoadState === undefined ? {} : { themeLoadState })}
            {...(themeSaveState === undefined ? {} : { themeSaveState })}
            {...(editorLoadState === undefined ? {} : { editorLoadState })}
            {...(editorSaveStates === undefined ? {} : { editorSaveStates })}
            {...(onPersonalSetting === undefined ? {} : { onPersonalSetting })}
            tokens={tokens}
            {...(tokenOwner === undefined ? {} : { tokenOwner })}
            {...(tokenQuery === undefined ? {} : { tokenQuery })}
            {...(onIssueToken === undefined ? {} : { onIssueToken })}
            {...(onRevokeToken === undefined ? {} : { onRevokeToken })}
            {...(onLogout === undefined ? {} : { onLogout })}
            {...(onPasswordChange === undefined ? {} : { onPasswordChange })}
            userRoster={userRoster}
            groupRoster={groupRoster}
            {...(aclAudit === undefined ? {} : { aclAudit })}
            {...(audit === undefined ? {} : { audit })}
            {...(auditLog === undefined ? {} : { auditLog })}
            {...(queueState === undefined ? {} : { queueState })}
            {...(queue === undefined ? {} : { queue })}
            {...(auditContextKey === undefined ? {} : { auditContextKey })}
            {...(auditOperation === undefined ? {} : { auditOperation })}
            {...(onAuditOperation === undefined ? {} : { onAuditOperation })}
            {...(onGroupRemove === undefined ? {} : { onGroupRemove })}
            {...(onGroupAddMember === undefined ? {} : { onGroupAddMember })}
            {...(signupMode === undefined ? {} : { signupMode })}
            {...(onApproveUser === undefined ? {} : { onApproveUser })}
            {...(onReopenUser === undefined ? {} : { onReopenUser })}
            {...(onUserStatus === undefined ? {} : { onUserStatus })}
            {...(onRegisterUser === undefined ? {} : { onRegisterUser })}
            {...(workspaceManagement === undefined ? {} : { workspaceManagement })}
          />
        }
        // 트리만 내용을 갖는다. 검색·즐겨찾기는 그것을 소유한 요구가 서는
        // 자리에서 채워진다 — 여기서 함께 만들면 셸 구조와 그 안의 기능이
        // 한 파일에서 얽힌다.
      >
        {(tab) => {
          // 접근 가능한 것이 없으면 빈 트리가 아니라 안내를 세운다
          // (`FR-AUTH-005` AC-1) — 아무 말 없는 빈 화면은 「권한이 없다」가
          // 아니라 「고장났다」로 읽힌다.
          if (tab.id === 'tree')
            return treeState.state === 'loading' ? (
              <LoadingState label="문서 트리 불러오는 중" />
            ) : treeState.state === 'error' ? (
              <ErrorState
                label="문서 트리 오류"
                title="문서 트리를 불러오지 못했습니다."
                description={treeState.message}
                {...(treeState.onRetry === undefined ? {} : { onRetry: treeState.onRetry })}
              />
            ) : workspaces.length === 0 ? (
              <AccessEmptyState />
            ) : (
              <DocumentTree
                workspaces={workspaces}
                onOpen={onOpen}
                onUpload={onUpload}
                onCreateNote={onCreateNote}
                onCreate={(node, kind) => {
                  // 자리를 **지금** 푼다 — 담길 자리를 고르는 규칙은 계약이
                  // 소유하고(`containerFor`) 화면은 그것을 부르기만 한다.
                  const container = containerFor(workspaces, node.id);
                  if (container !== undefined) {
                    namingAttempt.current += 1;
                    namingRequestPending.current = false;
                    setNamingPending(false);
                    setNamingError(undefined);
                    setNaming({ kind: 'create', ...container, makes: kind });
                  }
                }}
                {...(naming === null ? {} : { naming })}
                onNamed={async (name) => {
                  if (naming === null || namingRequestPending.current) return;
                  const attempt = namingAttempt.current;
                  namingRequestPending.current = true;
                  setNamingPending(true);
                  setNamingError(undefined);
                  try {
                    const error = naming.kind === 'rename'
                      ? await onRename?.(naming.node.id, name)
                      : await onCreate?.(naming.workspaceId, naming.parentId, naming.makes, name);
                    if (attempt !== namingAttempt.current) return;
                    if (typeof error === 'string') {
                      setNamingError(error);
                      return;
                    }
                    setNaming(null);
                  } finally {
                    if (attempt === namingAttempt.current) {
                      namingRequestPending.current = false;
                      setNamingPending(false);
                    }
                  }
                }}
                onNamingCancel={() => {
                  namingAttempt.current += 1;
                  namingRequestPending.current = false;
                  setNamingPending(false);
                  setNamingError(undefined);
                  setNaming(null);
                }}
                onNamingEdit={() => setNamingError(undefined)}
                namingPending={namingPending}
                {...(namingError === undefined ? {} : { namingError })}
                favorites={new Set(favorites.map((one) => one.nodeId))}
                onFavorite={onFavorite}
                {...(onUnfavorite === undefined ? {} : { onUnfavorite })}
                onDelete={onDelete}
                onRename={(node) => {
                  namingAttempt.current += 1;
                  namingRequestPending.current = false;
                  setNamingPending(false);
                  setNamingError(undefined);
                  setNaming({ kind: 'rename', node });
                }}
                onShare={(node) => {
                  share?.onOpen?.(node.id);
                  setSharing(node);
                }}
                onRelocate={(node, kind) => {
                  setDestinationId('');
                  setRelocating({ node, kind });
                }}
                onNewVersion={setOverwriting}
                focusRequest={newVersionFocusRequest}
                onFocusUnavailable={() => {
                  setLeftTab('tree');
                  requestAnimationFrame(() => {
                    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
                    tabs.find((tab) => tab.textContent?.trim() === '문서 트리')?.focus();
                  });
                }}
              />
            );
          if (tab.id === 'search')
            return (
              <SearchPanel
                documents={searchResults}
                query={query}
                {...(searchState === undefined ? {} : { state: searchState })}
                {...(searchAxes === undefined ? {} : { axes: searchAxes })}
                {...(onSearchAxes === undefined ? {} : { onAxes: onSearchAxes })}
                {...(onQuery === undefined ? {} : { onQuery })}
                onOpen={(nodeId) => {
                  const found = nodeById(workspaces, nodeId);
                  if (found !== undefined) onOpen?.(found, false);
                }}
              />
            );
          if (tab.id === 'favorites')
            return favoritesState.state === 'loading' ? (
              <LoadingState label="즐겨찾기 불러오는 중" />
            ) : favoritesState.state === 'error' ? (
              <ErrorState
                label="즐겨찾기 오류"
                title="즐겨찾기를 불러오지 못했습니다."
                description={favoritesState.message}
                {...(favoritesState.onRetry === undefined ? {} : { onRetry: favoritesState.onRetry })}
              />
            ) : (
              <FavoritesView
                favorites={favorites}
                onOpen={(nodeId) => {
                  const found = nodeById(workspaces, nodeId);
                  if (found !== undefined) onOpen?.(found, false);
                }}
                {...(onUnfavorite === undefined ? {} : { onUnfavorite })}
                onEmptyFocus={() => favoritesTab.current?.focus()}
              />
            );
          return <p>{tab.label}</p>;
        }}
      </Sidebar>

      <main>
        {notice !== undefined && (
          // `status` 인 이유는 이것이 사용자의 조작을 막지 않기 때문이다 —
          // 알림은 이미 끝난 일을 알리는 것이고, 대화상자로 세우면 확인
          // 단계가 하나 생겨 `SEC-SHELL-002` AC-4 가 깨진다.
          //
          // **닫을 수 있어야 한다.** 세션 내내 남으면 지난 조작의 말이
          // 지금 것으로 읽힌다.
          <div>
            {/* 닫기 버튼을 이 안에 넣지 않는다 — `status` 는 읽어 주는
                자리라, 버튼 글자까지 함께 읽히면 안내가 길어진다. */}
            <p role="status" aria-label="알림">
              {notice}
            </p>
            <button type="button" onClick={() => onNoticeDismiss?.()}>
              알림 닫기
            </button>
          </div>
        )}
        <DocumentArea
          {...(share === undefined ? {} : { share })}
          state={documents}
          missing={missingDocument}
          onState={(next) => onDocuments?.(next)}
          bodies={bodies}
          hashes={hashes}
          {...(onSaveState === undefined ? {} : { onSaveState })}
          {...(onSaved === undefined ? {} : { onSaved })}
          onTagClick={searchForTag}
          onOpenWikiLink={openByName}
        />
      </main>

      <Sidebar label="우측 사이드바" tabs={RIGHT_TABS} side="right" active={rightTab} onActivate={setRightTab} focusTarget={{ tabId: rightTab, ref: rightTabTrigger }} busyTabs={[
        ...(linksState.state === 'loading' && documents.activeId !== null ? ['backlinks', 'outgoing'] : []),
        ...(tagsState.state === 'loading' ? ['tags'] : []),
      ]}>
        {(tab) => {
          // 링크 줄을 누르면 그 문서를 연다 — 목록이 열 수 없는 이름의
          // 나열이면 그 탭은 읽을거리일 뿐 이동 수단이 되지 못한다.
          const openById = (nodeId: string) => {
            const found = nodeById(workspaces, nodeId);
            if (found !== undefined) onOpen?.(found, false);
          };

          if (tab.id === 'backlinks' || tab.id === 'outgoing') {
            const label = tab.id === 'backlinks' ? '백링크' : '아웃고잉 링크';
            const content = documents.activeId === null
              ? <EmptyState title="문서를 선택하면 링크를 볼 수 있습니다." />
              : linksState.state === 'error'
                ? <ErrorState label={`${label} 오류`} title={`${label}를 불러오지 못했습니다.`} description={linksState.message} {...(linksState.onRetry === undefined ? {} : { onRetry: linksState.onRetry })} />
                : linksState.state === 'loading'
                  ? <LoadingState label={`${label} 불러오는 중`} />
                  : <LinkPanel label={label} rows={tab.id === 'backlinks' ? links.backlinks : links.outgoing} empty={`${label}가 없습니다.`} onOpen={openById} />;
            return <FocusRestoreBoundary identity={`${tab.id}:${documents.activeId ?? 'none'}:${linksState.state}`} fallback={rightTabTrigger}>{content}</FocusRestoreBoundary>;
          }
          if (tab.id === 'tags')
            return (
              <FocusRestoreBoundary identity={`tags:${tagScope ?? ''}:${tagsState.state}`} fallback={rightTabTrigger}>
                <TagPanel
                  {...(tags === undefined ? {} : { index: tags })}
                  state={tagsState}
                  workspaces={workspaces.map((entry) => entry.workspace)}
                  {...(tagScope === undefined ? {} : { scope: tagScope })}
                  {...(onTagScope === undefined ? {} : { onScope: onTagScope })}
                  // 검색 탭을 여는 자리는 `searchForTag` 하나다 — 밖에서 또
                  // 받으면 태그 클릭과 본문 태그 클릭이 서로 다른 경로로
                  // 같은 일을 하게 된다 (`FR-SHELL-010` AC-1 · AC-2).
                  onPick={searchForTag}
                />
              </FocusRestoreBoundary>
            );
          return <p>{tab.label}</p>;
        }}
      </Sidebar>

      {sharing !== null && (
        <ShareModal
          nodeId={sharing.id}
          nodeName={sharing.name}
          nodeKind={sharing.kind}
          {...(share?.contextKey === undefined ? {} : { contextKey: share.contextKey })}
          open
          onOpenChange={(next) => {
            if (!next) setSharing(null);
          }}
          {...(share?.query === undefined ? {} : { query: share.query })}
          {...(share?.onGrant === undefined ? {} : { onGrant: (principalId: string, level: 'view' | 'edit') => share.onGrant!(sharing.id, principalId, level) })}
          {...(share?.onRevoke === undefined ? {} : { onRevoke: (entryId: string) => share.onRevoke!(sharing.id, entryId) })}
          {...(share?.onBreakInheritance === undefined ? {} : { onBreakInheritance: () => share.onBreakInheritance!(sharing.id) })}
          {...(share?.onInheritFromParent === undefined ? {} : { onInheritFromParent: () => share.onInheritFromParent!(sharing.id) })}
          refreshView={() => share?.refreshView?.(sharing.id) ?? Promise.resolve(undefined)}
          {...(share?.onWarnings === undefined ? {} : { onWarnings: share.onWarnings })}
        />
      )}

      {relocating !== null && (
        <RelocationDialog
          kind={relocating.kind}
          open
          sourceName={relocating.node.name}
          destinations={destinationsFor(workspaces, relocating.kind, relocating.node.id)}
          destinationId={destinationId}
          onDestination={setDestinationId}
          onConfirm={() => {
            onRelocate?.(relocating.node.id, relocating.kind, destinationId);
            setRelocating(null);
          }}
          onCancel={() => setRelocating(null)}
        />
      )}

      {overwriting !== null && (
        <NewVersionPrompt
          node={overwriting}
          onPick={(file) => onNewVersion?.(overwriting, file) ?? Promise.resolve({ status: 'unknown' })}
          onCancel={closeNewVersion}
        />
      )}

      {confirmReplace !== undefined && (
        <ReplaceConfirmation request={confirmReplace} restoreFocus={replaceInvoker.current} />
      )}
    </div>
  );
}
