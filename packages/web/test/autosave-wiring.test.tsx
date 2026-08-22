import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  // 트리에서 연다 — 같은 이름의 버튼이 탭 스트립에도 생기므로, 사용자가
  // 하듯 사이드바 안에서 고른다.
  const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
  await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
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

describe('FR-STORAGE-001 AC-4 — Ctrl+S 가 강제 스냅샷을 요청한다', () => {
  it('강제 표식을 실어 보낸다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    // 세션 ID 만 실으면 서버가 「이 세션은 이미 찍었다」로 건너뛴다 —
    // 두 번째 Ctrl+S 가 아무 지점도 남기지 않는다.
    expect((saves[0] as { forceSnapshot?: boolean }).forceSnapshot).toBe(true);
  });

  it('자동 저장은 강제하지 않는다 — 세션당 1회 규칙이 그대로 산다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard('고침');

    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 3000 });
    expect((saves[0] as { forceSnapshot?: boolean }).forceSnapshot).toBeUndefined();
  });
});

describe('편집 없이 저장해도 본문을 지우지 않는다', () => {
  it('아무것도 치지 않고 Ctrl+S 를 누르면 받아 온 본문 그대로 저장된다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    // 빈 문자열로 나가면 기준 해시는 맞으므로 서버가 받아들이고, 사용자
    // 화면의 글이 통째로 사라진다.
    expect(saves[0]!.body).toBe('# 처음\n');
  });

  it('고친 뒤에는 고친 것이 나간다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard('고침');
    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
    expect(saves[saves.length - 1]!.body).toContain('고침');
  });
});
