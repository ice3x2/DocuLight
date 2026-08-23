import type { LinkRowView } from '../links/LinkPanel.js';

/**
 * 서버와의 왕복 (`FR-WORKSPACE-003` · `FR-STORAGE-001` · `FR-SHELL-007` ·
 * `SEC-ATTACH-002`).
 *
 * **화면은 여기서 온 것을 그대로 그린다.** 서버가 이미 걸렀으므로 다시
 * 거르지 않는다 — 두 곳이 거르면 한쪽만 규칙이 바뀐다.
 *
 * 예외는 **신뢰 경계 양쪽이 함께 막아야 하는 것** 하나뿐이다 — 주체 검색
 * 결과 상한(`SEC-PRINCIPAL-003` AC-3)은 `PrincipalPicker` 도 자른다.
 * 엔드포인트는 화면 없이도 부를 수 있어 서버가 정본이고, 화면 쪽은 그리는
 * 줄 수를 막는다. 이 예외를 다른 규칙으로 넓히지 마라.
 *
 * 거절을 **상태 코드로 구별해서** 올린다. 404·403·409·413 이 화면에서
 * 각각 다르게 다뤄져야 하기 때문이다 — 하나로 접으면 충돌이 권한 거부로
 * 보이고, 자동 저장이 재개될 수 없는 상태에서 재개된다.
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** 충돌(409) 일 때 서버가 함께 준 현재 본문. */
    readonly current?: string,
  ) {
    super(`api ${status}`);
    this.name = 'ApiError';
  }
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // 서버가 HTML 을 돌려주는 경우(라우트 누락·프록시 오설정)에 파싱에서
    // 터지면 진짜 원인인 상태 코드가 묻힌다.
    return undefined;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    // 세션 쿠키가 실려야 한다 — 같은 오리진이라 기본값으로도 실리지만,
    // 그 사실이 배포 구성에 달려 있으면 안 된다.
    credentials: 'same-origin',
    ...init,
  });

  if (!response.ok) {
    const failure = (await bodyOf(response)) as { current?: string } | undefined;
    throw new ApiError(response.status, failure?.current);
  }

  return (await bodyOf(response)) as T;
}

export interface SessionBody {
  superuser: boolean;
  workspaceCount: number;
  adminWorkspaceCount: number;
}

export const fetchSession = () => call<SessionBody>('/session');

export const fetchTree = <T>() => call<T>('/tree');

/** 문서 본문과 그 **기준 해시**. 저장 요청이 이 해시를 싣는다. */
export interface DocumentBody {
  body: string;
  hash: string;
}

export const loadDocument = (nodeId: string) =>
  call<DocumentBody>(`/documents/${encodeURIComponent(nodeId)}`);

export const openEditSession = async (nodeId: string) =>
  (await call<{ session: string }>(`/documents/${encodeURIComponent(nodeId)}/session`, { method: 'POST' }))
    .session;

