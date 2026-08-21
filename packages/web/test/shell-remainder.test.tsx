import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import type { Viewer } from '../src/shell/shell-contract.js';
import { FavoritesView } from '../src/favorites/FavoritesView.js';
import { back, forward, visit, type History } from '../src/routing/history.js';
import { urlForNode } from '../src/routing/deep-link.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(cleanup);

const VIEWER: Viewer = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

const node = (over: Partial<TreeNodeView> = {}): TreeNodeView => ({
  id: 'n1',
  name: '회의록.md',
  kind: 'file',
  visibility: 'full',
  level: 'edit',
  parentLevel: 'edit',
  children: [],
  ...over,
});

describe('IR-SHELL-002 — 설정 진입', () => {
  it('AC-1: 좌하단 기어 버튼을 누르면 설정 모달이 열린다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={VIEWER} />);

    const gear = screen.getByRole('button', { name: '설정' });
    // 좌하단이라는 자리가 요구다 — 어디에 있어도 되는 버튼이면 사용자가
    // 매번 찾아야 한다.
    expect(gear.closest('[data-shell="settings-corner"]')).not.toBeNull();

    await user.click(gear);

    expect(await screen.findByRole('dialog', { name: '설정' })).toBeDefined();
  });
});

describe('FR-SHELL-001 — 즐겨찾기 뷰', () => {
  const favorites = [
    { nodeId: 'n1', name: '회의록.md', kind: 'file' as const, workspaceName: '기획팀' },
    { nodeId: 'd1', name: '회의', kind: 'directory' as const, workspaceName: '기획팀' },
  ];

  it('AC-3: 즐겨찾기에 추가한 문서가 목록에 나타난다', () => {
    render(<FavoritesView favorites={favorites} />);

    expect(within(screen.getByRole('list', { name: '즐겨찾기' })).getByText('회의록.md')).toBeDefined();
  });

  it('AC-4: 즐겨찾기에 추가한 디렉토리도 목록에 나타난다', () => {
    render(<FavoritesView favorites={favorites} />);

    // 문서만 담기면 디렉토리를 즐겨찾기한 사용자는 그것을 다시 찾지 못한다.
    expect(within(screen.getByRole('list', { name: '즐겨찾기' })).getByText('회의')).toBeDefined();
  });

  it('빈 즐겨찾기도 목록 자체는 선다 — 사라지면 탭이 고장으로 읽힌다', () => {
    render(<FavoritesView favorites={[]} />);

    expect(screen.getByRole('list', { name: '즐겨찾기' })).toBeDefined();
  });
});

describe('FR-SHELL-006 — 문서 이동 이력', () => {
  const start: History = { entries: [urlForNode('a')], at: 0 };

  it('AC-4: 뒤로 가면 직전 문서로 돌아간다', () => {
    const two = visit(start, urlForNode('b'));

    expect(two.entries[two.at]).toBe(urlForNode('b'));
    expect(back(two).entries[back(two).at]).toBe(urlForNode('a'));
  });

  it('AC-4: 앞으로 가면 되돌아간 자리에서 다시 나아간다', () => {
    const two = visit(start, urlForNode('b'));

    expect(forward(back(two)).entries[forward(back(two)).at]).toBe(urlForNode('b'));
  });

  it('AC-4: 끝에서 더 가려 해도 이력을 벗어나지 않는다', () => {
    expect(back(start)).toEqual(start);
    expect(forward(start)).toEqual(start);
  });

  it('되돌아간 자리에서 새 문서를 열면 앞쪽 이력이 잘린다', () => {
    // 자르지 않으면 「앞으로」가 사용자가 가지 않은 갈래로 데려간다.
    const three = visit(visit(start, urlForNode('b')), urlForNode('c'));
    const branched = visit(back(three), urlForNode('d'));

    expect(branched.entries).toEqual([urlForNode('a'), urlForNode('b'), urlForNode('d')]);
    expect(forward(branched)).toEqual(branched);
  });
});

describe('FR-WORKSPACE-003 — 워크스페이스를 넘는 링크', () => {
  it('AC-5: 다른 워크스페이스의 문서를 열어도 그 워크스페이스가 이미 트리에 있다', () => {
    const workspaces: WorkspaceTreeView[] = [
      { workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [node({ id: 'a' })] },
      { workspace: { id: 'ws-2', name: '인사팀' }, visibility: 'full', roots: [node({ id: 'b', name: '급여.md' })] },
    ];

    render(
      <AppShell
        viewer={VIEWER}
        workspaces={workspaces}
        documents={{
          tabs: [{ nodeId: 'b', name: '급여.md', breadcrumb: ['인사팀', '급여.md'], save: 'saved' }],
          activeId: 'b',
        }}
      />,
    );

    // 「전환」이 필요 없다는 것이 이 AC 의 내용이다 — 접근 가능한 것이
    // 처음부터 전부 서 있으므로 링크가 도착한 곳도 이미 서 있다.
    expect(screen.getByRole('treeitem', { name: /인사팀/ })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: /기획팀/ })).toBeDefined();
  });
});
