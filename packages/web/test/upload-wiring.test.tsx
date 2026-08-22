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
        id: 'd1',
        name: '회의',
        kind: 'directory',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        children: [
          { id: 'n1', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
        ],
      },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let uploads: Array<{ path: string; fileName: string }>;
let uploadStatus: number;
let treeFetches: number;

beforeEach(() => {
  uploads = [];
  uploadStatus = 200;
  treeFetches = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/session') return json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 });
      if (path === '/api/tree') {
        treeFetches += 1;
        return json(TREE);
      }
      if (path === '/api/trash') return json([]);
      if (path === '/api/documents/n1') return json({ body: '# 회의록\n', hash: 'h1' });
      if (path.endsWith('/attachments')) {
        const form = init?.body as FormData;
        const file = form.get('file') as File;
        uploads.push({ path, fileName: file.name });
        return uploadStatus === 200
          ? json({ hash: 'abc', link: '/api/attachments/ws-1/abc', limitBytes: 100 })
          : json(null, uploadStatus);
      }
      return json(null, 404);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * 파일 드롭을 브라우저가 보내는 모양으로 만든다.
 *
 * happy-dom 의 `DataTransfer` 는 `types` 를 채우지 않아 트리가 쓰는 드래그
 * 라이브러리가 이것을 파일 드래그로 알아보지 못한다 — 실제 브라우저에서는
 * `types` 에 `Files` 가 들어 있고, 그것이 그 라이브러리가 보는 신호다.
 */
const fileTransfer = (file: File) => ({
  files: [file],
  items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
  types: ['Files'],
  getData: () => '',
  setData: () => undefined,
  dropEffect: 'copy',
  effectAllowed: 'all',
});

const drop = (target: HTMLElement, file: File) => {
  const dataTransfer = fileTransfer(file);

  // 브라우저가 보내는 **순서 그대로** 보낸다 — `drop` 만 보내면 그
  // 라이브러리가 「시작하지 않은 드래그」로 보고 던진다.
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(
      Object.assign(new Event(type, { bubbles: true, cancelable: true }), { dataTransfer }),
    );
  }
};

describe('FR-ATTACH-001 — 트리 드롭이 실제로 서버로 간다', () => {
  it('AC-1: 디렉토리에 떨구면 업로드 요청이 나간다', async () => {
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    const row = await within(sidebar).findByRole('treeitem', { name: /회의/ });

    await drop(row, new File([new Uint8Array([1, 2, 3])], '그림.png', { type: 'image/png' }));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]!.fileName).toBe('그림.png');
  });

  it('AC-2: 업로드가 끝나면 트리를 다시 받는다 — 새 파일이 그 자리에 나타나야 한다', async () => {
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    const row = await within(sidebar).findByRole('treeitem', { name: /회의/ });
    await waitFor(() => expect(treeFetches).toBe(1));

    await drop(row, new File([new Uint8Array([1])], '그림.png'));

    // 다시 받지 않으면 사용자는 파일이 안 올라간 것으로 읽는다.
    await waitFor(() => expect(treeFetches).toBe(2));
  });

  it('업로드가 거부되면 트리를 다시 받지 않는다 — 헛된 왕복이다', async () => {
    uploadStatus = 413;
    render(<App />);
    const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
    const row = await within(sidebar).findByRole('treeitem', { name: /회의/ });
    await waitFor(() => expect(treeFetches).toBe(1));

    await drop(row, new File([new Uint8Array([1])], '큰것.bin'));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(treeFetches).toBe(1);
  });
});