export const saveBody = (
  nodeId: string,
  input: { body: string; baseHash: string; session?: string; forceSnapshot?: boolean },
) =>
  call<{ hash: string }>(`/documents/${encodeURIComponent(nodeId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

export function uploadAttachment(nodeId: string, file: File) {
  const form = new FormData();
  form.append('file', file);

  // multipart 로 보낸다 — JSON 에 실으면 바이너리가 base64 로 부풀어
  // 크기 상한이 실제 파일 크기와 갈린다.
  return call<{ hash: string; link: string; limitBytes: number }>(
    `/documents/${encodeURIComponent(nodeId)}/attachments`,
    { method: 'POST', body: form },
  );
}

export const fetchTrash = <T>(where: { scope?: 'mine' | 'all'; workspaceId?: string } = {}) => {
  const query = new URLSearchParams();
  if (where.scope !== undefined) query.set('scope', where.scope);
  if (where.workspaceId !== undefined) query.set('workspaceId', where.workspaceId);

  const suffix = query.toString();
  return call<T>(`/trash${suffix === '' ? '' : `?${suffix}`}`);
};

export const moveNodeToTrash = (nodeId: string) =>
  call<void>(`/nodes/${encodeURIComponent(nodeId)}`, { method: 'DELETE' });

export const purgeFromTrash = (nodeId: string) =>
  call<void>(`/trash/${encodeURIComponent(nodeId)}`, { method: 'DELETE' });

/** 휴지통에서 되돌린다 (`FR-SHELL-007`). 영구 삭제와 필요 권한이 다르다. */
export const restoreFromTrash = (nodeId: string) =>
  call<void>(`/trash/${encodeURIComponent(nodeId)}/restore`, { method: 'POST' });

/** 새 노드를 만든다 (`FR-SHELL-003` AC-1). */
export const createNode = (input: {
  workspaceId: string;
  parentId: string | null;
  kind: 'file' | 'directory';
  name: string;
}) =>
  call<{ id: string; name: string; notice?: string }>('/nodes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

/**
 * 디렉토리에 파일을 올린다 (`FR-ATTACH-001`).
 *
 * 문서 첨부와 **다른 조작**이다 — 그쪽은 본문 안에 링크로 들어가는
 * 자원이고 이쪽은 트리에 서는 노드다.
 */
export function uploadIntoDirectory(parentId: string, file: File) {
  const form = new FormData();
  form.append('file', file);

  return call<{ id: string; name: string; notice?: string }>(
    `/nodes/${encodeURIComponent(parentId)}/uploads`,
    { method: 'POST', body: form },
  );
}

/**
 * 이 문서의 링크 양쪽 (`CON-EDITOR-002` AC-2 · AC-3).
 *
 * 한 번에 받는다 — 나눠 받으면 두 응답 사이에 본문이 바뀌었을 때 두 목록이
 * 서로 다른 시점을 보인다.
 */
export interface DocumentLinksBody {
  outgoing: LinkRowView[];
  backlinks: LinkRowView[];
}

/**
 * 검색 결과에 실려 오는 계정 상태 (`SEC-PRINCIPAL-002`).
 *
 * `rejected` 가 **이 union 에 없다**. 서버가 빼고 주므로 (AC-3) 여기에
 * 두면 화면이 영영 그리지 않을 갈래를 하나 떠안게 되고, 그 갈래를 채우는
 * 순간 규칙이 두 곳으로 갈린다.
 */
export type PrincipalStatus = 'active' | 'pending' | 'suspended';

/** 사용자 또는 그룹 하나 (`CON-ARCH-004` AC-4). 권한은 주체에 붙지 종류에 붙지 않는다. */
export interface PrincipalRow {
  id: string;
  name: string;
  kind: 'user' | 'group';
  status: PrincipalStatus;
  /**
   * 시스템 그룹인가 (`FR-PRINCIPAL-010` AC-1 · `FR-CONFIRM-020` AC-3).
   *
   * **서버가 판정해 보낸다** — 화면이 ID 로 가리면 시스템 그룹의 정의가 두
   * 곳에 살게 되고, 그룹이 하나 늘 때 한쪽만 바뀐다. 후보에서 빼는 값이
   * 아니라 안내를 붙이는 값이다.
   */
  system: boolean;
}

/**
 * 이 사용자의 개인 설정 (`DR-SHELL-002` · `IR-SHELL-004`).
 *
 * 세 값을 한 번에 받는다 — 항목마다 왕복하면 그 사이에 하나만 바뀐 상태를
 * 그리게 된다.
 */
export const fetchPersonalSettings = () =>
  call<Record<string, string>>('/personal-settings');

export const savePersonalSetting = (key: string, value: string) =>
  call<void>('/personal-settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  });

/**
 * 주체 검색의 **부여 대상** (`R162`).
 *
 * 선택 인자가 아니다 — 빠뜨린 호출이 명부를 열지 않도록 대상을 반드시
 * 실어야 한다. 서버는 스코프가 없거나 자격이 없으면 404 로 답한다.
 */
export type PrincipalScope = `node:${string}` | `workspace:${string}` | `group:${string}`;

export const fetchPrincipals = (query: string, scope: PrincipalScope) =>
  call<PrincipalRow[]>(
    `/principals?q=${encodeURIComponent(query)}&for=${encodeURIComponent(scope)}`,
  );

/** 위키링크 자동완성 후보 (`CON-EDITOR-002` AC-1). 거르는 일은 서버가 한다. */
/**
 * 슈퍼유저 전용 명부의 계정 상태 (`FR-PRINCIPAL-009`).
 *
 * `PrincipalStatus` 와 **다른 타입이다** — 이쪽은 `rejected` 를 담는다.
 * 하나로 합치면 주체 검색 결과에도 그 갈래가 생기고, 그 갈래를 채우는
 * 순간 `SEC-PRINCIPAL-002` AC-3 이 깨진다.
 */
export type RosterUserStatus = 'active' | 'pending' | 'suspended' | 'rejected';

export interface RosterUser {
  id: string;
  name: string;
  status: RosterUserStatus;
}

export interface RosterGroup {
  id: string;
  name: string;
  system: boolean;
  members: RosterUser[];
}

export const fetchUserRoster = () => call<RosterUser[]>('/roster/users');

export const fetchGroupRoster = () => call<RosterGroup[]>('/roster/groups');

export const removeGroup = (groupId: string) =>
  call<void>(`/roster/groups/${encodeURIComponent(groupId)}`, { method: 'DELETE' });

/**
 * 공유 모달이 그리는 것 (`IR-ACL-002`).
 *
 * `rows` 가 `null` 인 것이 「목록을 볼 자격이 없다」다 (`SEC-ACL-015`
 * AC-1). 화면이 그것을 부분 목록으로 채우지 않는다 (AC-6).
 */
export interface ShareRow {
  entryId: string | null;
  principalId: string;
  principalName: string;
  principalKind: 'user' | 'group';
  level: 'view' | 'edit' | 'admin';
  inherited: boolean;
  source: string | null;
}

export interface ShareViewBody {
  metrics: { reachable: number; viaAcl: number };
  rows: ShareRow[] | null;
  level: 'view' | 'edit' | 'admin';
  /** 워크스페이스는 상속의 시작점이라 끊을 상위가 없다 (`FR-CONFIRM-015` AC-5). */
  nodeKind: 'file' | 'directory' | 'workspace';
  inheritsAcl: boolean;
  /** 여기서 준 부여가 닿는 하위 노드 수. 상속 끊기의 타이핑 토큰이기도 하다. */
  reached: number;
}

export const breakInheritance = (nodeId: string) =>
  call<void>(`/nodes/${encodeURIComponent(nodeId)}/break-inheritance`, { method: 'POST' });

export const inheritFromParent = (nodeId: string) =>
  call<void>(`/nodes/${encodeURIComponent(nodeId)}/inherit-from-parent`, { method: 'POST' });

export const fetchShareView = (nodeId: string) =>
  call<ShareViewBody>(`/nodes/${encodeURIComponent(nodeId)}/share`);

export const grantShare = (nodeId: string, principalId: string, level: 'view' | 'edit') =>
  call<void>(`/nodes/${encodeURIComponent(nodeId)}/share`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ principalId, level }),
  });

export const revokeShare = (entryId: string) =>
  call<void>(`/acl-entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' });

/**
 * 오프보딩 카드 (`FR-PRINCIPAL-003` · `CON-PRINCIPAL-004`).
 *
 * 완료 여부는 **서버가 파생한 값**이다 — 저장된 진행 상태가 아니다.
 */
export interface OffboardingStepBody {
  id: 'suspend' | 'tokens' | 'memberships' | 'acl';
  done: boolean;
  remaining?: number;
  /**
   * 멤버십 단계에만 있는 값 — 제거될 그룹의 이름 전부 (`FR-CONFIRM-009`
   * AC-2). 개수가 아니라 이름인 이유는 카드가 진행 상태를 저장하지 않아
   * 실행 뒤에는 복원할 정보가 남지 않기 때문이다.
   */
  groups?: string[];
}

export interface OffboardingCardBody {
  principalId: string;
  principalName: string;
  steps: OffboardingStepBody[];
}

export const fetchOffboarding = (principalId: string) =>
  call<OffboardingCardBody>(`/principals/${encodeURIComponent(principalId)}/offboarding`);

export const fetchWikiTargets = (query: string) =>
  call<{ target: string; label: string; detail: string }[]>(
    `/wiki-targets?q=${encodeURIComponent(query)}`,
  );

export const fetchLinks = (nodeId: string) =>
  call<DocumentLinksBody>(`/documents/${encodeURIComponent(nodeId)}/links`);

/** 즐겨찾기 한 줄 (`FR-SHELL-001` AC-3 · AC-4). 문서와 디렉토리가 같은 목록에 든다. */
export interface FavoriteRow {
  nodeId: string;
  name: string;
  kind: 'file' | 'directory';
  workspaceName: string;
}

export const fetchFavorites = () => call<FavoriteRow[]>('/favorites');

export const addFavorite = (nodeId: string) =>
  call<void>('/favorites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nodeId }),
  });

