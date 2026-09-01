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
      '즐겨찾기에 추가',
      '새 버전 올리기',
    ]);
  });

  it('AC-7: 이미 즐겨찾기한 노드에서는 그 항목이 해제로 바뀐다', () => {
    const 안한것 = enabledMenuItems(node({ kind: 'file' })).map((i) => i.label);
    const 한것 = enabledMenuItems(node({ kind: 'file' }), true).map((i) => i.label);

    expect(안한것).toContain('즐겨찾기에 추가');
    expect(안한것).not.toContain('즐겨찾기 해제');
    expect(한것).toContain('즐겨찾기 해제');
    expect(한것).not.toContain('즐겨찾기에 추가');
    // 항목의 수와 자리는 그대로다 — 라벨만 갈린다. 하나가 더 생기거나
    // 사라지면 메뉴가 노드마다 다른 모양이 되어 사용자가 자리를 못 외운다.
    expect(한것.length).toBe(안한것.length);
    expect(한것.indexOf('즐겨찾기 해제')).toBe(안한것.indexOf('즐겨찾기에 추가'));
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

describe('FR-SHELL-003 AC-3 · FR-SHELL-016 AC-1 — 만들기는 담길 자리의 권한을 본다', () => {
  it('파일에서는 그 노드를 고칠 수 있어도 부모를 못 고치면 만들기가 열리지 않는다', () => {
    // 만들기는 **담을 자리**에 쓰는 조작이다. 노드 자신의 권한으로 판정하면
    // 서버가 거절할 항목이 열려 보이고, 사용자에게는 고장으로 보인다.
    const items = enabledMenuItems(node({ level: 'edit', parentLevel: 'view' })).map((i) => i.label);

    expect(items).not.toContain('새 문서');
    expect(items).not.toContain('새 디렉토리');
    // 그 노드 자신에 대한 조작은 그대로 열린다 — 축이 다르다.
    expect(items).toContain('이름 변경');
  });

  it('파일에서는 부모를 고칠 수 있으면 그 노드를 못 고쳐도 만들기가 열린다', () => {
    const items = enabledMenuItems(node({ level: 'view', parentLevel: 'edit' })).map((i) => i.label);

    expect(items).toContain('새 문서');
    expect(items).not.toContain('삭제');
  });

  it('디렉토리에서는 그 디렉토리 자신을 못 고치면 만들기가 열리지 않는다', () => {
    // 디렉토리에서 고른 만들기는 **그 디렉토리 안**에 담긴다. 그래서 서버가
    // 보는 자리도 그 디렉토리이고(`node-service.ts` 의 `parentTarget` 은
    // `parentId ?? workspaceId` 다), 설계서 §2.2.5 도 「대상 디렉토리 편집」을
    // 적었다. 화면이 그 부모를 보면 열려 보이던 항목이 403 으로 거절된다.
    const 디렉토리 = node({ kind: 'directory', level: 'view', parentLevel: 'edit' });
    const items = enabledMenuItems(디렉토리).map((i) => i.label);

    expect(items).not.toContain('새 문서');
    expect(items).not.toContain('새 디렉토리');
  });

  it('디렉토리에서는 그 디렉토리를 고칠 수 있으면 부모를 못 고쳐도 만들기가 열린다', () => {
    // 상속이 끊긴 디렉토리에 편집을 직접 받은 경우다. 부모를 보면 이 사람은
    // 자기가 편집할 수 있는 자리에 문서를 만들지 못한다.
    const 디렉토리 = node({ kind: 'directory', level: 'edit', parentLevel: 'view' });
    const items = enabledMenuItems(디렉토리).map((i) => i.label);

    expect(items).toContain('새 문서');
    expect(items).toContain('새 디렉토리');
  });
});
