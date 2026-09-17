import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => ({ props: undefined as any }));
vi.mock('../src/shell/AppShell.js', () => ({ AppShell: (props: any) => { shell.props = props; return <div data-testid="mock-shell" />; } }));
import { App } from '../src/App.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); shell.props = undefined; });

it('IR-SHELL-004 App never replays an old retry after logout and same-ID reauthentication', async () => {
  let signedIn = true; let patches = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).split('?')[0];
    if (path === '/api/session') return signedIn ? new Response(JSON.stringify({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response(null, { status: 401 });
    if (path === '/api/auth/me') return new Response(JSON.stringify({ userId: 'u1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/api/personal-settings' && init?.method === 'PATCH') { patches += 1; return new Response(null, { status: 400 }); }
    if (path === '/api/personal-settings') return new Response(JSON.stringify({ 'default-view-mode': 'view' }), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/api/auth/logout') { signedIn = false; return new Response(null, { status: 204 }); }
    if (path === '/api/auth/login') { signedIn = true; return new Response(null, { status: 204 }); }
    return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
  render(<App queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />);
  await screen.findByTestId('mock-shell');
  await waitFor(() => expect(shell.props.editorLoadState.state).toBe('ready'));
  await act(async () => shell.props.onPersonalSetting('default-view-mode', 'edit'));
  await waitFor(() => expect(shell.props.editorSaveStates['default-view-mode'].state).toBe('error'));
  const retry = shell.props.editorSaveStates['default-view-mode'].onRetry;
  await act(async () => shell.props.onLogout());
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('이름'), 'same-user');
  await user.type(screen.getByLabelText('비밀번호'), 'same-password');
  await user.click(screen.getByRole('button', { name: '로그인' }));
  await screen.findByTestId('mock-shell');
  act(() => retry());
  await Promise.resolve();
  expect(patches).toBe(1);
});