/**
 * 기존 파일을 덮어쓴다 (`FR-SHELL-008` AC-2).
 *
 * 올리기와 **다른 자리**다 — 그쪽은 노드를 만들고 이름이 겹치면 접미사를
 * 붙인다. 덮어쓰기의 경로는 이것 하나여야 그 의도가 명시적으로만 표현된다.
 */
export function uploadNewVersion(nodeId: string, file: File) {
  const form = new FormData();
  form.append('file', file);

  return call<void>(`/nodes/${encodeURIComponent(nodeId)}/new-version`, {
    method: 'POST',
    body: form,
  });
}

/** 버전 목록 한 줄 (`IR-STORAGE-001` AC-1). 실체 경로는 오지 않는다. */
export interface VersionRow {
  seq: number;
  createdAt: string;
  /** 그 버전을 만든 주체 — 「누가」가 없으면 어느 것을 고를지 알 수 없다. */
  author: string;
}

export const listVersions = (nodeId: string) =>
  call<VersionRow[]>(`/documents/${encodeURIComponent(nodeId)}/versions`);

export const loadVersion = (nodeId: string, seq: number) =>
  call<{ seq: number; body: string }>(`/documents/${encodeURIComponent(nodeId)}/versions/${seq}`);

export const restoreVersion = (nodeId: string, seq: number) =>
  call<void>(`/documents/${encodeURIComponent(nodeId)}/versions/${seq}/restore`, { method: 'POST' });

