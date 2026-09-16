import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { AppShell } from '../src/shell/AppShell.js';
import type { WorkspaceTreeView } from '../src/tree/tree-contract.js';

const TREE = [{
  workspace: { id: 'ws', name: '기획팀' }, visibility: 'full', roots: [{
    id: 'doc', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [],
  }],
}];
const routes = new Map<string, (init?: RequestInit) => Response | Promise<Response>>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });

beforeEach(() => {
  routes.clear();
  routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
  routes.set('/api/auth/me', () => json({ userId: 'me' }));
  routes.set('/api/tree', () => json(TREE));
  routes.set('/api/favorites', () => json([]));
  vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).split('?')[0]!;
    return Promise.resolve(routes.get(path)?.(init) ?? json(null, 404));
  }));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('IR-SHELL-009 AC-3 — actual query and mutation states', () => {
  it('marks the tree list region busy only while its actual query is pending', async () => {
    let settle: ((response: Response) => void) | undefined;
    routes.set('/api/tree', () => new Promise<Response>((resolve) => { settle = resolve; }));
    render(<App queryClient={client()} />);

    const panel = await screen.findByRole('tabpanel', { name: '문서 트리' });
    expect(panel.getAttribute('aria-busy')).toBe('true');
    settle?.(json(TREE));
    await screen.findByRole('treeitem', { name: /기획팀/ });
    expect(panel.getAttribute('aria-busy')).not.toBe('true');
  });

  it('renders a persistent tree error inside the shell and retries through the existing refetch', async () => {
    routes.set('/api/tree', () => json({ reason: 'internal details must not leak' }, 500));
    render(<App queryClient={client()} />);

    const alert = await screen.findByRole('alert', { name: '문서 트리 오류' });
    expect(screen.getByRole('tabpanel', { name: '문서 트리' }).getAttribute('aria-busy')).not.toBe('true');
    expect(document.querySelector('[data-shell="root"]')).not.toBeNull();
    expect(document.querySelector('[data-state="loading"]')).toBeNull();
    expect(alert.textContent).toContain('문서 트리를 불러오지 못했습니다.');
    expect(alert.textContent).not.toContain('internal details');

    routes.set('/api/tree', () => json(TREE));
    await userEvent.setup().click(within(alert).getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByRole('treeitem', { name: /기획팀/ })).toBeDefined();
  });

  it('keeps favorites loading, error, and successful empty states separate', async () => {
    let settle: ((response: Response) => void) | undefined;
    routes.set('/api/favorites', () => new Promise<Response>((resolve) => { settle = resolve; }));
    render(<App queryClient={client()} />);
    await screen.findByRole('treeitem', { name: /기획팀/ });
    await userEvent.setup().click(screen.getByRole('tab', { name: '즐겨찾기' }));

    const panel = screen.getByRole('tabpanel', { name: '즐겨찾기' });
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status', { name: '즐겨찾기 불러오는 중' })).toBeDefined();
    expect(screen.queryByText('즐겨찾기한 항목이 없습니다.')).toBeNull();
    settle?.(json([]));
    expect(await screen.findByText('즐겨찾기한 항목이 없습니다.')).toBeDefined();
    expect(panel.getAttribute('aria-busy')).not.toBe('true');
  });

  it('shows favorites failure as a retryable error rather than successful empty', async () => {
    routes.set('/api/favorites', () => json({ reason: 'raw favorite failure' }, 500));
    render(<App queryClient={client()} />);
    await screen.findByRole('treeitem', { name: /기획팀/ });
    await userEvent.setup().click(screen.getByRole('tab', { name: '즐겨찾기' }));

    const alert = await screen.findByRole('alert', { name: '즐겨찾기 오류' });
    expect(screen.getByRole('tabpanel', { name: '즐겨찾기' }).getAttribute('aria-busy')).not.toBe('true');
    expect(screen.queryByText('즐겨찾기한 항목이 없습니다.')).toBeNull();
    expect(alert.textContent).not.toContain('raw favorite failure');
    expect(within(alert).getByRole('button', { name: '다시 시도' })).toBeDefined();
  });

  it('keeps inline naming open and exposes only the ApiError safe reason after server rejection', async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }}
        workspaces={TREE as WorkspaceTreeView[]}
        onRename={async () => '같은 위치에서 사용할 수 없는 이름입니다.'}
      />,
    );
    const row = await screen.findByRole('treeitem', { name: /회의록/ });
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '이름 변경' }));
    const input = await screen.findByRole('textbox', { name: /새 이름/ });
    await user.clear(input);
    await user.type(input, '거절될 이름.md{Enter}');

    const invalidInput = await screen.findByRole('textbox', { name: /새 이름/ });
    await waitFor(() => expect(invalidInput.getAttribute('aria-invalid')).toBe('true'));
    const described = invalidInput.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ');
    expect(described).toContain('같은 위치에서 사용할 수 없는 이름입니다.');
    expect(described).not.toContain('api 409');
    expect(invalidInput.isConnected).toBe(true);
  });
});
