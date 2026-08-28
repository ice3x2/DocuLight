import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { AXIS_LABELS } from '../src/search/search-axes.js';

/**
 * 검색 조합이 실제 요청까지 실려 가는 배선 (`FR-SHELL-013` AC-7 · AC-8).
 *
 * **양끝만 재면 그 사이가 비어도 초록이다.** 되살리기 규칙은
 * `axesFrom`·`readAxes` 가, 꺼진 축이 결과에서 빠지는 것은 서버가 각각
 * 재고 있었지만, 그 둘을 잇는 자리 — 저장된 값으로 상태를 세우고 그 상태를
 * 검색 요청에 싣는 `App` 의 배선 — 은 어느 시험도 재지 않았다. 실측으로
 * 확인했다: `readAxes()` 를 끊어도, 고른 조합 대신 전 축을 보내도 회귀
 * 스위트가 통째로 초록이었다.
 *
 * 그래서 여기서는 **나가는 요청을 관측한다.** 화면이 무엇을 그렸는가가
 * 아니라 서버가 무엇을 받게 되는가가 이 두 조항의 내용이기 때문이다.
 */

const TREE = [{ workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [] }];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 이 렌더에서 `/api/search` 로 나간 주소들. 순서대로 쌓인다. */
let 검색요청: string[];

beforeEach(() => {
  검색요청 = [];
  localStorage.clear();

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      const full = String(url);
      const path = full.split('?')[0]!;
      if (path === '/api/search') {
        검색요청.push(full);
        return Promise.resolve(json({ documents: [] }));
      }
      if (path === '/api/session') {
        return Promise.resolve(
          json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }),
        );
      }
      if (path === '/api/tree') return Promise.resolve(json(TREE));
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

/** 검색 탭을 열고 질의를 친다. 그래야 요청이 나간다. */
async function 검색한다(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('tab', { name: '검색' }));
  // cmdk 의 Command.Input 이라 role 이 combobox 다. placeholder 로 집는 것이
  // 그 부품 교체에 덜 흔들린다.
  await user.type(screen.getByPlaceholderText(/문서 제목/), '설계');
}

/** 그 요청이 실은 축들. 순서는 보지 않는다 — 조합이 같으면 같은 질의다. */
const 축들 = (url: string): string[] =>
  (new URL(url, 'http://x').searchParams.get('axes') ?? '').split(',').filter(Boolean).sort();

it('AC-7: 지난 방문에 고른 조합이 이번 검색 요청에 그대로 실린다', async () => {
  // 그 사용자가 지난번에 본문과 태그를 켜 두었다.
  localStorage.setItem('doculight.search-axes', 'body,tag');
  const user = userEvent.setup();
  render(<App />);

  await 검색한다(user);

  await waitFor(() => expect(검색요청.length).toBeGreaterThan(0));
  expect(축들(검색요청.at(-1)!), '저장된 조합이 요청에 실리지 않았다').toEqual(['body', 'tag']);
});

it('AC-7: 저장된 값이 깨져 있으면 기본값으로 요청한다', async () => {
  localStorage.setItem('doculight.search-axes', '그런축은없다');
  const user = userEvent.setup();
  render(<App />);

  await 검색한다(user);

  await waitFor(() => expect(검색요청.length).toBeGreaterThan(0));
  expect(축들(검색요청.at(-1)!)).toEqual(['name']);
});

it('AC-8: 필터에서 축을 켜면 그 축이 검색 요청에 더해진다', async () => {
  const user = userEvent.setup();
  render(<App />);

  await 검색한다(user);
  await waitFor(() => expect(검색요청.length).toBeGreaterThan(0));
  expect(축들(검색요청.at(-1)!), '기본은 이름 하나다').toEqual(['name']);

  // 팝오버를 열어 본문 축을 켠다 — 사용자가 실제로 하는 조작이다.
  await user.click(screen.getByRole('button', { name: '검색 대상' }));
  await user.click(screen.getByRole('checkbox', { name: AXIS_LABELS.body }));

  await waitFor(() => expect(축들(검색요청.at(-1)!)).toEqual(['body', 'name']));
});

it('AC-8: 축을 끄면 그 축이 검색 요청에서 빠진다', async () => {
  localStorage.setItem('doculight.search-axes', 'name,body');
  const user = userEvent.setup();
  render(<App />);

  await 검색한다(user);
  await waitFor(() => expect(검색요청.length).toBeGreaterThan(0));
  expect(축들(검색요청.at(-1)!)).toEqual(['body', 'name']);

  await user.click(screen.getByRole('button', { name: '검색 대상' }));
  await user.click(screen.getByRole('checkbox', { name: AXIS_LABELS.body }));

  await waitFor(() => expect(축들(검색요청.at(-1)!), '끈 축이 요청에 남았다').toEqual(['name']));
});
