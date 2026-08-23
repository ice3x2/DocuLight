import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

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
        children: [],
      },
    ],
  },
];

const routes = new Map<string, () => Response>();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  routes.clear();
  routes.set('/api/session', () => json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
  routes.set('/api/tree', () => json(TREE));
  routes.set('/api/documents/n1', () => json({ body: '# 회의록\n\n본문이다', hash: 'h1' }));

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      const path = String(url).split('?')[0]!;
      const handler = routes.get(path);
      return Promise.resolve(handler === undefined ? json(null, 404) : handler());
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('앱 배선 — 화면이 서버에서 값을 받아 그린다', () => {
  it('IR-SHELL-002: 세션에 따라 설정 카테고리가 열린다', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));

    const modal = await screen.findByRole('dialog', { name: '설정' });
    // 세션을 안 받아오면 최소 권한으로 남아 관리 카테고리 아홉이 영영
    // 뜨지 않는다 — 관리 진입점이 관리 기능을 하나도 담지 못한다.
    expect(within(modal).getByRole('tab', { name: '인스턴스 설정' })).toBeDefined();
    expect(within(modal).getByRole('tab', { name: '휴지통' })).toBeDefined();
  });

  it('FR-WORKSPACE-003: 트리를 서버에서 받아 그린다', async () => {
    render(<App />);

    expect(await screen.findByRole('treeitem', { name: /기획팀/ })).toBeDefined();
  });

  it('FR-SHELL-012 AC-1: 트리에서 문서를 클릭하면 그 문서가 열린다', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));

    // 열린다는 것은 탭이 생기고 본문이 온다는 뜻이다.
    expect(await screen.findByRole('tab', { name: /회의록\.md/ })).toBeDefined();
    await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull());
  });

  it('FR-SHELL-006 AC-1: 문서를 열면 주소가 그 노드 ID 를 담는다', async () => {
    const user = userEvent.setup();
    render(<App />);

    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));

    await waitFor(() => expect(window.location.pathname).toBe('/d/n1'));
  });

  it('FR-AUTH-005: 접근 가능한 것이 없으면 빈 상태 안내가 뜬다', async () => {
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 }));
    routes.set('/api/tree', () => json([]));
    render(<App />);

    expect(await screen.findByRole('note', { name: '빈 상태 안내' })).toBeDefined();
  });

  it('IR-AUTH-001 AC-4: 인증되지 않으면 셸이 깔리지 않는다', async () => {
    routes.set('/api/session', () => json(null, 401));
    render(<App />);

    // 셸을 깔아 두고 그 위에 로그인 화면을 얹으면, 사용자가 로그인 전에
    // 트리와 탭의 껍데기를 보게 되고 그것이 「내용이 없다」로 읽힌다.
    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
  });

  it('IR-AUTH-001 AC-5: 인증 전 화면에는 좌하단 기어가 없다', async () => {
    routes.set('/api/session', () => json(null, 401));
    render(<App />);

    await screen.findByRole('main', { name: '로그인' });
    expect(screen.queryByRole('button', { name: '설정' })).toBeNull();
  });
});

describe('권한 감사 구역이 실제로 서버에서 값을 받아 그린다', () => {
  const 감사구역 = async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '권한 감사' }));
    return { user, modal };
  };

  it('FR-ACL-005: 상속 끊김 목록이 서버 응답으로 그려진다', async () => {
    routes.set('/api/broken-inheritance', () =>
      json({
        rows: [
          { nodeId: 'n9', workspaceId: 'ws-1', workspaceName: '기획팀', path: '닫힌방', aclAccessors: 0 },
        ],
      }),
    );

    const { user, modal } = await 감사구역();
    await user.click(within(modal).getByRole('tab', { name: '상속 끊김' }));

    // 배선이 없으면 이 자리는 `null` 이거나 「워크스페이스가 없습니다」다.
    const row = await screen.findByTestId('broken-row-n9');
    expect(row.textContent ?? '').toContain('ACL 접근자 0명');
    expect(row.textContent ?? '').toContain('권한으로 접근할 수 있는 사람이 없습니다');
  });

  it('FR-ACL-003 · FR-ACL-004: 관리 워크스페이스가 있으면 주체를 고를 자리가 선다', async () => {
    routes.set('/api/workspaces', () => json([{ id: 'ws-1', name: '기획팀', adminless: false }]));

    const { modal } = await 감사구역();

    // 스코프 근거가 없으면 검색칸 자체가 서지 않으므로(`R162`), 검색칸이
    // 섰다는 것은 워크스페이스가 실제로 배선됐다는 뜻이다.
    await waitFor(() =>
      expect(within(modal).getAllByLabelText('사용자·그룹 검색').length).toBeGreaterThan(0),
    );
    expect(within(modal).queryByTestId('audit-no-workspace')).toBeNull();
  });

  it('CON-PRINCIPAL-006: 그룹 멤버 추가가 서버로 나간다', async () => {
    routes.set('/api/roster/groups', () =>
      json([{ id: 'g1', name: '기획팀원', system: false, members: [] }]),
    );
    routes.set('/api/principals', () =>
      json([{ id: 'u9', name: '새사람', kind: 'user', status: 'active' }]),
    );
    const 보냈다: string[] = [];
    routes.set('/api/roster/groups/g1/members', () => {
      보냈다.push('g1');
      return json(null, 204);
    });

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '그룹 관리' }));

    await user.type(await within(modal).findByLabelText('사용자·그룹 검색'), '새사람');
    await user.click(await within(modal).findByText('새사람'));

    await waitFor(() => expect(보냈다).toEqual(['g1']));
  });
});
