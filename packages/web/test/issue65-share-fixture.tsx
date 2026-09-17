import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShareModal, type ShareActionResult, type ShareQueryState } from '../src/acl/ShareModal.js';
import type { ShareViewBody } from '../src/api/client.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

declare global { interface Window { __issue65: { grants: number; revokes: number; breaks: number }; __issue65Role: (role: 'admin' | 'edit') => void; __issue65Query: (state: 'loading' | 'error' | 'ready' | 'empty') => void } }

const admin: ShareViewBody = {
  metrics: { reachable: 37, viaAcl: 5 }, level: 'admin', nodeKind: 'directory', inheritsAcl: true, reached: 37,
  rows: [
    { entryId: 'entry-1', principalId: 'user-1', principalName: '긴 이름 사용자 가나다라마바사아자차카타파하', principalKind: 'user', level: 'edit', inherited: false, source: null },
    { entryId: null, principalId: 'group-1', principalName: '상속된 기획 그룹', principalKind: 'group', level: 'view', inherited: true, source: '상위 폴더' },
  ],
};
const principals = [
  { id: 'group-new-1', name: '한글 그룹 하나', kind: 'group', status: 'active' },
  { id: 'group-new-2', name: '한글 그룹 둘', kind: 'group', status: 'active' },
  { id: 'group-new-3', name: '한글 그룹 셋 가나다라마바사아자차카타파하', kind: 'group', status: 'active' },
];
window.fetch = async (input) => {
  const url = String(input);
  if (url.includes('/api/principals')) return new Response(JSON.stringify(principals), { status: 200, headers: { 'content-type': 'application/json' } });
  return new Response('{}', { status: 404 });
};

function Fixture() {
  const [role, setRole] = useState<'admin' | 'edit'>('admin');
  const [query, setQuery] = useState<ShareQueryState>({ state: 'ready', nodeId: 'dir-1', view: admin });
  window.__issue65 ??= { grants: 0, revokes: 0, breaks: 0 };
  window.__issue65Role = (next) => { setRole(next); setQuery({ state: 'ready', nodeId: 'dir-1', view: { ...admin, level: next, rows: next === 'edit' ? null : admin.rows } }); };
  window.__issue65Query = (state) => setQuery(state === 'loading'
    ? { state: 'loading', nodeId: 'dir-1' }
    : state === 'error'
      ? { state: 'error', nodeId: 'dir-1', onRetry: () => setQuery({ state: 'ready', nodeId: 'dir-1', view: admin }) }
      : { state: 'ready', nodeId: 'dir-1', view: state === 'empty' ? { ...admin, rows: [] } : admin });
  const result = async (kind: keyof typeof window.__issue65): Promise<ShareActionResult> => { window.__issue65[kind] += 1; await new Promise((resolve) => setTimeout(resolve, 15)); return { ok: true }; };
  return <ShareModal
    open nodeId="dir-1" nodeName="아주 긴 공유 폴더 가나다라마바사아자차카타파하" nodeKind="directory"
    query={query} refreshView={async () => query.state === 'ready' ? query.view : undefined}
    onWarnings={async () => []} onGrant={async () => result('grants')} onRevoke={async (entryId) => { const outcome = await result('revokes'); setQuery({ state: 'ready', nodeId: 'dir-1', view: { ...admin, rows: admin.rows?.filter((row) => row.entryId !== entryId) ?? null } }); return outcome; }}
    onBreakInheritance={async () => result('breaks')} onInheritFromParent={async () => ({ ok: true })}
    onOpenChange={() => undefined}
  />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
