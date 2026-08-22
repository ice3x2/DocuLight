import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  fetchFavorites,
  fetchLinks,
  fetchSession,
  fetchTrash,
  fetchTree,
  loadDocument,
  type DocumentBody,
  type DocumentLinksBody,
  type FavoriteRow,
  type SessionBody,
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
  document: (nodeId: string) => ['document', nodeId] as const,
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
