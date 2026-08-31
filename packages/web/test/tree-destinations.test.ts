import { describe, expect, it } from 'vitest';

import { containerFor, destinationsFor, type WorkspaceTreeView } from '../src/tree/tree-contract.js';

/**
 * 옮기거나 복사할 자리의 목록 (`FR-SHELL-015` AC-2 · AC-4).
 *
 * 목록을 고르는 규칙이 화면 부품 안에 있으면 같은 화면을 다른 자리에서 그릴
 * 때 규칙이 갈린다 — 컨텍스트 메뉴의 활성 규칙을 이 파일에 둔 것과 같은
 * 이유다.
 */

const 트리: readonly WorkspaceTreeView[] = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      {
        id: 'd1',
        name: '자료',
        kind: 'directory',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        children: [
          {
            id: 'd1-1',
            name: '지난해',
            kind: 'directory',
            visibility: 'full',
            level: 'edit',
            parentLevel: 'edit',
            children: [
              {
                id: 'f2',
                name: '작년정리.md',
                kind: 'file',
                visibility: 'full',
                level: 'edit',
                parentLevel: 'edit',
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'd2',
        name: '읽기만',
        kind: 'directory',
        visibility: 'full',
        level: 'view',
        parentLevel: 'edit',
        children: [],
      },
      {
        id: 'f1',
        name: '회의록.md',
        kind: 'file',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        children: [],
      },
    ],
  },
  {
    workspace: { id: 'ws-2', name: '개발팀' },
    visibility: 'full',
    roots: [
      {
        id: 'd3',
        name: '설계',
        kind: 'directory',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        children: [],
      },
    ],
  },
];

describe('FR-SHELL-015 — 옮기거나 복사할 자리를 고른다', () => {
  it('AC-2: 이동은 같은 워크스페이스 안으로만 간다', () => {
    const 자리들 = destinationsFor(트리, 'move', 'f1');

    // 목적지는 그 워크스페이스의 루트와 그 아래 디렉토리들이다.
    expect(자리들.map((one) => one.id)).toEqual(['ws-1', 'd1', 'd1-1']);
    // 경계를 넘는 수요는 복사가 받는다 (`SEC-ACL-014`).
    expect(자리들.some((one) => one.id === 'd3')).toBe(false);
  });

  it('AC-4: 복사는 다른 워크스페이스로도 간다', () => {
    const 자리들 = destinationsFor(트리, 'copy', 'f1');

    expect(자리들.map((one) => one.id)).toContain('d3');
    expect(자리들.map((one) => one.id)).toContain('ws-2');
  });

  it('편집 권한이 없는 자리는 목적지가 아니다', () => {
    // 두 조작 모두 목적지에는 편집을 요구한다 — 서버의 조작별 권한 표와
    // 같은 값이다. 화면이 넓게 보이면 눌러 봐야 거절을 만난다.
    for (const kind of ['move', 'copy'] as const) {
      expect(destinationsFor(트리, kind, 'f1').some((one) => one.id === 'd2')).toBe(false);
    }
  });

  it('AC-2: 자기 자신과 자기 자손은 목적지가 아니다', () => {
    const 자리들 = destinationsFor(트리, 'move', 'd1');

    // 허용하면 부모 사슬에 고리가 생겨 루트에서 도달할 수 없게 되고,
    // 경로를 파생하는 모든 호출이 그 고리를 돈다.
    expect(자리들.map((one) => one.id)).toEqual(['ws-1']);
  });

  it('파일은 목적지가 아니다 — 그 아래에는 아무것도 설 수 없다', () => {
    expect(destinationsFor(트리, 'copy', 'd3').some((one) => one.id === 'f1')).toBe(false);
  });

  it('경로에 조상을 함께 적는다 — 이름만으로는 같은 이름을 가릴 수 없다', () => {
    const 깊은자리 = destinationsFor(트리, 'move', 'f1').find((one) => one.id === 'd1-1');

    expect(깊은자리?.path).toBe('기획팀 / 자료 / 지난해');
  });
});

describe('FR-SHELL-016 — 만들기가 담길 자리를 고른다', () => {
  it('AC-1: 디렉토리에서 고르면 그 디렉토리 아래다', () => {
    expect(containerFor(트리, 'd1')).toEqual({ workspaceId: 'ws-1', parentId: 'd1' });
  });

  it('AC-1: 파일에서 고르면 그 파일이 담긴 자리다', () => {
    // 활성 판정(`enabledMenuItems`)이 **부모**의 편집 권한을 보므로 결과도
    // 같은 자리를 가리켜야 한다. 노드 자신 아래에 만들면 파일 아래에 노드를
    // 두는 셈이 되고, 열려 보이던 항목이 서버에서 거절된다.
    expect(containerFor(트리, 'f2')).toEqual({ workspaceId: 'ws-1', parentId: 'd1-1' });
  });

  it('AC-1: 워크스페이스 루트의 노드는 부모가 없다', () => {
    // `null` 이 곧 그 워크스페이스의 루트다 — 서버의 `POST /nodes` 가
    // `parentId` 를 그렇게 받는다.
    expect(containerFor(트리, 'f1')).toEqual({ workspaceId: 'ws-1', parentId: null });
  });

  it('AC-1: 어느 워크스페이스의 노드인지를 함께 돌려준다', () => {
    // 워크스페이스 id 없이 부모만 주면 부르는 쪽이 그것을 다시 찾아야 하고,
    // 두 곳이 같은 순회를 갖게 된다.
    expect(containerFor(트리, 'd3')).toEqual({ workspaceId: 'ws-2', parentId: 'd3' });
  });

  it('트리에 없는 노드에는 자리가 없다', () => {
    // 없는 자리에 기본값을 주면 엉뚱한 워크스페이스에 문서가 선다.
    expect(containerFor(트리, '없는노드')).toBeUndefined();
  });
});
