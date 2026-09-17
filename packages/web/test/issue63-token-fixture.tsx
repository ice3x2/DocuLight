import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '../src/shell/AppShell.js';
import type { TokenQueryState } from '../src/settings/TokenPanel.js';
import type { TokenRowView } from '../src/settings/token-contract.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const initialRows: TokenRowView[] = Array.from({ length: 14 }, (_, index) => ({
  id: `token-${index}`,
  name: index === 0 ? '아주 긴 자동화 액세스 토큰 이름은 여러 줄로 자연스럽게 표시됩니다' : `자동화 토큰 ${index + 1}`,
  scope: index % 2 === 0 ? 'read-only' : 'read-write',
  expiresAt: index === 1 ? '2020-01-01T00:00:00.000Z' : '2099-09-17T00:00:00.000Z',
  lastUsedAt: null,
  revokedAt: index === 2 ? '2026-09-17T00:00:00.000Z' : null,
}));

declare global {
  interface Window {
    __issue63SetQuery: (state: 'loading' | 'error' | 'ready') => void;
    __issue63SetOwner: (owner: { userId: string; generation: number } | undefined) => void;
    __issue63Issued: number;
    __issue63Revoked: number;
  }
}

function Fixture() {
  const [owner, setOwner] = useState<{ userId: string; generation: number } | undefined>({ userId: 'fixture-owner', generation: 1 });
  const [rows, setRows] = useState(initialRows);
  const [queryState, setQueryState] = useState<'loading' | 'error' | 'ready'>('ready');
  const [issueFailures, setIssueFailures] = useState(1);
  const [revokeFailures, setRevokeFailures] = useState(1);
  window.__issue63SetQuery = setQueryState;
  window.__issue63SetOwner = setOwner;
  window.__issue63Issued ??= 0;
  window.__issue63Revoked ??= 0;
  const query: TokenQueryState = queryState === 'loading'
    ? { state: 'loading' }
    : queryState === 'error'
      ? { state: 'error', onRetry: () => setQueryState('ready') }
      : { state: 'ready', rows };
  return <AppShell viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }} {...(owner === undefined ? {} : { tokenOwner: owner })} tokenQuery={query}
    onIssueToken={async () => {
      window.__issue63Issued += 1;
      if (issueFailures > 0) { setIssueFailures(issueFailures - 1); return undefined; }
      return { token: 'dl_pat_fixture_secret_never_written_to_artifact' };
    }}
    onRevokeToken={async (id) => {
      window.__issue63Revoked += 1;
      if (revokeFailures > 0) { setRevokeFailures(revokeFailures - 1); return { ok: false }; }
      setRows((current) => current.filter((row) => row.id !== id));
      return { ok: true };
    }} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
