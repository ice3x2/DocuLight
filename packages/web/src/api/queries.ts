import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  fetchAuditLog,
  fetchBrokenInheritance,
  fetchFavorites,
  fetchRevocation,
  fetchSimulation,
  fetchWorkspaceList,
  fetchLinks,
  fetchGroupRoster,
  fetchPersonalSettings,
  fetchUserRoster,
  fetchSession,
  fetchTrash,
  fetchTree,
  loadDocument,
  type AuditViewBody,
  type ReconciliationQueueBody,
  type TagIndexBody,
  fetchTags,
  fetchReconciliationQueue,
  type BrokenInheritanceBody,
  type DocumentBody,
  type DocumentLinksBody,
  type RevocationBody,
  type SimulationBody,
  type FavoriteRow,
  type RosterGroup,
  type RosterUser,
  type SessionBody,
  type WorkspaceListRow,
} from './client.js';
import type { TrashRowView } from '../trash/TrashPanel.js';
import type { WorkspaceTreeView } from '../tree/tree-contract.js';

/**
 * 서버 상태 (`CON-ARCH-004` AC-5).
 *
 * `@tanstack/react-query` 를 쓰는 이유는 조항이 그것을 지목하기 때문이며,
 * 부수로 「서버가 가진 것」과 「화면이 가진 것」의 경계가 강제된다 —
 * 서버에서 온 값을 컴포넌트 상태로 복사하지 않게 되고, 그래야 같은 사실이
 * 두 곳에 살지 않는다.
 *
 * 키를 여기 모으는 것은 무효화가 그 키를 알아야 하기 때문이다. 호출부마다
 * 키를 적으면 한 곳만 바뀌어 갱신이 조용히 멈춘다.
 */
export const QUERY_KEYS = {
  session: ['session'] as const,
  tree: ['tree'] as const,
  favorites: ['favorites'] as const,
  trash: (scope: 'mine' | 'all', workspaceId?: string) => ['trash', scope, workspaceId] as const,
  links: (nodeId: string) => ['links', nodeId] as const,
  personalSettings: ['personal-settings'] as const,
  userRoster: ['roster', 'users'] as const,
  groupRoster: ['roster', 'groups'] as const,
  document: (nodeId: string) => ['document', nodeId] as const,
  workspaces: ['workspaces'] as const,
  brokenInheritance: ['broken-inheritance'] as const,
  auditLog: (operation: string) => ['audit-log', operation] as const,
  reconciliationQueue: ['reconciliation-queue'] as const,
  tags: (workspaceId: string) => ['tags', workspaceId] as const,
  revocation: (principalId: string) => ['revocation', principalId] as const,
  simulation: (subjectId: string) => ['simulation', subjectId] as const,
};

export const useSession = (): UseQueryResult<SessionBody> =>
  useQuery({
    queryKey: QUERY_KEYS.session,
    queryFn: fetchSession,
    // 401 은 다시 물어도 401 이다 — 되풀이하면 로그인 화면이 뜨기까지
    // 사용자가 빈 화면을 본다.
    retry: false,
  });

export const useTree = (enabled: boolean): UseQueryResult<WorkspaceTreeView[]> =>
  useQuery({ queryKey: QUERY_KEYS.tree, queryFn: () => fetchTree<WorkspaceTreeView[]>(), enabled });

/** 이 사용자의 개인 설정. 로그인 전에는 읽을 행이 정해지지 않는다. */
export const usePersonalSettings = (
  enabled: boolean,
): UseQueryResult<Record<string, string>> =>
  useQuery({ queryKey: QUERY_KEYS.personalSettings, queryFn: fetchPersonalSettings, enabled });

/** 슈퍼유저 전용 명부 (`R163`). 슈퍼유저가 아니면 서버가 404 로 답한다. */
export const useUserRoster = (enabled: boolean): UseQueryResult<RosterUser[]> =>
  useQuery({ queryKey: QUERY_KEYS.userRoster, queryFn: fetchUserRoster, enabled, retry: false });

export const useGroupRoster = (enabled: boolean): UseQueryResult<RosterGroup[]> =>
  useQuery({ queryKey: QUERY_KEYS.groupRoster, queryFn: fetchGroupRoster, enabled, retry: false });

export const useFavorites = (enabled: boolean): UseQueryResult<FavoriteRow[]> =>
  useQuery({ queryKey: QUERY_KEYS.favorites, queryFn: fetchFavorites, enabled });

export const useTrash = (
  where: { scope: 'mine' | 'all'; workspaceId?: string },
  enabled: boolean,
): UseQueryResult<TrashRowView[]> =>
  useQuery({
    queryKey: QUERY_KEYS.trash(where.scope, where.workspaceId),
    queryFn: () => fetchTrash<TrashRowView[]>(where),
    enabled,
  });

