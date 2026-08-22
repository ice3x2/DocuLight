import { cleanup, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentSurface } from '../src/document/DocumentSurface.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const md = { nodeId: 'n1', name: '회의록.md', level: 'edit' as const };

const stubFetch = () => {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      calls.push(String(url));
      return Promise.resolve(
        new Response(JSON.stringify([{ target: '설계', label: '설계.md', detail: '기획팀' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }),
  );
  return calls;
};

/**
 * 위키링크 입력·자동완성 (`CON-EDITOR-002` AC-1).
 *
 * vendor 편집기가 이 확장을 이미 갖고 있었지만 제품 묶음이 그것을 얹지
 * 않았다 — 있는 것과 켜져 있는 것은 다르다.
 *
 * 여기서 재는 것은 **이음매**다: 사용자가 친 글자가 후보 질의로 서버까지
 * 가는가. 후보 목록이 화면에 뜨는 모양은 vendor 확장의 몫이고 그쪽 시험이
 * 갖는다 — 여기서 그 DOM 을 다시 재면 vendor 를 갱신할 때마다 이 시험이
 * 깨지는데, 깨진 이유는 제품 배선과 무관하다.
 */
describe('CON-EDITOR-002 AC-1 — `[[` 를 치면 후보를 서버에 묻는다', () => {
  it('친 글자가 그대로 질의가 되어 나간다', async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<DocumentSurface file={md} initialMode="live" body={'본문\n'} />);

    await user.click(document.querySelector('.cm-content') as HTMLElement);
    // userEvent 의 `keyboard` 문법에서 `[` 는 키 이름의 시작이라, 글자
    // 하나를 치려면 두 번 적는다 — `[[[[` 가 실제로는 `[[` 다.
    await user.keyboard('[[[[설');

    await waitFor(
      () => expect(calls.some((one) => one.includes('/api/wiki-targets'))).toBe(true),
      { timeout: 3000 },
    );
    expect(calls.find((one) => one.includes('/api/wiki-targets'))).toContain(
      `q=${encodeURIComponent('설')}`,
    );
  });

  it('`[[` 밖에서는 묻지 않는다 — 타이핑마다 물으면 문서 하나가 질의 폭풍이 된다', async () => {
    const calls = stubFetch();
    const user = userEvent.setup();
    render(<DocumentSurface file={md} initialMode="live" body={'본문\n'} />);

    await user.click(document.querySelector('.cm-content') as HTMLElement);
    await user.keyboard('그냥 글자');

    expect(calls.some((one) => one.includes('/api/wiki-targets'))).toBe(false);
  });
});
