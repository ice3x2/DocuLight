import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { CONTEXT_MENU_ITEMS } from '../src/tree/tree-contract.js';

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
/** 주소 이력에 쌓인 자리. 같은 자리가 두 번 쌓이면 뒤로 가기가 멈춘 것처럼 된다. */
let pushed: string[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  // 앞 시험이 문서를 열면 그 주소가 창에 남는다 — 창은 파일 하나에 하나뿐이라
  // 다음 시험의 앱이 그 딥링크를 보고 문서를 연다.
  window.history.replaceState(null, '', '/');
  routes.clear();
  sent = [];
  pushed = [];
  // 원본을 부르지 않는다 — happy-dom 의 구현이 다시 이 자리를 타고 들어와
  // 한 번의 호출이 수백 번으로 불어난다. 여기서 재려는 것은 **몇 번
  // 밀렸는가**뿐이므로 기록만 한다.
  vi.spyOn(window.history, 'pushState').mockImplementation((_data, _unused, url) => {
    pushed.push(String(url));
  });
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
  /** 태그 탭이 목록을 그리려면 색인이 있어야 한다. */
  const 태그색인 = () => {
    routes.set('/api/tags', () =>
      json({
        tags: [{ name: '할일', documents: 1 }],
        basis: '내가 볼 수 있는 문서 기준 출현 문서 수',
      }),
    );
  };

  /** 지금 검색 입력에 들어 있는 질의. */
  const 질의 = async () =>
    ((await screen.findByRole('combobox', { name: '검색' })) as HTMLInputElement).value;

  it('본문의 태그를 누르면 좌측이 검색 탭으로 바뀌고 그 태그가 질의가 된다', async () => {
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    const tag = await screen.findByRole('button', { name: '#할일' });
    await user.click(tag);

    expect(await 질의()).toBe('#할일');
  });

  it('본문 태그를 누른 결과가 우측 태그 탭에서 누른 결과와 같다', async () => {
    // 조항이 요구하는 것은 두 자리가 각각 무엇을 채우는가가 아니라 **둘이
    // 같은가**이다. 한쪽만 재면 다음에 다른 쪽이 어긋나도 아무도 모른다.
    태그색인();
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    await user.click(await screen.findByRole('button', { name: '#할일' }));
    const 본문경로 = await 질의();

    const 우측 = screen.getByRole('complementary', { name: '우측 사이드바' });
    await user.click(within(우측).getByRole('tab', { name: '태그' }));
    const 태그구역 = await screen.findByRole('region', { name: '태그' });
    await user.click(within(태그구역).getByRole('button', { name: /할일/ }));
    const 태그탭경로 = await 질의();

    expect(본문경로).toBe(태그탭경로);
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

describe('R112-d — 슈퍼유저 전용 관리 화면에 중립어 부품을 두지 않는다', () => {
  const openCategory = async (name: string) => {
    const user = await openTree();
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name }),
    );
    return user;
  };

  for (const name of ['사용자 관리', '그룹 관리']) {
    it(`${name} 에 주체 검색 상자가 서지 않는다`, async () => {
      await openCategory(name);

      // `PrincipalPicker` 는 `suspended` 를 `비활성` 으로 적고 `rejected`
      // 를 감춘다. 슈퍼유저가 그 상태를 **직접 설정하는** 화면에 두면
      // 원장 `R112-d` 가 지키려는 4상태 게이트가 보이지 않게 된다.
      // 이 화면은 `FR-PRINCIPAL-009` 가 소유하며 아직 서지 않았다.
      expect(screen.queryByRole('combobox', { name: '사용자·그룹 검색' })).toBeNull();
    });
  }
});

describe('검증에서 나온 나머지 — 안내 소거·취소·포커스', () => {
  it('안내를 닫으면 사라진다 — 세션 내내 남으면 지난 조작의 말이 지금 것으로 읽힌다', async () => {
    routes.set('/api/nodes', () =>
      json({ id: 'n9', name: '제목 없음 (2).md', notice: '같은 이름이 있어 바꿔 만들었습니다.' }),
    );
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '새 노트' }));
    await screen.findByRole('status', { name: '알림' });
    await user.click(screen.getByRole('button', { name: '알림 닫기' }));

    expect(screen.queryByRole('status', { name: '알림' })).toBeNull();
  });

  it('md 문서의 새 버전 올리기도 그만둘 수 있다 — 파일을 고르는 것 말고 없앨 방법이 있어야 한다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '새 버전 올리기' }),
    );
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    expect(screen.queryByLabelText('회의록.md 새 버전 파일')).toBeNull();
  });

  it('되돌릴 수 없는 파일의 경고는 모달로 선다 — 뒤가 조작 가능하면 경고를 지나칠 수 있다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /설계.zip/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '새 버전 올리기' }),
    );

    const warning = await screen.findByRole('alertdialog', { name: '새 버전 올리기' });
    expect(warning.getAttribute('aria-modal')).toBe('true');
  });
});

