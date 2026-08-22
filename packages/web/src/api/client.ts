import type { LinkRowView } from '../links/LinkPanel.js';

/**
 * 서버와의 왕복 (`FR-WORKSPACE-003` · `FR-STORAGE-001` · `FR-SHELL-007` ·
 * `SEC-ATTACH-002`).
 *
 * **화면은 여기서 온 것을 그대로 그린다.** 서버가 이미 걸렀으므로 다시
 * 거르지 않는다 — 두 곳이 거르면 한쪽만 규칙이 바뀐다.
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

/** 사용자 또는 그룹 하나 (`CON-ARCH-004` AC-4). 권한은 주체에 붙지 종류에 붙지 않는다. */
export interface PrincipalRow {
  id: string;
  name: string;
  kind: 'user' | 'group';
}

export const fetchPrincipals = (query: string) =>
  call<PrincipalRow[]>(`/principals?q=${encodeURIComponent(query)}`);

/** 위키링크 자동완성 후보 (`CON-EDITOR-002` AC-1). 거르는 일은 서버가 한다. */
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
