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
  // 앞 시험이 문서를 열면 그 주소가 창에 남는다 — 창은 파일 하나에 하나뿐이라
  // 다음 시험의 앱이 그 딥링크를 보고 문서를 연다.
  window.history.replaceState(null, '', '/');
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

describe('FR-SHELL-007 AC-4 · AC-5 — 휴지통의 워크스페이스 필터와 범위 토글', () => {
  const TRASH = [
    {
      nodeId: 't1',
      workspaceId: 'ws-1',
      workspaceName: '기획팀',
      originalPath: '기획팀/회의록.md',
      deletedAt: '2026-08-20T01:00:00.000Z',
      deletedBy: '한범',
      canPurge: true,
    },
  ];

  const openTrash = async () => {
    routes.set('/api/trash', () => json(TRASH));
    const user = await openTree();
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', {
        name: '휴지통',
      }),
    );
    return user;
  };

  it('AC-4: 워크스페이스를 고르면 그 워크스페이스로 좁혀 다시 받는다', async () => {
    const user = await openTrash();

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '워크스페이스 필터' }),
      'ws-1',
    );

    await waitFor(() =>
      expect(
        (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.some((call) =>
          String(call[0]).includes('workspaceId=ws-1'),
        ),
      ).toBe(true),
    );
  });

  it('AC-5: 관리 권한이 있으면 전체/본인분 토글이 서고, 누르면 범위가 실려 나간다', async () => {
    const user = await openTrash();

    await user.click(await screen.findByRole('button', { name: '전체 보기' }));

    await waitFor(() =>
      expect(
        (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.some((call) =>
          String(call[0]).includes('scope=all'),
        ),
      ).toBe(true),
    );
  });
});

describe('CON-EDITOR-002 AC-2 · AC-3 — 백링크와 아웃고잉 링크 패널', () => {
  const LINKS = {
    outgoing: [
      { nodeId: 'n3', name: '설계.md', workspaceName: '기획팀', resolved: true },
      { nodeId: null, name: '없는문서', workspaceName: null, resolved: false },
    ],
    backlinks: [{ nodeId: 'n4', name: '주간보고.md', workspaceName: '기획팀', resolved: true }],
  };

  it('AC-2: 열린 문서를 가리키는 문서가 백링크 탭에 온다', async () => {
    routes.set('/api/documents/n1/links', () => json(LINKS));
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    const right = screen.getByRole('complementary', { name: '우측 사이드바' });
    await user.click(within(right).getByRole('tab', { name: '백링크' }));

    const list = await screen.findByRole('list', { name: '백링크' });
    expect(within(list).getByText('주간보고.md')).toBeDefined();
  });

  it('AC-3: 열린 문서가 가리키는 문서가 아웃고잉 탭에 온다', async () => {
    routes.set('/api/documents/n1/links', () => json(LINKS));
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    const right = screen.getByRole('complementary', { name: '우측 사이드바' });
    await user.click(within(right).getByRole('tab', { name: '아웃고잉 링크' }));

    const list = await screen.findByRole('list', { name: '아웃고잉 링크' });
    expect(within(list).getByText('설계.md')).toBeDefined();
    // 아직 없는 문서도 줄을 갖는다 — 지우면 사용자가 적은 링크가 사라진
    // 것으로 읽힌다.
    expect(within(list).getByText('없는문서')).toBeDefined();
  });

  it('문서를 열지 않았으면 링크를 묻지 않는다 — 물을 대상이 없다', async () => {
    await openTree();

    await waitFor(() => expect(screen.getByRole('tree', { name: '문서 트리' })).toBeDefined());
    expect(
      (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.some((call) =>
        String(call[0]).includes('/links'),
      ),
    ).toBe(false);
  });
});

describe('CON-ARCH-004 AC-4 — 사용자·그룹 검색이 cmdk 로 선다', () => {
  const openCategory = async (name: string) => {
    const user = await openTree();
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name }),
    );
    return user;
  };

  it('사용자 관리에서 친 글자가 질의로 나가고 결과가 목록에 뜬다', async () => {
    routes.set('/api/principals', () =>
      json([
        { id: 'p1', name: '한범', kind: 'user' },
        { id: 'g1', name: '기획팀', kind: 'group' },
      ]),
    );
    const user = await openCategory('사용자 관리');

    await user.type(await screen.findByRole('combobox', { name: '사용자·그룹 검색' }), '한');

    await waitFor(() => expect(screen.getByText('한범')).toBeDefined());
  });

  it('그룹 관리도 같은 검색을 쓴다 — 두 벌을 만들면 한쪽만 고쳐진다', async () => {
    routes.set('/api/principals', () => json([{ id: 'g1', name: '기획팀', kind: 'group' }]));
    await openCategory('그룹 관리');

    expect(await screen.findByRole('combobox', { name: '사용자·그룹 검색' })).toBeDefined();
  });
});
