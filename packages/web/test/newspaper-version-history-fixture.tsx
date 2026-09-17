import { createRoot } from 'react-dom/client';
import { AppShell } from '../src/shell/AppShell.js';
import { MergeView } from '../src/document/MergeView.js';
import type { WorkspaceTreeView } from '../src/tree/tree-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const params = new URLSearchParams(location.search);
const state = params.get('state') ?? 'ready';
const shape = params.get('shape') ?? 'large';
const long = '아주긴작성자이름과경로가연속되는테스트문자열ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const currentBody = shape === 'empty' || shape === 'deletion' ? '' : shape === 'equal' ? '# 같은 본문' : shape === 'insertion' ? '# 새로 추가된 본문' : `# 현재 본문\n\n${long.repeat(10)}\n\n${Array.from({ length: 40 }, (_, i) => `현재 줄 ${i}`).join('\n')}`;
const archivedBody = shape === 'empty' || shape === 'insertion' ? '' : shape === 'equal' ? '# 같은 본문' : shape === 'deletion' ? '# 삭제될 본문' : `# 보관된 26판\n\n${long.repeat(12)}\n\n${Array.from({ length: 40 }, (_, i) => `줄 ${i}`).join('\n')}`;
const versions = Array.from({ length: 26 }, (_, index) => ({
  seq: 26 - index,
  createdAt: `2026-09-${String(16 - (index % 9)).padStart(2, '0')}T0${index % 9}:00:00.000Z`,
  author: `${long}-${index}`,
}));
let listAttempts = 0;
let compareAttempts = 0;
let restoreAttempts = 0;

globalThis.fetch = async (input, init) => {
  const path = String(input).split('?')[0]!;
  if (path === '/api/documents/n1/versions') {
    listAttempts += 1;
    if (state === 'list-error' && listAttempts === 1) return new Response('{}', { status: 500 });
    return Response.json(state === 'empty' ? [] : versions);
  }
  const match = path.match(/^\/api\/documents\/n1\/versions\/(\d+)$/);
  if (match) {
    compareAttempts += 1;
    if (state === 'compare-error' && compareAttempts === 1) return new Response('{}', { status: 500 });
    const seq = Number(match[1]);
    return Response.json({ seq, body: seq === 26 ? archivedBody : `# 보관된 ${seq}판` });
  }
  const restore = path.match(/^\/api\/documents\/n1\/versions\/(\d+)\/restore$/);
  if (restore && init?.method === 'POST') {
    restoreAttempts += 1;
    if (state === 'restore-pending') return new Promise<Response>(() => {});
    if (state === 'restore-error' && restoreAttempts === 1) return new Response('{}', { status: 500 });
    document.body.dataset.persistedSeq = restore[1];
    document.body.dataset.restoreCalls = String(restoreAttempts);
    return new Response(null, { status: 204 });
  }
  return new Response('{}', { status: 404 });
};

createRoot(document.getElementById('root')!).render(
  <main data-version-fixture>
    <AppShell
      viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }}
      workspaces={[{ workspace: { id: 'ws', name: '워크스페이스' }, visibility: 'full', roots: [{ id: 'n1', name: '긴 문서 이름.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] }] }] satisfies WorkspaceTreeView[]}
      documents={{ tabs: [{ nodeId: 'n1', name: '긴 문서 이름.md', breadcrumb: ['워크스페이스', long, '긴 문서 이름.md'], save: 'saved' }], activeId: 'n1' }}
      bodies={{ n1: currentBody }}
    />
    {params.has('conflict') && <section data-conflict-regression>
      <MergeView label="충돌 병합" left="# 서버 본문" right="# 내 초안" onResolve={() => {}} />
    </section>}
  </main>,
);
