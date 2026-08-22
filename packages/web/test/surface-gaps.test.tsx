import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { DocumentSurface } from '../src/document/DocumentSurface.js';

const TREE = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      { id: 'n1', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
      { id: 'n2', name: '보고서.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let saveResponse: () => Response;

beforeEach(() => {
  saveResponse = () => json({ hash: 'h2' });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/tree') return Promise.resolve(json(TREE));
      if (path === '/api/trash') return Promise.resolve(json([]));
      if (path.endsWith('/session')) return Promise.resolve(json({ session: 's1' }));
      if (init?.method === 'PUT') return Promise.resolve(saveResponse());
      if (path === '/api/documents/n1') return Promise.resolve(json({ body: '# 회의록\n', hash: 'h1' }));
      if (path === '/api/documents/n2') return Promise.resolve(json({ body: '# 보고서\n', hash: 'h9' }));
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };

describe('FR-EDITOR-003 — 모드 전환이 편집을 잃지 않는다', () => {
  it('AC-2: 소스 모드에서 원문이 그대로 보이고 편집할 수 있다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={md} initialMode="source" body={'# 제목\n\n| 가 | 나 |\n| --- | --- |\n'} />);

    const raw = screen.getByRole('textbox', { name: '원문' }) as HTMLTextAreaElement;

    // 기호가 숨으면 소스가 아니다 — 표 구분선을 손보려면 그것이 보여야 한다.
    expect(raw.value).toContain('# 제목');
    expect(raw.value).toContain('| --- |');

    // 읽기 전용으로 두면 「편집할 수 있다」의 절반이 거짓이다.
    await user.type(raw, ' 고침');
    expect(raw.value).toContain('고침');
  });

  it('AC-3: 라이브에서 고친 것이 소스로 갔다 와도 남는다', async () => {
    const user = userEvent.setup();
    render(<DocumentSurface file={md} initialMode="live" body={'# 처음'} />);

    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard(' 고침');

    await user.click(screen.getByRole('button', { name: '소스' }));
    await user.click(screen.getByRole('button', { name: '라이브 프리뷰' }));

    // 서버가 준 원본으로 다시 마운트하면 사용자가 방금 친 글자가 사라진다.
    expect(document.querySelector('.cm-content')?.textContent).toContain('고침');
  });
});

describe('FR-EDITOR-005 AC-2 — 거부된 본문을 내려받을 수 있다', () => {
  it('내려받기 버튼이 실제로 무언가를 한다', async () => {
    const user = userEvent.setup();
    const clicks: string[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        clicks.push(String(blob.size));
        return 'blob:x';
      },
      revokeObjectURL: () => undefined,
    });

    render(<DocumentSurface file={md} initialMode="live" body={'# 잃으면 안 되는 본문'} save="rejected" />);
    await user.click(screen.getByRole('button', { name: '내려받기' }));

    // 알리기만 하면 사용자는 화면을 닫는 순간 자기 글을 잃는다.
    expect(clicks).toHaveLength(1);
  });
});

describe('FR-SHELL-003 AC-1 — 새 노트 버튼이 실제로 문서를 만든다', () => {
  it('누르면 만들기 요청이 나간다', async () => {
    const user = userEvent.setup();
    const created: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init?: RequestInit) => {
        const path = String(url).split('?')[0]!;
        if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
        if (path === '/api/tree') return Promise.resolve(json(TREE));
        if (path === '/api/trash') return Promise.resolve(json([]));
        if (path === '/api/nodes' && init?.method === 'POST') {
          created.push(String(init.body));
          return Promise.resolve(json({ id: 'n3', name: '제목 없음.md' }));
        }
        return Promise.resolve(json(null, 404));
      }),
    );

    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(within(sidebar).getByRole('button', { name: '새 노트' }));

    await waitFor(() => expect(created).toHaveLength(1));
  });
});

describe('FR-SHELL-012 AC-3 · AC-4 — 잃을 것이 있는 탭은 확인을 받는다', () => {
  it('충돌 상태의 탭은 트리 클릭으로 즉시 교체되지 않는다', async () => {
    saveResponse = () => json({ current: '# 남이 고침\n' }, 409);
    const user = userEvent.setup();
    render(<App />);

    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
    await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('region', { name: '병합' });

    await user.click(within(sidebar).getByRole('button', { name: /보고서\.md/ }));

    // 즉시 교체하면 충돌 배너 뒤에 남아 있던 사용자의 편집이 사라진다.
    expect(await screen.findByRole('alertdialog')).toBeDefined();
  });
});