/**
 * 활성 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3).
 *
 * **연 문서가 없으면 묻지 않는다** — 대상 없는 질의는 서버에서 404 로
 * 끝나고, 그 404 가 로그를 채워 진짜 문제를 가린다.
 */
export const useLinks = (nodeId: string | null): UseQueryResult<DocumentLinksBody> =>
  useQuery({
    queryKey: QUERY_KEYS.links(nodeId ?? ''),
    queryFn: () => fetchLinks(nodeId!),
    enabled: nodeId !== null,
  });

/**
 * 한 문서의 본문과 기준 해시.
 *
 * 둘을 **한 질의**로 든다 — 저장 요청이 해시를 실어야 충돌이 판정되고,
 * 따로 들면 그 판정이 남의 본문을 근거로 하게 된다.
 */
export const useDocument = (nodeId: string): UseQueryResult<DocumentBody> =>
  useQuery({
    queryKey: QUERY_KEYS.document(nodeId),
    queryFn: () => loadDocument(nodeId),
  });

/**
 * 권한 감사 구역이 쓰는 질의들 (`FR-ACL-003`~`FR-ACL-005`).
 *
 * 셋 다 **관리 범위로 잘린 것을 서버가 준다** — 화면이 다시 거르지
 * 않는다. `enabled` 로 막는 것은 인가가 아니라 헛질의를 줄이는 것뿐이다.
 */
export const useWorkspaceList = (
  enabled: boolean,
): UseQueryResult<WorkspaceListRow[]> =>
  useQuery({ queryKey: QUERY_KEYS.workspaces, queryFn: fetchWorkspaceList, enabled, retry: false });

export const useBrokenInheritance = (enabled: boolean): UseQueryResult<BrokenInheritanceBody> =>
  useQuery({
    queryKey: QUERY_KEYS.brokenInheritance,
    queryFn: fetchBrokenInheritance,
    enabled,
    retry: false,
  });

/** 주체를 고르기 전에는 물을 것이 없다 — 그래서 `null` 이면 서지 않는다. */
export const useRevocation = (principalId: string | null): UseQueryResult<RevocationBody> =>
  useQuery({
    queryKey: QUERY_KEYS.revocation(principalId ?? ''),
    queryFn: () => fetchRevocation(principalId!),
    enabled: principalId !== null,
    retry: false,
  });

export const useSimulation = (subjectId: string | null): UseQueryResult<SimulationBody> =>
  useQuery({
    queryKey: QUERY_KEYS.simulation(subjectId ?? ''),
    queryFn: () => fetchSimulation(subjectId!),
    enabled: subjectId !== null,
    retry: false,
  });

/** 감사 로그 (`SEC-AUDIT-010`). 관리 범위가 없으면 서버가 404 로 답한다. */
export const useAuditLog = (
  enabled: boolean,
  /** 조작 필터. 빈 문자열이 「전체」다 — 질의 키의 일부라 바뀌면 다시 받는다. */
  operation = '',
): UseQueryResult<AuditViewBody> =>
  useQuery({
    queryKey: QUERY_KEYS.auditLog(operation),
    queryFn: () => fetchAuditLog(operation),
    enabled,
    retry: false,
  });

/**
 * 태그 색인 (`FR-SHELL-009`).
 *
 * 범위가 질의 키의 일부라, 바뀌면 다시 받는 일이 저절로 일어난다. 필터는
 * 서버가 조회 시점에 걸므로(`SEC-WORKSPACE-004` AC-6) 오래 들고 있지 않는다.
 */
export const useTags = (enabled: boolean, workspaceId = ''): UseQueryResult<TagIndexBody> =>
  useQuery({
    queryKey: QUERY_KEYS.tags(workspaceId),
    queryFn: () => fetchTags(workspaceId),
    enabled,
    retry: false,
  });

/**
 * 재조정 대기열 (`SEC-AUDIT-007` · `IR-AUDIT-002`).
 *
 * 감사 로그와 **같은 조건**으로 켠다 — 자격 판정이 서버에서 하나이므로
 * (`SEC-AUDIT-007` AC-6) 화면에서 조건을 따로 적으면 그 둘이 갈린다.
 */
export const useReconciliationQueue = (
  enabled: boolean,
): UseQueryResult<ReconciliationQueueBody> =>
  useQuery({
    queryKey: QUERY_KEYS.reconciliationQueue,
    queryFn: fetchReconciliationQueue,
    enabled,
    retry: false,
  });
