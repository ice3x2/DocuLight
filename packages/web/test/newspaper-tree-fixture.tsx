import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '../src/shell/AppShell.js';
import type { Favorite } from '../src/favorites/FavoritesView.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const leaf = (id: string, name: string, level: 'view' | 'edit' = 'edit'): TreeNodeView => ({ id, name, kind: 'file', visibility: 'full', level, parentLevel: level, children: [] });
const many = Array.from({ length: 45 }, (_, i) => leaf(`many-${i}`, `긴 목록 문서 ${String(i + 1).padStart(2, '0')}.md`));
const deep: TreeNodeView = { id: 'deep-a', name: '아주긴한글이름과공백없는경로가끝없이이어지는최상위디렉토리', kind: 'directory', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [{ id: 'deep-b', name: '두번째깊이디렉토리', kind: 'directory', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [{ id: 'deep-c', name: '세번째깊이디렉토리', kind: 'directory', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [leaf('deep-file', '마지막긴문서이름.md')] }] }] };
const readonly = leaf('readonly', '읽기 전용 문서.md', 'view');
const workspaces: WorkspaceTreeView[] = [{ workspace: { id: 'ws', name: '신문 편집국' }, visibility: 'full', roots: [deep, { id: 'upload-dir', name: '업로드 디렉토리', kind: 'directory', visibility: 'full', level: 'edit', parentLevel: 'edit', children: many }, readonly] }];
const seed: Favorite[] = [leaf('deep-file', '마지막긴문서이름.md'), { id: 'upload-dir', name: '업로드 디렉토리', kind: 'directory', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] }].map((node) => ({ nodeId: node.id, name: node.name, kind: node.kind, workspaceName: '신문 편집국' }));

function Fixture() {
  const [favorites, setFavorites] = useState(seed);
  const [, setUnrelatedRender] = useState(0);
  const state = new URLSearchParams(window.location.search).get('state');
  const treeState = state === 'tree-loading'
    ? { state: 'loading' as const }
    : state === 'tree-error'
      ? { state: 'error' as const, message: '문서 트리를 불러오지 못했습니다.', onRetry: () => { document.body.dataset.retried = 'tree'; } }
      : { state: 'ready' as const };
  const favoritesState = state === 'favorites-loading'
    ? { state: 'loading' as const }
    : state === 'favorites-error'
      ? { state: 'error' as const, message: '즐겨찾기를 불러오지 못했습니다.', onRetry: () => { document.body.dataset.retried = 'favorites'; } }
      : { state: 'ready' as const };
  return <AppShell viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }} workspaces={workspaces} favorites={favorites} treeState={treeState} favoritesState={favoritesState} onUnfavorite={(id) => {
    setUnrelatedRender((value) => value + 1);
    window.setTimeout(() => setFavorites((rows) => rows.filter((row) => row.nodeId !== id)), 100);
  }} onRename={(_, name) => {
    if (state === 'rename-pending') {
      document.body.dataset.renameCalls = String(Number(document.body.dataset.renameCalls ?? '0') + 1);
      return new Promise<undefined>((resolve) => window.setTimeout(resolve, 250));
    }
    if (state === 'naming-error') return Promise.resolve('같은 위치에서 사용할 수 없는 이름입니다.');
    document.body.dataset.renamed = name;
  }} onCreate={() => {
    if (state === 'create-pending') {
      document.body.dataset.createCalls = String(Number(document.body.dataset.createCalls ?? '0') + 1);
      return new Promise<undefined>((resolve) => window.setTimeout(resolve, 250));
    }
  }} onUpload={() => {}} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
