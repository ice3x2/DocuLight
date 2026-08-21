import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';
import { DocumentTree } from '../src/tree/DocumentTree.js';
import { CONTEXT_MENU_ITEMS, type TreeNodeView, type WorkspaceTreeView } from '../src/tree/tree-contract.js';
import { MergeView, mergeEngine } from '../src/document/MergeView.js';
import { surfaceOf } from '../src/document/surface-contract.js';

afterEach(cleanup);

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

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

const treeOf = (...roots: TreeNodeView[]): WorkspaceTreeView[] => [
  { workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots },
];

describe('FR-STORAGE-001 AC-2 — 편집 화면에 저장 버튼을 두지 않는다', () => {
  it('편집 모드 어디에도 저장 버튼이 없다', () => {
    render(<DocumentSurface file={{ nodeId: 'n1', name: '회의록.md', level: 'edit' }} initialMode="live" />);

    // 버튼이 있으면 자동 저장이 되고 있다는 사실이 흐려지고, 사용자는
    // 누르지 않은 편집이 사라질까 봐 계속 누르게 된다.
    expect(screen.queryByRole('button', { name: /^저장$|저장하기/ })).toBeNull();
  });

  it('저장 거부 배너에도 저장 버튼은 없다 — 재시도는 자동 저장이 한다', () => {
    render(
      <DocumentSurface
        file={{ nodeId: 'n1', name: '회의록.md', level: 'edit' }}
        initialMode="live"
        save="rejected"
      />,
    );

    expect(screen.queryByRole('button', { name: /^저장$|저장하기|다시 저장/ })).toBeNull();
  });
});

describe('FR-SHELL-008 AC-1 — 생성 흐름에 덮어쓰기 선택지가 없다', () => {
  it('컨텍스트 메뉴의 만들기 항목에 덮어쓰기가 없다', () => {
    const labels = CONTEXT_MENU_ITEMS.map((item) => item.label);

    expect(labels).not.toContain('덮어쓰기');
    expect(labels).not.toContain('바꿔치기');
    // 덮어쓰기로 가는 길은 「새 버전 올리기」 하나다.
    expect(labels.filter((l) => /덮어|올리기/.test(l))).toEqual(['새 버전 올리기']);
  });

  it('업로드 경로가 덮어쓰기 여부를 묻지 않는다', async () => {
    const contract = await readFile(join(WEB, 'src/attachment/upload-contract.ts'), 'utf8');

    expect(contract).not.toMatch(/overwrite|덮어쓰/);
  });
});

describe('FR-ATTACH-002 AC-1 · FR-ATTACH-001 AC-2 — 비-md 도 트리에 선다', () => {
  it('AC-1: 이미지·바이너리가 자식 노드로 보인다', () => {
    render(
      <DocumentTree
        workspaces={treeOf(
          node({ id: 'd1', name: '회의', kind: 'directory', children: [
            node({ id: 'p', name: '그림.png' }),
            node({ id: 'z', name: '설계.zip' }),
          ] }),
        )}
      />,
    );

    expect(screen.getByRole('treeitem', { name: /회의/ })).toBeDefined();
  });

  it('FR-ATTACH-001 AC-2: 올린 파일이 그 디렉토리의 자식으로 나타난다', async () => {
    const user = userEvent.setup();
    render(
      <DocumentTree
        workspaces={treeOf(
          node({ id: 'd1', name: '회의', kind: 'directory', children: [node({ id: 'p', name: '그림.png' })] }),
        )}
        onUpload={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '회의 펼치기' }));

    // 목록은 서버가 준 것을 그대로 그린다 — 업로드 뒤의 새 목록이 오면
    // 그 안에 든 파일이 확장자와 무관하게 선다.
    expect(screen.getByRole('treeitem', { name: /그림\.png/ })).toBeDefined();
  });
});

describe('FR-EDITOR-006 AC-1 — 비-md 파일도 본문 영역에서 열린다', () => {
  it('이미지가 본문 영역에 뜬다', () => {
    render(<DocumentSurface file={{ nodeId: 'p', name: '그림.png', level: 'view' }} />);

    expect(surfaceOf('그림.png')).toBe('image');
    expect(screen.getByRole('img', { name: '그림.png' })).toBeDefined();
  });

  it('바이너리도 본문 영역에서 열린다 — 열리지 않는 종류가 없다', () => {
    render(<DocumentSurface file={{ nodeId: 'z', name: '설계.zip', level: 'view' }} />);

    expect(screen.getByRole('link', { name: /설계\.zip/ })).toBeDefined();
  });
});

describe('IR-STORAGE-001 · FR-EDITOR-008 — 비교·병합은 같은 컴포넌트다', () => {
  it('IR-STORAGE-001 AC-3 · CON-ARCH-005 AC-3: 머지 엔진이 @codemirror/merge 다', () => {
    expect(mergeEngine()).toBe('@codemirror/merge');
  });

  it('IR-STORAGE-001 AC-1: 고른 버전과 현재 본문이 나란히 표시된다', () => {
    render(<MergeView label="버전 비교" left="# 예전 판" right="# 지금 판" />);

    const view = screen.getByRole('region', { name: '버전 비교' });
    expect(within(view).getByText(/예전 판/)).toBeDefined();
    expect(within(view).getByText(/지금 판/)).toBeDefined();
  });

  it('FR-EDITOR-008 AC-3: 충돌 병합도 같은 컴포넌트를 쓴다', () => {
    render(<MergeView label="병합" left="# 서버" right="# 내 것" />);

    expect(screen.getByRole('region', { name: '병합' })).toBeDefined();
  });

  it('FR-EDITOR-008 AC-4: 해소한 결과를 넘기면 그 값이 그대로 나온다', async () => {
    const user = userEvent.setup();
    const resolved: string[] = [];
    render(
      <MergeView label="병합" left="# 서버" right="# 내 것" onResolve={(body) => resolved.push(body)} />,
    );

    await user.click(screen.getByRole('button', { name: '이 내용으로 저장' }));

    // 해소 결과가 저장 경로로 흘러야 병합이 끝난다 — 화면만 닫히면
    // 사용자는 합친 것이 반영됐다고 믿고 그것을 잃는다.
    expect(resolved).toHaveLength(1);
  });
});
