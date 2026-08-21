import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentTree } from '../src/tree/DocumentTree.js';
import {
  CONTEXT_MENU_ITEMS,
  enabledMenuItems,
  type TreeNodeView,
} from '../src/tree/tree-contract.js';

afterEach(cleanup);

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

const WORKSPACES = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full' as const,
    roots: [node({ id: 'doc', name: '회의록.md' })],
  },
  {
    workspace: { id: 'ws-2', name: '인사팀' },
    visibility: 'pass-through' as const,
    roots: [node({ id: 'dir', name: '급여', kind: 'directory', visibility: 'pass-through', level: null })],
  },
];

describe('FR-WORKSPACE-003 — 접근 가능한 워크스페이스가 나란히 선다', () => {
  it('AC-1: 둘이 동시에 최상위 항목으로 나타난다', () => {
    render(<DocumentTree workspaces={WORKSPACES} />);

    expect(screen.getByRole('treeitem', { name: /기획팀/ })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: /인사팀/ })).toBeDefined();
  });

  it('AC-3: 현재 워크스페이스를 고르는 전환 UI 가 없다', () => {
    render(<DocumentTree workspaces={WORKSPACES} />);

    // 셀렉트·콤보박스가 있으면 그것이 곧 전환 UI 다.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /워크스페이스 (전환|선택|변경)/ })).toEqual([]);
  });

  it('AC-2: 둘의 하위를 전환 조작 없이 각각 펼친다', async () => {
    const user = userEvent.setup();
    render(
      <DocumentTree
        workspaces={[
          { ...WORKSPACES[0]!, roots: [node({ id: 'a', name: '기획', kind: 'directory', children: [node({ id: 'a1', name: '안.md' })] })] },
          { ...WORKSPACES[1]!, roots: [node({ id: 'b', name: '인사', kind: 'directory', children: [node({ id: 'b1', name: '표.md' })] })] },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: '기획 펼치기' }));
    await user.click(screen.getByRole('button', { name: '인사 펼치기' }));

    expect(screen.getByRole('treeitem', { name: /안\.md/ })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: /표\.md/ })).toBeDefined();
  });
});

describe('FR-SHELL-003 — 트리 컨텍스트 메뉴와 새 노트 버튼', () => {
  it('AC-1: 트리 상단에 새 노트 버튼이 있다', () => {
    render(<DocumentTree workspaces={WORKSPACES} />);

    expect(screen.getByRole('button', { name: '새 노트' })).toBeDefined();
  });

  it('AC-2: 아홉 항목이 정확히 그 목록이다', () => {
    expect(CONTEXT_MENU_ITEMS.map((i) => i.label)).toEqual([
      '새 문서',
      '새 디렉토리',
      '이름 변경',
      '이동',
      '복사',
      '삭제',
      '공유',
      '즐겨찾기',
      '새 버전 올리기',
    ]);
  });

  it('AC-4 · AC-5: 새 버전 올리기는 파일에만 있다', () => {
    const onFile = enabledMenuItems(node({ kind: 'file' })).map((i) => i.label);
    const onDirectory = enabledMenuItems(node({ kind: 'directory' })).map((i) => i.label);
    const onPassThrough = enabledMenuItems(
      node({ kind: 'directory', visibility: 'pass-through', level: null }),
    ).map((i) => i.label);

    expect(onFile).toContain('새 버전 올리기');
    expect(onDirectory).not.toContain('새 버전 올리기');
    expect(onPassThrough).not.toContain('새 버전 올리기');
  });

  it('AC-6: 복사는 보기 권한만으로 활성되고 편집을 요구하지 않는다', () => {
    const viewer = enabledMenuItems(node({ level: 'view', parentLevel: 'view' }));

    expect(viewer.map((i) => i.label)).toContain('복사');
    // 편집이 필요한 것들은 함께 열리지 않는다 — 열리면 그 항목이 보기
    // 권한으로도 실행되는 것처럼 읽힌다.
    expect(viewer.map((i) => i.label)).not.toContain('삭제');
    expect(viewer.map((i) => i.label)).not.toContain('이름 변경');
  });

  it('AC-3: 권한이 없는 항목은 비활성으로 표시된다 — 사라지지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <DocumentTree
        workspaces={[{ ...WORKSPACES[0]!, roots: [node({ id: 'doc', level: 'view', parentLevel: 'view' })] }]}
      />,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('treeitem', { name: /회의록/ }) });

    const menu = await screen.findByRole('menu');
    // 「보이지 않는다」와 「비활성이다」는 다르다 — 사라지면 그 조작이
    // 존재하지 않는 것으로 읽히고, 권한을 얻어도 찾지 못한다.
    const remove = within(menu).getByRole('menuitem', { name: '삭제' });
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByRole('menuitem', { name: '복사' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('pass-through 노드에는 만들기가 열리지 않는다 — 부모로 삼을 수 없다', () => {
    const items = enabledMenuItems(
      node({ kind: 'directory', visibility: 'pass-through', level: null, parentLevel: null }),
    ).map((i) => i.label);

    expect(items).not.toContain('새 문서');
    expect(items).not.toContain('새 디렉토리');
  });
});
