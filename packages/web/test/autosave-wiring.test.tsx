import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

const TREE = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      { id: 'n1', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let saves: Array<{ body: string; baseHash: string; session?: string }>;
let saveResponse: () => Response;

beforeEach(() => {
  saves = [];
  saveResponse = () => json({ hash: 'h2' });

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/tree') return Promise.resolve(json(TREE));
      if (path === '/api/documents/n1/session') return Promise.resolve(json({ session: 's1' }));
      if (path === '/api/documents/n1' && init?.method === 'PUT') {
        saves.push(JSON.parse(String(init.body)));
        return Promise.resolve(saveResponse());
      }
      if (path === '/api/documents/n1') return Promise.resolve(json({ body: '# 처음\n', hash: 'h1' }));
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDocument() {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: /회의록\.md/ }));
  await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull());
  return user;
}

describe('FR-STORAGE-001 — 자동 저장이 실제로 돈다', () => {
  it('AC-3: Ctrl+S 로 즉시 저장된다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.baseHash).toBe('h1');
  });

  it('AC-4: Ctrl+S 는 편집 세션을 실어 스냅샷을 남긴다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.session).toBe('s1');
  });

  it('AC-5: 충돌하면 배너가 뜨고 서버의 현재 본문을 함께 보여 준다', async () => {
    saveResponse = () => json({ current: '# 남이 고침\n' }, 409);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    const merge = await screen.findByRole('region', { name: '병합' });
    expect(merge.textContent).toContain('남이 고침');
  });

  it('AC-5: 충돌 뒤에는 더 저장하지 않는다 — 매번 거절되는 동안 사용자는 저장되고 있다고 믿는다', async () => {
    saveResponse = () => json({ current: '# 남이 고침\n' }, 409);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('region', { name: '병합' });
    await user.keyboard('{Control>}s{/Control}');

    expect(saves).toHaveLength(1);
  });

  it('FR-EDITOR-005 AC-3: 저장이 거부되면 그 사실이 표시된다', async () => {
    saveResponse = () => json(null, 403);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    expect((await screen.findByRole('alert')).textContent).toContain('저장');
  });

  it('AC-2: 저장 버튼은 어디에도 없다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    expect(screen.queryByRole('button', { name: /^저장$|저장하기/ })).toBeNull();
  });
});
