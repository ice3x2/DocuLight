import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FavoritesView, type Favorite } from '../src/favorites/FavoritesView.js';
import { DocumentTree } from '../src/tree/DocumentTree.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(cleanup);

const longName = '아주긴한글문서이름과공백없는경로가계속이어지는문서이름.md';
const directory: TreeNodeView = {
  id: 'dir', name: longName, kind: 'directory', visibility: 'full', level: 'edit',
  parentLevel: 'edit', children: [{ id: 'file', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] }],
};
const workspaces: WorkspaceTreeView[] = [{ workspace: { id: 'ws', name: '기획팀' }, visibility: 'full', roots: [directory] }];

describe('IR-SHELL-009 AC-3 — newspaper tree contracts', () => {
  it('uses the primary toolbar and exposes 40px rows, 16px indentation, icons, and a non-title name description', async () => {
    render(<DocumentTree workspaces={workspaces} />);

    expect(screen.getByRole('button', { name: '새 노트' }).getAttribute('data-variant')).toBe('primary');
    const tree = screen.getByRole('tree', { name: '문서 트리' });
    expect(tree.getAttribute('data-row-height')).toBe('40');
    expect(tree.getAttribute('data-indent')).toBe('16');
    const row = screen.getByRole('treeitem', { name: new RegExp(longName) });
    expect(row.querySelector('[data-tree-icon="directory"]')).not.toBeNull();
    expect(within(row).getByRole('button', { name: `${longName} 펼치기` }).textContent).not.toContain(longName);
    expect(row.querySelector('[data-tree-name-description]')?.textContent).toBe(longName);
    expect(row.querySelector('[title]')).toBeNull();
  });

  it('marks only an accepted external file drop and clears the marker on leave and drop', () => {
    const onUpload = vi.fn();
    render(<DocumentTree workspaces={workspaces} onUpload={onUpload} />);
    const row = screen.getByRole('treeitem', { name: new RegExp(longName) });
    const transfer = { files: [new File(['x'], '자료.pdf')], types: ['Files'] };

    fireEvent.dragEnter(row, { dataTransfer: transfer });
    expect(row.getAttribute('data-upload-drop')).toBe('active');
    expect(within(row).getByText('파일 업로드')).toBeDefined();
    fireEvent.dragLeave(row, { dataTransfer: transfer, relatedTarget: document.body });
    expect(row.getAttribute('data-upload-drop')).toBeNull();
    fireEvent.dragEnter(row, { dataTransfer: transfer });
    fireEvent.drop(row, { dataTransfer: transfer });
    expect(row.getAttribute('data-upload-drop')).toBeNull();
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('shows fixed naming help and ignores Enter during composition before one later confirmation', () => {
    const onNamed = vi.fn();
    const onCancel = vi.fn();
    render(<DocumentTree workspaces={workspaces} naming={{ kind: 'rename', node: directory }} onNamed={onNamed} onNamingCancel={onCancel} />);

    const input = screen.getByRole('textbox', { name: `${longName} 새 이름` });
    const help = document.getElementById(input.getAttribute('aria-describedby')!);
    expect(help?.textContent).toContain(`${longName} 새 이름`);
    expect(help?.textContent).toContain('Enter로 확정 · Esc로 취소');
    fireEvent.change(input, { target: { value: '새 이름' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onNamed).not.toHaveBeenCalled();
    fireEvent.compositionEnd(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onNamed).toHaveBeenCalledOnce();
    expect(onNamed).toHaveBeenCalledWith('새 이름');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('styles the Radix context menu surface and keeps disabled destructive items disabled', async () => {
    const user = userEvent.setup();
    const readonly = { ...directory, level: 'view' as const, parentLevel: 'view' as const };
    render(<DocumentTree workspaces={[{ ...workspaces[0]!, roots: [readonly] }]} />);
    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('treeitem', { name: new RegExp(longName) }) });
    const menu = await screen.findByRole('menu');
    expect(menu.getAttribute('data-tree-menu')).toBe('');
    const remove = within(menu).getByRole('menuitem', { name: '삭제' });
    expect(remove.getAttribute('data-destructive')).toBe('');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('FR-SHELL-001 — newspaper favorites contracts', () => {
  const initial: Favorite[] = [
    { nodeId: 'a', name: '첫 문서.md', kind: 'file', workspaceName: '기획팀' },
    { nodeId: 'b', name: '둘째 디렉토리', kind: 'directory', workspaceName: '인사팀' },
  ];

  it('uses the common empty state with the approved copy', () => {
    render(<FavoritesView favorites={[]} />);
    const empty = screen.getByText('즐겨찾기한 항목이 없습니다.').closest('[data-slot="empty-state"]');
    expect(empty).not.toBeNull();
    expect(screen.getByText('트리의 메뉴에서 문서나 디렉토리를 추가할 수 있습니다.')).toBeDefined();
  });

  it('does not open when removing and moves focus to the next remove button', async () => {
    const onOpen = vi.fn();
    function Fixture() {
      const [rows, setRows] = useState(initial);
      return <FavoritesView favorites={rows} onOpen={onOpen} onUnfavorite={(id) => setRows((value) => value.filter((row) => row.nodeId !== id))} />;
    }
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: '첫 문서.md 즐겨찾기 해제' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '둘째 디렉토리 즐겨찾기 해제' }));
  });

  it('returns focus through the empty callback after removing the last favorite', async () => {
    const tab = createRef<HTMLButtonElement>();
    function Fixture() {
      const [rows, setRows] = useState(initial.slice(0, 1));
      return <><button ref={tab}>즐겨찾기</button><FavoritesView favorites={rows} onUnfavorite={() => setRows([])} onEmptyFocus={() => tab.current?.focus()} /></>;
    }
    const user = userEvent.setup();
    render(<Fixture />);
    await user.click(screen.getByRole('button', { name: '첫 문서.md 즐겨찾기 해제' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '즐겨찾기' }));
  });
});
