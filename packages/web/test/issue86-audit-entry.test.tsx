import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { QUERY_KEYS } from '../src/api/queries.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const auditView = (target: string) => ({
  groups: [{
    operation: target,
    actor: 'root',
    occurredAt: '2026-09-22 01:02:03',
    rows: [{
      id: target,
      occurredAt: '2026-09-22 01:02:03',
      operation: target,
      actor: 'root',
      target,
      counterpart: null,
    }],
  }],
  operations: [target],
});

describe('IR-SHELL-012 zero-workspace superuser audit entry', () => {
  it('mounts the real audit and reconciliation views without constructing a workspace id', async () => {
    const requests: Array<{ method: string; path: string; search: string }> = [];
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(new URL(String(input), 'http://local'), init);
      const url = new URL(request.url);
      requests.push({ method: request.method, path: url.pathname, search: url.search });
      if (url.pathname === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 0, adminWorkspaceCount: 0 }));
      if (url.pathname === '/api/auth/me') return Promise.resolve(json({ userId: 'root-zero' }));
      if (url.pathname === '/api/audit-log') return Promise.resolve(json({ groups: [], operations: [] }));
      if (url.pathname === '/api/reconciliation-queue') return Promise.resolve(json({ items: [] }));
      if (url.pathname === '/api/tree' || url.pathname === '/api/favorites' || url.pathname === '/api/tags' || url.pathname === '/api/workspaces') return Promise.resolve(json([]));
      if (url.pathname === '/api/personal-settings') return Promise.resolve(json({}));
      return Promise.resolve(json(null, 404));
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);

    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    const auditTab = within(modal).getByRole('tab', { name: '감사 로그' });
    expect(within(modal).getByRole('heading', { name: '워크스페이스 관리' })).toBeDefined();
    expect(within(modal).queryByRole('tab', { name: '워크스페이스', exact: true })).toBeNull();
    expect(within(modal).queryByRole('tab', { name: '휴지통' })).toBeNull();

    await user.click(auditTab);
    expect(await within(modal).findByText('기록된 감사 행이 없습니다.')).toBeDefined();
    expect(within(auditTab).getByTestId('queue-badge').textContent).toBe('0');
    await user.click(within(modal).getByRole('button', { name: '재조정 대기열' }));
    expect(await within(modal).findByText('미해소 항목이 없습니다.')).toBeDefined();
    await user.click(within(modal).getByRole('button', { name: '감사 로그' }));
    expect(await within(modal).findByText('기록된 감사 행이 없습니다.')).toBeDefined();

    await waitFor(() => {
      expect(requests.some(({ path }) => path === '/api/audit-log')).toBe(true);
      expect(requests.some(({ path }) => path === '/api/reconciliation-queue')).toBe(true);
    });
    expect(requests.filter(({ method }) => method === 'POST')).toEqual([]);
    expect(requests.filter(({ path }) => path === '/api/audit-log' || path === '/api/reconciliation-queue').every(({ search }) => !search.includes('workspace'))).toBe(true);
  });

  it('keeps the selected and focused audit category while a mounted superuser loses the last managed workspace', async () => {
    let auditRead = 0;
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'root-transition' }));
      if (path === '/api/audit-log') return Promise.resolve(json(auditView(`감사 범위 ${++auditRead}`)));
      if (path === '/api/reconciliation-queue') return Promise.resolve(json({ items: [] }));
      if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags' || path === '/api/workspaces') return Promise.resolve(json([]));
      if (path === '/api/personal-settings') return Promise.resolve(json({}));
      return Promise.resolve(json(null, 404));
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);

    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    const auditTab = within(modal).getByRole('tab', { name: '감사 로그' });
    await user.click(auditTab);
    await waitFor(() => expect(auditRead).toBeGreaterThan(0));
    await waitFor(() => expect(modal.querySelector('[data-audit-disclosure]')).not.toBeNull());
    const readsBeforeTransition = auditRead;
    auditTab.focus();

    act(() => queryClient.setQueryData(QUERY_KEYS.session, {
      superuser: true,
      workspaceCount: 0,
      adminWorkspaceCount: 0,
    }));

    await waitFor(() => expect(auditRead).toBeGreaterThan(readsBeforeTransition));
    await waitFor(() => expect(modal.querySelector('[data-audit-disclosure]')).not.toBeNull());
    expect(within(modal).getByRole('tab', { name: '감사 로그' }).getAttribute('data-state')).toBe('active');
    expect(within(modal).getByRole('tab', { name: '감사 로그' })).toBe(document.activeElement);
    expect(within(modal).queryByRole('tab', { name: '워크스페이스', exact: true })).toBeNull();
    expect(within(modal).queryByRole('tab', { name: '권한 감사' })).toBeNull();
  });

  it.each([
    {
      name: 'ordinary user',
      selected: '감사 로그',
      session: { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 },
    },
    {
      name: 'workspace manager',
      selected: '인스턴스 설정',
      session: { superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 },
    },
  ])('moves focus to a live neutral continuation when a mounted superuser becomes $name', async ({ selected, session }) => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'root-role-loss' }));
      if (path === '/api/audit-log') return Promise.resolve(json(auditView('역할 전환 전')));
      if (path === '/api/reconciliation-queue') return Promise.resolve(json({ items: [] }));
      if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags' || path === '/api/workspaces') return Promise.resolve(json([]));
      if (path === '/api/personal-settings') return Promise.resolve(json({}));
      return Promise.resolve(json(null, 404));
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);

    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    const selectedTab = within(modal).getByRole('tab', { name: selected });
    await user.click(selectedTab);
    selectedTab.focus();

    act(() => queryClient.setQueryData(QUERY_KEYS.session, session));

    const status = await within(modal).findByRole('status');
    const continuation = within(status).getByRole('button', { name: '에디터로 이동' });
    await waitFor(() => expect(document.activeElement).toBe(continuation));
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(within(modal).queryByRole('tab', { name: selected })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.isConnected).toBe(true);
  });

  it('preserves focus on the surviving Settings Close control when the selected privileged category is revoked', async () => {
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'root-close-focus' }));
      if (path === '/api/audit-log') return Promise.resolve(json(auditView('역할 전환 전')));
      if (path === '/api/reconciliation-queue') return Promise.resolve(json({ items: [] }));
      if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags' || path === '/api/workspaces') return Promise.resolve(json([]));
      if (path === '/api/personal-settings') return Promise.resolve(json({}));
      return Promise.resolve(json(null, 404));
    }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);

    await user.click(await screen.findByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '감사 로그' }));
    const close = within(modal).getByRole('button', { name: '설정 닫기' });
    close.focus();
    expect(document.activeElement).toBe(close);

    act(() => queryClient.setQueryData(QUERY_KEYS.session, {
      superuser: false,
      workspaceCount: 1,
      adminWorkspaceCount: 0,
    }));

    const status = await within(modal).findByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(within(modal).queryByRole('tab', { name: '감사 로그' })).toBeNull();
    expect(document.activeElement).toBe(close);
    expect(close.isConnected).toBe(true);
  });
});
