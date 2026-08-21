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

export const loadDocument = (nodeId: string) =>
  call<{ body: string; hash: string }>(`/documents/${encodeURIComponent(nodeId)}`);

export const openEditSession = async (nodeId: string) =>
  (await call<{ session: string }>(`/documents/${encodeURIComponent(nodeId)}/session`, { method: 'POST' }))
    .session;

export const saveBody = (
  nodeId: string,
  input: { body: string; baseHash: string; session?: string },
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
