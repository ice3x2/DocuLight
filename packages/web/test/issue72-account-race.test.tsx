import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceAdministrators, useWorkspaceList } from '../src/api/queries.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};

afterEach(() => vi.unstubAllGlobals());

describe('issue #72 계정 세대별 워크스페이스 데이터 격리', () => {
  it('이전 계정의 늦은 managed 목록이 새 계정 선택 원본을 덮지 않는다', async () => {
    const oldAccount = deferred<Response>();
    const newAccount = deferred<Response>();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => calls++ === 0 ? oldAccount.promise : newAccount.promise));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ userId, generation }) => useWorkspaceList(true, 'managed', userId, generation), {
      initialProps: { userId: 'old-user', generation: 1 }, wrapper,
    });

    await waitFor(() => expect(calls).toBe(1));
    rerender({ userId: 'new-user', generation: 2 });
    await waitFor(() => expect(calls).toBe(2));
    newAccount.resolve(json([{ id: 'new-workspace', name: '새 계정', adminless: false }]));
    await waitFor(() => expect(result.current.data?.[0]?.id).toBe('new-workspace'));
    oldAccount.resolve(json([{ id: 'old-workspace', name: '이전 계정', adminless: false }]));
    await oldAccount.promise;
    expect(result.current.data?.[0]?.id).toBe('new-workspace');
  });

  it('이전 계정의 늦은 직접 관리자 응답이 새 계정 상세를 덮지 않는다', async () => {
    const oldAccount = deferred<Response>();
    const newAccount = deferred<Response>();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(() => calls++ === 0 ? oldAccount.promise : newAccount.promise));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ userId, generation }) => useWorkspaceAdministrators(true, 'same-workspace', userId, generation), {
      initialProps: { userId: 'old-user', generation: 1 }, wrapper,
    });

    await waitFor(() => expect(calls).toBe(1));
    rerender({ userId: 'new-user', generation: 2 });
    await waitFor(() => expect(calls).toBe(2));
    newAccount.resolve(json({ nodeKind: 'workspace', rows: [{ entryId: 'new-entry', principalId: 'new-admin', principalName: '새 관리자', principalKind: 'user', level: 'admin', inherited: false, source: null }] }));
    await waitFor(() => expect(result.current.data?.[0]?.principalId).toBe('new-admin'));
    oldAccount.resolve(json({ nodeKind: 'workspace', rows: [{ entryId: 'old-entry', principalId: 'old-admin', principalName: '이전 관리자', principalKind: 'user', level: 'admin', inherited: false, source: null }] }));
    await oldAccount.promise;
    expect(result.current.data?.[0]?.principalId).toBe('new-admin');
  });
});
