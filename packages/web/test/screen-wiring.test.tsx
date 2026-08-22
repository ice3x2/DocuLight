import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

/**
 * 화면 배선 — 조작이 서버까지, 서버가 다시 화면까지 닿는가.
 *
 * 부품이 서 있는 것과 배선이 이어진 것은 다르다. 부품만 재는 시험은 그
 * 사이가 끊겨도 통과하고, 끊긴 배선은 사용자가 눌러 봐야 드러난다.
 */
const TREE = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      {
        id: 'n1',
        name: '회의록.md',
        kind: 'file',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        overwriteIrreversible: false,
        children: [],
      },
      {
        id: 'n2',
        name: '설계.zip',
        kind: 'file',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        overwriteIrreversible: true,
        children: [],
      },
    ],
  },
];

const routes = new Map<string, (init?: RequestInit) => Response>();
/** 서버로 나간 요청 — 배선이 끊기면 여기가 빈다. */
let sent: { path: string; method: string; body: unknown }[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  routes.clear();
  sent = [];
  routes.set('/api/session', () =>
    json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }),
  );
  routes.set('/api/tree', () => json(TREE));
  routes.set('/api/favorites', () => json([]));
  routes.set('/api/documents/n1', () => json({ body: '회의를 했다\n\n#할일 을 적는다\n', hash: 'h1' }));

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        sent.push({
          path,
          method,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
        });
      const handler = routes.get(path);
      return Promise.resolve(handler === undefined ? json(null, 404) : handler(init));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const openTree = async () => {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('treeitem', { name: /회의록/ });
  return user;
};

describe('FR-SHELL-001 AC-3 · AC-4 — 즐겨찾기가 목록까지 닿는다', () => {
  it('트리에서 즐겨찾기를 고르면 서버로 나간다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '즐겨찾기' }));

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/favorites',
        method: 'POST',
        body: { nodeId: 'n1' },
      }),
    );
  });

  it('더한 것이 즐겨찾기 탭 목록에 나타난다', async () => {
    routes.set('/api/favorites', (init) =>
      init?.method === 'POST'
        ? json(null, 204)
        : json(
            sent.some((one) => one.path === '/api/favorites')
              ? [{ nodeId: 'n1', name: '회의록.md', kind: 'file', workspaceName: '기획팀' }]
              : [],
          ),
    );
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '즐겨찾기' }));
    await user.click(screen.getByRole('tab', { name: '즐겨찾기' }));

    const list = await screen.findByRole('list', { name: '즐겨찾기' });
    await waitFor(() => expect(within(list).getByText('회의록.md')).toBeDefined());
  });
});

describe('SEC-SHELL-002 AC-3 — 이름 충돌 안내가 화면에 뜬다', () => {
  it('접미사가 붙어 만들어지면 그 사실을 알린다', async () => {
    routes.set('/api/nodes', () =>
      json({ id: 'n9', name: '제목 없음 (2).md', notice: '같은 이름이 있어 `제목 없음 (2).md` 로 만들었습니다.' }),
    );
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '새 노트' }));

    // 서버가 보낸 문구를 그대로 보인다 — 화면이 다시 지으면 보이는 충돌과
    // 보이지 않는 충돌의 문구가 갈리고, 그 차이가 존재 오라클이 된다.
    expect(await screen.findByRole('status', { name: '알림' })).toHaveProperty(
      'textContent',
      '같은 이름이 있어 `제목 없음 (2).md` 로 만들었습니다.',
    );
  });

  it('접미사가 붙지 않았으면 아무 말도 하지 않는다', async () => {
    routes.set('/api/nodes', () => json({ id: 'n9', name: '제목 없음.md' }));
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '새 노트' }));

    await waitFor(() => expect(sent.some((one) => one.path === '/api/nodes')).toBe(true));
    expect(screen.queryByRole('status', { name: '알림' })).toBeNull();
  });
});

describe('FR-SHELL-008 AC-5 — 되돌릴 수 없는 덮어쓰기는 경고한다', () => {
  it('바이너리 파일의 새 버전 올리기는 경고를 먼저 세운다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /설계.zip/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '새 버전 올리기' }),
    );

    const warning = await screen.findByRole('alertdialog', { name: '새 버전 올리기' });
    expect(warning.textContent).toContain('되돌릴 수 없습니다');
  });

  it('md 문서에는 경고가 서지 않는다 — 그것은 버전으로 남는다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '새 버전 올리기' }),
    );

    expect(screen.queryByRole('alertdialog', { name: '새 버전 올리기' })).toBeNull();
  });
});

describe('FR-EDITOR-007 AC-11 — 태그를 누르면 그 태그로 검색된다', () => {
  it('본문의 태그를 누르면 좌측이 검색 탭으로 바뀌고 그 태그가 질의가 된다', async () => {
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    const tag = await screen.findByRole('button', { name: '#할일' });
    await user.click(tag);

    const search = await screen.findByRole('combobox', { name: '검색' });
    expect(search).toHaveProperty('value', '할일');
  });
});
