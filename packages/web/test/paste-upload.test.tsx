import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let uploads: string[];
let uploadStatus: number;

beforeEach(() => {
  uploads = [];
  uploadStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path.endsWith('/attachments')) {
        uploads.push(((init?.body as FormData).get('file') as File).name);
        return Promise.resolve(
          uploadStatus === 200
            ? json({ hash: 'abc', link: '/api/attachments/ws-1/abc', limitBytes: 100 })
            : json(null, uploadStatus),
        );
      }
      if (path.endsWith('/session')) return Promise.resolve(json({ session: 's1' }));
      return Promise.resolve(json({ hash: 'h2' }));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };

const clipboardWith = (file: File) => ({
  files: [file],
  items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
  types: ['Files'],
  getData: () => '',
});

const paste = (target: HTMLElement, file: File) => {
  target.dispatchEvent(
    Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
      clipboardData: clipboardWith(file),
    }),
  );
};

describe('FR-ATTACH-004 — 편집기 붙여넣기·드래그 업로드', () => {
  it('AC-1: 이미지를 붙여넣으면 업로드된다', async () => {
    render(<DocumentSurface file={md} initialMode="live" body="# 본문" baseHash="h1" />);
    const content = document.querySelector('.cm-content') as HTMLElement;

    paste(content, new File([new Uint8Array([1, 2])], '그림.png', { type: 'image/png' }));

    await waitFor(() => expect(uploads).toEqual(['그림.png']));
  });

  it('AC-1: 본문에 그 첨부를 가리키는 링크가 들어간다', async () => {
    const saved: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request, init?: RequestInit) => {
        const path = String(url).split('?')[0]!;
        if (path.endsWith('/attachments'))
          return Promise.resolve(json({ hash: 'abc', link: '/api/attachments/ws-1/abc', limitBytes: 100 }));
        if (path.endsWith('/session')) return Promise.resolve(json({ session: 's1' }));
        if (init?.method === 'PUT') {
          saved.push(JSON.parse(String(init.body)).body);
          return Promise.resolve(json({ hash: 'h2' }));
        }
        return Promise.resolve(json(null, 404));
      }),
    );

    render(<DocumentSurface file={md} initialMode="live" body="# 본문" baseHash="h1" />);
    const content = document.querySelector('.cm-content') as HTMLElement;

    paste(content, new File([new Uint8Array([1, 2])], '그림.png', { type: 'image/png' }));

    // 화면에서는 라이브 프리뷰가 URL 을 감추므로 **저장으로 나가는 본문**을
    // 본다 — 링크가 안 들어가면 올린 파일이 문서 어디에도 남지 않는다.
    await waitFor(() => expect(saved.some((body) => body.includes('/api/attachments/ws-1/abc'))).toBe(true), {
      timeout: 3000,
    });
  });

  it('AC-2: 드래그해 놓아도 같은 경로로 간다', async () => {
    render(<DocumentSurface file={md} initialMode="live" body="# 본문" baseHash="h1" />);
    const content = document.querySelector('.cm-content') as HTMLElement;
    const file = new File([new Uint8Array([1])], '설계.zip');

    for (const type of ['dragenter', 'dragover', 'drop']) {
      content.dispatchEvent(
        Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          dataTransfer: clipboardWith(file),
        }),
      );
    }

    await waitFor(() => expect(uploads).toEqual(['설계.zip']));
  });

  it('AC-4: 편집 권한이 없으면 올리지 않는다', async () => {
    render(<DocumentSurface file={{ ...md, level: 'view' }} initialMode="read" body="# 본문" />);
    const content = document.querySelector('.cm-content') as HTMLElement;

    paste(content, new File([new Uint8Array([1])], '그림.png', { type: 'image/png' }));

    // 화면에서 받아 놓고 서버가 거절하면 사용자에게는 파일이 사라진
    // 것으로 보인다.
    await new Promise((done) => setTimeout(done, 50));
    expect(uploads).toEqual([]);
  });

  it('파일이 아닌 붙여넣기는 그대로 둔다 — 글자 붙여넣기를 가로채면 안 된다', async () => {
    render(<DocumentSurface file={md} initialMode="live" body="# 본문" baseHash="h1" />);
    const content = document.querySelector('.cm-content') as HTMLElement;

    content.dispatchEvent(
      Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
        clipboardData: { files: [], items: [], types: ['text/plain'], getData: () => '글자' },
      }),
    );

    await new Promise((done) => setTimeout(done, 50));
    expect(uploads).toEqual([]);
  });

  it('거부된 업로드는 본문에 링크를 넣지 않는다 — 열리지 않는 링크가 남는다', async () => {
    uploadStatus = 413;
    render(<DocumentSurface file={md} initialMode="live" body="# 본문" baseHash="h1" />);
    const content = document.querySelector('.cm-content') as HTMLElement;

    paste(content, new File([new Uint8Array([1])], '큰것.bin'));

    await waitFor(() => expect(uploads).toHaveLength(1));
    expect(document.querySelector('.cm-content')?.textContent).not.toContain('/api/attachments');
  });
});
