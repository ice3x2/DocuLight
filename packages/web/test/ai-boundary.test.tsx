import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchPanel } from '../src/search/SearchPanel.js';
import { SEARCH_AXES } from '../src/search/search-axes.js';

/**
 * 좌측 검색 탭에 AI 전환 수단이 없다 (`CON-SHELL-002` AC-2).
 *
 * 토글이 생기는 순간 같은 입력이 두 경로로 갈리고, 사용자는 어느 쪽 결과를
 * 보고 있는지 알 수 없게 된다. 의미 검색은 MCP 표면에서만 부른다 — 그
 * 사실은 `packages/server/test/arch/ai-boundary.test.ts` 가 호출부로 잰다.
 */

afterEach(cleanup);

/** AI 전환을 뜻할 만한 글자. 화면 어디에도 없어야 한다. */
const AI_전환 = /\bAI\b|의미\s*검색|시맨틱|semantic|벡터\s*검색|smart\s*search/i;

describe('검색 탭에 AI 검색 전환 수단이 없다', () => {
  it('AC-2: 화면 어디에도 AI 전환을 뜻하는 글자가 없다', () => {
    const { container } = render(<SearchPanel query="설계" />);

    expect(AI_전환.test(container.textContent ?? ''), 'AI 전환 글자가 화면에 있다').toBe(false);
  });

  /**
   * **필터 팝오버 안까지 본다.**
   *
   * 접힌 곳에 토글을 두면 겉면만 보는 항은 통과한다. 팝오버를 실제로 열어
   * 그 안의 선택지가 네 대상뿐임을 확인한다.
   */
  it('AC-2: 필터 팝오버의 선택지가 네 대상뿐이다', async () => {
    render(<SearchPanel query="설계" />);

    const 필터 = screen.getByRole('button', { name: '검색 대상' });
    await userEvent.click(필터);

    const 선택지 = screen.getAllByRole('checkbox');
    expect(선택지.length, '체크박스 수가 네 대상과 다르다').toBe(SEARCH_AXES.length);

    for (const one of 선택지) {
      expect(
        AI_전환.test(one.getAttribute('aria-label') ?? one.textContent ?? ''),
        'AI 전환 선택지가 팝오버에 있다',
      ).toBe(false);
    }

    const 열린화면 = document.body.textContent ?? '';
    expect(AI_전환.test(열린화면), '팝오버를 열자 AI 전환 글자가 나타났다').toBe(false);
  });
});
