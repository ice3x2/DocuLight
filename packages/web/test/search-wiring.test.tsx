import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
let 검색응답: (url: string) => Promise<Response>;

beforeEach(() => {
  검색요청 = [];
  검색응답 = async () => json({ documents: [] });
  localStorage.clear();

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) => {
      const full = String(url);
      const path = full.split('?')[0]!;
      if (path === '/api/search') {
        검색요청.push(full);
        return 검색응답(full);
      }
      if (path === '/api/session') {
        return Promise.resolve(
          json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }),
        );
      }
      if (path === '/api/auth/me') return Promise.resolve(json({ userId: 'user-a' }));
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
  await user.type(screen.getByPlaceholderText(/이름 · 본문/), '설계');
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

it('IR-SHELL-009 AC-3: 실제 search query의 loading/error와 refetch를 화면에 전달한다', async () => {
  let resolve!: (response: Response) => void;
  검색응답 = () => new Promise<Response>((done) => { resolve = done; });
  const user = userEvent.setup();
  render(<App />);
  await 검색한다(user);
  expect(await screen.findByRole('status', { name: '검색 중…' })).toBeDefined();

  resolve(json({}, 500));
  const alert = await screen.findByRole('alert', { name: '검색 오류' });
  expect(alert.textContent).not.toContain('500');

  const beforeRetry = 검색요청.length;
  검색응답 = async () => json({ documents: [] });
  await user.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(await screen.findByText('검색 결과가 없습니다.')).toBeDefined();
  expect(검색요청).toHaveLength(beforeRetry + 1);
});

it('IR-SHELL-009 AC-3: 이전 query의 늦은 응답이 새 query 결과를 덮지 않는다', async () => {
  const pending = new Map<string, (response: Response) => void>();
  검색응답 = (url) => new Promise<Response>((done) => {
    pending.set(new URL(url, 'http://x').searchParams.get('q') ?? '', done);
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('tab', { name: '검색' }));
  const input = screen.getByRole('combobox', { name: '검색' });
  fireEvent.change(input, { target: { value: '이전질의' } });
  await waitFor(() => expect(pending.has('이전질의')).toBe(true));
  fireEvent.change(input, { target: { value: '현재질의' } });
  await waitFor(() => expect(pending.has('현재질의')).toBe(true));

  pending.get('현재질의')!(json({ documents: [{ nodeId: 'new', name: '현재.md', workspaceName: '기획팀', excerpts: [] }] }));
  expect(await screen.findByText('현재.md')).toBeDefined();
  pending.get('이전질의')!(json({ documents: [{ nodeId: 'old', name: '이전.md', workspaceName: '기획팀', excerpts: [] }] }));
  await waitFor(() => expect(screen.queryByText('이전.md')).toBeNull());
  expect(screen.getByText('현재.md')).toBeDefined();
});
