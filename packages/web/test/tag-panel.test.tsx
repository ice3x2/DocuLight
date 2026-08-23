import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { TagPanel } from '../src/search/TagPanel.js';
import type { TagIndexBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const 색인 = (over: Partial<TagIndexBody> = {}): TagIndexBody => ({
  tags: [
    { name: '기획', documents: 3 },
    { name: '회의', documents: 1 },
  ],
  basis: '내가 볼 수 있는 문서 기준 출현 문서 수',
  ...over,
});

describe('FR-SHELL-009 — 태그 탭의 목록과 수치', () => {
  it('AC-1: 태그와 그 수치가 목록으로 선다', () => {
    render(<TagPanel index={색인()} />);

    const 줄 = screen.getAllByTestId('tag-row').map((one) => one.textContent ?? '');
    expect(줄[0]).toContain('기획');
    expect(줄[0]).toContain('3');
    expect(줄[1]).toContain('회의');
  });

  it('AC-6: 기준 문구가 서버가 준 값 그대로 상시 표시된다', () => {
    render(<TagPanel index={색인()} />);

    // 화면이 문구를 지으면 숨은 항목의 유무에 따라 갈릴 자리가 생긴다.
    expect(screen.getByTestId('tag-basis').textContent).toBe(색인().basis);
  });

  it('AC-6: 태그가 하나도 없어도 기준 문구는 그대로 선다', () => {
    render(<TagPanel index={색인({ tags: [] })} />);

    expect(screen.getByTestId('tag-basis').textContent).toBe(색인().basis);
    expect(screen.queryAllByTestId('tag-row')).toHaveLength(0);
  });

  it('AC-2: 범위 선택기가 있고 고르면 그 값이 밖으로 나간다', async () => {
    const 고른것: string[] = [];
    render(
      <TagPanel
        index={색인()}
        workspaces={[{ id: 'ws-1', name: '기획팀' }]}
        onScope={(id) => 고른것.push(id)}
      />,
    );

    await userEvent.setup().selectOptions(screen.getByLabelText('범위'), 'ws-1');

    expect(고른것).toEqual(['ws-1']);
  });

  it('`FR-SHELL-010` AC-3: 태그 탭이 자체 문서 결과 목록을 갖지 않는다', () => {
    render(<TagPanel index={색인()} />);

    // 결과를 여기서도 그리면 같은 물음에 답하는 자리가 둘이 된다.
    expect(screen.queryByRole('list', { name: /검색 결과|문서/ })).toBeNull();
  });
});

describe('FR-SHELL-011 — 화면은 서버가 준 순서를 그대로 그린다', () => {
  it('AC-5: 화면이 자체 비교식으로 다시 정렬하지 않는다', () => {
    // 서버가 이름순으로 주므로 화면이 또 정렬하면 비교식이 두 벌이 된다.
    const 뒤집힌 = 색인({
      tags: [
        { name: '회의', documents: 1 },
        { name: '기획', documents: 3 },
      ],
    });
    render(<TagPanel index={뒤집힌} />);

    expect(screen.getAllByTestId('tag-row').map((one) => one.textContent?.slice(0, 2))).toEqual([
      '회의',
      '기획',
    ]);
  });
});

describe('FR-SHELL-010 — 태그를 누르면 검색 탭이 그 질의를 든다', () => {
  const 앱 = () => {
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const path = String(url).split('?')[0]!;
        if (path === '/api/session')
          return Promise.resolve(json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
        if (path === '/api/tree')
          return Promise.resolve(
            json([{ workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [] }]),
          );
        if (path === '/api/tags') return Promise.resolve(json(색인()));
        return Promise.resolve(json(null, 404));
      }),
    );
  };

  it('AC-1 · AC-2: 태그를 누르면 좌측이 검색 탭으로 바뀌고 질의가 채워진다', async () => {
    앱();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('tab', { name: '태그' }));
    // 트리에도 「기획팀」이 있으므로 태그 구역 안에서 고른다.
    const 태그구역 = await screen.findByRole('region', { name: '태그' });
    await user.click(within(태그구역).getByRole('button', { name: /기획/ }));

    const 좌측 = screen.getByRole('complementary', { name: '좌측 사이드바' });
    expect(within(좌측).getByRole('tab', { name: '검색' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() =>
      expect((within(좌측).getByPlaceholderText(/문서 제목/) as HTMLInputElement).value).toBe('#기획'),
    );
  });
});