describe('탭 상태의 정본은 하나다', () => {
  const TWO = [
    {
      workspace: { id: 'ws-1', name: '기획팀' },
      visibility: 'full',
      roots: [
        { id: 'n1', name: '가.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        { id: 'n2', name: '나.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      ],
    },
  ];

  const openBoth = async () => {
    routes.set('/api/tree', () => json(TWO));
    routes.set('/api/documents/n1', () => json({ body: '가 본문\n', hash: 'a1' }));
    routes.set('/api/documents/n2', () => json({ body: '나 본문\n', hash: 'b1' }));
    routes.set('/api/documents/n1/links', () => json({ outgoing: [], backlinks: [] }));
    routes.set('/api/documents/n2/links', () =>
      json({ outgoing: [], backlinks: [{ nodeId: 'n1', name: '가.md', workspaceName: '기획팀', resolved: true }] }),
    );

    const user = userEvent.setup();
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: '가.md' }));
    await user.pointer({ keys: '[MouseLeft>]' });
    await user.keyboard('{Control>}');
    await user.click(within(sidebar).getByRole('button', { name: '나.md' }));
    await user.keyboard('{/Control}');
    return user;
  };

  it('CON-EDITOR-002 AC-2: 탭을 바꾸면 백링크도 그 문서 것으로 바뀐다', async () => {
    const user = await openBoth();

    // 탭 스트립에서 첫 문서로 돌아간다 — 그 전환이 앱에 닿지 않으면
    // 우측 패널이 앞 문서의 링크를 계속 보인다.
    const tabs = screen.getByRole('tablist', { name: '열린 문서' });
    await user.click(within(tabs).getByRole('tab', { name: '가.md' }));

    await waitFor(() => {
      const list = screen.getByRole('list', { name: '백링크' });
      expect(within(list).queryByText('가.md')).toBeNull();
    });
  });
});

describe('휴지통 복구·영구 삭제가 서버까지 닿는다 (`FR-SHELL-007` · `SEC-SHELL-001`)', () => {
  const TRASH_ROW = [
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

  const openTrashPanel = async () => {
    routes.set('/api/trash', () => json(TRASH_ROW));
    routes.set('/api/trash/t1', () => json(null, 204));
    routes.set('/api/nodes/t1/restore', () => json(null, 204));
    const user = await openTree();
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name: '휴지통' }),
    );
    return user;
  };

  it('영구 삭제를 누르면 그 요청이 나간다', async () => {
    const user = await openTrashPanel();

    await user.click(await screen.findByRole('button', { name: /영구 삭제/ }));

    await waitFor(() =>
      expect(sent.some((one) => one.path === '/api/trash/t1' && one.method === 'DELETE')).toBe(true),
    );
  });

  it('복구를 누르면 그 요청이 나간다', async () => {
    const user = await openTrashPanel();

    await user.click(await screen.findByRole('button', { name: /복구/ }));

    await waitFor(() => expect(sent.some((one) => one.path.includes('restore'))).toBe(true));
  });
});

describe('FR-SHELL-006 AC-4 — 트리가 갱신돼도 이력이 쌓이지 않는다', () => {
  it('업로드로 트리를 다시 받아도 딥링크가 같은 자리를 또 밀지 않는다', async () => {
    routes.set('/api/documents/n1/links', () => json({ outgoing: [], backlinks: [] }));
    routes.set('/api/nodes/n1/uploads', () => json({ id: 'n5', name: '새 파일.txt' }));
    const user = await openTree();

    await user.click(screen.getByRole('button', { name: '회의록.md' }));
    await waitFor(() => expect(pushed.filter((one) => one.includes('n1'))).toHaveLength(1));

    // 트리를 다시 받게 만든다 — 그때마다 딥링크 효과가 다시 도는데,
    // 그것이 주소를 또 밀면 뒤로 가기가 여러 번 눌러야 동작한다.
    await user.click(screen.getByRole('tab', { name: '문서 트리' }));
    routes.set('/api/tree', () => json(TREE.map((entry) => ({ ...entry }))));
    await user.click(screen.getByRole('button', { name: '새 노트' }));
    await waitFor(() => expect(sent.some((one) => one.path === '/api/nodes')).toBe(true));

    expect(pushed.filter((one) => one.includes('n1'))).toHaveLength(1);
  });
});

