import { useCallback, useEffect, useState } from 'react';

import { ApiError, fetchSession, fetchTree, loadDocument, type SessionBody } from './api/client.js';
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

  useEffect(() => {
    void (async () => {
      try {
        const body: SessionBody = await fetchSession();
        setSession({ state: 'signed-in', viewer: body });
        setWorkspaces(await fetchTree<WorkspaceTreeView[]>());
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
        .then(({ body }) => setBodies((was) => ({ ...was, [node.id]: body })))
        // 본문을 못 받으면 그 자리를 비워 둔다 — 빈 문자열을 넣으면
        // 사용자가 그 위에 쓰기 시작하고, 저장이 남의 본문을 지운다.
        .catch(() => undefined);
    },
    [],
  );

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
      onOpen={open}
    />
  );
}
