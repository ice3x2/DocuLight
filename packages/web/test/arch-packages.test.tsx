import { cleanup, render, screen } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchPanel } from '../src/search/SearchPanel.js';
import { TrashPanel } from '../src/trash/TrashPanel.js';
import { DocumentTree } from '../src/tree/DocumentTree.js';
import type { TreeNodeView, WorkspaceTreeView } from '../src/tree/tree-contract.js';

afterEach(cleanup);

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const src = (path: string) => readFile(join(WEB, 'src', path), 'utf8');

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

const tree: WorkspaceTreeView[] = [
  { workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [node()] },
];

describe('CON-ARCH-004 — 지정 패키지가 실제로 쓰인다', () => {
  it('AC-1: 트리가 react-arborist 위에 선다', async () => {
    // 의존성에 있는 것과 쓰이는 것은 다르다 — `package.json` 만 보면
    // 아무 화면도 그 패키지를 쓰지 않아도 통과한다.
    expect(await src('tree/DocumentTree.tsx')).toContain('react-arborist');
  });

  it('AC-1: 그 트리가 실제로 그려진다', () => {
    render(<DocumentTree workspaces={tree} />);

    expect(screen.getByRole('tree', { name: '문서 트리' })).toBeDefined();
    expect(screen.getByRole('treeitem', { name: /기획팀/ })).toBeDefined();
  });

  it('AC-2: 모달·탭·팝오버가 Radix 위에 선다', async () => {
    // 세 부품이 각자 다른 자리에 서 있으므로 한 파일만 보면 나머지가
    // 손으로 만든 것이어도 통과한다.
    const 셸 = await src('shell/AppShell.tsx');
    expect(셸).toContain('@radix-ui/react-dialog');
    expect(셸).toContain('@radix-ui/react-tabs');
    expect(await src('tree/DocumentTree.tsx')).toContain('@radix-ui/react-context-menu');
  });

  it('AC-3: 관리 목록이 @tanstack/react-table 위에 선다', async () => {
    expect(await src('trash/TrashPanel.tsx')).toContain('@tanstack/react-table');
  });

  it('AC-6: 그 목록이 @tanstack/react-virtual 로 가상화된다', async () => {
    expect(await src('trash/TrashPanel.tsx')).toContain('@tanstack/react-virtual');
  });

  it('AC-4: 검색이 cmdk 위에 선다', async () => {
    expect(await src('search/SearchPanel.tsx')).toContain('cmdk');
  });

  it('AC-4: 사용자·그룹 검색도 cmdk 위에 선다', async () => {
    // 조항이 이름 댄 것은 **사용자·그룹 검색 UI** 이고 그것을 소유한
    // 부품은 이제 `PrincipalPicker` 하나다 (`CON-PRINCIPAL-006`).
    // 어느 화면이 그것을 배치하는지는 이 조항이 정하지 않는다.
    expect(await src('principal/PrincipalPicker.tsx')).toContain('cmdk');
  });

  it('AC-5: 서버 상태가 @tanstack/react-query 로 관리된다', async () => {
    expect(await src('api/queries.ts')).toContain('@tanstack/react-query');
    // 소유가 `App` 에 있다 — 마운트 지점에서 조립해 넘기면 앱을 세우는
    // 자리마다 그 조립을 따라 적어야 하고, 하나를 빠뜨리면 그 자리에서만
    // 캐시 없이 돈다.
    expect(await src('App.tsx')).toContain('QueryClientProvider');
    // 훅이 **실제로 불린다.** 파일만 있고 부르는 자리가 없으면 서버 상태는
    // 여전히 컴포넌트가 든 것이다.
    expect(await src('App.tsx')).toMatch(/useTree\(|useSession\(/);
  });
});

describe('CON-SHELL-002 · FR-SHELL-007 — 검색과 휴지통이 실제로 선다', () => {
  it('검색 탭이 질의 입력을 갖는다', () => {
    render(<SearchPanel />);

    expect(screen.getByRole('combobox', { name: '검색' })).toBeDefined();
  });

  it('CON-SHELL-002 AC-2: 검색 탭에 AI 전환 토글이 없다', () => {
    render(<SearchPanel />);

    // 토글이 있으면 좌측 검색 탭이 텍스트 검색이라는 제약이 깨진다.
    expect(screen.queryByRole('button', { name: /AI|의미|벡터/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('휴지통이 워크스페이스 열과 영구 삭제 버튼을 그린다', () => {
    render(
      <TrashPanel
        rows={[
          {
            nodeId: 'n1',
            workspaceId: 'ws-1',
            workspaceName: '기획팀',
            originalPath: '회의록.md',
            deletedAt: '2026-08-22T00:00:00.000Z',
            deletedBy: 'u1',
            canPurge: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: '워크스페이스' })).toBeDefined();
    expect(screen.getByRole('button', { name: /영구 삭제/ })).toBeDefined();
  });

  it('FR-SHELL-007 AC-5: 관리 권한이 없으면 범위 토글이 서지 않는다', () => {
    // 서버는 범위를 넓혀 달라고 해도 권한이 없으면 좁은 결과를 준다.
    // 그래도 토글이 서 있으면 사용자는 눌러 놓고 아무것도 안 바뀌는 것을
    // 본다 — 열려 보이는 조작이 거절되는 것과 같은 고장이다.
    render(<TrashPanel canWidenScope={false} rows={[]} />);

    expect(screen.queryByRole('button', { name: /전체 보기|본인분만 보기/ })).toBeNull();
  });

  it('FR-SHELL-007 AC-5: 관리 권한이 있으면 범위 토글이 선다', () => {
    render(<TrashPanel canWidenScope rows={[]} />);

    expect(screen.getByRole('button', { name: /전체 보기|본인분만 보기/ })).toBeDefined();
  });

  it('SEC-SHELL-001 AC-1 · AC-3: 권한 없는 행에는 영구 삭제 버튼이 없다', () => {
    render(
      <TrashPanel
        rows={[
          { nodeId: 'a', workspaceId: 'w1', workspaceName: '기획팀', originalPath: 'a.md', deletedAt: 'x', deletedBy: 'u', canPurge: true },
          { nodeId: 'b', workspaceId: 'w2', workspaceName: '인사팀', originalPath: 'b.md', deletedAt: 'x', deletedBy: 'u', canPurge: false },
        ]}
      />,
    );

    // 한 목록 안에 열린 행과 닫힌 행이 함께 선다.
    expect(screen.getAllByRole('button', { name: /영구 삭제/ })).toHaveLength(1);
  });
});