describe('IR-SHELL-005 — 트리 컨텍스트 메뉴의 항목이 실제 조작에 닿는다', () => {
  /**
   * **아직 조작에 닿지 못하는 항목과 그 사유.**
   *
   * 이 목록이 줄어드는 것이 다음 작업의 정의다. 사유를 함께 적는 이유는
   * 빈 허용목록이 곧 「나중에」가 되기 때문이며, 어느 작업이 이 줄을
   * 지우는지가 적혀 있어야 그 작업이 실제로 온다. `packages/server` 의
   * 조립 방벽이 쓰는 방식과 같다.
   *
   * **여기 없는 항목이 끊기면 그 순간 이 시험이 실패한다** — 그것이 이
   * 방벽이 있는 이유다. 겉모습만 재는 `tree-menu.test.tsx` 는 아홉 항목이
   * 전부 끊겨 있어도 통과한다.
   */
  const 아직_닿지_않음: ReadonlyMap<string, string> = new Map([
    ['new-file', '메뉴 항목이 끊겨 있다. 문서 생성은 트리 상단 「새 노트」 버튼에만 배선돼 있고 그 버튼은 자리를 고를 수 없다'],
    ['new-directory', '메뉴 항목이 끊겨 있다. kind=directory 로 createNode 를 부르는 자리가 화면에 없다'],
    ['rename', '**배선은 이어져 있다.** 다만 이름을 고르는 자리를 거치므로 「눌렀을 때 곧바로 나가는가」로는 재어지지 않는다 — 아래 `FR-SHELL-015` 시험이 그 왕복을 잰다'],
    ['move', '**배선은 이어져 있다.** 다만 목적지를 고르고 확인 관문을 지나야 하므로 「눌렀을 때 곧바로 나가는가」로는 재어지지 않는다 — 아래 `FR-SHELL-015` 시험이 그 왕복을 잰다'],
    ['copy', '**배선은 이어져 있다.** 이동과 같은 자리를 거치므로 같은 사유다 — 아래 `FR-SHELL-015` 시험이 그 왕복을 잰다'],
    ['share', 'client 함수와 서버 라우트는 있으나 그것을 쓸 화면이 자리표다 — document/ShareModal.tsx 가 안내 문구만 그린다'],
    ['new-version', '**배선은 이어져 있다.** 다만 파일 선택기를 거치므로 고르기 전에는 요청이 나가지 않아, 이 시험의 「눌렀을 때 나가는가」로는 재어지지 않는다'],
  ]);

  it('AC-1 · AC-2: 삭제를 고르면 그 노드가 휴지통으로 간다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }));

    await waitFor(() =>
      expect(sent).toContainEqual({ path: '/api/nodes/n1', method: 'DELETE', body: undefined }),
    );
  });

  it('AC-2: 삭제한 노드가 휴지통 목록에 나타난다', async () => {
    // 삭제가 나간 뒤에만 휴지통이 그 노드를 돌려준다 — 목록이 처음부터
    // 차 있으면 「삭제가 넣었다」와 「원래 있었다」가 갈리지 않는다.
    routes.set('/api/trash', () =>
      json(
        sent.some((one) => one.method === 'DELETE' && one.path === '/api/nodes/n1')
          ? [
              {
                nodeId: 'n1',
                originalPath: '기획팀/회의록.md',
                workspaceName: '기획팀',
                deletedAt: '2026-08-30T00:00:00.000Z',
                canPurge: false,
              },
            ]
          : [],
      ),
    );
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '삭제' }));

    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '휴지통' }));

    expect(await screen.findByRole('button', { name: /기획팀\/회의록\.md 복구/ })).toBeTruthy();
  });

  it.each(CONTEXT_MENU_ITEMS.map((item) => [item.id, item.label] as const))(
    'AC-3 · AC-4: `%s` 는 명시된 목록과 실제 배선이 일치한다',
    async (id, label) => {
      const user = await openTree();
      await user.pointer({
        keys: '[MouseRight]',
        target: screen.getByRole('treeitem', { name: /회의록/ }),
      });

      const 항목 = within(await screen.findByRole('menu')).getByRole('menuitem', { name: label });
      const 이전 = sent.length;
      await user.click(항목);
      // 요청은 비동기로 나간다. 나가지 않는 항목을 기다리느라 시험이 느려지지
      // 않도록, 나가는 항목만 기다리고 나머지는 한 틱만 준다.
      await waitFor(() => expect(sent.length).toBeGreaterThan(이전)).catch(() => undefined);

      const 닿았다 = sent.length > 이전;
      const 사유 = 아직_닿지_않음.get(id);

      if (사유 === undefined) {
        expect(닿았다, `\`${id}\` 가 끊겼다. 고치거나, 사유와 함께 목록에 올려라`).toBe(true);
      } else {
        expect(
          닿았다,
          `\`${id}\` 가 이제 닿는다 — 목록에서 그 줄을 지워라. 적혀 있던 사유: ${사유}`,
        ).toBe(false);
      }
    },
  );
});

