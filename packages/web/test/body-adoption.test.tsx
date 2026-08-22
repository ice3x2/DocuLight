import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

let saved: string[];

beforeEach(() => {
  saved = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/documents/n1/session') return Promise.resolve(json({ session: 's1' }));
      if (path === '/api/documents/n1' && init?.method === 'PUT') {
        saved.push(JSON.parse(String(init.body)).body);
        return Promise.resolve(json({ hash: `h${saved.length + 1}` }));
      }
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const text = () => document.querySelector('.cm-content')?.textContent ?? '';

/**
 * 서버 본문을 언제 받아들이는가.
 *
 * 새 버전 올리기처럼 **남이 갈아 끼운** 본문은 받아들여야 하고, 우리가 방금
 * 저장한 것이 되돌아오는 것은 받아들이면 안 된다 — 그 사이에 더 친 글자가
 * 있기 때문이다. 둘을 구별하지 못하면 저장할수록 글이 사라진다.
 */
describe('본문 받아들이기', () => {
  it('우리가 저장한 본문이 되돌아와도 그 뒤에 친 글자를 밀지 않는다', async () => {
    const user = userEvent.setup();
    const landed: { body: string; hash: string }[] = [];
    const surface = (props: { body: string; baseHash: string }) => (
      <DocumentSurface
        file={md}
        initialMode="live"
        body={props.body}
        baseHash={props.baseHash}
        onSaved={(body, hash) => landed.push({ body, hash })}
      />
    );
    const view = render(surface({ body: '처음', baseHash: 'h1' }));

    await user.click(document.querySelector('.cm-content') as HTMLElement);
    await user.keyboard('AAA');
    await user.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(landed).toHaveLength(1));

    // 저장이 끝난 **뒤에** 더 친다 — 아직 서버에 없는 글자다.
    await user.click(document.querySelector('.cm-content') as HTMLElement);
    await user.keyboard('BBB');
    const typed = text();

    // 캐시가 방금 저장한 판본으로 갱신되어 되돌아온다. 화면이 이것을
    // 「남이 갈아 끼운 것」으로 읽으면 그 뒤에 친 것이 밀린다.
    view.rerender(surface({ body: landed[0]!.body, baseHash: landed[0]!.hash }));

    expect(text()).toBe(typed);
    // 그리고 그 사이 저장한 본문과 화면이 실제로 달라야 이 시험이 뜻을
    // 갖는다 — 같으면 무엇을 넣어도 통과한다.
    expect(typed).not.toBe(landed[0]!.body);
  });

  it('남이 갈아 끼운 본문은 받아들인다 — 새 버전 올리기가 그것이다', async () => {
    const view = render(<DocumentSurface file={md} initialMode="live" body="처음" baseHash="h1" />);
    await waitFor(() => expect(text()).toContain('처음'));

    view.rerender(
      <DocumentSurface file={md} initialMode="live" body="아주 다른 본문" baseHash="h9" />,
    );

    expect(text()).toContain('아주 다른 본문');
  });
});