/** 런타임 설정 (`DR-SHELL-001`). 슈퍼유저만 읽고 쓴다. */
export const loadSettings = () => call<Record<string, string>>('/settings');

export const saveSettings = (patch: Record<string, string>) =>
  call<void>('/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });

/**
 * 권한 감사 구역이 부르는 것들 (`FR-ACL-003`~`FR-ACL-006` · `IR-ACL-001`).
 *
 * **복사 프리뷰의 문이 따로 없다.** 복사본의 접근자는 목적지 상속에서
 * 파생되므로 목적지의 접근자가 곧 그 답이다 (`FR-ACL-002`) — 문을 따로
 * 내면 같은 목적지가 화면마다 다른 수를 보인다.
 */
export interface AccessorReportBody {
  metrics: { reachable: number; viaAcl: number };
  /** `null` 이 「명단을 볼 자격이 없다」다 (`SEC-ACL-015` AC-1). */
  roster: string[] | null;
}

/**
 * 볼 수 있는 워크스페이스와 그 관리 상태 (`FR-PRINCIPAL-006`).
 *
 * `adminless` 를 서버가 판정해 보낸다 — 화면이 접근자를 세면 슈퍼유저의
 * 상방 게이트가 「관리자 있음」으로 잘못 세어진다.
 */
export interface WorkspaceListRow {
  id: string;
  name: string;
  adminless: boolean;
}

export const fetchWorkspaceList = () => call<WorkspaceListRow[]>('/workspaces');

export const fetchAccessors = (nodeId: string) =>
  call<AccessorReportBody>(`/nodes/${encodeURIComponent(nodeId)}/accessors`);

export interface MovePreviewBody {
  before: number;
  after: number;
}

/** 목적지를 비우면 워크스페이스 루트로 옮기는 것이다. */
export const fetchMovePreview = (nodeId: string, destinationId: string | null) => {
  const query = destinationId === null ? '' : `?destinationId=${encodeURIComponent(destinationId)}`;
  return call<MovePreviewBody>(`/nodes/${encodeURIComponent(nodeId)}/move-preview${query}`);
};

export type RevocationScope = 'instance' | 'managed-workspaces';

export interface RevocationRow {
  entryId: string;
  workspaceId: string;
  workspaceName: string;
  /** 워크스페이스 자체에 걸린 항목이면 `null` 이다. */
  path: string | null;
  level: 'view' | 'edit' | 'admin';
  grantedBy: string | null;
  grantedAt: string;
}

export interface RevocationBody {
  scope: RevocationScope;
  rows: RevocationRow[];
}

export const fetchRevocation = (principalId: string) =>
  call<RevocationBody>(`/principals/${encodeURIComponent(principalId)}/revocation`);

export const revokeAllFor = (principalId: string) =>
  call<RevocationBody>(`/principals/${encodeURIComponent(principalId)}/revocation`, { method: 'POST' });

export interface SimulatedNodeBody {
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  path: string;
  level: 'view' | 'edit' | 'admin' | null;
  source: 'direct' | 'inherited' | null;
}

export interface SimulationBody {
  subjectId: string;
  nodes: SimulatedNodeBody[];
}

export const fetchSimulation = (subjectId: string) =>
  call<SimulationBody>(`/simulation?subjectId=${encodeURIComponent(subjectId)}`);

export interface BrokenInheritanceRowBody {
  nodeId: string;
  workspaceId: string;
  workspaceName: string;
  path: string;
  /** ACL·상속으로만 닿는 사람 수 — 상방 게이트는 빠진다 (`IR-ACL-001` AC-2). */
  aclAccessors: number;
}

export interface BrokenInheritanceBody {
  rows: BrokenInheritanceRowBody[];
}

export const fetchBrokenInheritance = () => call<BrokenInheritanceBody>('/broken-inheritance');

export const restoreInheritance = (nodeId: string) =>
  call<void>(`/nodes/${encodeURIComponent(nodeId)}/restore-inheritance`, { method: 'POST' });

export const addGroupMember = (groupId: string, userId: string) =>
  call<void>(`/roster/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId }),
  });

/**
 * 감사 로그 한 줄 (`R84` · `SEC-AUDIT-008`).
 *
 * **원시 노드 ID 가 오지 않는다.** 열람 워크스페이스 안이면 경로로, 밖이면
 * 고정 문구로 서버가 이미 풀어 준다 — 화면이 가리면 API 를 직접 부르는
 * 쪽에 그대로 나간다.
 */
export interface AuditRowBody {
  id: string;
  occurredAt: string;
  operation: string;
  actor: string;
  target: string | null;
  counterpart: string | null;
  targetRole?: 'origin' | 'copy';
  subject?: string;
  level?: string;
  beforeValue?: string;
  afterValue?: string;
}

/**
 * 한 번의 조작에서 나온 행들 (`IR-AUDIT-003`).
 *
 * 묶음 키가 없다 — 표시 산물이지 기록이 아니므로 응답에 실리지 않고
 * (AC-6) 그것으로 거르는 필터도 없다 (AC-7).
 */
export interface AuditGroupBody {
  operation: string;
  actor: string;
  occurredAt: string;
  rows: AuditRowBody[];
}

export interface AuditViewBody {
  groups: AuditGroupBody[];
  /** 조작 필터의 선택지. 실제 기록 값의 distinct 집합이다. */
  operations: string[];
}

export const fetchAuditLog = (operation?: string) =>
  call<AuditViewBody>(
    operation === undefined || operation === ''
      ? '/audit-log'
      : `/audit-log?operation=${encodeURIComponent(operation)}`,
  );

/**
 * 재조정 대기열 한 줄 (`SEC-AUDIT-007`).
 *
 * **워크스페이스 칸이 없다** (AC-2) — 스코프는 참조 감사 행에서 파생하며,
 * 응답에 실으면 그 값이 곧 두 번째 정본이 된다.
 */
export interface QueueItemBody {
  id: string;
  type: string;
}

export interface ReconciliationQueueBody {
  items: QueueItemBody[];
}

/** 검색 결과의 일치 지점 하나 (`FR-SHELL-013` AC-9). */
export interface SearchExcerptBody {
  axis: 'name' | 'body' | 'tag' | 'attachment';
  text: string;
}

/** 결과의 한 문서 — 머리행 하나에 발췌가 쌓인다 (AC-10). */
export interface SearchDocumentBody {
  nodeId: string;
  name: string;
  workspaceName: string;
  excerpts: SearchExcerptBody[];
}

/** 거르기 전 개수나 분모가 없다 (AC-11). */
export interface SearchResultBody {
  documents: SearchDocumentBody[];
}

export const fetchSearch = (query: string, axes: readonly string[]) =>
  call<SearchResultBody>(
    `/search?q=${encodeURIComponent(query)}&axes=${encodeURIComponent(axes.join(','))}`,
  );

/** 태그 색인의 한 줄 (`FR-SHELL-009`). 문서 목록은 여기 없다. */
export interface TagRowBody {
  name: string;
  documents: number;
}

export interface TagIndexBody {
  tags: TagRowBody[];
  /** 개수의 기준. 언제나 같은 값이라 화면이 짓지 않는다. */
  basis: string;
}

export const fetchTags = (workspaceId?: string) =>
  call<TagIndexBody>(
    workspaceId === undefined || workspaceId === ''
      ? '/tags'
      : `/tags?workspaceId=${encodeURIComponent(workspaceId)}`,
  );

export const fetchReconciliationQueue = () =>
  call<ReconciliationQueueBody>('/reconciliation-queue');
