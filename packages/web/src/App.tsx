import { useCallback, useEffect, useState } from 'react';

import { ApiError, fetchSession, fetchTree, fetchTrash, loadDocument, type SessionBody } from './api/client.js';
import { uploadAttachment } from './api/client.js';
import type { UploadRequest } from './attachment/upload-contract.js';
import type { TrashRowView } from './trash/TrashPanel.js';
import { PreAuthScreen } from './auth/PreAuthScreen.js';
import { AppShell } from './shell/AppShell.js';
import type { Viewer } from './shell/shell-contract.js';
import { openInActiveTab, openInNewTab, type TabState } from './document/tab-state.js';
import { nodeIdOf, urlForNode } from './routing/deep-link.js';
import type { WorkspaceTreeView, TreeNodeView } from './tree/tree-contract.js';

/**
 * 앱의 진입 컴포넌트.
 *
 * **인증 상태가 화면 종류를 가른다** (`IR-AUTH-001` AC-4). 세션을 세우지
 * 못하면 셸 자체를 세우지 않는다 — 깔아 두고 그 위에 로그인 화면을 얹으면
 * 사용자가 로그인 전에 트리와 탭의 껍데기를 보게 되고, 그것이 「내용이
 * 없다」로 읽힌다.
 */
type Session = { state: 'loading' } | { state: 'anonymous' } | { state: 'signed-in'; viewer: Viewer };

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

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceTreeView[]>([]);
  const [documents, setDocuments] = useState<TabState>({ tabs: [], activeId: null });
  const [bodies, setBodies] = useState<Readonly<Record<string, string>>>({});
  // 본문과 그 **기준 해시**를 함께 들고 있는다 — 저장 요청이 해시를
  // 실어야 충돌이 판정되고, 둘이 갈리면 그 판정이 남의 본문을 근거로 한다.
  const [hashes, setHashes] = useState<Readonly<Record<string, string>>>({});
  const [trash, setTrash] = useState<readonly TrashRowView[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const body: SessionBody = await fetchSession();
        setSession({ state: 'signed-in', viewer: body });
        setWorkspaces(await fetchTree<WorkspaceTreeView[]>());
        // 휴지통은 전 워크스페이스 통합이라 트리와 별개로 받는다
        // (`FR-SHELL-007` AC-3). 실패해도 셸은 서야 한다 — 휴지통 하나가
        // 안 온다고 앱을 못 쓰게 만들 이유가 없다.
        setTrash(await fetchTrash<TrashRowView[]>({ scope: 'mine' }).catch(() => []));
      } catch (error) {
        // 401 만 익명이다. 다른 실패를 익명으로 접으면 서버가 잠깐 죽은
        // 것과 로그아웃이 구별되지 않아 사용자가 다시 로그인하게 된다.
        setSession(error instanceof ApiError && error.status === 401 ? { state: 'anonymous' } : { state: 'loading' });
      }
    })();
  }, []);

  /**
   * 문서를 연다 (`FR-SHELL-012` · `FR-SHELL-006` AC-1).
   *
   * 주소를 함께 민다 — 그래야 그 문서의 링크가 생기고, 뒤로 가기가 문서
   * 이동 이력을 따른다.
   */
  const open = useCallback(
    (node: TreeNodeView, inNewTab: boolean) => {
      const tab = {
        nodeId: node.id,
        name: node.name,
        breadcrumb: [node.name],
        save: 'saved' as const,
        level: node.level,
      };
      setDocuments((was) => (inNewTab ? openInNewTab(was, tab) : openInActiveTab(was, tab)));
      window.history.pushState(null, '', urlForNode(node.id));

      void loadDocument(node.id)
        .then(({ body, hash }) => {
          setBodies((was) => ({ ...was, [node.id]: body }));
          setHashes((was) => ({ ...was, [node.id]: hash }));
        })
        // 본문을 못 받으면 그 자리를 비워 둔다 — 빈 문자열을 넣으면
        // 사용자가 그 위에 쓰기 시작하고, 저장이 남의 본문을 지운다.
        .catch(() => undefined);
    },
    [],
  );

  /**
   * 트리에 떨군 파일을 올린다 (`FR-ATTACH-001`).
   *
   * 올린 뒤 트리를 **다시 받는다**(AC-2) — 새 파일이 그 디렉토리의 자식으로
   * 나타나야 하고, 안 받으면 사용자는 파일이 안 올라간 것으로 읽는다.
   * 거부됐으면 다시 받지 않는다: 바뀐 것이 없으므로 헛된 왕복이다.
   */
  const upload = useCallback(async (request: UploadRequest) => {
    const target = request.ownerNodeId ?? request.parentId;
    if (target === undefined) return;

    const done = await Promise.all(
      request.files.map((file) => uploadAttachment(target, file).then(() => true).catch(() => false)),
    );
    if (!done.some(Boolean)) return;

    setWorkspaces(await fetchTree<WorkspaceTreeView[]>().catch(() => []));
  }, []);

  // 주소에 문서가 실려 들어왔으면 그것을 연다 (`FR-SHELL-006` AC-2).
  useEffect(() => {
    const wanted = nodeIdOf(window.location.pathname);
    if (wanted === null || workspaces.length === 0) return;

    const node = findNode(workspaces, wanted);
    if (node !== undefined) open(node, false);
  }, [workspaces, open]);

  if (session.state === 'loading') return <div data-state="loading" />;
  if (session.state === 'anonymous') return <PreAuthScreen screen="login" />;

  return (
    <AppShell
      viewer={session.viewer}
      workspaces={workspaces}
      documents={documents}
      bodies={bodies}
      hashes={hashes}
      trash={trash}
      onOpen={open}
      onUpload={upload}
    />
  );
}