describe('FR-SHELL-015 — 이름 변경이 화면에서 서버까지 닿는다', () => {
  it('AC-1: 메뉴에서 고른 이름이 서버로 나간다', async () => {
    routes.set('/api/nodes/n1/rename', () => json({ name: '바뀐이름.md' }));
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '이름 변경' }),
    );

    // 지금 이름이 골라진 채로 서 있어야 한다 — 바꾸려는 사람이 먼저
    // 지워야 하면 그 한 걸음이 매번 든다.
    const 입력 = await screen.findByRole('textbox', { name: /새 이름/ });
    expect((입력 as HTMLInputElement).value).toBe('회의록.md');

    await user.clear(입력);
    await user.type(입력, '바뀐이름.md');
    await user.click(screen.getByRole('button', { name: '이름 바꾸기' }));

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/nodes/n1/rename',
        method: 'POST',
        body: { name: '바뀐이름.md' },
      }),
    );
  });

  it('AC-1: 그만두면 아무것도 나가지 않는다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '이름 변경' }),
    );
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    // 잘못 연 사용자가 빠져나갈 길이 없으면 아무 이름이나 넣게 된다.
    expect(screen.queryByRole('textbox', { name: /새 이름/ })).toBeNull();
    expect(sent.some((one) => one.path.includes('/rename'))).toBe(false);
  });

  it('AC-1: 빈 이름으로는 나가지 않는다 — 부재는 판정 이전이다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '이름 변경' }),
    );
    await user.clear(await screen.findByRole('textbox', { name: /새 이름/ }));
    await user.click(screen.getByRole('button', { name: '이름 바꾸기' }));

    // 이름 **규칙**은 서버가 소유한다. 화면이 막는 것은 입력이 아예 없는
    // 경우 하나뿐이고, 그것은 규칙 판정이 아니다.
    expect(sent.some((one) => one.path.includes('/rename'))).toBe(false);
  });
});

describe('FR-SHELL-015 — 이동과 복사가 화면에서 서버까지 닿는다', () => {
  /** 메뉴를 열어 한 항목을 고르고, 목적지를 고른 뒤 확인 관문까지 지난다. */
  const 자리를고르고실행한다 = async (항목: string, 목적지: string) => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 항목 }));

    await user.selectOptions(await screen.findByLabelText('목적지'), 목적지);

    // 실행 버튼은 **관문이 아니다** — 그것을 누르면 확인 다이얼로그가 서고,
    // 거기서 한 번 더 실행해야 나간다 (`FR-CONFIRM-005`).
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '실행' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }),
    );
    return user;
  };

  it('AC-2: 이동은 고른 자리로 나가고 워크스페이스를 고르면 루트다', async () => {
    routes.set('/api/nodes/n1/move', () => json({ name: '회의록.md' }));

    await 자리를고르고실행한다('이동', 'ws-1');

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/nodes/n1/move',
        method: 'POST',
        body: { parentId: null },
      }),
    );
  });

  it('AC-4: 복사는 같은 자리를 워크스페이스로 표현한다 — 두 조작의 계약이 다르다', async () => {
    routes.set('/api/nodes/n1/copy', () => json({ id: 'n9', name: '회의록 (2).md', copied: 1 }));

    await 자리를고르고실행한다('복사', 'ws-1');

    // 이동은 부모 없음, 복사는 워크스페이스 — 서버가 목적지를 판별
    // 합집합으로 받으므로 화면도 여기서 갈라 보낸다.
    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/nodes/n1/copy',
        method: 'POST',
        body: { workspaceId: 'ws-1' },
      }),
    );
  });

  it('AC-2: 목적지를 고르지 않으면 실행할 수 없다', async () => {
    const user = await openTree();

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: '이동' }));

    const 실행 = within(await screen.findByRole('dialog')).getByRole('button', { name: '실행' });
    expect(실행).toHaveProperty('disabled', true);
    expect(sent.some((one) => one.path.includes('/move'))).toBe(false);
  });
});
