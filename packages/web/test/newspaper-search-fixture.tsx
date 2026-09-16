import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { SearchDocumentBody } from '../src/api/client.js';
import { AppShell } from '../src/shell/AppShell.js';
import type { WorkspaceTreeView } from '../src/tree/tree-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const long = '매우긴한글검색결과와공백없는문자열ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const documents: SearchDocumentBody[] = Array.from({ length: 32 }, (_, index) => ({
  nodeId: `search-${index}`,
  name: [0, 15, 31].includes(index) ? `결과 ${index + 1}.md` : `${long} ${index + 1}.md`,
  workspaceName: [0, 15, 31].includes(index) ? '신문편집국' : `신문편집국${long}`,
  excerpts: [0, 15, 31].includes(index)
    ? [{ axis: 'body', text: `본문 발췌 ${index + 1}` }]
    : [
        { axis: 'body', text: `${long} 본문 발췌 ${index + 1}` },
        { axis: 'body', text: `두 번째 발췌는 서버가 준 순서 그대로 표시됩니다 ${long}` },
      ],
}));
const workspaces: WorkspaceTreeView[] = [{
  workspace: { id: 'ws-search', name: '신문 편집국' },
  visibility: 'full',
  roots: documents.map((document) => ({
    id: document.nodeId,
    name: document.name,
    kind: 'file',
    visibility: 'full',
    level: 'edit',
    parentLevel: 'edit',
    children: [],
  })),
}];

function Fixture() {
  const requestedState = new URLSearchParams(window.location.search).get('state');
  const [query, setQuery] = useState(long);
  const [axes, setAxes] = useState<readonly ('name' | 'body' | 'tag' | 'attachment')[]>(['name']);
  const state = requestedState === 'idle'
    ? { state: 'idle' as const }
    : requestedState === 'loading'
      ? { state: 'loading' as const }
      : requestedState === 'error'
        ? { state: 'error' as const, onRetry: () => { document.body.dataset.retried = 'true'; } }
        : { state: 'success' as const };
  return (
    <AppShell
      viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }}
      workspaces={workspaces}
      query={requestedState === 'idle' ? '' : query}
      searchAxes={axes}
      searchResults={requestedState === 'empty' ? [] : documents}
      searchState={state}
      onQuery={setQuery}
      onSearchAxes={(next) => { setAxes(next); document.body.dataset.axes = next.join(','); }}
      onOpen={(node) => {
        document.body.dataset.opened = node.id;
        document.body.dataset.openCalls = String(Number(document.body.dataset.openCalls ?? '0') + 1);
      }}
    />
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
