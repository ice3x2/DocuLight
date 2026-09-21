import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import type { AuditViewBody, ReconciliationQueueBody, SessionBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const audit = (id: string, operation: string, operations = ['old.operation', 'new.operation']): AuditViewBody => ({
  groups: [{
    operation,
    actor: '감사 담당자',
    occurredAt: '2026-09-18 12:00:00',
    rows: [{ id, operation, actor: '감사 담당자', occurredAt: '2026-09-18 12:00:00', target: `${id}.md`, counterpart: null }],
  }],
  operations,
});

const queue = (count: number): ReconciliationQueueBody => ({
  items: Array.from({ length: count }, (_, index) => ({ id: `q-${index}`, type: 'missing-file' })),
});

const client = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-a' });
  queryClient.setQueryData(['workspaces'], [{ id: 'ws-1', name: '기획팀', adminless: false }]);
  return queryClient;
};

const commonResponse = (path: string) => {
  if (path === '/api/tree' || path === '/api/favorites' || path === '/api/tags') return json([]);
  if (path === '/api/workspaces') return json([{ id: 'ws-1', name: '기획팀', adminless: false }]);
  if (path === '/api/personal-settings') return json({});
  return json(null, 404);
};

const openAudit = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: '설정' }));
  const modal = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(modal).getByRole('tab', { name: '감사 로그' }));
  return modal;
};

