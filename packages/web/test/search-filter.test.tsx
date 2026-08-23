import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchPanel } from '../src/search/SearchPanel.js';
import {
  AXIS_LABELS,
  DEFAULT_AXES,
  axesFrom,
  axesTo,
  readAxes,
  writeAxes,
  type SearchAxis,
} from '../src/search/search-axes.js';
import type { SearchDocumentBody } from '../src/api/client.js';

afterEach(cleanup);

const 결과: SearchDocumentBody[] = [
  {
    nodeId: 'n1',
    name: '회의록.md',
    workspaceName: '기획팀',
    excerpts: [
      { axis: 'body', text: '앞말 설계 뒷말' },
      { axis: 'body', text: '또 설계 이야기' },
    ],
  },
];

describe('FR-SHELL-013 — 필터 팝오버', () => {
  it('AC-5: 필터 버튼을 누르면 네 대상의 체크박스가 나온다', async () => {
    render(<SearchPanel />);

    await userEvent.setup().click(screen.getByRole('button', { name: '검색 대상' }));

    const 상자 = screen.getAllByRole('checkbox');
    expect(상자.map((one) => one.getAttribute('aria-label'))).toEqual([
      AXIS_LABELS.name,
      AXIS_LABELS.body,
      AXIS_LABELS.tag,
      AXIS_LABELS.attachment,
    ]);
  });

  it('AC-6: 처음 열면 `이름` 만 켜져 있다', async () => {
    render(<SearchPanel />);

    await userEvent.setup().click(screen.getByRole('button', { name: '검색 대상' }));

    const 켜진것 = screen
      .getAllByRole('checkbox')
      .filter((one) => one.getAttribute('aria-checked') === 'true')
      .map((one) => one.getAttribute('aria-label'));
    expect(켜진것).toEqual([AXIS_LABELS.name]);
  });

  it('AC-8: 체크를 바꾸면 그 조합이 밖으로 나간다', async () => {
    const 나간것: SearchAxis[][] = [];
    render(<SearchPanel onAxes={(axes) => 나간것.push([...axes])} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '검색 대상' }));
    await user.click(screen.getByRole('checkbox', { name: AXIS_LABELS.body }));

    // 거르는 일은 서버가 하므로 화면은 조합만 내보낸다.
    expect(나간것.at(-1)?.sort()).toEqual(['body', 'name']);
  });
});

describe('FR-SHELL-013 — 결과의 모양', () => {
  it('AC-9 · AC-10: 문서 제목 머리행 하나 아래에 발췌가 쌓인다', () => {
    render(<SearchPanel documents={결과} />);

    const 문서 = screen.getAllByTestId('search-document');
    expect(문서).toHaveLength(1);
    expect(within(문서[0]!).getAllByTestId('search-excerpt')).toHaveLength(2);
    expect(within(문서[0]!).getAllByText('회의록.md')).toHaveLength(1);
  });

  it('AC-11: 거르기 전 개수나 분모를 보이지 않는다', () => {
    render(<SearchPanel documents={결과} />);

    const 글자 = screen.getByRole('region', { name: '검색 결과' }).textContent ?? '';
    expect(글자).not.toMatch(/\/\s*\d/);
    expect(글자).not.toContain('전체');
    expect(글자).not.toContain('중');
  });

  it('AC-12: 결과 목록이 자체 스크롤 영역을 갖는다', () => {
    render(<SearchPanel documents={결과} />);

    // 목록이 아니라 화면 전체가 스크롤되면 검색창이 위로 밀려 사라진다.
    expect(screen.getByRole('region', { name: '검색 결과' }).getAttribute('data-scroll')).toBe('y');
  });
});

describe('FR-SHELL-013 AC-7 — 마지막 조합이 되살아난다', () => {
  it('저장된 값이 있으면 그 조합으로 시작한다', () => {
    expect(axesFrom('name,tag').sort()).toEqual(['name', 'tag']);
  });

  it('값이 없으면 기본값이다', () => {
    expect(axesFrom(null)).toEqual([...DEFAULT_AXES]);
  });

  it('값이 깨졌으면 기본값으로 돌아간다', () => {
    // 모르는 축이 섞이면 그 이름이 곧 다섯 번째 축이 된다.
    expect(axesFrom('{}')).toEqual([...DEFAULT_AXES]);
    expect(axesFrom('name,없는축')).toEqual([...DEFAULT_AXES]);
    expect(axesFrom('')).toEqual([...DEFAULT_AXES]);
  });
});

describe('FR-SHELL-013 AC-7 — 고른 조합이 브라우저에 남는다', () => {
  it('쓴 값을 그대로 되살린다', () => {
    writeAxes(axesTo(['name', 'tag']));

    // 저장과 복원이 짝이 아니면 다음 방문에 다른 조합이 선다.
    expect(axesFrom(readAxes()).sort()).toEqual(['name', 'tag']);
  });

  it('저장소가 없어도 던지지 않는다 — 기본값으로 시작할 뿐이다', () => {
    const 원래 = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });

    expect(() => writeAxes('name')).not.toThrow();
    expect(axesFrom(readAxes())).toEqual([...DEFAULT_AXES]);

    Object.defineProperty(globalThis, 'localStorage', { value: 원래, configurable: true });
  });
});
