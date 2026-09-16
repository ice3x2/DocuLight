import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { QUERY_KEYS } from '../src/api/queries.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('실제 links/tags query 오류가 stale 성공 행보다 우선하고 실제 refetch를 제공한다', async () => {
  window.history.replaceState(null, '', '/d/active');
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const fetcher = vi.fn((input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/api/session')) return json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 });
    if (url.endsWith('/api/tree')) return json([{ workspace: { id: 'ws', name: '작업공간' }, visibility: 'full', roots: [{ id: 'active', name: '현재.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] }] }]);
    if (url.includes('/documents/active/links') || url.includes('/tags')) return json({ message: 'internal secret' }, 500);
    return json(null, 404);
  });
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  client.setQueryData(QUERY_KEYS.links('active'), { backlinks: [{ nodeId: 'old', name: '오래된 링크', workspaceName: '옛곳', resolved: true }], outgoing: [] }, { updatedAt: 0 });
  client.setQueryData(QUERY_KEYS.tags(''), { basis: '서버 기준', tags: [{ name: '오래된태그', documents: 9 }] }, { updatedAt: 0 });
  render(<App queryClient={client} />);

  expect(await screen.findByRole('alert', { name: '백링크 오류' })).toBeDefined();
  expect(screen.queryByText('오래된 링크')).toBeNull();
  await userEvent.setup().click(screen.getByRole('tab', { name: '태그' }));
  expect(await screen.findByRole('alert', { name: '태그 오류' })).toBeDefined();
  expect(screen.queryByText('오래된태그')).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
  expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/tags')).length).toBeGreaterThan(1);
});
