import {
  QueryClient,
  QueryClientProvider,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  ApiError,
  addFavorite,
  removeFavorite,
  logIn,
  requestLogout,
  requestPasswordChange,
  requestSignup,
  removeGroup,
  savePersonalSetting,
  saveEditorPreference,
  issueToken,
  revokeToken,
  createNode,
  fetchTree,
  loadDocument,
  uploadAttachment,
  uploadIntoDirectory,
  moveNodeToTrash,
  moveNode,
  copyNode,
  fetchRelocationPreview,
  breakInheritance,
  inheritFromParent,
  fetchShareView,
  fetchGrantWarnings,
  grantShare,
  revokeShare,
  renameNode,
  renameWorkspace,
  createWorkspace as createWorkspaceRequest,
  fetchWorkspaceAdminGrantPreview,
  grantWorkspaceAdministrator,
  purgeFromTrash,
  restoreFromTrash,
  uploadNewVersion,
  addGroupMember,
  registerUser,
  approveUser,
  reopenUser,
  setUserStatus,
  type RosterUserStatus,
  fetchRevocation,
  fetchIndexQueue,
  fetchSession,
  fetchIdentity,
  revokeAllFor,
  type PrincipalRow,
  type RevocationSubject,
  type RevocationBody,
} from './api/client.js';
import {
  QUERY_KEYS,
  useAuditLog,
  useReconciliationQueue,
  useTags,
  useSearch,
  useBrokenInheritance,
  useFavorites,
  useSignupMode,
  useGroupRoster,
  useIdentity,
  usePersonalSettings,
  useTokens,
  useSimulation,
  useManagedWorkspaces,
  useUserRoster,
  useLinks,
  useSession,
  useTrash,
  useTree,
  useWorkspaceList,
  useWorkspaceAdministrators,
} from './api/queries.js';
import type { AuditQuery, BulkPlan } from './acl/BulkRevokePanel.js';
import { axesFrom, axesTo, readAxes, writeAxes, type SearchAxis } from './search/search-axes.js';
import type { UploadRequest } from './attachment/upload-contract.js';
import { PreAuthScreen, type PreAuthScreenId } from './auth/PreAuthScreen.js';
import { AppShell, type ShellPanelState } from './shell/AppShell.js';
import type { NewVersionOutcome, NewVersionResult } from './tree/NewVersionPrompt.js';
import { ErrorState, LoadingState } from './components/ui/states.js';
import { Button } from './components/ui/button.js';
import { createAuthAttemptLock, createAuthBoundary, type AuthAttemptToken, type DraftRecord, type LiveDraftRegistration, type RecoveryRecord } from './auth/auth-boundary.js';
import { checkCurrentAuthentication } from './auth/check-current-authentication.js';
import { LocalRecoverySurface } from './auth/LocalRecoverySurface.js';
import type { DocumentReadState } from './document/DocumentArea.js';
import {
  activeTab,
  closeTab,
  needsConfirmBeforeReplace,
  openInActiveTab,
  openInNewTab,
  type TabState,
} from './document/tab-state.js';
import { nodeIdOf, urlForNode } from './routing/deep-link.js';
import type { SaveState } from './document/tab-state.js';
import type { TrashLens } from './trash/TrashPanel.js';
import type { ShareQueryState } from './acl/ShareModal.js';
import { CREATE_DEFAULTS, relocationTransportFor } from './tree/tree-contract.js';
import type { WorkspaceTreeView, TreeNodeView } from './tree/tree-contract.js';
import { rememberTheme, useThemeRuntime, type ThemePreference } from './theme/runtime.js';
import type { ThemeLoadState, ThemeSaveState } from './settings/PersonalSettings.js';
import { useEditorPreferenceController, type EditorPreferenceKey } from './settings/editor-preferences.js';
import type { PrincipalActionResult } from './principal/request-contract.js';

export async function revokeSubjectAndRefresh(
  principalId: string,
  revoke: (id: string) => Promise<RevocationBody>,
  refresh: (target: 'revocation' | 'tree', id: string) => Promise<void>,
) {
  const removed = await revoke(principalId);
  let refreshFailed = false;
  for (const target of ['revocation', 'tree'] as const) {
    try {
      await refresh(target, principalId);
    } catch {
      refreshFailed = true;
    }
  }
  return { revocation: removed, refreshFailed };
}

export async function refreshAfterSubjectRevoke(
  queries: QueryClient,
  dependentContext: string,
  principalId: string,
): Promise<void> {
  await queries.invalidateQueries(
    { queryKey: QUERY_KEYS.revocation(principalId, dependentContext), exact: true, refetchType: 'active' },
    { throwOnError: true },
  );
}

/** 트리에서 그 노드를 찾는다 — 문서를 열 때 이름과 권한이 필요하다. */
function findNode(workspaces: readonly WorkspaceTreeView[], nodeId: string): TreeNodeView | undefined {
  const walk = (nodes: readonly TreeNodeView[]): TreeNodeView | undefined => {
    for (const node of nodes) {
      if (node.id === nodeId) return node;
      const inner = walk(node.children);
      if (inner !== undefined) return inner;
    }
    return undefined;
  };

  for (const entry of workspaces) {
    const found = walk(entry.roots);
    if (found !== undefined) return found;
  }
  return undefined;
}

const toTab = (node: TreeNodeView) => ({
  nodeId: node.id,
  name: node.name,
  breadcrumb: [node.name],
  save: 'saved' as const,
  level: node.level,
});

const namingFailureMessage = (error: unknown) =>
  error instanceof ApiError && typeof error.detail?.reason === 'string' && error.detail.reason.trim() !== ''
    ? error.detail.reason
    : '이름을 저장하지 못했습니다. 잠시 후 다시 시도하십시오.';

/**
 * 서버 상태의 단일 클라이언트 (`CON-ARCH-004` AC-5).
 *
 * 창을 다시 볼 때마다 다시 받지 않는다 — 문서를 편집하다 탭을 옮겼다
 * 돌아오면 트리가 새로 오면서 열린 문서의 자리가 흔들린다.
 */
const newQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
  });

/**
 * 앱의 진입 컴포넌트.
 *
 * 클라이언트를 **여기서** 만든다. 마운트 지점에서 만들어 넘기면 앱을 세우는
 * 자리마다 그 조립을 따라 적어야 하고, 하나를 빠뜨리면 그 자리에서만 서버
 * 상태가 캐시 없이 돈다 — 화면은 도는데 같은 것을 계속 다시 받는다.
 */
export function App({ queryClient }: { queryClient?: QueryClient } = {}) {
  // 마운트마다 새로 만든다 — 앱이 두 번 서는 자리(시험)가 앞의 캐시를
  // 물려받으면 앞 시험의 응답이 뒤 시험의 첫 화면이 된다.
  const [client] = useState(() => queryClient ?? newQueryClient());

  return (
    <QueryClientProvider client={client}>
      <AppBody />
    </QueryClientProvider>
  );
}

/**
 * **인증 상태가 화면 종류를 가른다** (`IR-AUTH-001` AC-4). 세션을 세우지
 * 못하면 셸 자체를 세우지 않는다 — 깔아 두고 그 위에 로그인 화면을 얹으면
 * 사용자가 로그인 전에 트리와 탭의 껍데기를 보게 되고, 그것이 「내용이
 * 없다」로 읽힌다.
 */
export async function refetchWorkspaceCreationReads(queries: QueryClient): Promise<boolean> {
  const refreshed = await Promise.allSettled([
    queries.refetchQueries({ queryKey: QUERY_KEYS.workspaces('managed') }, { throwOnError: true }),
    queries.refetchQueries({ queryKey: QUERY_KEYS.workspaces('all') }, { throwOnError: true }),
    queries.refetchQueries({ queryKey: QUERY_KEYS.tree }, { throwOnError: true }),
    queries.refetchQueries({ queryKey: QUERY_KEYS.session }, { throwOnError: true }),
  ]);
  return refreshed.every((result) => result.status === 'fulfilled');
}

// @req IR-SHELL-011 AC-8
async function refetchRelocationTree(queries: QueryClient): Promise<void> {
  await queries.fetchQuery({
    queryKey: QUERY_KEYS.tree,
    queryFn: () => fetchTree<WorkspaceTreeView[]>(),
    staleTime: 0,
  });
}

