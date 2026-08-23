import { QueryClient, QueryClientProvider, useQueries, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  addFavorite,
  removeGroup,
  savePersonalSetting,
  createNode,
  loadDocument,
  uploadAttachment,
  uploadIntoDirectory,
  purgeFromTrash,
  restoreFromTrash,
  uploadNewVersion,
  addGroupMember,
  registerUser,
  restoreInheritance,
  revokeAllFor,
  type PrincipalRow,
} from './api/client.js';
import {
  QUERY_KEYS,
  useAuditLog,
  useReconciliationQueue,
  useTags,
  useSearch,
  useBrokenInheritance,
  useFavorites,
  useGroupRoster,
  usePersonalSettings,
  useRevocation,
  useSimulation,
  useUserRoster,
  useLinks,
  useSession,
  useTrash,
  useTree,
  useWorkspaceList,
} from './api/queries.js';
import { axesFrom, axesTo, readAxes, writeAxes, type SearchAxis } from './search/search-axes.js';
import type { UploadRequest } from './attachment/upload-contract.js';
import { PreAuthScreen } from './auth/PreAuthScreen.js';
import { AppShell } from './shell/AppShell.js';
import {
  activeTab,
  needsConfirmBeforeReplace,
  openInActiveTab,
  openInNewTab,
  type TabState,
} from './document/tab-state.js';
import { nodeIdOf, urlForNode } from './routing/deep-link.js';
import type { SaveState } from './document/tab-state.js';
import type { TrashLens } from './trash/TrashPanel.js';
import type { WorkspaceTreeView, TreeNodeView } from './tree/tree-contract.js';

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
export function App() {
  // 마운트마다 새로 만든다 — 앱이 두 번 서는 자리(시험)가 앞의 캐시를
  // 물려받으면 앞 시험의 응답이 뒤 시험의 첫 화면이 된다.
  const [client] = useState(newQueryClient);

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
function AppBody() {
  const queries = useQueryClient();
  const session = useSession();
  const signedIn = session.data !== undefined;

  const tree = useTree(signedIn);
  const workspaces: readonly WorkspaceTreeView[] = tree.data ?? [];

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

  // 휴지통은 전 워크스페이스 통합이라 트리와 별개로 받는다
  // (`FR-SHELL-007` AC-3). 실패해도 셸은 서야 한다 — 휴지통 하나가 안
  // 온다고 앱을 못 쓰게 만들 이유가 없다.
  const trash = useTrash(trashLens, signedIn);
  const favorites = useFavorites(signedIn);
  const personal = usePersonalSettings(signedIn);
  // 슈퍼유저가 아니면 서버가 404 로 답한다 — 화면이 다시 판정하지 않는다.
  const users = useUserRoster(signedIn && session.data?.superuser === true);
  const groups = useGroupRoster(signedIn && session.data?.superuser === true);
  const links = useLinks(documents.activeId);

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
    })),
  });

  const bodies: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  documents.tabs.forEach((tab, index) => {
    const got = bodyQueries[index]?.data;
    // 못 받은 자리는 **비워 둔다**. 빈 문자열을 넣으면 사용자가 그 위에
    // 쓰기 시작하고, 저장이 남의 본문을 지운다.
    if (got === undefined) return;
    bodies[tab.nodeId] = got.body;
    hashes[tab.nodeId] = got.hash;
  });

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
      let blocked = false;

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
      if (window.location.pathname !== url) window.history.pushState(null, '', url);
    },
    [],
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
  const makeUser = useCallback(
    async (input: { name: string; password: string }) => {
      await registerUser(input).catch(() => undefined);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.userRoster });
    },
    [queries],
  );

  const afterTrashAction = useCallback(async () => {
    await queries.invalidateQueries({ queryKey: ['trash'] });
    await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
  }, [queries]);

  const purgeTrash = useCallback(
    async (nodeId: string) => {
      await purgeFromTrash(nodeId).catch(() => undefined);
      await afterTrashAction();
    },
    [afterTrashAction],
  );

  const restoreTrash = useCallback(
    async (nodeId: string) => {
      await restoreFromTrash(nodeId).catch(() => undefined);
      await afterTrashAction();
    },
    [afterTrashAction],
  );

  const noteSaved = useCallback(
    (nodeId: string, savedBody: string, hash: string) => {
      queries.setQueryData(QUERY_KEYS.document(nodeId), { body: savedBody, hash });
    },
    [queries],
  );

  /**
   * 새 문서를 만든다 (`FR-SHELL-003` AC-1).
   *
   * 첫 워크스페이스의 루트에 만든다 — 어디에 만들지 먼저 고르게 하면 조작이
   * 하나 더 붙는데, 「새 노트」는 곧바로 쓰기 시작하는 자리다.
   */
  const createNote = useCallback(async () => {
    const first = workspaces[0];
    if (first === undefined) return;

    const made = await createNode({
      workspaceId: first.workspace.id,
      parentId: null,
      kind: 'file',
      name: '제목 없음.md',
    }).catch(() => null);
    if (made === null) return;

    // 접미사가 붙었을 때만 말이 온다 — 늘 말하면 사용자가 그 자리를 읽지
    // 않게 되고, 정작 이름이 바뀐 때도 지나친다.
    setNotice(made.notice);
    await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
  }, [workspaces, queries]);

  /**
   * 즐겨찾기에 더한다 (`FR-SHELL-001` AC-3 · AC-4).
   *
   * 더한 뒤 목록을 **무효화한다** — 화면에서 지어 넣으면 서버가 무엇을
   * 담았는지와 갈리고, 볼 수 없게 된 항목이 화면에만 남는다.
   */
  const favorite = useCallback(
    async (nodeId: string) => {
      await addFavorite(nodeId).catch(() => undefined);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.favorites });
    },
    [queries],
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
      await removeGroup(groupId).catch(() => undefined);
      // 트리도 다시 받는다 — 그 그룹으로 보이던 노드가 사라질 수 있다.
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.groupRoster });
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
  );

  /**
   * 권한 감사 구역 (`FR-ACL-003`~`FR-ACL-005`).
   *
   * 고른 주체를 여기서 든다 — 두 탭이 각자 들면 같은 사람을 두 번 고르게
   * 되고, 한쪽만 갱신되는 자리가 생긴다. 관리 워크스페이스는 서버가 준
   * 목록의 첫 항목을 쓴다: 주체 검색의 자격 근거일 뿐이라 어느 것이어도
   * 같은 인가를 지난다 (`R162`).
   */
  const [회수주체, set회수주체] = useState<readonly PrincipalRow[]>([]);
  const [시뮬주체, set시뮬주체] = useState<string | null>(null);
  const adminScope = session.data !== undefined && session.data.adminWorkspaceCount > 0;
  const workspaceList = useWorkspaceList(signedIn && adminScope);
  const brokenInheritance = useBrokenInheritance(signedIn && adminScope);
  // 슈퍼유저는 관리 워크스페이스가 없어도 인스턴스 스코프의 행을 읽는다
  // (`SEC-AUDIT-010` AC-5) — `adminScope` 만 보면 그 문이 닫힌다.
  const 감사자격 = signedIn && (adminScope || session.data?.superuser === true);
  /** 감사 로그의 조작 필터. 빈 문자열이 「전체」다 (`IR-AUDIT-001`). */
  const [auditOperation, setAuditOperation] = useState('');
  const auditLog = useAuditLog(감사자격, auditOperation);
  // 대기열은 감사 로그와 **같은 조건**으로 켠다 (`SEC-AUDIT-007` AC-6) —
  // 자격 판정은 서버가 하나로 들고, 화면이 조건을 따로 적으면 둘이 갈린다.
  const queue = useReconciliationQueue(감사자격);
  /** 태그 탭의 범위 (`FR-SHELL-009` AC-2). 빈 문자열이 「전체」다. */
  const [tagScope, setTagScope] = useState('');
  const tags = useTags(signedIn, tagScope);
  const searchResults = useSearch(signedIn ? query : '', searchAxes);
  // 지금은 첫 주체의 것만 묻는다 — 다건 조회의 합산 규칙을 정한 요구가
  // 아직 없어, 없는 규칙을 화면이 지어내지 않는다.
  const revocation = useRevocation(회수주체[0]?.id ?? null);
  const simulation = useSimulation(시뮬주체);

  const revokeAllForSubject = useCallback(
    async (principalIds: readonly string[]) => {
      // 주체마다 한 번씩 지난다 — 확인은 묶음 1회였고(`FR-CONFIRM-021`)
      // 실행은 항목마다 감사 행을 남겨야 한다(`SEC-ACL-010`).
      for (const principalId of principalIds) {
        await revokeAllFor(principalId).catch(() => undefined);
        await queries.invalidateQueries({ queryKey: QUERY_KEYS.revocation(principalId) });
      }
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
  );

  const restoreNodeInheritance = useCallback(
    async (nodeId: string) => {
      await restoreInheritance(nodeId).catch(() => undefined);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.brokenInheritance });
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
  );

  const addMember = useCallback(
    async (groupId: string, userId: string) => {
      await addGroupMember(groupId, userId).catch(() => undefined);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.groupRoster });
    },
    [queries],
  );

  const pickPersonalSetting = useCallback(
    async (key: string, value: string) => {
      await savePersonalSetting(key, value).catch(() => undefined);
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.personalSettings });
    },
    [queries],
  );

  /**
   * 기존 파일에 새 버전을 올린다 (`FR-SHELL-008` AC-2).
   *
   * 올린 뒤 그 문서를 무효화한다 — 열려 있는 탭이 옛 본문을 들고 있으면
   * 다음 저장이 방금 올린 것을 덮는다.
   */
  const newVersion = useCallback(
    async (node: TreeNodeView, file: File) => {
      const done = await uploadNewVersion(node.id, file)
        .then(() => true)
        .catch(() => false);
      if (!done) return;

      await queries.invalidateQueries({ queryKey: QUERY_KEYS.document(node.id) });
      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
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
      const owner = request.ownerNodeId;
      const parent = request.parentId;

      const send = (file: File) => {
        if (parent !== undefined) return uploadIntoDirectory(parent, file);
        if (owner !== undefined) return uploadAttachment(owner, file);
        return Promise.reject(new Error('대상이 없다'));
      };

      const done = await Promise.all(
        request.files.map((file) => send(file).then(() => true).catch(() => false)),
      );
      if (!done.some(Boolean)) return;

      await queries.invalidateQueries({ queryKey: QUERY_KEYS.tree });
    },
    [queries],
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
  useEffect(() => {
    const wanted = nodeIdOf(window.location.pathname);
    if (wanted === null || wanted === activeId || workspaces.length === 0) return;

    const node = findNode(workspaces, wanted);
    if (node !== undefined) open(node, false);
  }, [workspaces, open, activeId]);

  /**
   * 뒤로·앞으로 (`FR-SHELL-006` AC-4).
   *
   * 주소만 바뀌고 화면이 그대로면 사용자는 뒤로 가기가 고장 났다고 읽는다.
   */
  useEffect(() => {
    const onPop = () => {
      const wanted = nodeIdOf(window.location.pathname);
      if (wanted === null) return;

      const node = findNode(workspaces, wanted);
      if (node === undefined) return;

      // 여기서는 주소를 다시 밀지 않는다 — 브라우저가 이미 옮겨 놓았고,
      // 또 밀면 이력에 같은 자리가 두 번 쌓여 뒤로 가기가 멈춘 것처럼 된다.
      setDocuments((was) => openInActiveTab(was, toTab(node)));
    };

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [workspaces]);

  // 401 만 익명이다. 다른 실패를 익명으로 접으면 서버가 잠깐 죽은 것과
  // 로그아웃이 구별되지 않아 사용자가 다시 로그인하게 된다.
  if (session.error instanceof ApiError && session.error.status === 401)
    return <PreAuthScreen screen="login" />;
  // **트리가 올 때까지 셸을 세우지 않는다.** 빈 트리로 먼저 세우면 아직
  // 모르는 상태가 「접근 가능한 워크스페이스가 없다」로 그려지고
  // (`FR-AUTH-005` AC-1), 사용자는 권한을 잃었다고 읽는다.
  if (session.data === undefined || !tree.isSuccess) return <div data-state="loading" />;

  return (
    <AppShell
      viewer={session.data}
      workspaces={workspaces}
      documents={documents}
      bodies={bodies}
      hashes={hashes}
      trash={trash.data ?? []}
      trashLens={trashLens}
      onTrashLens={setTrashLens}
      onTrashPurge={purgeTrash}
      onTrashRestore={restoreTrash}
      personalSettings={personal.data ?? {}}
      onPersonalSetting={pickPersonalSetting}
      userRoster={users.data ?? []}
      groupRoster={groups.data ?? []}
      onGroupRemove={dropGroup}
      onGroupAddMember={addMember}
      onRegisterUser={makeUser}
      aclAudit={{
        ...(workspaceList.data?.[0] === undefined ? {} : { workspaceId: workspaceList.data[0].id }),
        subjects: 회수주체,
        ...(revocation.data === undefined ? {} : { revocation: revocation.data }),
        ...(simulation.data === undefined ? {} : { simulation: simulation.data }),
        ...(brokenInheritance.data === undefined ? {} : { audit: brokenInheritance.data }),
        onRevokePick: (row) => set회수주체((was) => (was.some((one) => one.id === row.id) ? was : [...was, row])),
        onSimulatePick: (row) => set시뮬주체(row.id),
        onRevoke: revokeAllForSubject,
        onRestore: restoreNodeInheritance,
      }}
      favorites={favorites.data ?? []}
      links={links.data ?? { outgoing: [], backlinks: [] }}
      query={query}
      onQuery={setQuery}
      onOpen={open}
      onUpload={upload}
      onCreateNote={createNote}
      onFavorite={favorite}
      onNewVersion={newVersion}
      onNoticeDismiss={() => setNotice(undefined)}
      onSaveState={noteSaveState}
      onSaved={noteSaved}
      onDocuments={setDocuments}
      {...(auditLog.data === undefined ? {} : { auditLog: auditLog.data })}
      auditOperation={auditOperation}
      onAuditOperation={setAuditOperation}
      {...(queue.data === undefined ? {} : { queue: queue.data })}
      {...(tags.data === undefined ? {} : { tags: tags.data })}
      tagScope={tagScope}
      onTagScope={setTagScope}
      searchResults={searchResults.data?.documents ?? []}
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
                window.history.pushState(null, '', urlForNode(pendingOpen.id));
                setPendingOpen(null);
              },
              cancel: () => setPendingOpen(null),
            },
          })}
    />
  );
}
