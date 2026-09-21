import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const pendingUsers = [{ id: 'pending-1', name: '대기자', status: 'pending' }];

const makeClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } } });
  client.setQueryData(['session'], { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 });
  client.setQueryData(['identity'], { kind: 'ok', userId: 'super-1' });
  client.setQueryData(['tree'], []);
  client.setQueryData(['favorites'], []);
  client.setQueryData(['personal-settings', 'super-1'], {});
  return client;
};

const setup = (options: {
  write: Promise<Response>;
  roster?: (call: number) => Promise<Response>;
  mode?: (call: number) => Promise<Response>;
}) => {
  let rosterCalls = 0;
  let modeCalls = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => 1_800_000_000_000 + rosterCalls * 100 + modeCalls);
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input), 'http://local').pathname;
    if (path === '/api/roster/users' && (init?.method ?? 'GET') === 'GET') {
      rosterCalls += 1;
      return options.roster?.(rosterCalls) ?? Promise.resolve(json(pendingUsers));
    }
    if (path === '/api/instance/signup-mode') {
      modeCalls += 1;
      return options.mode?.(modeCalls) ?? Promise.resolve(json({ mode: 'approval' }));
    }
    if (path === '/api/roster/users/pending-1/approve') return options.write;
    if (path === '/api/roster/groups' || path === '/api/tokens') return Promise.resolve(json([]));
    if (path === '/api/workspaces') return Promise.resolve(json([]));
    return Promise.resolve(json(null, 404));
  }));
  return { client: makeClient(), rosterCalls: () => rosterCalls, modeCalls: () => modeCalls };
};

const openApproval = async () => {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '설정' }));
  const dialog = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(dialog).getByRole('tab', { name: '가입 승인' }));
  await within(dialog).findByRole('button', { name: '대기자 승인' });
  return { user, dialog };
};

describe('IR-PRINCIPAL-002 — App accepted read generation', () => {
  it('action 자체 post-write roster refresh가 읽기 세대를 올려도 성공 결과를 self-stale 처리하지 않는다', async () => {
    const write = deferred<Response>();
    const env = setup({ write: write.promise });
    render(<App queryClient={env.client} />);
    const { user, dialog } = await openApproval();

    await user.click(within(dialog).getByRole('button', { name: '대기자 승인' }));
    write.resolve(json(null, 204));

    expect(await within(dialog).findByText('가입을 승인했습니다.')).toBeDefined();
    expect(env.rosterCalls()).toBe(2);
  });

  it('write 대기 중 받아들인 newer roster snapshot 뒤의 늦은 write 완료를 버린다', async () => {
    const write = deferred<Response>();
    const env = setup({ write: write.promise });
    render(<App queryClient={env.client} />);
    const { user, dialog } = await openApproval();

    await user.click(within(dialog).getByRole('button', { name: '대기자 승인' }));
    await act(async () => { await env.client.invalidateQueries({ queryKey: ['roster', 'users'] }); });
    expect(env.rosterCalls()).toBe(2);
    write.resolve(json(null, 204));

    await waitFor(() => expect((within(dialog).getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement).disabled).toBe(false));
    expect(within(dialog).queryByText('가입을 승인했습니다.')).toBeNull();
    expect(env.rosterCalls()).toBe(2);
  });

  it('write 대기 중 받아들인 newer signup-mode snapshot 뒤의 늦은 write 완료를 버린다', async () => {
    const write = deferred<Response>();
    const env = setup({ write: write.promise });
    render(<App queryClient={env.client} />);
    const { user, dialog } = await openApproval();

    await user.click(within(dialog).getByRole('button', { name: '대기자 승인' }));
    await act(async () => { await env.client.invalidateQueries({ queryKey: ['signup-mode'] }); });
    expect(env.modeCalls()).toBe(2);
    write.resolve(json(null, 204));

    await waitFor(() => expect((within(dialog).getByRole('button', { name: '대기자 승인' }) as HTMLButtonElement).disabled).toBe(false));
    expect(within(dialog).queryByText('가입을 승인했습니다.')).toBeNull();
    expect(env.rosterCalls()).toBe(1);
  });
});