function AppBody() {
  const queries = useQueryClient();
  const authBoundary = useRef(createAuthBoundary()).current;
  const [authPhase, setAuthPhase] = useState(authBoundary.phase());
  const activeAuthAttempt = useRef<AuthAttemptToken | null>(null);
  const authAttemptLock = useRef(createAuthAttemptLock()).current;
  const syncAuthPhase = useCallback(() => setAuthPhase(authBoundary.phase()), [authBoundary]);
  const allowsProtected = useCallback((expected?: { userId: string; generation: number }) => {
    const owner = expected ?? establishedOwner.current;
    return authPhase === 'active' && owner !== undefined && authBoundary.allowsProtected(owner);
  }, [authBoundary, authPhase]);
  const [authEnded, setAuthEnded] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [authenticationEndedUnexpectedly, setAuthenticationEndedUnexpectedly] = useState(false);
  const [authUncertain, setAuthUncertain] = useState(false);
  const [authCheckBusy, setAuthCheckBusy] = useState(false);
  const [authResumeAvailable, setAuthResumeAvailable] = useState(false);
  const authCheckGeneration = useRef(0);
  const [documentRecovery, setDocumentRecovery] = useState<Readonly<Record<string, readonly RecoveryRecord[]>>>({});
  const [documentUnavailable, setDocumentUnavailable] = useState<Readonly<Record<string, true>>>({});
  const [ownerRecovery, setOwnerRecovery] = useState<readonly RecoveryRecord[]>([]);
  const [hasQuarantinedDrafts, setHasQuarantinedDrafts] = useState(false);
  const [draftHandoff, setDraftHandoff] = useState<{
    records: readonly DraftRecord[];
    resolve: (continueMutation: boolean) => void;
  } | null>(null);
  const draftHandoffDialog = useRef<HTMLDivElement>(null);
  const [downloadedDrafts, setDownloadedDrafts] = useState<ReadonlySet<string>>(() => new Set());
  useLayoutEffect(() => {
    if (draftHandoff === null) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    draftHandoffDialog.current?.focus();
    const focusFrame = requestAnimationFrame(() => draftHandoffDialog.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener('beforeunload', guard);
    };
  }, [draftHandoff]);
  const session = useSession();
  const sessionUnauthorized = session.error instanceof ApiError && session.error.status === 401;
  const signedIn = session.data !== undefined && !sessionUnauthorized;
  const hadEstablishedSession = useRef(false);
  if (signedIn) hadEstablishedSession.current = true;
  const [authGeneration, setAuthGeneration] = useState(0);
  const establishedOwner = useRef<{ userId: string; generation: number } | undefined>(undefined);
  const identity = useIdentity(signedIn);
  const userId = signedIn
    ? identity.data?.kind === 'ok' ? identity.data.userId : establishedOwner.current?.userId
    : undefined;
  const identityFailed = identity.isError || identity.data?.kind === 'malformed' || identity.data?.kind === 'http-error';
  const ownerMismatch = userId !== undefined && establishedOwner.current !== undefined
    && establishedOwner.current.userId !== userId;
  const observedUserId = useRef<string | undefined>(userId);
  observedUserId.current = userId;
  const retireReplacedOwnerDraft = useCallback((surface: LiveDraftRegistration) => {
    if (observedUserId.current !== undefined && observedUserId.current !== surface.owner.userId) {
      authBoundary.quarantineRegistration(surface);
    }
  }, [authBoundary]);
  const scopedOwnerRecovery = userId === undefined
    ? []
    : ownerRecovery.filter((record) => record.userId === userId);
  const protectedEnabled = signedIn && userId !== undefined && authPhase === 'active'
    && !ownerMismatch && authBoundary.allowsProtected({ userId, generation: authGeneration });

  const tree = useTree(protectedEnabled);
  const workspaces: readonly WorkspaceTreeView[] = tree.data ?? [];
  const treeState: ShellPanelState = tree.isError
      ? { state: 'error', message: '잠시 후 다시 시도하십시오.', onRetry: () => void tree.refetch() }
      : tree.isFetching || tree.data === undefined
        ? { state: 'loading' }
        : { state: 'ready' };

  const [documents, setDocuments] = useState<TabState>({ tabs: [], activeId: null });
  /**
   * 휴지통을 좁혀 보는 조건 (`FR-SHELL-007` AC-4 · AC-5).
   *
   * 좁히는 일은 **서버가** 한다 — 받아 놓고 화면에서 거르면 넓힌 범위의
   * 행이 이미 브라우저에 와 있게 되고, 그것은 권한 판정이 아니다. 이 값이
   * 질의 키의 일부라, 바뀌면 다시 받는 일이 저절로 일어난다.
   */
  const [trashLens, setTrashLens] = useState<TrashLens>({ scope: 'mine' });
  /**
   * 방금 조작에 대한 서버의 안내 (`SEC-SHELL-002` AC-3).
   *
   * 서버가 준 문구를 그대로 든다 — 화면이 지으면 보이는 충돌과 보이지 않는
   * 충돌의 문구가 갈리고, 그 차이가 존재 오라클이 된다.
   */
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [relocationRefreshError, setRelocationRefreshError] = useState(false);
  /**
   * 지금 서 있는 인증 전 화면 (`IR-AUTH-001`).
   *
   * 주소에 담지 않는다 — 인증 전 화면은 세션이 없을 때만 서고, 세션이
   * 생기면 어느 화면에 있었든 앱으로 넘어간다. 주소에 담으면 로그인한
   * 뒤에도 그 자리가 이력에 남아 뒤로 가기가 인증 전으로 되돌린다.
   */
  const [preAuthScreen, setPreAuthScreen] = useState<PreAuthScreenId>('login');
  /** 좌측 검색 탭의 질의. 태그를 눌러도 이 값이 채워진다. */
  const [query, setQuery] = useState('');
  /**
   * 켜진 검색 대상 (`FR-SHELL-013` AC-6 · AC-7).
   *
   * 마지막 조합을 브라우저에 남긴다 — 되살리는 규칙(깨졌으면 기본값)은
   * `axesFrom` 한 자리에 있고, 여기서 다시 판정하지 않는다.
   */
  const [searchAxes, setSearchAxes] = useState<readonly SearchAxis[]>(() =>
    axesFrom(readAxes()),
  );
  const pickAxes = useCallback((axes: readonly SearchAxis[]) => {
    setSearchAxes(axes);
    writeAxes(axesTo(axes));
  }, []);
  /**
   * 확인을 기다리는 열기 (`FR-SHELL-012` AC-3 · AC-4).
   *
   * 잃을 것이 남은 탭을 교체하려 할 때 그 요청을 여기 세워 둔다 — 버리면
   * 사용자가 다시 눌러야 하고, 바로 실행하면 그 탭의 편집이 사라진다.
   */
  const [pendingOpen, setPendingOpen] = useState<TreeNodeView | null>(null);
  type HistoryMark = { epoch: string; key: string; index: number };
  const historyEpoch = useRef(`doculight-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const historySequence = useRef(0);
  const acceptedHistory = useRef<HistoryMark | null>(null);
  const pendingPopRestore = useRef<{ accepted: HistoryMark; observed: HistoryMark } | null>(null);
  const restoration = useRef<{ epoch: string; expectedEntryKey: string; restoreGeneration: number } | null>(null);
  const restoreGeneration = useRef(0);
  const popRequestGeneration = useRef(0);
  const requestedRetryPending = useRef(false);
  const readHistoryMark = useCallback((): HistoryMark | null => {
    const value = (window.history.state as { __doculight?: Partial<HistoryMark> } | null)?.__doculight;
    return value?.epoch === historyEpoch.current && typeof value.key === 'string' && typeof value.index === 'number'
      ? { epoch: value.epoch, key: value.key, index: value.index }
      : null;
  }, []);
  const pushDocumentHistory = useCallback((url: string) => {
    const current = acceptedHistory.current ?? readHistoryMark();
    const mark: HistoryMark = {
      epoch: historyEpoch.current,
      key: `${historyEpoch.current}:${++historySequence.current}`,
      index: (current?.index ?? 0) + 1,
    };
    const oldState = typeof window.history.state === 'object' && window.history.state !== null ? window.history.state : {};
    window.history.pushState({ ...oldState, __doculight: mark }, '', url);
    acceptedHistory.current = mark;
  }, [readHistoryMark]);

  useEffect(() => {
    const existing = readHistoryMark();
    if (existing !== null) {
      acceptedHistory.current = existing;
      historySequence.current = Math.max(historySequence.current, existing.index);
      return;
    }
    const mark: HistoryMark = { epoch: historyEpoch.current, key: `${historyEpoch.current}:0`, index: 0 };
    const oldState = typeof window.history.state === 'object' && window.history.state !== null ? window.history.state : {};
    window.history.replaceState({ ...oldState, __doculight: mark }, '', window.location.href);
    acceptedHistory.current = mark;
  }, [readHistoryMark]);

  const requestDraftHandoff = useCallback(async (attempt: AuthAttemptToken) => {
    const result = authBoundary.preflight({ userId: userId ?? '', generation: authGeneration });
    if (result.kind === 'composition') {
      authBoundary.thaw();
      authBoundary.resume(attempt);
      activeAuthAttempt.current = null;
      authAttemptLock.release(attempt);
      syncAuthPhase();
      setNotice('입력을 마친 뒤 다시 시도하세요.');
      return false;
    }
    if (result.kind === 'clean') return true;
    if (userId === undefined) {
      authBoundary.thaw();
      authBoundary.resume(attempt);
      activeAuthAttempt.current = null;
      authAttemptLock.release(attempt);
      syncAuthPhase();
      setNotice('현재 로그인 사용자를 확인한 뒤 다시 시도하세요.');
      return false;
    }
    return new Promise<boolean>((resolve) => setDraftHandoff({ records: result.records, resolve }));
  }, [authAttemptLock, authBoundary, authGeneration, syncAuthPhase, userId]);

  const endAuthentication = useCallback((changedPassword = false, unexpected = false, expectedAttempt?: AuthAttemptToken) => {
    const attempt = expectedAttempt ?? activeAuthAttempt.current ?? undefined;
    if (!authBoundary.end(attempt)) return false;
    if (attempt !== undefined) authAttemptLock.release(attempt);
    else authAttemptLock.clear();
    activeAuthAttempt.current = null;
    syncAuthPhase();
    authCheckGeneration.current += 1;
    setAuthCheckBusy(false);
    setAuthUncertain(false);
    setAuthResumeAvailable(false);
    setAuthEnded(true);
    establishedOwner.current = undefined;
    setPasswordChanged(changedPassword);
    setAuthenticationEndedUnexpectedly(unexpected);
    setAuthGeneration((value) => value + 1);
    clearOwnerUi();
    void queries.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    const oldState = typeof window.history.state === 'object' && window.history.state !== null ? window.history.state : {};
    window.history.replaceState(oldState, '', '/');
    return true;
  }, [authAttemptLock, authBoundary, queries, syncAuthPhase]);

  const checkAuthenticationAfterAttempt = useCallback(async (owner: { userId: string; generation: number }, attempt: AuthAttemptToken) => {
    if (!authBoundary.markChecking(attempt)) return undefined;
    syncAuthPhase();
    const checkGeneration = ++authCheckGeneration.current;
    setAuthCheckBusy(true);
    setAuthUncertain(false);
    setAuthResumeAvailable(false);
    const outcome = await checkCurrentAuthentication(owner.userId, fetchSession, fetchIdentity);
    if (authCheckGeneration.current !== checkGeneration || authEnded || !authBoundary.isCurrentAttempt(attempt)) return outcome;
    setAuthCheckBusy(false);
    if (outcome.kind === 'same-owner') {
      queries.setQueryData(QUERY_KEYS.session, outcome.session);
      queries.setQueryData(QUERY_KEYS.identity, { kind: 'ok', userId: outcome.userId });
      setAuthResumeAvailable(true);
      setNotice('처리 결과를 확인하지 못했습니다.');
      return outcome;
    }
    if (outcome.kind === 'uncertain') {
      authBoundary.markUncertain(attempt);
      syncAuthPhase();
      setAuthUncertain(true);
      return outcome;
    }
    const records = authBoundary.quarantine(owner);
    if (records.length > 0) setHasQuarantinedDrafts(true);
    if (outcome.kind === 'ended') {
      endAuthentication(false, true, attempt);
      return outcome;
    }
    clearOwnerUi();
    void queries.cancelQueries();
    queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    queries.setQueryData(QUERY_KEYS.session, outcome.session);
    queries.setQueryData(QUERY_KEYS.identity, { kind: 'ok', userId: outcome.userId });
    const replacementOwner = { userId: outcome.userId, generation: owner.generation + 1 };
    establishedOwner.current = replacementOwner;
    authBoundary.activate(replacementOwner);
    authAttemptLock.clear();
    activeAuthAttempt.current = null;
    syncAuthPhase();
    setAuthGeneration((value) => value + 1);
    setNotice(undefined);
    return outcome;
  }, [authAttemptLock, authBoundary, authEnded, endAuthentication, queries, syncAuthPhase]);

  useEffect(() => {
    if (userId === undefined) return;
    const previous = establishedOwner.current;
    if (previous !== undefined && previous.userId !== userId) {
      const records = authBoundary.quarantine(previous);
      if (records.length > 0 || authBoundary.recoveryFor(previous.userId).length > 0) setHasQuarantinedDrafts(true);
      clearOwnerUi();
      void queries.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' && query.queryKey[0] !== 'identity' });
      queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' && query.queryKey[0] !== 'identity' });
      const nextGeneration = authGeneration + 1;
      const replacement = { userId, generation: nextGeneration };
      establishedOwner.current = replacement;
      authBoundary.activate(replacement);
      authAttemptLock.clear();
      activeAuthAttempt.current = null;
      setAuthGeneration(nextGeneration);
      syncAuthPhase();
      return;
    }
    const owner = { userId, generation: authGeneration };
    establishedOwner.current = owner;
    if (authBoundary.phase() === 'ended' && !authEnded) {
      authBoundary.activate(owner);
      authAttemptLock.clear();
      activeAuthAttempt.current = null;
      syncAuthPhase();
    }
  }, [authAttemptLock, authBoundary, authEnded, authGeneration, queries, syncAuthPhase, userId]);

  useEffect(() => {
    if (userId === undefined || authEnded) {
      setOwnerRecovery([]);
      return;
    }
    setOwnerRecovery(authBoundary.recoveryFor(userId));
  }, [authBoundary, authEnded, authGeneration, userId]);

  useLayoutEffect(() => {
    const owner = establishedOwner.current;
    if (!sessionUnauthorized || owner === undefined || authEnded) return;
    const records = authBoundary.quarantine(owner);
    if (records.length > 0) setHasQuarantinedDrafts(true);
    endAuthentication(false, true);
  }, [authBoundary, authEnded, endAuthentication, sessionUnauthorized]);

  useLayoutEffect(() => {
    const identityKnown = identity.data?.kind === 'ok';
    const identityUnauthorized = identity.data?.kind === 'http-error' && identity.data.status === 401;
    if (!signedIn || authEnded) return;
    if (!identityFailed) {
      if (identityKnown) setAuthUncertain(false);
      return;
    }
    const owner = establishedOwner.current;
    if (owner === undefined) return;
    if (authBoundary.phase() !== 'active') return;
    const attempt = authBoundary.beginAttempt(owner);
    if (attempt === null || !authAttemptLock.acquire(attempt)) return;
    activeAuthAttempt.current = attempt;
    authBoundary.markChecking(attempt);
    if (identityUnauthorized) {
      const records = authBoundary.quarantine(owner);
      if (records.length > 0) setHasQuarantinedDrafts(true);
      endAuthentication(false, true, attempt);
      return;
    }
    authBoundary.markUncertain(attempt);
    authBoundary.preflight(owner);
    syncAuthPhase();
    setAuthUncertain(true);
    setAuthResumeAvailable(false);
  }, [authAttemptLock, authBoundary, authEnded, endAuthentication, identity.data, identityFailed, signedIn, syncAuthPhase]);

  useEffect(() => {
    const owner = establishedOwner.current;
    if (!hadEstablishedSession.current || owner === undefined || authEnded || !session.isError || sessionUnauthorized) return;
    if (authBoundary.phase() !== 'active') return;
    const attempt = authBoundary.beginAttempt(owner);
    if (attempt === null) return;
    if (!authAttemptLock.acquire(attempt)) return;
    activeAuthAttempt.current = attempt;
    authBoundary.markChecking(attempt);
    authBoundary.markUncertain(attempt);
    syncAuthPhase();
    authBoundary.preflight(owner);
    setAuthUncertain(true);
    setAuthResumeAvailable(false);
  }, [authAttemptLock, authBoundary, authEnded, session.isError, sessionUnauthorized, syncAuthPhase]);

  // 휴지통은 전 워크스페이스 통합이라 트리와 별개로 받는다
  // (`FR-SHELL-007` AC-3). 실패해도 셸은 서야 한다 — 휴지통 하나가 안
  // 온다고 앱을 못 쓰게 만들 이유가 없다.
  const trash = useTrash(trashLens, protectedEnabled);
  const favorites = useFavorites(protectedEnabled);
  const favoritesState: ShellPanelState = favorites.data !== undefined
    ? { state: 'ready' }
    : favorites.isError
      ? { state: 'error', message: '잠시 후 다시 시도하십시오.', onRetry: () => void favorites.refetch() }
      : { state: 'loading' };
  const personal = usePersonalSettings(protectedEnabled ? userId : undefined);
  const [optimisticTheme, setOptimisticTheme] = useState<ThemePreference | undefined>();
  const [themeSaveState, setThemeSaveState] = useState<ThemeSaveState>({ state: 'idle' });
  const themeRequest = useRef(0);
  const currentUser = useRef<string | undefined>(userId);
  currentUser.current = userId;
  const currentAuthGeneration = useRef(authGeneration);
  currentAuthGeneration.current = authGeneration;
  const currentRelocationOwner = useRef<string | undefined>(undefined);
  const resolvedTheme = optimisticTheme ?? personal.data?.theme;
  const themeLoadState: ThemeLoadState = userId === undefined
    ? identity.isFetching
      ? { state: 'loading' }
      : identityFailed
        ? { state: 'error', onRetry: () => void identity.refetch() }
        : { state: 'loading' }
    : personal.data !== undefined
      ? { state: 'ready' }
      : personal.isError
        ? { state: 'error', onRetry: () => void personal.refetch() }
        : { state: 'loading' };
  const editorLoad = userId === undefined
    ? identityFailed ? 'error' as const : 'loading' as const
    : personal.data !== undefined ? 'ready' as const : personal.isError ? 'error' as const : 'loading' as const;
  const editor = useEditorPreferenceController({
    userId,
    authGeneration,
    settings: personal.data ?? {},
    loadState: editorLoad,
    retryLoad: () => void (userId === undefined ? identity.refetch() : personal.refetch()),
    save: saveEditorPreference,
    cancelReads: () => userId === undefined ? undefined : queries.cancelQueries({ queryKey: QUERY_KEYS.personalSettings(userId) }),
    mergeCache: (key, value) => {
      if (userId === undefined) return;
      queries.setQueryData<Record<string, string>>(QUERY_KEYS.personalSettings(userId), (was) => ({ ...(was ?? {}), [key]: value }));
    },
  });
  useThemeRuntime({
    ...(userId === undefined ? {} : { userId }),
    ...(resolvedTheme === undefined ? {} : { preference: resolvedTheme }),
    settingsResolved: personal.data !== undefined,
  });

  useEffect(() => {
    themeRequest.current += 1;
    setOptimisticTheme(undefined);
    setThemeSaveState({ state: 'idle' });
  }, [userId]);

  useEffect(() => {
    if (!sessionUnauthorized) return;
    queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
  }, [queries, sessionUnauthorized]);
  // PAT 목록은 설정 모달의 한 탭에서만 쓰이지만 다른 개인 설정과 같은
  // 조건으로 받는다 — 탭을 열 때 받게 하면 그 자리에 로딩이 서고,
  // 목록이 비어 있는 것과 아직 안 온 것이 화면에서 같아 보인다.
  const tokens = useTokens(protectedEnabled ? userId : undefined, authGeneration);
  // 슈퍼유저가 아니면 서버가 404 로 답한다 — 화면이 다시 판정하지 않는다.
  const principalEnabled = protectedEnabled && session.data?.superuser === true;
  const users = useUserRoster(userId, authGeneration, principalEnabled);
  // 가입 승인 화면이 빈 대기열의 **원인**을 말하려면 모드를 알아야 한다.
  const signupMode = useSignupMode(userId, authGeneration, principalEnabled);
  const principalReadTracker = useRef<{
    owner: string | undefined;
    rosterRevision: number;
    modeRevision: number;
    generation: number;
  }>({ owner: undefined, rosterRevision: 0, modeRevision: 0, generation: 0 });
  const principalOwner = principalEnabled && userId !== undefined ? `${userId}:${authGeneration}` : undefined;
  const principalRosterKey = QUERY_KEYS.userRoster(userId ?? `authenticated-${authGeneration}`, authGeneration);
  const principalModeKey = QUERY_KEYS.signupMode(userId ?? `authenticated-${authGeneration}`, authGeneration);
  const principalReadCounts = () => ({
    roster: queries.getQueryState(principalRosterKey)?.dataUpdateCount ?? 0,
    mode: queries.getQueryState(principalModeKey)?.dataUpdateCount ?? 0,
  });
  const samePrincipalReads = (left: { roster: number; mode: number }, right: { roster: number; mode: number }) =>
    left.roster === right.roster && left.mode === right.mode;
  const acceptPrincipalReads = (counts: { roster: number; mode: number }): number => {
    const tracker = principalReadTracker.current;
    if (tracker.owner !== principalOwner) {
      tracker.owner = principalOwner;
      tracker.rosterRevision = 0;
      tracker.modeRevision = 0;
      tracker.generation += 1;
    }
    if (counts.roster !== tracker.rosterRevision) {
      tracker.rosterRevision = counts.roster;
      tracker.generation += 1;
    }
    if (counts.mode !== tracker.modeRevision) {
      tracker.modeRevision = counts.mode;
      tracker.generation += 1;
    }
    return tracker.generation;
  };
  acceptPrincipalReads(principalReadCounts());
  const principalReadGeneration = principalReadTracker.current.generation;
  const groups = useGroupRoster(principalEnabled);
  const previousPrincipalOwner = useRef<string | undefined>(undefined);
  useEffect(() => {
    const owner = principalEnabled && userId !== undefined ? `${userId}:${authGeneration}` : undefined;
    if (owner === previousPrincipalOwner.current) return;
    const lostOrChangedOwner = previousPrincipalOwner.current !== undefined || owner === undefined;
    previousPrincipalOwner.current = owner;
    if (!lostOrChangedOwner) return;
    queries.removeQueries({ queryKey: ['roster'] });
    queries.removeQueries({ queryKey: ['signup-mode'] });
  }, [authGeneration, principalEnabled, queries, userId]);
  const links = useLinks(protectedEnabled ? documents.activeId : null);
  const linksState: ShellPanelState = links.isError
    ? { state: 'error', message: '잠시 후 다시 시도하십시오.', onRetry: () => void links.refetch() }
    : links.isFetching && documents.activeId !== null
      ? { state: 'loading' }
      : { state: 'ready' };

  /**
   * 열린 탭들의 본문.
   *
   * 열린 탭 목록이 곧 질의 목록이다 — 「열었으니 받아 와라」를 따로 부르면
   * 부르는 자리를 하나 빠뜨렸을 때 그 탭만 영영 비어 있는다.
   *
   * 받아 온 값을 컴포넌트 상태로 **복사하지 않는다.** 복사하면 같은 사실이
   * 두 곳에 살고, 무효화가 한쪽만 갱신한다.
   */
  const bodyQueries = useQueries({
    queries: documents.tabs.map((tab) => ({
      queryKey: QUERY_KEYS.document(tab.nodeId),
      queryFn: () => loadDocument(tab.nodeId),
      enabled: protectedEnabled,
      retry: false,
    })),
  });

  const bodies: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  const documentReadStates: Record<string, DocumentReadState> = {};
  documents.tabs.forEach((tab, index) => {
    const query = bodyQueries[index];
    const got = query?.data;
    documentReadStates[tab.nodeId] = documentUnavailable[tab.nodeId] === true
      ? { state: 'missing' }
      : query?.isError
      ? query.error instanceof ApiError && query.error.status === 404
        ? { state: 'missing' }
        : { state: 'error', retrying: query.isFetching, onRetry: () => { void query.refetch(); } }
      : got !== undefined
        ? { state: 'ready' }
        : { state: 'loading' };
    // 못 받은 자리는 **비워 둔다**. 빈 문자열을 넣으면 사용자가 그 위에
    // 쓰기 시작하고, 저장이 남의 본문을 지운다.
    if (got === undefined) return;
    bodies[tab.nodeId] = got.body;
    hashes[tab.nodeId] = got.hash;
  });

  const deniedNodes = documents.tabs
    .filter((_tab, index) => bodyQueries[index]?.error instanceof ApiError && (bodyQueries[index]!.error as ApiError).status === 404)
    .map((tab) => tab.nodeId)
    .join('\0');
  const documentUnauthorized = bodyQueries.some(
    (query) => query.error instanceof ApiError && query.error.status === 401,
  );
  useLayoutEffect(() => {
    const owner = establishedOwner.current;
    if (!documentUnauthorized || owner === undefined || authEnded) return;
    const records = authBoundary.quarantine(owner);
    if (records.length > 0) setHasQuarantinedDrafts(true);
    endAuthentication(false, true);
  }, [authBoundary, authEnded, documentUnauthorized, endAuthentication]);
  useLayoutEffect(() => {
    const owner = establishedOwner.current;
    if (owner === undefined || deniedNodes === '') return;
    for (const nodeId of deniedNodes.split('\0')) {
      if (documentUnavailable[nodeId] === true) continue;
      const records = authBoundary.quarantineNode(owner, nodeId);
      setDocumentRecovery((was) => ({ ...was, [nodeId]: records }));
      setDocumentUnavailable((was) => ({ ...was, [nodeId]: true }));
      setDocuments((was) => closeTab(was, nodeId));
      if (documents.activeId === nodeId || nodeIdOf(window.location.pathname) === nodeId) setMissingDocument(true);
    }
  }, [authBoundary, deniedNodes, documentUnavailable, documents.activeId, queries]);

  /**
   * 문서를 연다 (`FR-SHELL-012` · `FR-SHELL-006` AC-1).
   *
   * 주소를 함께 민다 — 그래야 그 문서의 링크가 생기고, 뒤로 가기가 문서
   * 이동 이력을 따른다.
   *
   * **잃을 것이 남은 탭은 즉시 교체하지 않는다**(AC-3 · AC-4). 충돌로
   * 자동 저장이 멈췄거나 저장이 거부된 탭에는 그 탭에만 있는 편집이
   * 남아 있고, 교체하면 그것이 사라진다.
   */
  const open = useCallback(
    (node: TreeNodeView, inNewTab: boolean) => {
      if (!allowsProtected()) return;
      popRequestGeneration.current += 1;
      requestedRetryPending.current = false;
      let blocked = false;

      if (documentUnavailable[node.id] === true) {
        setDocumentUnavailable((was) => {
          const next = { ...was };
          delete next[node.id];
          return next;
        });
        queries.removeQueries({ queryKey: QUERY_KEYS.document(node.id), exact: true });
        setMissingDocument(false);
      }

      setDocuments((was) => {
        const current = activeTab(was);
        if (!inNewTab && current !== undefined && needsConfirmBeforeReplace(current)) {
          blocked = true;
          return was;
        }
        return inNewTab ? openInNewTab(was, toTab(node)) : openInActiveTab(was, toTab(node));
      });

      if (blocked) {
        setPendingOpen(node);
        return;
      }

      // 여기서 본문을 다시 받지 **않는다.** 저장이 그때마다 캐시를 맞추므로
      // (`noteSaved`) 캐시가 낡을 자리가 없고, 무효화를 걸면 열려 있는
      // 문서의 아직 저장되지 않은 글자가 그 자리에서 밀린다.
      // 이미 그 자리에 있으면 밀지 않는다 — 같은 자리가 두 번 쌓이면
      // 뒤로 가기가 멈춘 것처럼 보인다 (`FR-SHELL-006` AC-4).
      const url = urlForNode(node.id);
      if (window.location.pathname !== url) pushDocumentHistory(url);
    },
    [allowsProtected, documentUnavailable, pushDocumentHistory, queries],
  );

  /**
   * 저장된 본문을 서버 상태 캐시에 그대로 앉힌다.
   *
   * 무효화가 아니라 **되쓰기**다 — 무효화는 왕복을 한 번 더 돌면서 그
   * 사이의 편집을 밀어낼 자리를 만든다. 우리는 서버가 무엇을 갖게 됐는지
   * 이미 알고 있으므로 다시 물을 이유가 없다.
   */
  /**
   * 휴지통 항목을 되돌리거나 영구 삭제한다 (`FR-SHELL-007` · `SEC-SHELL-001`).
   *
   * 끝나면 목록과 트리를 **둘 다** 무효화한다 — 되돌린 문서는 트리에
   * 나타나야 하고 목록에서는 사라져야 하는데, 한쪽만 갱신하면 사용자는
   * 그것이 어디로 갔는지 알 수 없다.
   */
  /**
   * 슈퍼유저 직접 등록 (`FR-AUTH-003`).
   *
   * 끝나면 명부를 다시 받는다 — 방금 만든 계정이 목록에 없으면 사용자는
   * 등록이 안 된 줄 안다.
   */
  const refreshUserRoster = useCallback(async (): Promise<{ failed: boolean; generation: number }> => {
    const refreshed = await users.refetch();
    const generation = acceptPrincipalReads(principalReadCounts());
    return { failed: refreshed.isError, generation };
  }, [users.refetch, principalOwner]);

  const failedPrincipalAction = (error: unknown): PrincipalActionResult => ({
    ok: false,
    kind: error instanceof ApiError ? 'rejected' : 'uncertain',
  });

  const makeUser = useCallback(async (input: { name: string; password: string }): Promise<PrincipalActionResult> => {
    if (!allowsProtected()) return { ok: false, kind: 'stale' };
    const capturedReads = principalReadCounts();
    try {
      const created = await registerUser(input);
      if (typeof created.id !== 'string' || created.id === '') return { ok: false, kind: 'uncertain' };
      if (!allowsProtected()) return { ok: false, kind: 'stale' };
      if (!samePrincipalReads(principalReadCounts(), capturedReads)) return { ok: false, kind: 'stale' };
      const refresh = await refreshUserRoster();
      if (!allowsProtected()) return { ok: false, kind: 'stale' };
      return { ok: true, id: created.id, refreshFailed: refresh.failed, acceptedReadGeneration: refresh.generation };
    } catch (error) {
      return failedPrincipalAction(error);
    }
  }, [allowsProtected, refreshUserRoster]);

  /**
   * 가입 승인·재심사·상태 전환 (`SEC-AUTH-004` · `FR-AUTH-002` · `R112-d`).
   *
   * 셋이 같은 뒷정리를 한다 — 명부를 다시 받는다. 화면에서 상태를 지어
   * 넣으면 서버가 거절했을 때 그 사실이 드러나지 않고, 사용자는 바뀐 줄 안다.
   */
  const 명부를다시받는다 = useCallback(async (조작: () => Promise<unknown>): Promise<PrincipalActionResult> => {
    if (!allowsProtected()) return { ok: false, kind: 'stale' };
    const capturedReads = principalReadCounts();
    try {
      await 조작();
      if (!allowsProtected()) return { ok: false, kind: 'stale' };
      if (!samePrincipalReads(principalReadCounts(), capturedReads)) return { ok: false, kind: 'stale' };
      const refresh = await refreshUserRoster();
      if (!allowsProtected()) return { ok: false, kind: 'stale' };
      return { ok: true, refreshFailed: refresh.failed, acceptedReadGeneration: refresh.generation };
    } catch (error) {
      return failedPrincipalAction(error);
    }
  }, [allowsProtected, refreshUserRoster]);

  const approve = useCallback(
    (userId: string) => allowsProtected() ? 명부를다시받는다(() => approveUser(userId)) : Promise.resolve({ ok: false as const, kind: 'stale' as const }),
    [allowsProtected, 명부를다시받는다],
  );
  const reopen = useCallback(
    (userId: string) => allowsProtected() ? 명부를다시받는다(() => reopenUser(userId)) : Promise.resolve({ ok: false as const, kind: 'stale' as const }),
    [allowsProtected, 명부를다시받는다],
  );
  const changeUserStatus = useCallback(
    (userId: string, status: RosterUserStatus) => allowsProtected()
      ? 명부를다시받는다(() => setUserStatus(userId, status))
      : Promise.resolve({ ok: false as const, kind: 'stale' as const }),
    [allowsProtected, 명부를다시받는다],
  );

  const afterTrashAction = useCallback(async () => {
    await queries.invalidateQueries({ queryKey: ['trash'] });
    await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
  }, [queries]);

  /**
   * 노드를 휴지통으로 보낸다 (`IR-SHELL-005` AC-1).
   *
   * 되돌릴 수 있는 조작이라 확인을 거치지 않는다 — 복구는 휴지통 화면에
   * 있고, 영구 삭제만이 되돌릴 수 없다.
   *
   * 트리와 휴지통을 함께 무효화한다. 트리만 갱신하면 지운 노드가 트리에서는
   * 사라지는데 휴지통에는 나타나지 않아, 사용자가 그것을 잃었다고 읽는다.
   */
  const deleteNode = useCallback(
    async (nodeId: string) => {
      if (!allowsProtected()) return;
      await moveNodeToTrash(nodeId).catch(() => undefined);
      if (!allowsProtected()) return;
      await afterTrashAction();
    },
    [afterTrashAction, allowsProtected],
  );

  /**
   * 이름을 바꾼다 (`FR-SHELL-015` AC-1).
   *
   * 트리를 무효화한다 — 화면에서 지어 넣으면 서버가 접미사를 붙인 경우와
   * 갈리고, 그때 사용자는 자기 문서를 못 찾는다.
   */
  const rename = useCallback(
    async (nodeId: string, name: string) => {
      if (!allowsProtected()) return;
      try {
        await renameNode(nodeId, name);
        if (!allowsProtected()) return;
        await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
        return undefined;
      } catch (error) {
        return namingFailureMessage(error);
      }
    },
    [allowsProtected, queries],
  );

  /**
   * 옮기거나 복사한다 (`FR-SHELL-015` AC-2 · AC-4).
   *
   * 목적지 id 가 **워크스페이스 자신이면 그 루트**다. 두 조작이 그것을
   * 다르게 표현한다 — 이동은 부모 없음(`null`)이고, 복사는 목적지를 판별
   * 합집합으로 받으므로 `{ workspaceId }` 다. 서버가 그 둘을 나란히 받지
   * 않는 이유가 어긋나는 조합을 표현 불가능하게 두기 위해서이므로, 화면도
   * 여기서 한 번에 갈라 보낸다.
   */
  const relocate = useCallback(
    async (nodeId: string, kind: 'move' | 'copy', destinationId: string, ownerKey: string) => {
      const owner = userId;
      const generation = authGeneration;
      const transport = relocationTransportFor(workspaces, nodeId, kind, destinationId);
      if (transport === null) throw new Error('invalid relocation destination');
      if (kind === 'move') {
        const moved = await moveNode(nodeId, transport.writeDestination as string | null);
        if (currentUser.current !== owner || currentAuthGeneration.current !== generation || currentRelocationOwner.current !== ownerKey) return { kind: 'move' as const, name: moved.name };
        try {
          await refetchRelocationTree(queries);
          if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) setRelocationRefreshError(false);
        } catch {
          if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) setRelocationRefreshError(true);
        }
        if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) {
          setNotice(`항목을 이동했습니다. 결과 이름: ${moved.name}`);
        }
        return { kind: 'move' as const, name: moved.name };
      }
      const copied = await copyNode(nodeId, transport.writeDestination as { parentId: string } | { workspaceId: string });
      if (currentUser.current !== owner || currentAuthGeneration.current !== generation || currentRelocationOwner.current !== ownerKey) return { kind: 'copy' as const, ...copied };
      try {
        await refetchRelocationTree(queries);
        if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) setRelocationRefreshError(false);
      } catch {
        if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) setRelocationRefreshError(true);
      }
      if (currentUser.current === owner && currentAuthGeneration.current === generation && currentRelocationOwner.current === ownerKey) {
        setNotice(`${copied.copied}개 항목을 복사했습니다. 결과 이름: ${copied.name}`);
      }
      return { kind: 'copy' as const, ...copied };
    },
    [workspaces, queries, userId, authGeneration],
  );

  const previewRelocation = useCallback(
    async (nodeId: string, kind: 'move' | 'copy', destinationId: string) => {
      const transport = relocationTransportFor(workspaces, nodeId, kind, destinationId);
      if (transport === null) throw new Error('invalid relocation destination');
      return fetchRelocationPreview(nodeId, kind, transport.previewDestinationId);
    },
    [workspaces],
  );

  const retryRelocationRefresh = useCallback(() => {
    const owner = currentUser.current;
    const generation = currentAuthGeneration.current;
    void refetchRelocationTree(queries).then(
      () => { if (currentUser.current === owner && currentAuthGeneration.current === generation) setRelocationRefreshError(false); },
      () => { if (currentUser.current === owner && currentAuthGeneration.current === generation) setRelocationRefreshError(true); },
    );
  }, [queries]);

  /**
   * 공유 화면 (`IR-ACL-002` · `IR-ACL-003`).
   *
   * 연 노드가 있을 때만 묻는다 — 늘 물으면 트리를 훑는 동안에도 노드마다
   * 권한 조회가 나가고, 그 조회는 관리 전용 명단을 담고 있어 값싸지 않다.
   */
  const [sharingId, setSharingId] = useState<string | null>(null);
  const shareQuery = useQuery({
    queryKey: ['share', sharingId],
    queryFn: () => fetchShareView(sharingId as string),
    enabled: protectedEnabled && sharingId !== null,
    retry: false,
  });
  const shareState: ShareQueryState | undefined = sharingId === null
    ? undefined
    : shareQuery.isError
      ? { state: 'error', nodeId: sharingId, onRetry: () => void shareQuery.refetch() }
      : shareQuery.data === undefined
        ? { state: 'loading', nodeId: sharingId }
        : { state: 'ready', nodeId: sharingId, view: shareQuery.data };

  /** 부여·회수·상속 조작 뒤에 그 노드의 공유 화면을 다시 받는다. */
  const afterShareChange = useCallback(
    async (nodeId: string) => {
      await queries.invalidateQueries({ queryKey: ['share', nodeId] });
      // 상속을 끊거나 되붙이면 트리의 보임도 달라질 수 있다.
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
  );

  const share = useMemo(
    () => ({
      contextKey: `${userId ?? 'anonymous'}:${authGeneration}`,
      ...(shareState === undefined ? {} : { query: shareState }),
      onOpen: setSharingId,
      onGrant: async (nodeId: string, principalId: string, level: 'view' | 'edit') => {
        if (!allowsProtected()) return { ok: false as const };
        try {
          const grantReceipt = await grantShare(nodeId, principalId, level);
          if (!allowsProtected()) return { ok: false as const };
          void afterShareChange(nodeId);
          return { ok: true as const, ...(grantReceipt === undefined ? {} : { grantReceipt }) };
        } catch {
          return { ok: false as const };
        }
      },
      onRevoke: async (nodeId: string, entryId: string) => {
        if (!allowsProtected()) return { ok: false as const };
        try {
          await revokeShare(entryId);
        } catch {
          return { ok: false as const };
        }
        if (!allowsProtected()) return { ok: false as const };
        void afterShareChange(nodeId);
        return { ok: true as const };
      },
      onBreakInheritance: async (nodeId: string) => {
        if (!allowsProtected()) return { ok: false as const };
        try { await breakInheritance(nodeId); } catch { return { ok: false as const }; }
        if (!allowsProtected()) return { ok: false as const };
        void afterShareChange(nodeId);
        return { ok: true as const };
      },
      onInheritFromParent: async (nodeId: string) => {
        if (!allowsProtected()) return { ok: false as const };
        try { await inheritFromParent(nodeId); } catch { return { ok: false as const }; }
        if (!allowsProtected()) return { ok: false as const };
        void afterShareChange(nodeId);
        return { ok: true as const };
      },
      refreshView: async (nodeId: string) => allowsProtected() ? fetchShareView(nodeId).catch(() => undefined) : undefined,
      onWarnings: async (input: Parameters<typeof fetchGrantWarnings>[0]) => allowsProtected() ? fetchGrantWarnings(input) : [],
    }),
    [allowsProtected, shareState, afterShareChange, userId, authGeneration],
  );

  const purgeTrash = useCallback(
    async (nodeId: string) => {
      if (!allowsProtected()) return { ok: false as const };
      try {
        await purgeFromTrash(nodeId);
      } catch {
        return { ok: false as const };
      }
      if (!allowsProtected()) return { ok: false as const };
      void afterTrashAction();
      return { ok: true as const };
    },
    [afterTrashAction, allowsProtected],
  );

  const restoreTrash = useCallback(
    async (nodeId: string) => {
      const owner = establishedOwner.current;
      if (owner === undefined || !allowsProtected(owner)) return { ok: false as const };
      try {
        await restoreFromTrash(nodeId);
      } catch {
        return { ok: false as const };
      }
      if (!allowsProtected(owner)) return { ok: false as const };
      void afterTrashAction();
      return { ok: true as const };
    },
    [afterTrashAction, allowsProtected],
  );

  const noteSaved = useCallback(
    (nodeId: string, savedBody: string, hash: string) => {
      queries.setQueryData(QUERY_KEYS.document(nodeId), { body: savedBody, hash });
    },
    [queries],
  );

  /**
   * 고른 자리에 노드를 만든다 (`FR-SHELL-016`).
   *
   * **만들기로 가는 길은 이 함수 하나다** (AC-7). 트리 상단 버튼과 컨텍스트
   * 메뉴가 각자 서버를 부르면 한쪽만 고쳐지고 다른 쪽은 조용히 어긋난다 —
   * 이 저장소가 이미 여러 번 겪은 부류다.
   */
  const create = useCallback(
    async (
      workspaceId: string,
      parentId: string | null,
      kind: 'file' | 'directory',
      name: string,
    ) => {
      if (!allowsProtected()) return '?꾩옱 濡쒓렇???곹깭瑜??뺤씤?????놁뒿?덈떎.';
      let made: Awaited<ReturnType<typeof createNode>>;
      try {
        made = await createNode({ workspaceId, parentId, kind, name });
      } catch (error) {
        return namingFailureMessage(error);
      }

      // 접미사가 붙었을 때만 말이 온다 — 늘 말하면 사용자가 그 자리를 읽지
      // 않게 되고, 정작 이름이 바뀐 때도 지나친다.
      setNotice(made.notice);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
      return undefined;
    },
    [allowsProtected, queries],
  );

  /**
   * 트리 상단 `새 노트` 버튼 (`FR-SHELL-003` AC-1 · `FR-SHELL-016` AC-7).
   *
   * 첫 워크스페이스의 루트에 **이름을 묻지 않고** 만든다 — 어디에 만들지
   * 먼저 고르게 하면 조작이 하나 더 붙는데, 「새 노트」는 곧바로 쓰기
   * 시작하는 자리다. 자리를 고르고 이름을 정하는 길은 컨텍스트 메뉴가 받는다.
   */
  const createNote = useCallback(async () => {
    const first = workspaces[0];
    if (first === undefined) return;

    await create(first.workspace.id, null, 'file', CREATE_DEFAULTS.file.name);
  }, [workspaces, create]);

  /**
   * 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4).
   *
   * 더한 뒤 목록을 **무효화한다** — 화면에서 지어 넣으면 서버가 무엇을
   * 담았는지와 갈리고, 볼 수 없게 된 항목이 화면에만 남는다.
   */
  const favorite = useCallback(
    async (nodeId: string) => {
      if (!allowsProtected()) return;
      await addFavorite(nodeId).catch(() => undefined);
      if (!allowsProtected()) return;
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
    [allowsProtected, queries],
  );

  /**
   * 즐겨찾기에서 뺀다 (`FR-SHELL-001` AC-5).
   *
   * 더하기와 **같은 자리에서 같은 방식으로** 목록을 무효화한다 — 한쪽만
   * 다시 받으면 뺀 것이 화면에 그대로 남고, 사용자는 조작이 먹지 않았다고
   * 읽어 한 번 더 누른다.
   */
  /**
   * 로그인한다 (원장 §4 **수용 기준 14** · R57).
   *
   * 성공하면 세션을 **다시 받는다** — 받지 않으면 쿠키는 생겼는데 화면은
   * 로그인 화면에 그대로 남고, 그 화면은 아무 말도 하지 않아 사용자에게는
   * 로그인이 실패한 것으로 보인다.
   *
   * 거절되면 서버가 준 **사유 문장**을 그대로 돌려준다(R60 · R60-b) —
   * 상태별 안내를 화면이 다시 지으면 계정 상태가 늘 때마다 두 곳이 갈린다.
   */
  const signIn = useCallback(
    async (input: { name: string; password: string }) => {
      try {
        await logIn(input);
      } catch (error) {
        if (error instanceof ApiError) return error.detail?.reason ?? '로그인하지 못했습니다';
        throw error;
      }
      queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      try {
        const freshSession = await fetchSession();
        const freshIdentity = await fetchIdentity();
        if (freshIdentity.kind !== 'ok') return '로그인 계정을 확인하지 못했습니다. 다시 시도하세요.';
        queries.setQueryData(QUERY_KEYS.session, freshSession);
        queries.setQueryData(QUERY_KEYS.identity, freshIdentity);
      } catch {
        return '로그인 계정을 확인하지 못했습니다. 다시 시도하세요.';
      }
      setAuthGeneration((value) => value + 1);
      setAuthEnded(false);
      setPasswordChanged(false);
      setAuthenticationEndedUnexpectedly(false);
      return undefined;
    },
    [queries],
  );

  /**
   * 가입을 신청한다 (`IR-AUTH-001` AC-2 · `FR-AUTH-004` AC-5).
   *
   * 성공해도 세션을 다시 받지 않는다 — 신청은 계정을 `pending` 으로
   * 세울 뿐이고, 그 상태로는 로그인되지 않는다. 다시 받으면 401 이 한 번
   * 더 돌 뿐이다.
   */
  const signUp = useCallback(async (input: { name: string; password: string }) => {
    try {
      await requestSignup(input);
    } catch (error) {
      if (error instanceof ApiError) {
        // 403 은 인스턴스가 신청을 받지 않는다는 뜻이다. 「이름이 이미
        // 있습니다」로 뭉개면 사용자는 이름만 바꿔 가며 계속 시도한다.
        return error.status === 403
          ? '이 인스턴스는 지금 가입 신청을 받지 않습니다. 관리자에게 문의하십시오.'
          : '신청하지 못했습니다. 이름이 이미 쓰이고 있거나 입력이 올바르지 않습니다.';
      }
      throw error;
    }
    return undefined;
  }, []);

  /**
   * 로그아웃한다 (`SEC-AUTH-019`).
   *
   * 세션만 무효화하지 않고 **캐시를 통째로 비운다** — 남겨 두면 다음
   * 사용자가 같은 브라우저에서 로그인했을 때 앞 사람의 트리와 본문이
   * 잠깐 보인다.
   */
  const signOut = useCallback(async () => {
    if (authAttemptLock.current() !== null) return;
    const owner = establishedOwner.current;
    if (owner === undefined) return;
    const attempt = authBoundary.beginAttempt(owner);
    if (attempt === null) return;
    if (!authAttemptLock.acquire(attempt)) return;
    activeAuthAttempt.current = attempt;
    syncAuthPhase();
    try {
      if (!(await requestDraftHandoff(attempt))) {
        authBoundary.resume(attempt);
        authAttemptLock.release(attempt);
        activeAuthAttempt.current = null;
        syncAuthPhase();
        return;
      }
      authBoundary.markPosting(attempt);
      syncAuthPhase();
      const response = await requestLogout();
      switch (response.kind) {
        case 'accepted':
          endAuthentication(false, false, attempt);
          return;
        case 'malformed':
        case 'http-error':
          await checkAuthenticationAfterAttempt(owner, attempt);
          return;
      }
    } catch {
      await checkAuthenticationAfterAttempt(owner, attempt);
    } finally {
      authAttemptLock.release(attempt);
    }
  }, [authAttemptLock, authBoundary, checkAuthenticationAfterAttempt, endAuthentication, requestDraftHandoff, syncAuthPhase]);

  /**
   * 자기 비밀번호를 바꾼다 (`SEC-AUTH-018`).
   *
   * 성공하면 서버가 그 계정의 **모든 세션을 끊으므로** 이 브라우저도
   * 로그아웃된 상태가 된다. 그래서 로그아웃과 같은 뒷정리를 한다.
   */
  const changeOwnPassword = useCallback(
    async (input: { current: string; next: string }, lifecycle: { dispatched: () => void }) => {
      if (authAttemptLock.current() !== null) return;
      const owner = establishedOwner.current;
      if (owner === undefined) return;
      const attempt = authBoundary.beginAttempt(owner);
      if (attempt === null) return;
      if (!authAttemptLock.acquire(attempt)) return;
      activeAuthAttempt.current = attempt;
      syncAuthPhase();
      try {
        if (!(await requestDraftHandoff(attempt))) {
          authBoundary.resume(attempt);
          authAttemptLock.release(attempt);
          activeAuthAttempt.current = null;
          syncAuthPhase();
          return;
        }
        authBoundary.markPosting(attempt);
        syncAuthPhase();
        const request = requestPasswordChange(input);
        lifecycle.dispatched();
        input.current = '';
        input.next = '';
        const response = await request;
        switch (response.kind) {
          case 'accepted':
            break;
          case 'malformed':
            await checkAuthenticationAfterAttempt(owner, attempt);
            return undefined;
          case 'http-error':
            if (response.status === 401) {
              if (userId !== undefined) {
                const records = authBoundary.quarantine({ userId, generation: authGeneration });
                if (records.length > 0) setHasQuarantinedDrafts(true);
              }
              endAuthentication(false, true, attempt);
              return undefined;
            }
            await checkAuthenticationAfterAttempt(owner, attempt);
            return response.status === 400 && response.rule !== undefined && ['wrong-password', 'empty-password', 'self-only', 'unknown-account'].includes(response.rule)
              ? response.rule
              : 'generic';
        }
      } catch {
        await checkAuthenticationAfterAttempt(owner, attempt);
        return 'generic';
      } finally {
        authAttemptLock.release(attempt);
      }
      endAuthentication(true, false, attempt);
      return undefined;
    },
    [authAttemptLock, authBoundary, authGeneration, checkAuthenticationAfterAttempt, endAuthentication, requestDraftHandoff, syncAuthPhase, userId],
  );

  const unfavorite = useCallback(
    async (nodeId: string) => {
      if (!allowsProtected()) return;
      await removeFavorite(nodeId).catch(() => undefined);
      if (!allowsProtected()) return;
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
    [allowsProtected, queries],
  );

  /**
   * 개인 설정 하나를 바꾼다 (`IR-SHELL-004` · `DR-SHELL-002`).
   *
   * 쓴 뒤 다시 받는다 — 화면이 고른 값을 자기 상태로 복사해 두면 서버가
   * 거절했을 때(모르는 키·값) 화면만 바뀐 채 남는다.
   */
  /** 그룹을 지운다 (`FR-PRINCIPAL-002`). 그 그룹의 ACL 항목도 함께 걷힌다. */
  const dropGroup = useCallback(
    async (groupId: string) => {
      if (!allowsProtected()) return;
      await removeGroup(groupId).catch(() => undefined);
      if (!allowsProtected()) return;
      // 트리도 다시 받는다 — 그 그룹으로 보이던 노드가 사라질 수 있다.
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.groupRoster });
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [allowsProtected, queries],
  );

  /**
   * 권한 감사 구역 (`FR-ACL-003`~`FR-ACL-005`).
   *
   * 고른 주체를 여기서 든다 — 두 탭이 각자 들면 같은 사람을 두 번 고르게
   * 되고, 한쪽만 갱신되는 자리가 생긴다. 관리 워크스페이스는 서버가 준
   * 목록의 첫 항목을 쓴다: 주체 검색의 자격 근거일 뿐이라 어느 것이어도
   * 같은 인가를 지난다 (`R162`).
   */
  const [회수주체, set회수주체] = useState<readonly RevocationSubject[]>([]);
  const [시뮬주체, set시뮬주체] = useState<PrincipalRow | null>(null);
  const auditSelectionContext = useRef<string | undefined>(undefined);
  const adminScope = session.data !== undefined && session.data.adminWorkspaceCount > 0;
  const workspaceList = useWorkspaceList(protectedEnabled && adminScope, 'managed', userId, authGeneration);
  const managedWorkspaceScope = useManagedWorkspaces(userId, authGeneration, protectedEnabled);
  const allWorkspaces = useWorkspaceList(protectedEnabled && session.data?.superuser === true, 'all', userId, authGeneration);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(undefined as string | undefined);
  const selectionInitialized = useRef(false);
  useEffect(() => {
    selectionInitialized.current = false;
    setSelectedWorkspaceId(undefined);
  }, [authGeneration, userId]);
  useEffect(() => {
    if (workspaceList.data === undefined || selectionInitialized.current) return;
    selectionInitialized.current = true;
    setSelectedWorkspaceId(workspaceList.data[0]?.id);
  }, [workspaceList.data]);
  const authorizedSelectedWorkspaceId = selectedWorkspaceId !== undefined
    && workspaceList.data?.some((workspace) => workspace.id === selectedWorkspaceId)
    ? selectedWorkspaceId
    : undefined;
  const selectedWorkspaceAdministrators = useWorkspaceAdministrators(
    protectedEnabled && authorizedSelectedWorkspaceId !== undefined && userId !== undefined,
    authorizedSelectedWorkspaceId ?? 'unavailable',
    userId ?? 'anonymous',
    authGeneration,
  );
  const renameSelectedWorkspace = useCallback(async (workspaceId: string, name: string) => {
    if (!allowsProtected()) return { blocked: 'authentication' as const };
    const result = await renameWorkspace(workspaceId, name);
    if (!allowsProtected()) return { blocked: 'authentication' as const };
    await Promise.all([
      queries.invalidateQueries({ queryKey: QUERY_KEYS.workspaces('managed') }),
      queries.invalidateQueries({ queryKey: QUERY_KEYS.workspaces('all') }),
      queries.invalidateQueries({ queryKey: QUERY_KEYS.tree }),
    ]);
    return result;
  }, [allowsProtected, queries]);
  const [workspaceCreationStatus, setWorkspaceCreationStatus] = useState<{ kind: 'success' | 'refresh-error'; message: string }>();
  const [workspaceAdministratorMutationStatus, setWorkspaceAdministratorMutationStatus] = useState<{ kind: 'success' | 'refresh-error'; message: string }>();
  const refreshWorkspaceCreationReads = useCallback(() => refetchWorkspaceCreationReads(queries), [queries]);
  const retryWorkspaceCreationReads = useCallback(async () => {
    if (!allowsProtected()) return;
    const refreshed = await refreshWorkspaceCreationReads();
    if (!allowsProtected()) return;
    setWorkspaceCreationStatus(refreshed
      ? { kind: 'success', message: '워크스페이스 목록을 새로 불러왔습니다.' }
      : { kind: 'refresh-error', message: '워크스페이스는 만들어졌지만 목록을 새로 불러오지 못했습니다.' });
  }, [allowsProtected, refreshWorkspaceCreationReads]);
  // @req IR-WORKSPACE-001
  const createWorkspaceAndRefresh = useCallback(async (input: Parameters<typeof createWorkspaceRequest>[0]) => {
    if (!allowsProtected()) return { blocked: 'authentication' as const };
    const result = await createWorkspaceRequest(input);
    if (!allowsProtected()) return { blocked: 'authentication' as const };
    setSelectedWorkspaceId(result.workspace.id);
    const refreshed = await refreshWorkspaceCreationReads();
    setWorkspaceCreationStatus(refreshed
      ? { kind: 'success', message: '워크스페이스를 만들었습니다.' }
      : { kind: 'refresh-error', message: '워크스페이스를 만들었습니다. 목록을 새로 불러오지 못했습니다.' });
    return result;
  }, [allowsProtected, refreshWorkspaceCreationReads]);
  const refreshWorkspaceAdministratorReads = useCallback(async () => {
    const [administratorsResult] = await Promise.all([
      selectedWorkspaceAdministrators.refetch(),
      queries.invalidateQueries({ queryKey: QUERY_KEYS.workspaces('managed') }),
      queries.invalidateQueries({ queryKey: QUERY_KEYS.workspaces('all') }),
      queries.invalidateQueries({ queryKey: QUERY_KEYS.session }),
    ]);
    if (administratorsResult.isError) throw administratorsResult.error;
  }, [queries, selectedWorkspaceAdministrators]);
  const retryWorkspaceAdministratorReads = useCallback(() => {
    void refreshWorkspaceAdministratorReads().then(() => {
      setWorkspaceAdministratorMutationStatus({ kind: 'success', message: '관리자 목록을 새로 불러왔습니다.' });
    }).catch(() => {
      setWorkspaceAdministratorMutationStatus({ kind: 'refresh-error', message: '관리 권한을 회수했지만 목록을 새로 불러오지 못했습니다.' });
    });
  }, [refreshWorkspaceAdministratorReads]);
  const brokenInheritance = useBrokenInheritance(protectedEnabled && (adminScope || session.data?.superuser === true));
  // 슈퍼유저는 관리 워크스페이스가 없어도 인스턴스 스코프의 행을 읽는다
  // (`SEC-AUDIT-010` AC-5) — `adminScope` 만 보면 그 문이 닫힌다.
  const 감사자격 = protectedEnabled && (adminScope || session.data?.superuser === true);
  /** 감사 로그의 조작 필터. 빈 문자열이 「전체」다 (`IR-AUDIT-001`). */
  const [auditOperation, setAuditOperation] = useState('');
  const auditContextKey = `${authGeneration}:${userId ?? 'pending'}:${session.data?.superuser === true ? 'super' : 'member'}:${session.data?.adminWorkspaceCount ?? 0}`;
  const auditLog = useAuditLog(감사자격, auditOperation, auditContextKey);
  // 대기열은 감사 로그와 **같은 조건**으로 켠다 (`SEC-AUDIT-007` AC-6) —
  // 자격 판정은 서버가 하나로 들고, 화면이 조건을 따로 적으면 둘이 갈린다.
  const queue = useReconciliationQueue(감사자격, auditContextKey);
  const auditOptions = useRef<{ contextKey: string; operations: readonly string[] } | undefined>(undefined);
  useEffect(() => {
    if (auditLog.data === undefined || auditLog.isError) return;
    auditOptions.current = { contextKey: auditContextKey, operations: auditLog.data.operations };
  }, [auditContextKey, auditLog.data, auditLog.isError]);
  const sameContextOperations = auditOptions.current?.contextKey === auditContextKey
    ? auditOptions.current.operations
    : undefined;
  const auditState = auditLog.isError
    ? { state: 'error' as const, onRetry: () => { void auditLog.refetch(); }, ...(sameContextOperations === undefined ? {} : { operations: sameContextOperations }) }
    : auditLog.isFetching || auditLog.data === undefined
      ? { state: 'loading' as const, ...(sameContextOperations === undefined ? {} : { operations: sameContextOperations }) }
      : { state: 'ready' as const, data: auditLog.data };
  const queueState = queue.isError
    ? { state: 'error' as const, onRetry: () => { void queue.refetch(); } }
    : queue.isFetching || queue.data === undefined
      ? { state: 'loading' as const }
      : { state: 'ready' as const, data: queue.data };
  /** 태그 탭의 범위 (`FR-SHELL-009` AC-2). 빈 문자열이 「전체」다. */
  const [tagScope, setTagScope] = useState('');
  const tags = useTags(protectedEnabled, tagScope);
  const tagsState: ShellPanelState = tags.isError
    ? { state: 'error', message: '잠시 후 다시 시도하십시오.', onRetry: () => void tags.refetch() }
    : tags.isFetching
      ? { state: 'loading' }
      : { state: 'ready' };
  const searchResults = useSearch(protectedEnabled ? query : '', searchAxes);
  const searchEnabled = protectedEnabled && query.trim() !== '' && searchAxes.length > 0;
  const searchState = !searchEnabled
    ? { state: 'idle' as const }
    : searchResults.isFetching
      ? { state: 'loading' as const }
      : searchResults.isError
        ? { state: 'error' as const, onRetry: () => void searchResults.refetch() }
        : { state: 'success' as const };
  const managedScopeFingerprint = managedWorkspaceScope.data === undefined
    ? undefined
    : QUERY_KEYS.managedScopeFingerprint(managedWorkspaceScope.data);
  const [auditWorkspaceId, setAuditWorkspaceId] = useState(undefined as string | undefined);
  useEffect(() => {
    if (managedWorkspaceScope.data === undefined) return;
    setAuditWorkspaceId((current) => current !== undefined
      && managedWorkspaceScope.data.workspaces.some(({ id }) => id === current)
      ? current
      : managedWorkspaceScope.data.workspaces[0]?.id);
  }, [managedScopeFingerprint, managedWorkspaceScope.data]);
  const authorizedAuditWorkspaceId = auditWorkspaceId !== undefined
    && managedWorkspaceScope.data?.workspaces.some(({ id }) => id === auditWorkspaceId)
    ? auditWorkspaceId
    : managedWorkspaceScope.data?.workspaces[0]?.id;
  useEffect(() => {
    if (auditSelectionContext.current === managedScopeFingerprint) return;
    auditSelectionContext.current = managedScopeFingerprint;
    set회수주체([]);
    set시뮬주체(null);
  }, [managedScopeFingerprint]);
  const auditSelectionsCurrent = auditSelectionContext.current === managedScopeFingerprint;
  const currentRevocationSubjects = auditSelectionsCurrent ? 회수주체 : [];
  const currentSimulationSubject = auditSelectionsCurrent ? 시뮬주체 : null;
  const dependentContext = `${userId ?? 'anonymous'}:${authGeneration}:${managedScopeFingerprint ?? 'unresolved'}`;
  const revocations = useQueries({
    queries: currentRevocationSubjects.map((subject) => ({
      queryKey: QUERY_KEYS.revocation(subject.id, dependentContext),
      queryFn: () => fetchRevocation(subject.id),
      enabled: protectedEnabled && managedScopeFingerprint !== undefined,
      retry: false,
    })),
  });
  const revocationPlan: AuditQuery<BulkPlan> = currentRevocationSubjects.length === 0
    ? { state: 'idle' }
    : revocations.some((query) => query.isError)
      ? { state: 'error', onRetry: () => { for (const query of revocations) void query.refetch(); } }
      : revocations.some((query) => query.isFetching || query.data === undefined)
        ? { state: 'loading' }
        : {
          state: 'ready',
          data: {
            subjects: currentRevocationSubjects.map((subject, index) => ({
              subject,
              response: revocations[index]!.data!,
            })),
          },
        };
  const managedAuditScope = managedWorkspaceScope.isError
    ? { state: 'error' as const, onRetry: () => { void managedWorkspaceScope.refetch(); } }
    : managedWorkspaceScope.data === undefined || managedWorkspaceScope.isFetching
      ? { state: 'loading' as const }
      : authorizedAuditWorkspaceId === undefined
        ? { state: 'empty' as const, authorityScope: managedWorkspaceScope.data.scope }
        : { state: 'ready' as const, workspaceId: authorizedAuditWorkspaceId, authorityScope: managedWorkspaceScope.data.scope };
  const aclAuditContextKey = JSON.stringify([
    userId ?? 'anonymous',
    authGeneration,
    managedScopeFingerprint ?? managedAuditScope.state,
    currentRevocationSubjects.map((subject) => subject.id),
  ]);
  const previewRevocations = useCallback(async (selected: readonly RevocationSubject[]): Promise<BulkPlan> => ({
    subjects: allowsProtected() ? await Promise.all(selected.map(async (subject) => ({
      subject,
      response: await fetchRevocation(subject.id),
    }))) : [],
  }), [allowsProtected]);
  const simulation = useSimulation(protectedEnabled ? (currentSimulationSubject?.id ?? null) : null, dependentContext);

  const revokeOneSubject = useCallback(
    async (principalId: string) => {
      if (!allowsProtected()) return { kind: 'blocked' as const };
      return revokeSubjectAndRefresh(principalId, revokeAllFor, async (target, id) => {
      if (target === 'revocation') await refreshAfterSubjectRevoke(queries, dependentContext, id);
      else await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
      });
    },
    [allowsProtected, dependentContext, queries],
  );

  const addMember = useCallback(
    async (groupId: string, userId: string) => {
      if (!allowsProtected()) return;
      await addGroupMember(groupId, userId).catch(() => undefined);
      if (!allowsProtected()) return;
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.groupRoster });
    },
    [allowsProtected, queries],
  );

  const saveTheme = useCallback(
    async function persistTheme(value: ThemePreference) {
      if (!allowsProtected() || userId === undefined || personal.data === undefined) return;
      const owner = userId;
      const request = ++themeRequest.current;
      await queries.cancelQueries({ queryKey: QUERY_KEYS.personalSettings(owner) });
      setOptimisticTheme(value);
      setThemeSaveState({ state: 'saving' });

      try {
        await savePersonalSetting('theme', value);
        if (!allowsProtected() || currentUser.current !== owner || themeRequest.current !== request) return;
        await queries.cancelQueries({ queryKey: QUERY_KEYS.personalSettings(owner) });
        if (currentUser.current !== owner || themeRequest.current !== request) return;
        queries.setQueryData<Record<string, string>>(
          QUERY_KEYS.personalSettings(owner),
          (was) => ({ ...(was ?? {}), theme: value }),
        );
        rememberTheme(owner, value);
        setOptimisticTheme(undefined);
        setThemeSaveState({ state: 'saved' });
      } catch {
        if (currentUser.current !== owner || themeRequest.current !== request) return;
        setOptimisticTheme(undefined);
        setThemeSaveState({ state: 'error', onRetry: () => void persistTheme(value) });
      }
    },
    [allowsProtected, personal.data, queries, userId],
  );

  const pickPersonalSetting = useCallback(
    async (key: string, value: string) => {
      if (key === 'theme' && (value === 'light' || value === 'dark' || value === 'system')) {
        await saveTheme(value);
        return;
      }
      if (key === 'default-view-mode' || key === 'default-edit-subview') editor.onPick(key as EditorPreferenceKey, value);
    },
    [editor, saveTheme],
  );

  /**
   * PAT 를 발급한다 (`SEC-AUTH-007` AC-1 · `SEC-AUTH-006` AC-2).
   *
   * **평문을 여기 두지 않는다.** 화면에 그대로 넘겨 주고 이 자리에는
   * 아무것도 남기지 않는다 — 상태로 들면 그 값이 앱의 수명을 갖게 되고,
   * 그때 「1회 노출」이 화면 문구로만 남는다.
   *
   * 거절되면 `undefined` 다. 그러면 노출 화면이 서지 않는다.
   */
  const 토큰을발급한다 = useCallback(
    async (input: { name: string; scope: 'read-only' | 'read-write'; expiresInDays: number }) => {
      if (!allowsProtected()) return undefined;
      const issued = await issueToken(input).catch(() => undefined);
      if (issued === undefined || !allowsProtected()) return undefined;

      void queries.invalidateQueries({ queryKey: QUERY_KEYS.tokens(userId ?? '', authGeneration) });
      return { token: issued.token };
    },
    [allowsProtected, authGeneration, queries, userId],
  );

  /** PAT 를 폐기한다 (`SEC-AUTH-007` AC-2). 화면이 L2 확인을 이미 받았다. */
  const 토큰을폐기한다 = useCallback(
    async (id: string) => {
      if (!allowsProtected()) return { ok: false as const };
      try {
        await revokeToken(id);
      } catch {
        return { ok: false as const };
      }
      if (!allowsProtected()) return { ok: false as const };
      void queries.invalidateQueries({ queryKey: QUERY_KEYS.tokens(userId ?? '', authGeneration) });
      return { ok: true as const };
    },
    [allowsProtected, authGeneration, queries, userId],
  );

  /**
   * 기존 파일에 새 버전을 올린다 (`FR-SHELL-008` AC-2).
   *
   * 올린 뒤 그 문서를 무효화한다 — 열려 있는 탭이 옛 본문을 들고 있으면
   * 다음 저장이 방금 올린 것을 덮는다.
   */
  const newVersion = useCallback(
    async (node: TreeNodeView, file: File): Promise<NewVersionResult> => {
      const owner = establishedOwner.current;
      if (owner === undefined || !allowsProtected(owner)) return { status: 'unknown' };
      try {
        await uploadNewVersion(node.id, file);
      } catch (error) {
        if (!(error instanceof ApiError)) return { status: 'unknown' };
        if (error.status === 403) return { status: 'rejected', reason: 'forbidden' };
        if (error.status === 413) return { status: 'rejected', reason: 'too-large' };
        return { status: 'rejected' };
      }

      if (!allowsProtected(owner)) return { status: 'unknown' };
      const observedDocument = documents.tabs.some((tab) => tab.nodeId === node.id);
      type RefreshTarget = 'tree' | 'document';
      const refresh = async (targets: readonly RefreshTarget[]): Promise<NewVersionOutcome> => {
        if (!allowsProtected(owner)) return { status: 'refresh-failed', retryRefresh: () => refresh(targets) };
        const failed: RefreshTarget[] = [];
        for (const target of targets) {
          try {
            if (target === 'tree') {
              await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree, exact: true, refetchType: 'none' });
              await queries.fetchQuery({ queryKey: QUERY_KEYS.tree, queryFn: () => fetchTree<WorkspaceTreeView[]>() });
            } else {
              await queries.invalidateQueries({ queryKey: QUERY_KEYS.document(node.id), exact: true, refetchType: 'none' });
              await queries.fetchQuery({ queryKey: QUERY_KEYS.document(node.id), queryFn: () => loadDocument(node.id) });
            }
          } catch {
            failed.push(target);
          }
          if (!allowsProtected(owner)) return { status: 'refresh-failed', retryRefresh: () => refresh(targets) };
        }
        return failed.length === 0 ? { status: 'success' } : { status: 'refresh-failed', retryRefresh: () => refresh(failed) };
      };

      if (!observedDocument) {
        await queries.invalidateQueries({ queryKey: QUERY_KEYS.document(node.id), exact: true, refetchType: 'none' });
      }
      return { status: 'refreshing', completion: refresh(observedDocument ? ['tree', 'document'] : ['tree']) };
    },
    [allowsProtected, documents.tabs, queries],
  );

  /**
   * 떨군 파일을 올린다 (`FR-ATTACH-001`).
   *
   * 트리 드롭은 **디렉토리에 노드를 만드는** 조작이고, 편집기 붙여넣기는
   * 본문에 링크로 들어가는 첨부다 — 서버 경로가 다르다.
   *
   * 올린 뒤 트리를 무효화한다(AC-2) — 안 하면 사용자는 파일이 안 올라간
   * 것으로 읽는다. 거부됐으면 무효화하지 않는다: 바뀐 것이 없다.
   */
  const upload = useCallback(
    async (request: UploadRequest) => {
      const authOwner = establishedOwner.current;
      if (authOwner === undefined || !allowsProtected(authOwner)) return;
      const owner = request.ownerNodeId;
      const parent = request.parentId;

      const send = (file: File) => {
        if (parent !== undefined) return uploadIntoDirectory(parent, file);
        if (owner !== undefined) return uploadAttachment(owner, file);
        return undefined;
      };

      const done = await Promise.all(
        request.files.map((file) => {
          const pending = send(file);
          return pending === undefined ? false : pending.then(() => true).catch(() => false);
        }),
      );
      if (!done.some(Boolean) || !allowsProtected(authOwner)) return;

      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [allowsProtected, queries],
  );

  /**
   * 본문 표면이 알려 온 저장 상태를 탭에 반영한다.
   *
   * 탭이 그것을 알아야 **교체 판정**이 성립한다 (`FR-SHELL-012` AC-3 ·
   * AC-4) — 모르면 충돌로 멈춘 탭도 그냥 교체된다.
   */
  const noteSaveState = useCallback((nodeId: string, state: SaveState) => {
    setDocuments((was) =>
      was.tabs.some((tab) => tab.nodeId === nodeId && tab.save !== state)
        ? { ...was, tabs: was.tabs.map((tab) => (tab.nodeId === nodeId ? { ...tab, save: state } : tab)) }
        : was,
    );
  }, []);

  // 주소에 문서가 실려 들어왔으면 그것을 연다 (`FR-SHELL-006` AC-2).
  //
  // **이미 그 문서가 활성이면 아무 일도 하지 않는다.** 이 효과는 트리를
  // 다시 받을 때마다 도는데, 그때마다 열면 주소가 같은 자리에 또 쌓여
  // 뒤로 가기가 여러 번 눌러야 동작한다 (AC-4).
  const activeId = documents.activeId;
  /**
   * 주소가 가리킨 문서에 닿지 못했다 (`SEC-ACL-006` AC-6).
   *
   * **왜 닿지 못했는지는 담지 않는다.** 서버가 못 보는 노드를 트리에서
   * 빼고 원문에 404 를 주므로 화면이 받는 입력은 두 경우가 이미 같다 —
   * 여기서 사유를 되살리면 그 구분이 화면에서 다시 태어난다.
   */
  const [missingDocument, setMissingDocument] = useState(false);
  const [requestedDocumentState, setRequestedDocumentState] = useState<DocumentReadState | undefined>(undefined);
  function clearOwnerUi() {
    setDocuments({ tabs: [], activeId: null });
    setDocumentRecovery({});
    setDocumentUnavailable({});
    setOwnerRecovery([]);
    setDownloadedDrafts(new Set());
    setDraftHandoff((pending) => {
      pending?.resolve(false);
      return null;
    });
    setQuery('');
    setPendingOpen(null);
    pendingPopRestore.current = null;
    restoration.current = null;
    setOptimisticTheme(undefined);
    setThemeSaveState({ state: 'idle' });
    setSharingId(null);
    set회수주체([]);
    set시뮬주체(null);
    setSelectedWorkspaceId(undefined);
    setWorkspaceCreationStatus(undefined);
    setAuditOperation('');
    setTagScope('');
    setMissingDocument(false);
    setRequestedDocumentState(undefined);
    authBoundary.clearRegistrations();
  }
  useEffect(() => {
    const wanted = nodeIdOf(window.location.pathname);
    // 트리가 도착하기 전에는 판정하지 않는다 — 로딩 중에 「찾을 수
    // 없습니다」가 잠깐 뜨면 사용자는 멀쩡한 링크를 깨진 것으로 읽는다.
    if (wanted === null || wanted === activeId) {
      setMissingDocument(false);
      setRequestedDocumentState(undefined);
      return;
    }
    if (tree.data === undefined) {
      setMissingDocument(false);
      setRequestedDocumentState((current) => {
        if (tree.isError) return current?.state === 'error'
          ? current
          : { state: 'error', onRetry: () => { void tree.refetch(); } };
        return current?.state === 'loading' ? current : { state: 'loading' };
      });
      return;
    }

    if (documentUnavailable[wanted] === true) {
      setMissingDocument(true);
      setRequestedDocumentState(undefined);
      return;
    }

    const node = findNode(workspaces, wanted);
    setMissingDocument(node === undefined);
    setRequestedDocumentState(undefined);
    if (node !== undefined) open(node, false);
  }, [workspaces, tree.data, tree.isError, open, activeId, documentUnavailable]);

  /**
   * 뒤로·앞으로 (`FR-SHELL-006` AC-4).
   *
   * 주소만 바뀌고 화면이 그대로면 사용자는 뒤로 가기가 고장 났다고 읽는다.
   */
  useEffect(() => {
    const onPop = async () => {
      const requestedGeneration = ++popRequestGeneration.current;
      const retrying = requestedRetryPending.current;
      const wanted = nodeIdOf(window.location.pathname);
      const observed = readHistoryMark();
      const token = restoration.current;
      if (token !== null && observed?.epoch === token.epoch && observed.key === token.expectedEntryKey) {
        restoration.current = null;
        setMissingDocument(false);
        return;
      }
      if (token !== null) restoration.current = null;
      if (wanted === null) {
        requestedRetryPending.current = false;
        setDocuments((was) => ({ ...was, activeId: null }));
        setMissingDocument(false);
        setRequestedDocumentState(undefined);
        return;
      }

      const owner = establishedOwner.current;
      if (owner === undefined || !allowsProtected(owner)) return;
      const pendingRecovery = documents.tabs.some((tab) => tab.nodeId === wanted)
        ? authBoundary.quarantineNode(owner, wanted)
        : [];
      setMissingDocument(false);
      if (!retrying) setRequestedDocumentState({ state: 'loading' });
      const authoritativeTree = await fetchTree<readonly WorkspaceTreeView[]>().catch(() => undefined);
      if (requestedGeneration !== popRequestGeneration.current) {
        for (const record of pendingRecovery) authBoundary.discardRecovery(record.id, owner.userId);
        return;
      }
      if (!allowsProtected(owner)) return;
      if (authoritativeTree === undefined) {
        for (const record of pendingRecovery) authBoundary.discardRecovery(record.id, owner.userId);
        requestedRetryPending.current = false;
        setRequestedDocumentState({ state: 'error', onRetry: () => {
          if (requestedRetryPending.current) return;
          requestedRetryPending.current = true;
          setRequestedDocumentState((current) => current?.state === 'error' ? { ...current, retrying: true } : current);
          window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
        } });
        return;
      }
      requestedRetryPending.current = false;
      const node = findNode(authoritativeTree, wanted);
      if (node === undefined) {
        if (documents.tabs.some((tab) => tab.nodeId === wanted)) {
          setDocumentRecovery((was) => ({ ...was, [wanted]: pendingRecovery }));
          setDocumentUnavailable((was) => ({ ...was, [wanted]: true }));
          queries.removeQueries({ queryKey: QUERY_KEYS.document(wanted), exact: true });
          setDocuments((was) => closeTab(was, wanted));
        }
        setMissingDocument(true);
        setRequestedDocumentState(undefined);
        return;
      }
      for (const record of pendingRecovery) authBoundary.discardRecovery(record.id, owner.userId);

      const current = activeTab(documents);
      if (current !== undefined && needsConfirmBeforeReplace(current)) {
        const accepted = acceptedHistory.current;
        if (observed === null) {
          const retained = authBoundary.readNodeDraft(owner, current.nodeId);
          if (retained !== undefined) {
            queries.setQueryData<{ body: string; hash: string }>(QUERY_KEYS.document(current.nodeId), (cached) => cached === undefined
              ? cached
              : { ...cached, body: retained.text });
          }
          setDocuments((was) => openInNewTab(was, toTab(node)));
          setMissingDocument(false);
          setRequestedDocumentState(undefined);
          requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-document-header]')?.focus());
          return;
        }
        if (accepted !== null && observed !== null) {
          pendingPopRestore.current = { accepted, observed };
        }
        setPendingOpen(node);
        setRequestedDocumentState({ state: 'pending' });
        return;
      }

      // 여기서는 주소를 다시 밀지 않는다 — 브라우저가 이미 옮겨 놓았고,
      // 또 밀면 이력에 같은 자리가 두 번 쌓여 뒤로 가기가 멈춘 것처럼 된다.
      setDocuments((was) => openInActiveTab(was, toTab(node)));
      setMissingDocument(false);
      setRequestedDocumentState(undefined);
      if (observed !== null) acceptedHistory.current = observed;
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-document-header]')?.focus());
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [allowsProtected, authBoundary, documents, queries, readHistoryMark]);

  // **설치 전은 503 + 표식으로 판별한다** (`SEC-AUTH-010` AC-1).
  //
  // 상태 코드만 보면 안 된다 — 리버스 프록시·드레이닝·과부하도 503 이고,
  // 그때 설치 화면을 세우면 운영 중인 인스턴스가 잠깐 재시작하는 동안
  // 로그인한 사용자에게 「설치 토큰을 입력하세요」가 뜬다. 그것은 바로
  // 아래 주석이 401 에 대해 금지한 접기와 같은 종류다.
  if (authEnded)
    return (
      <PreAuthScreen
        screen="login"
        {...(passwordChanged
          ? { notice: '비밀번호가 변경되었습니다. 다시 로그인하세요.' }
          : authenticationEndedUnexpectedly
            ? { notice: hasQuarantinedDrafts
              ? '로그인이 해제되었습니다. 다시 로그인하세요. 편집본은 원래 계정으로 다시 로그인한 뒤 확인할 수 있습니다.'
              : '로그인이 해제되었습니다. 다시 로그인하세요.' }
            : {})}
        onLogin={signIn}
        onSignup={signUp}
        onScreen={setPreAuthScreen}
      />
    );
  if (
    session.error instanceof ApiError &&
    session.error.status === 503 &&
    session.error.detail?.state === 'uninstalled'
  )
    return <PreAuthScreen screen="install" />;
  // 401 만 익명이다. 다른 실패를 익명으로 접으면 서버가 잠깐 죽은 것과
  // 로그아웃이 구별되지 않아 사용자가 다시 로그인하게 된다.
  if (session.error instanceof ApiError && session.error.status === 401 && !hadEstablishedSession.current)
    return (
      <PreAuthScreen
        screen={preAuthScreen}
        {...(hadEstablishedSession.current
          ? { notice: '로그인이 해제되었습니다. 다시 로그인하세요.' }
          : {})}
        onLogin={signIn}
        onSignup={signUp}
        onScreen={setPreAuthScreen}
      />
    );
  if (session.isError && session.data === undefined)
    return (
      <main aria-label="애플리케이션 오류" data-app-bootstrap="error">
        <ErrorState
          label="애플리케이션 오류"
          title="애플리케이션을 불러오지 못했습니다."
          description="연결 상태를 확인한 뒤 다시 시도하세요."
          onRetry={() => { void session.refetch(); }}
        />
      </main>
    );
  // **트리가 올 때까지 셸을 세우지 않는다.** 빈 트리로 먼저 세우면 아직
  // 모르는 상태가 「접근 가능한 워크스페이스가 없다」로 그려지고
  // (`FR-AUTH-005` AC-1), 사용자는 권한을 잃었다고 읽는다.
  if (session.data === undefined) return <LoadingState label="애플리케이션 불러오는 중" data-state="loading" />;
  if (signedIn && userId === undefined && identity.isFetching) {
    return <LoadingState label="로그인 계정 확인 중" data-state="loading" />;
  }
  if (signedIn && userId === undefined && identityFailed) {
    return (
      <main aria-label="로그인 계정 확인 오류" data-identity-bootstrap="error">
        <ErrorState
          label="로그인 계정 확인 오류"
          title="로그인 계정을 확인하지 못했습니다."
          description="연결 상태를 확인한 뒤 다시 시도하세요."
          onRetry={() => { void identity.refetch(); }}
        />
      </main>
    );
  }
  if (signedIn && userId === undefined) {
    return <LoadingState label="로그인 계정 확인 중" data-state="loading" />;
  }
  if (ownerMismatch) return <LoadingState label="로그인 계정 전환 중" data-state="loading" />;

  if (scopedOwnerRecovery.length > 0 && userId !== undefined) return (
    <LocalRecoverySurface
      records={scopedOwnerRecovery}
      onResolve={(recordId) => {
        authBoundary.discardRecovery(recordId, userId);
        setOwnerRecovery(authBoundary.recoveryFor(userId));
      }}
    />
  );

  return (
    <>
    {authUncertain || authCheckBusy || authResumeAvailable ? (
      <div role="alert" data-auth-uncertainty aria-busy={authCheckBusy || undefined}>
        <strong>{authCheckBusy ? '로그인 상태를 다시 확인하는 중…' : authUncertain ? '현재 로그인 상태를 확인하지 못했습니다.' : '처리 결과를 확인하지 못했습니다.'}</strong>
        <p>편집 내용은 유지되지만 확인이 끝날 때까지 저장할 수 없습니다.</p>
        {authUncertain ? <Button disabled={authCheckBusy} onClick={() => {
          const owner = establishedOwner.current;
          const attempt = activeAuthAttempt.current;
          if (owner !== undefined && attempt !== null) void checkAuthenticationAfterAttempt(owner, attempt);
        }}>로그인 상태 다시 확인</Button> : null}
        {authResumeAvailable ? <Button onClick={() => {
          authBoundary.thaw();
          const attempt = activeAuthAttempt.current;
          if (attempt !== null) authBoundary.resume(attempt);
          if (attempt !== null) authAttemptLock.release(attempt);
          activeAuthAttempt.current = null;
          syncAuthPhase();
          setAuthResumeAvailable(false);
          setNotice(undefined);
        }}>편집 계속</Button> : null}
      </div>
    ) : null}
    <div data-protected-shell inert={draftHandoff !== null ? true : undefined}>
    <AppShell
      key={`${userId}:${authGeneration}`}
      viewer={session.data}
      fetchIndexQueue={fetchIndexQueue}
      indexQueueContextKey={`${userId ?? 'pending'}:${authGeneration}:${session.data.superuser ? 'super' : 'member'}`}
      workspaces={workspaces}
      treeState={treeState}
      documents={documents}
      missingDocument={missingDocument}
      requestedDocumentState={requestedDocumentState}
      bodies={bodies}
      hashes={hashes}
      documentReadStates={documentReadStates}
      documentRecovery={documentRecovery}
      onDiscardDocumentRecovery={(nodeId, recordId) => {
        if (userId !== undefined) authBoundary.discardRecovery(recordId, userId);
        setDocumentRecovery((was) => ({ ...was, [nodeId]: (was[nodeId] ?? []).filter((record) => record.id !== recordId) }));
      }}
      trash={trash.data ?? []}
      trashQuery={trash.isError
        ? { state: 'error', onRetry: () => void trash.refetch() }
        : trash.data === undefined
          ? { state: 'loading' }
          : { state: 'ready' }}
      trashContextKey={`${userId ?? 'anonymous'}:${authGeneration}:${trashLens.workspaceId ?? '*'}:${trashLens.scope}`}
      trashLens={trashLens}
      onTrashLens={setTrashLens}
      onTrashPurge={purgeTrash}
      onTrashRestore={restoreTrash}
      personalSettings={{
        ...editor.values,
        ...(optimisticTheme === undefined ? {} : { theme: optimisticTheme }),
      }}
      themeSaveState={themeSaveState}
      themeLoadState={themeLoadState}
      editorLoadState={editor.loadState}
      editorSaveStates={editor.saveStates}
      onPersonalSetting={pickPersonalSetting}
      tokenOwner={userId === undefined ? undefined : { userId, generation: authGeneration }}
      tokenQuery={userId === undefined || identity.isFetching || tokens.isFetching
        ? { state: 'loading' }
        : identityFailed || tokens.isError
          ? { state: 'error', onRetry: () => void (identityFailed ? identity.refetch() : tokens.refetch()) }
          : tokens.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', rows: tokens.data }}
      onIssueToken={토큰을발급한다}
      onRevokeToken={토큰을폐기한다}
      onAuthenticationLoss={() => {
        const owner = establishedOwner.current;
        if (owner !== undefined) {
          const records = authBoundary.quarantine(owner);
          if (records.length > 0) setHasQuarantinedDrafts(true);
        }
        endAuthentication(false, true);
      }}
      userRoster={principalEnabled ? users.data ?? [] : []}
      userRosterQuery={
        users.isError
          ? { state: 'error', revision: users.dataUpdatedAt, onRetry: () => void users.refetch() }
          : users.isFetching || users.data === undefined
            ? { state: 'loading', revision: users.dataUpdatedAt }
            : { state: 'ready', revision: users.dataUpdatedAt, users: users.data, onRetry: () => void users.refetch() }
      }
      principalRequestContext={{ principalId: userId ?? 'anonymous', authGeneration, queryGeneration: principalReadGeneration }}
      groupRoster={groups.data ?? []}
      onGroupRemove={dropGroup}
      onGroupAddMember={addMember}
      onRegisterUser={makeUser}
      {...(signupMode.data === undefined ? {} : { signupMode: signupMode.data.mode })}
      signupModeQuery={
        signupMode.isError
          ? { state: 'error', onRetry: () => void signupMode.refetch() }
          : signupMode.isFetching || signupMode.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', mode: signupMode.data.mode }
      }
      onApproveUser={approve}
      onReopenUser={reopen}
      onUserStatus={changeUserStatus}
      aclAudit={{
        contextKey: aclAuditContextKey,
        managedScope: managedAuditScope,
        subjects: currentRevocationSubjects,
        revocationPlan,
        simulationSubject: currentSimulationSubject,
        simulationQuery: currentSimulationSubject === null
          ? { state: 'idle' }
          : simulation.isError
            ? { state: 'error', onRetry: () => { void simulation.refetch(); } }
            : simulation.isFetching || simulation.data === undefined
              ? { state: 'loading' }
              : { state: 'ready', data: simulation.data },
        inheritanceQuery: brokenInheritance.isError
          ? { state: 'error', onRetry: () => { void brokenInheritance.refetch(); } }
          : brokenInheritance.isFetching || brokenInheritance.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', data: brokenInheritance.data },
        onRevokePick: (row) => {
          auditSelectionContext.current = managedScopeFingerprint;
          set회수주체((was) => (was.some((one) => one.id === row.id) ? was : [...was, row]));
        },
        onRevokeReplace: set회수주체,
        onRevokeRemove: (id) => set회수주체((was) => was.filter((subject) => subject.id !== id)),
        onSimulatePick: (row) => {
          auditSelectionContext.current = managedScopeFingerprint;
          set시뮬주체(row);
        },
        onPreviewRevocation: previewRevocations,
        onRevokeSubject: revokeOneSubject,
      }}
      workspaceManagement={{
        selectedId: selectedWorkspaceId,
        onSelect: setSelectedWorkspaceId,
        onRename: renameSelectedWorkspace,
        onCreate: createWorkspaceAndRefresh,
        onLoadCreationWarnings: ({ administratorId, defaultGroupLevel }) => allowsProtected()
          ? fetchGrantWarnings({ principalId: administratorId, defaultGroupLevel })
          : Promise.resolve([]),
        onLoadAdminGrantPreview: fetchWorkspaceAdminGrantPreview,
        onGrantAdministrator: grantWorkspaceAdministrator,
        onLoadAdminRevokeWarnings: (entryId) => fetchGrantWarnings({ entryId }),
        onRevokeAdministrator: async (_workspaceId, entryId) => revokeShare(entryId),
        onAdministratorsRefresh: refreshWorkspaceAdministratorReads,
        administratorMutationStatus: workspaceAdministratorMutationStatus,
        onAdministratorMutationStatus: setWorkspaceAdministratorMutationStatus,
        onRetryAdministratorRefresh: retryWorkspaceAdministratorReads,
        creationStatus: workspaceCreationStatus,
        onRetryCreationRefresh: () => { void retryWorkspaceCreationReads(); },
        administrators: selectedWorkspaceAdministrators.isError
          ? { state: 'error', onRetry: () => { void selectedWorkspaceAdministrators.refetch(); } }
          : selectedWorkspaceAdministrators.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', rows: selectedWorkspaceAdministrators.data },
        managed: workspaceList.isError
          ? { state: 'error', onRetry: () => { void workspaceList.refetch(); } }
          : workspaceList.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', rows: workspaceList.data },
        all: allWorkspaces.isError
          ? { state: 'error', onRetry: () => { void allWorkspaces.refetch(); } }
          : allWorkspaces.data === undefined
            ? { state: 'loading' }
            : { state: 'ready', rows: allWorkspaces.data },
      }}
      favorites={favorites.data ?? []}
      favoritesState={favoritesState}
      links={links.data ?? { outgoing: [], backlinks: [] }}
      linksState={linksState}
      query={query}
      onQuery={setQuery}
      onOpen={open}
      onUpload={upload}
      onCreateNote={createNote}
      onCreate={create}
      onFavorite={favorite}
      onUnfavorite={unfavorite}
      onLogout={signOut}
      onPasswordChange={changeOwnPassword}
      authHandoffOpen={draftHandoff !== null}
      onDelete={deleteNode}
      onRename={rename}
      onRelocate={relocate}
      onRelocationPreview={previewRelocation}
      relocationContextKey={`${userId ?? 'anonymous'}:${authGeneration}`}
      relocationTreeGeneration={tree.dataUpdatedAt}
      onRelocationOwnerChange={(ownerKey) => { currentRelocationOwner.current = ownerKey; }}
      relocationRefreshError={relocationRefreshError}
      onRetryRelocationRefresh={retryRelocationRefresh}
      share={share}
      onNewVersion={newVersion}
      onNoticeDismiss={() => setNotice(undefined)}
      onSaveState={noteSaveState}
      onSaved={noteSaved}
      onDocuments={setDocuments}
      registerDraft={authBoundary.register}
      beforeDraftUnmount={retireReplacedOwnerDraft}
      allowsProtected={authBoundary.allowsProtected}
      authorizationPhase={authPhase}
      authorizationEpoch={authGeneration}
      audit={auditState}
      auditOperation={auditOperation}
      onAuditOperation={setAuditOperation}
      queueState={queueState}
      auditContextKey={auditContextKey}
      {...(tags.data === undefined ? {} : { tags: tags.data })}
      tagsState={tagsState}
      tagScope={tagScope}
      onTagScope={setTagScope}
      searchResults={searchResults.data?.documents ?? []}
      searchState={searchState}
      searchAxes={searchAxes}
      onSearchAxes={pickAxes}
      {...(notice === undefined ? {} : { notice })}
      {...(pendingOpen === null
        ? {}
        : {
            confirmReplace: {
              name: pendingOpen.name,
              accept: () => {
                setDocuments((was) => openInActiveTab(was, toTab(pendingOpen)));
                setRequestedDocumentState(undefined);
                if (pendingPopRestore.current === null) pushDocumentHistory(urlForNode(pendingOpen.id));
                else acceptedHistory.current = pendingPopRestore.current.observed;
                pendingPopRestore.current = null;
                setPendingOpen(null);
              },
              cancel: () => {
                const pending = pendingPopRestore.current;
                pendingPopRestore.current = null;
                setPendingOpen(null);
                setRequestedDocumentState(undefined);
                if (pending === null) return;
                restoration.current = {
                  epoch: pending.accepted.epoch,
                  expectedEntryKey: pending.accepted.key,
                  restoreGeneration: ++restoreGeneration.current,
                };
                window.history.go(pending.accepted.index - pending.observed.index);
              },
            },
          })}
    />
    </div>
    {draftHandoff === null ? null : createPortal((
      <div ref={draftHandoffDialog} tabIndex={-1} autoFocus role="dialog" aria-modal="true" aria-label="편집 내용 보관" data-auth-draft-handoff style={{ pointerEvents: 'auto' }} onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (buttons.length === 0) return;
        const first = buttons[0]!;
        const last = buttons[buttons.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
          event.preventDefault();
          first.focus();
        }
      }}>
        <h2>편집 내용을 보관한 뒤 계속하세요.</h2>
        <p>서버에 저장되지 않은 로컬 편집본이 있습니다.</p>
        <div data-auth-draft-list>
          {draftHandoff.records.map((record, index) => (
            <div key={record.id}>
              <strong>로컬 편집본 {index + 1}</strong>
              <Button variant="secondary" onClick={() => {
                const url = URL.createObjectURL(new Blob([record.text], { type: 'text/markdown' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = `local-draft-${index + 1}.md`;
                link.click();
                URL.revokeObjectURL(url);
                setDownloadedDrafts((was) => new Set([...was, record.id]));
              }}>내려받기</Button>
            </div>
          ))}
        </div>
        <div data-auth-draft-actions>
          <Button
            disabled={draftHandoff.records.some((record) => !downloadedDrafts.has(record.id))}
            onClick={() => {
              draftHandoff.resolve(true);
              setDraftHandoff(null);
              setDownloadedDrafts(new Set());
            }}
          >파일 보관을 확인하고 계속</Button>
          <Button variant="destructive" onClick={() => {
            draftHandoff.resolve(true);
            setDraftHandoff(null);
            setDownloadedDrafts(new Set());
          }}>편집본을 버리고 계속</Button>
          <Button variant="secondary" onClick={() => {
            authBoundary.thaw();
            draftHandoff.resolve(false);
            setDraftHandoff(null);
            setDownloadedDrafts(new Set());
          }}>취소</Button>
        </div>
      </div>
    ), document.body)}
    </>
  );
}
