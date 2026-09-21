import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App, refreshAfterSubjectRevoke, revokeSubjectAndRefresh } from '../src/App.js';
import { fetchManagedWorkspaces } from '../src/api/client.js';
import { QUERY_KEYS } from '../src/api/queries.js';
import { AclAuditPanel, type ManagedSearchScope } from '../src/acl/AclAuditPanel.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('IR-WORKSPACE-002 managed workspace query contract', () => {
  it('uses the dedicated typed endpoint', async () => {
    const fetcher = vi.fn(() => Promise.resolve(json({ scope: 'managed-workspaces', workspaces: [{ id: 'managed', name: 'Managed', path: 'must-not-enter-client-state' }] })));
    vi.stubGlobal('fetch', fetcher);
    await expect(fetchManagedWorkspaces()).resolves.toEqual({ scope: 'managed-workspaces', workspaces: [{ id: 'managed', name: 'Managed' }] });
    expect(new URL(String(fetcher.mock.calls[0]![0]), 'http://local').pathname).toBe('/api/managed-workspaces');
  });

  it('rejects a malformed managed-workspaces response instead of fabricating ready-empty', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json({
      scope: 'managed-workspaces',
      workspaces: [{ id: 7, name: 'private-name-must-not-render' }],
    }))));

    await expect(fetchManagedWorkspaces()).rejects.toThrow('invalid managed-workspaces response');
  });

  it('keys the source only by owner and auth generation and App queries before response data exists', async () => {
    let resolveScope!: (response: Response) => void;
    const pendingScope = new Promise<Response>((resolve) => { resolveScope = resolve; });
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://local').pathname;
      requested.push(path);
      if (path === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 2, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'manager' }));
      if (path === '/api/managed-workspaces') return pendingScope;
      if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags' || path === '/api/workspaces') return Promise.resolve(json([]));
      if (path === '/api/personal-settings') return Promise.resolve(json({}));
      if (path === '/api/broken-inheritance') return Promise.resolve(json({ rows: [] }));
      return Promise.resolve(json(null, 404));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<App queryClient={client} />);
    await waitFor(() => expect(requested).toContain('/api/managed-workspaces'));
    expect(client.getQueryState(QUERY_KEYS.managedWorkspaces('manager', 0))?.status).toBe('pending');
    expect(client.getQueryCache().findAll({ queryKey: ['managed-workspaces'] })).toHaveLength(1);
    resolveScope(json({ scope: 'managed-workspaces', workspaces: [{ id: 'managed', name: 'Managed' }] }));
    await waitFor(() => expect(client.getQueryData(QUERY_KEYS.managedWorkspaces('manager', 0))).toEqual({ scope: 'managed-workspaces', workspaces: [{ id: 'managed', name: 'Managed' }] }));
    expect(client.getQueryCache().findAll({ queryKey: ['managed-workspaces'] })).toHaveLength(1);
  });

  it('uses the complete sorted authorization set in the dependent fingerprint', () => {
    expect(QUERY_KEYS.managedScopeFingerprint({ scope: 'managed-workspaces', workspaces: [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }] })).toBe('managed-workspaces:a\u0000b');
    expect(QUERY_KEYS.managedScopeFingerprint({ scope: 'managed-workspaces', workspaces: [{ id: 'c', name: 'C' }, { id: 'a', name: 'A' }] })).not.toBe('managed-workspaces:a\u0000b');
  });

  it('removes a pending old-owner source query and ignores its late completion after account change', async () => {
    let resolveOld!: (response: Response) => void;
    const oldRequest = new Promise<Response>((resolve) => { resolveOld = resolve; });
    let managedReads = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'old-owner' }));
      if (path === '/api/managed-workspaces') {
        managedReads += 1;
        return managedReads === 1
          ? oldRequest
          : Promise.resolve(json({ scope: 'managed-workspaces', workspaces: [] }));
      }
      if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags' || path === '/api/workspaces') return Promise.resolve(json([]));
      if (path === '/api/personal-settings') return Promise.resolve(json({}));
      if (path === '/api/broken-inheritance') return Promise.resolve(json({ rows: [] }));
      return Promise.resolve(json(null, 404));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<App queryClient={client} />);
    await waitFor(() => expect(client.getQueryState(QUERY_KEYS.managedWorkspaces('old-owner', 0))?.status).toBe('pending'));

    act(() => client.setQueryData(QUERY_KEYS.identity, { kind: 'ok', userId: 'new-owner' }));
    await waitFor(() => expect(client.getQueryData(QUERY_KEYS.managedWorkspaces('new-owner', 1))).toEqual({ scope: 'managed-workspaces', workspaces: [] }));
    expect(client.getQueryState(QUERY_KEYS.managedWorkspaces('old-owner', 0))).toBeUndefined();

    resolveOld(json({ scope: 'managed-workspaces', workspaces: [{ id: 'private-old', name: 'Private old' }] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryState(QUERY_KEYS.managedWorkspaces('old-owner', 0))).toBeUndefined();
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain('private-old');
  });

  it('wires the actual App picker only to the authoritative managed id and replaces a same-count scope', async () => {
    const requested: URL[] = [];
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://local');
      requested.push(url);
      if (url.pathname === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 2, adminWorkspaceCount: 1 }));
      if (url.pathname === '/api/auth/me') return Promise.resolve(json({ userId: 'manager' }));
      if (url.pathname === '/api/managed-workspaces') return Promise.resolve(json({ scope: 'managed-workspaces', workspaces: [{ id: 'managed-a', name: 'Managed A' }] }));
      if (url.pathname === '/api/workspaces') return Promise.resolve(json([{ id: 'visible-unmanaged', name: 'Visible', adminless: false }]));
      if (url.pathname === '/api/tree' || url.pathname === '/api/favorites' || url.pathname === '/api/tags') return Promise.resolve(json([]));
      if (url.pathname === '/api/personal-settings') return Promise.resolve(json({}));
      if (url.pathname === '/api/broken-inheritance') return Promise.resolve(json({ rows: [] }));
      if (url.pathname === '/api/principals') return Promise.resolve(json([]));
      return Promise.resolve(json(null, 404));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={client} />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(await within(modal).findByRole('tab', { name: '권한 감사' }));
    const picker = await within(modal).findByRole('combobox', { name: '사용자·그룹 검색' });
    await user.type(picker, 'ab');
    await waitFor(() => expect(requested.some((url) => url.pathname === '/api/principals' && url.searchParams.get('for') === 'workspace:managed-a')).toBe(true));
    expect(requested.some((url) => url.searchParams.get('for') === 'workspace:visible-unmanaged')).toBe(false);

    act(() => client.setQueryData(QUERY_KEYS.managedWorkspaces('manager', 0), {
      scope: 'managed-workspaces',
      workspaces: [{ id: 'managed-b', name: 'Managed B' }],
    }));
    const replacedPicker = await within(modal).findByRole('combobox', { name: '사용자·그룹 검색' });
    await waitFor(() => expect((replacedPicker as HTMLInputElement).value).toBe(''));
    await user.type(replacedPicker, 'cd');
    await waitFor(() => expect(requested.some((url) => url.pathname === '/api/principals' && url.searchParams.get('for') === 'workspace:managed-b')).toBe(true));
  });

  it('resets both picker searches, candidates, and selections when the complete set changes but anchor A remains', async () => {
    const requested: URL[] = [];
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://local');
      requested.push(url);
      if (url.pathname === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 3, adminWorkspaceCount: 2 }));
      if (url.pathname === '/api/auth/me') return Promise.resolve(json({ userId: 'manager-set-change' }));
      if (url.pathname === '/api/managed-workspaces') return Promise.resolve(json({ scope: 'managed-workspaces', workspaces: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }));
      if (url.pathname === '/api/principals') return Promise.resolve(json([{ id: 'candidate-old', name: '이전 후보', kind: 'user', status: 'active' }]));
      if (url.pathname === '/api/revocations') return Promise.resolve(json({ scope: 'managed-workspaces', rows: [] }));
      if (url.pathname === '/api/simulation') return Promise.resolve(json({ subjectId: 'candidate-old', nodes: [] }));
      if (url.pathname === '/api/tree' || url.pathname === '/api/favorites' || url.pathname === '/api/tags' || url.pathname === '/api/workspaces') return Promise.resolve(json([]));
      if (url.pathname === '/api/personal-settings') return Promise.resolve(json({}));
      if (url.pathname === '/api/broken-inheritance') return Promise.resolve(json({ rows: [] }));
      return Promise.resolve(json(null, 404));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={client} />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(await within(modal).findByRole('tab', { name: '권한 감사' }));

    const revokePicker = within(modal).getByRole('combobox', { name: '사용자·그룹 검색' });
    await user.type(revokePicker, '이전');
    await user.click(await within(modal).findByText('이전 후보'));
    expect(within(modal).getByTestId('revocation-subjects').textContent).toContain('이전 후보');

    await user.click(within(modal).getByRole('tab', { name: '유효 권한 시뮬레이션' }));
    const simulationPicker = within(modal).getByRole('combobox', { name: '사용자·그룹 검색' });
    await user.type(simulationPicker, '이전');
    await user.click(await within(modal).findByText('이전 후보'));
    expect(within(modal).getByTestId('simulation-subject').textContent).toContain('이전 후보');

    act(() => client.setQueryData(QUERY_KEYS.managedWorkspaces('manager-set-change', 0), {
      scope: 'managed-workspaces',
      workspaces: [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }],
    }));

    await waitFor(() => expect(within(modal).queryByTestId('simulation-subject')).toBeNull());
    expect((within(modal).getByRole('combobox', { name: '사용자·그룹 검색' }) as HTMLInputElement).value).toBe('');
    expect(within(modal).queryByText('이전 후보')).toBeNull();
    await user.click(within(modal).getByRole('tab', { name: '권한 회수' }));
    expect((within(modal).getByRole('combobox', { name: '사용자·그룹 검색' }) as HTMLInputElement).value).toBe('');
    expect(within(modal).queryByText('이전 후보')).toBeNull();
    expect(within(modal).queryByTestId('revocation-subjects')).toBeNull();
    expect(requested.filter((url) => url.pathname === '/api/managed-workspaces')).toHaveLength(1);
  });

  it('invalidates and refetches only the exact active contextual revocation key', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const contextualKey = QUERY_KEYS.revocation('subject-1', 'owner:0:managed-workspaces:a\u0000c');
    const otherKey = QUERY_KEYS.revocation('subject-1', 'owner:0:managed-workspaces:a\u0000b');
    client.setQueryData(otherKey, { scope: 'managed-workspaces', rows: [{ entryId: 'stale-other' }] });
    let reads = 0;
    const observer = new QueryObserver(client, {
      queryKey: contextualKey,
      queryFn: async () => ({ scope: 'managed-workspaces' as const, rows: [{ entryId: `fresh-${++reads}` }] }),
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await waitFor(() => expect(reads).toBe(1));

    await refreshAfterSubjectRevoke(client, 'owner:0:managed-workspaces:a\u0000c', 'subject-1');

    expect(reads).toBe(2);
    expect(client.getQueryData(contextualKey)).toEqual({ scope: 'managed-workspaces', rows: [{ entryId: 'fresh-2' }] });
    expect(client.getQueryData(otherKey)).toEqual({ scope: 'managed-workspaces', rows: [{ entryId: 'stale-other' }] });
    unsubscribe();
  });

  it('rejects when the active contextual refetch fails so refreshFailed remains truthful', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const contextualKey = QUERY_KEYS.revocation('subject-fail', 'owner:0:managed-workspaces:a');
    let fail = false;
    const observer = new QueryObserver(client, {
      queryKey: contextualKey,
      queryFn: async () => {
        if (fail) throw new Error('owned refetch failure');
        return { scope: 'managed-workspaces' as const, rows: [] };
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    await waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    fail = true;

    await expect(revokeSubjectAndRefresh(
      'subject-fail',
      vi.fn().mockResolvedValue({ scope: 'managed-workspaces', rows: [] }),
      async (target, id) => {
        if (target === 'revocation') await refreshAfterSubjectRevoke(client, 'owner:0:managed-workspaces:a', id);
      },
    )).resolves.toEqual({
      revocation: { scope: 'managed-workspaces', rows: [] },
      refreshFailed: true,
    });
    unsubscribe();
  });

  it('keeps malformed hook data in error, retries the current query, and only then enables pickers', async () => {
    let reads = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://local');
      if (url.pathname === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (url.pathname === '/api/auth/me') return Promise.resolve(json({ userId: 'malformed-manager' }));
      if (url.pathname === '/api/managed-workspaces') {
        reads += 1;
        return Promise.resolve(reads === 1
          ? json({ scope: 'managed-workspaces', workspaces: [{ id: false, name: 'hidden malformed name' }] })
          : json({ scope: 'managed-workspaces', workspaces: [{ id: 'managed-safe', name: 'Safe' }] }));
      }
      if (url.pathname === '/api/tree' || url.pathname === '/api/favorites' || url.pathname === '/api/tags' || url.pathname === '/api/workspaces') return Promise.resolve(json([]));
      if (url.pathname === '/api/personal-settings') return Promise.resolve(json({}));
      if (url.pathname === '/api/broken-inheritance') return Promise.resolve(json({ rows: [] }));
      return Promise.resolve(json(null, 404));
    }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(await within(modal).findByRole('tab', { name: '권한 감사' }));

    const alert = await within(modal).findByRole('alert');
    expect(alert.textContent).toContain('관리 범위를 확인하지 못했습니다');
    expect(within(modal).queryByText('관리 권한이 있는 워크스페이스가 없습니다.')).toBeNull();
    expect(within(modal).queryByText('hidden malformed name')).toBeNull();
    expect(within(modal).queryByRole('combobox', { name: '사용자·그룹 검색' })).toBeNull();
    await user.click(within(alert).getByRole('button', { name: '관리 범위 다시 시도' }));
    expect(await within(modal).findByRole('combobox', { name: '사용자·그룹 검색' })).toBeDefined();
    expect(reads).toBe(2);
  });

  it('connects error retry to the current refetch and moves focus only when the retry disappears', async () => {
    function Controlled() {
      const [scope, setScope] = useState<ManagedSearchScope>({ state: 'error', onRetry: () => setScope({ state: 'loading' }) });
      return <AclAuditPanel managedScope={scope} />;
    }
    render(<Controlled />);
    const retry = screen.getAllByRole('button', { name: '관리 범위 다시 시도' })[0]!;
    retry.focus();
    await userEvent.setup().click(retry);
    const status = screen.getAllByRole('status')[0]!;
    await waitFor(() => expect(document.activeElement).toBe(status));
    expect(screen.queryByTestId('audit-no-workspace')).toBeNull();
  });

  it('moves focus after scope invalidation only when the focused owner was removed', async () => {
    const props = {
      contextKey: 'ctx-a',
      subjects: [],
      revocationPlan: { state: 'idle' as const },
      simulationSubject: null,
      simulationQuery: { state: 'idle' as const },
      onRevokePick: vi.fn(), onRevokeRemove: vi.fn(), onPreviewRevocation: vi.fn(), onRevokeSubject: vi.fn(), onSimulatePick: vi.fn(),
    };
    const view = render(<AclAuditPanel {...props} managedScope={{ state: 'ready', workspaceId: 'a' }} />);
    const picker = screen.getAllByRole('combobox', { name: '사용자·그룹 검색' })[0]!;
    picker.focus();
    view.rerender(<AclAuditPanel {...props} contextKey="ctx-b" managedScope={{ state: 'loading' }} />);
    const status = screen.getAllByRole('status')[0]!;
    await waitFor(() => expect(document.activeElement).toBe(status));

    const tab = screen.getByRole('tab', { name: '권한 회수' });
    tab.focus();
    view.rerender(<AclAuditPanel {...props} contextKey="ctx-c" managedScope={{ state: 'error', onRetry: vi.fn() }} />);
    expect(document.activeElement).toBe(tab);
  });
});
