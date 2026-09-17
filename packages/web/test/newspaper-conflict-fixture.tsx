import { createRoot } from 'react-dom/client';
import { AppShell } from '../src/shell/AppShell.js';
import type { TabState } from '../src/document/tab-state.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const params = new URLSearchParams(location.search);
const state = params.get('state') ?? 'conflict';
const longName = '아주 긴 한글 대상 문서 이름과경로가공백없이이어지는문자열ABCDEFGHIJKLMNOPQRSTUVWXYZ.md';
const localBody = '# 내 편집 내용\n\n한글 😀 줄\n' + '긴줄'.repeat(120) + '\n마지막 공백  \n';
const serverBody = '# 서버 내용\n\n' + Array.from({ length: 30 }, (_, index) => `서버 줄 ${index}`).join('\n');
const save = state === 'rejected' ? 'rejected' : 'conflict';
const documents: TabState = { tabs: [{ nodeId: 'n1', name: longName, breadcrumb: ['워크스페이스', longName], save, level: 'edit', serverBody }], activeId: 'n1' };

globalThis.fetch = async (input, init) => {
  const target = String(input).split('?')[0]!;
  if (target.endsWith('/api/documents/n1') && init?.method === 'PUT') {
    document.body.dataset.savedBody = String(init.body);
    return Response.json({ hash: 'resolved-hash' });
  }
  if (target.endsWith('/api/documents/n1') && (init?.method === undefined || init.method === 'GET')) return Response.json({ body: serverBody, hash: 'fresh-hash' });
  if (target.endsWith('/api/documents/n1/session') && init?.method === 'POST') return Response.json({ session: 'fixture-session' });
  return new Response('{}', { status: 404 });
};

const confirmReplace = state === 'confirm' ? {
  name: longName,
  accept: () => { document.body.dataset.accepted = String(Number(document.body.dataset.accepted ?? '0') + 1); },
  cancel: () => { document.body.dataset.cancelled = String(Number(document.body.dataset.cancelled ?? '0') + 1); },
} : undefined;

createRoot(document.getElementById('root')!).render(
  <AppShell
    viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }}
    documents={documents}
    bodies={{ n1: localBody }}
    hashes={{ n1: 'base-hash' }}
    {...(confirmReplace === undefined ? {} : { confirmReplace })}
  />,
);