describe('GitHub #70 — 실제 App 감사 읽기 세대와 상태 어댑터', () => {
  it('늦은 이전 필터 응답을 버리고 로딩 중 select 초점과 서버 옵션은 유지한다', async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const parsed = new URL(String(url), 'http://local');
      if (parsed.pathname === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (parsed.pathname === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
      if (parsed.pathname === '/api/audit-log') {
        const operation = parsed.searchParams.get('operation');
        if (operation === 'old.operation') return oldRequest.promise;
        if (operation === 'new.operation') return newRequest.promise;
        return Promise.resolve(json(audit('initial-row', 'initial.operation')));
      }
      if (parsed.pathname === '/api/reconciliation-queue') return Promise.resolve(json(queue(0)));
      return Promise.resolve(commonResponse(parsed.pathname));
    }));
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const modal = await openAudit(user);
    await within(modal).findByTestId('audit-group');
    const select = within(modal).getByLabelText('조작');

    await user.selectOptions(select, 'old.operation');
    expect(document.activeElement).toBe(select);
    expect(within(modal).queryByText('initial-row.md')).toBeNull();
    expect(within(modal).getByText('감사 로그를 불러오는 중입니다.')).toBeDefined();
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '전체', 'old.operation', 'new.operation',
    ]);

    await user.selectOptions(select, 'new.operation');
    newRequest.resolve(json(audit('new-row', 'new.operation')));
    await within(modal).findByRole('button', { name: /new\.operation/ });
    oldRequest.resolve(json(audit('old-row', 'old.operation')));
    await act(async () => { await oldRequest.promise; });
    expect(within(modal).queryByText('old-row.md')).toBeNull();
    expect(within(modal).getByRole('button', { name: /new\.operation/ })).toBeDefined();
  });

  it('같은 문맥의 필터 요청이 실패해도 select와 초점을 유지하고 오류 재시도를 보인다', async () => {
    const filteredRequest = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const parsed = new URL(String(url), 'http://local');
      if (parsed.pathname === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (parsed.pathname === '/api/audit-log') {
        return parsed.searchParams.get('operation') === 'old.operation'
          ? filteredRequest.promise
          : Promise.resolve(json(audit('initial-row', 'initial.operation')));
      }
      if (parsed.pathname === '/api/reconciliation-queue') return Promise.resolve(json(queue(0)));
      return Promise.resolve(commonResponse(parsed.pathname));
    }));
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const modal = await openAudit(user);
    await within(modal).findByTestId('audit-group');
    const select = within(modal).getByLabelText('조작');

    await user.selectOptions(select, 'old.operation');
    expect(document.activeElement).toBe(select);
    expect(within(modal).queryByTestId('audit-group')).toBeNull();
    filteredRequest.resolve(json({ reason: 'hidden' }, 500));

    expect(await within(modal).findByText('감사 로그를 불러오지 못했습니다.')).toBeDefined();
    expect(within(modal).getByRole('button', { name: '다시 불러오기' })).toBeDefined();
    expect(within(modal).queryByTestId('audit-group')).toBeNull();
    expect(within(modal).getByLabelText('조작')).toBe(select);
    expect(document.activeElement).toBe(select);
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '전체', 'old.operation', 'new.operation',
    ]);
  });

  it('계정이 바뀌면 늦은 이전 계정 응답이 새 계정 화면과 배지를 칠하지 않는다', async () => {
    const auditRequests = [deferred<Response>(), deferred<Response>()];
    const queueRequests = [deferred<Response>(), deferred<Response>()];
    let auditCall = 0;
    let queueCall = 0;
    const queryClient = client();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = new URL(String(url), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
      if (path === '/api/audit-log') return auditRequests[auditCall++]!.promise;
      if (path === '/api/reconciliation-queue') return queueRequests[queueCall++]!.promise;
      return Promise.resolve(commonResponse(path));
    }));
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    const modal = await openAudit(user);
    await waitFor(() => expect(auditCall).toBe(1));

    act(() => queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-b' }));
    await waitFor(() => expect(auditCall).toBe(2));
    const replacementModal = await openAudit(user);
    auditRequests[1]!.resolve(json(audit('account-b-row', 'new.operation')));
    queueRequests[1]!.resolve(json(queue(1)));
    await within(replacementModal).findByRole('button', { name: /new\.operation/ });
    auditRequests[0]!.resolve(json(audit('account-a-row', 'old.operation')));
    queueRequests[0]!.resolve(json(queue(7)));
    await act(async () => { await Promise.all([auditRequests[0]!.promise, queueRequests[0]!.promise]); });

    expect(within(replacementModal).queryByRole('button', { name: /old\.operation/ })).toBeNull();
    expect(within(replacementModal).getByTestId('queue-badge').textContent).toBe('1');
  });

  it('캐시 데이터가 있어도 실패한 authoritative 재읽기를 오류로 보인다', async () => {
    let failAudit = false;
    const queryClient = client();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = new URL(String(url), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
      if (path === '/api/audit-log') return Promise.resolve(failAudit ? json({ reason: 'hidden' }, 500) : json(audit('cached-row', 'old.operation')));
      if (path === '/api/reconciliation-queue') return Promise.resolve(json(queue(0)));
      return Promise.resolve(commonResponse(path));
    }));
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    const modal = await openAudit(user);
    await within(modal).findByTestId('audit-group');

    failAudit = true;
    await act(async () => { await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'audit-log' }); });
    expect(await within(modal).findByText('감사 로그를 불러오지 못했습니다.')).toBeDefined();
    expect(within(modal).queryByTestId('audit-group')).toBeNull();
  });

  it('감사와 대기열 실패가 각자의 다시 불러오기만 실행한다', async () => {
    let auditCalls = 0;
    let queueCalls = 0;
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = new URL(String(url), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
      if (path === '/api/audit-log') { auditCalls += 1; return Promise.resolve(json(null, 500)); }
      if (path === '/api/reconciliation-queue') { queueCalls += 1; return Promise.resolve(json(null, 500)); }
      return Promise.resolve(commonResponse(path));
    }));
    const user = userEvent.setup();
    render(<App queryClient={client()} />);
    const modal = await openAudit(user);
    await within(modal).findByText('감사 로그를 불러오지 못했습니다.');
    const beforeQueue = queueCalls;
    await user.click(within(modal).getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(auditCalls).toBe(2));
    expect(queueCalls).toBe(beforeQueue);

    await user.click(within(modal).getByRole('button', { name: '재조정 대기열' }));
    await within(modal).findByText('재조정 대기열을 불러오지 못했습니다.');
    const beforeAudit = auditCalls;
    await user.click(within(modal).getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(queueCalls).toBe(beforeQueue + 1));
    expect(auditCalls).toBe(beforeAudit);
  });

  it('역할 상실 뒤 다른 계정이 권한을 얻어도 이전 숫자 배지를 재사용하지 않는다', async () => {
    const secondQueue = deferred<Response>();
    let session: SessionBody = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 };
    let queueCalls = 0;
    const queryClient = client();
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request) => {
      const path = new URL(String(url), 'http://local').pathname;
      if (path === '/api/session') return Promise.resolve(json(session));
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
      if (path === '/api/audit-log') return Promise.resolve(json(audit('row', 'old.operation')));
      if (path === '/api/reconciliation-queue') {
        queueCalls += 1;
        return queueCalls === 1 ? Promise.resolve(json(queue(3))) : secondQueue.promise;
      }
      return Promise.resolve(commonResponse(path));
    }));
    const user = userEvent.setup();
    render(<App queryClient={queryClient} />);
    const modal = await openAudit(user);
    expect((await within(modal).findByTestId('queue-badge')).textContent).toBe('3');

    session = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };
    act(() => queryClient.setQueryData(['session'], session));
    await waitFor(() => expect(within(modal).queryByRole('tab', { name: '감사 로그' })).toBeNull());
    act(() => {
      queryClient.setQueryData(['identity'], { kind: 'ok', userId: 'user-b' });
      session = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 };
      queryClient.setQueryData(['session'], session);
    });
    const replacementModal = await openAudit(user);
    const auditTab = await within(replacementModal).findByRole('tab', { name: '감사 로그' });
    expect(within(auditTab).getByTestId('queue-badge').textContent).toBe('…');
    expect(queueCalls).toBe(2);
  });
});
