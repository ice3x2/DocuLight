import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

/**
 * 액세스 토큰 화면이 **서버까지 배선되어 있는가** (`SEC-AUTH-007` AC-1 ·
 * AC-2 · `SEC-AUTH-006` AC-2).
 *
 * `token-panel.test.tsx` 는 부품에 가짜 콜백을 꽂아 화면의 규칙을 잰다.
 * 그것만으로는 **부품과 서버 사이가 끊겨도 통과한다** — 이슈 #29 가 정확히
 * 그 형태였다: 서비스는 규칙을 전부 갖고 있는데 부르는 자리가 없었다.
 * 그래서 여기서는 진짜 `App` 을 세우고 나간 요청을 센다.
 */

const routes = new Map<string, (init?: RequestInit) => Response>();
let sent: { path: string; method: string; body: unknown }[];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  routes.clear();
  sent = [];
  vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);

  routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
  routes.set('/api/tree', () =>
    json([{ workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [] }]),
  );
  routes.set('/api/favorites', () => json([]));
  routes.set('/api/auth/tokens', (init) =>
    (init?.method ?? 'GET') === 'POST'
      ? json({ id: 't-new', token: 'dl_pat_서버가준값' }, 201)
      : json([
          {
            id: 't1',
            name: '노트북 CLI',
            scope: 'read-write',
            expiresAt: '2099-11-10T00:00:00.000Z',
            lastUsedAt: null,
            revokedAt: null,
          },
        ]),
  );
  routes.set('/api/auth/tokens/t1', () => new Response(null, { status: 204 }));

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      const method = init?.method ?? 'GET';
      if (method !== 'GET')
        sent.push({
          path,
          method,
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body,
        });
      const handler = routes.get(path);
      return Promise.resolve(handler === undefined ? json(null, 404) : handler(init));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const 토큰탭을연다 = async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole('button', { name: '설정' }));
  const modal = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(modal).getByRole('tab', { name: '액세스 토큰' }));
  return { user, panel: within(modal).getByRole('tabpanel', { name: '액세스 토큰' }) };
};

describe('SEC-AUTH-007 — 화면이 서버의 토큰을 그린다', () => {
  it('서버가 준 목록이 탭에 선다', async () => {
    const { panel } = await 토큰탭을연다();

    // 지어낸 목록이 아니라 서버 응답이 그려져야 한다 — 부품만 재면 그
    // 차이가 드러나지 않는다.
    await waitFor(() => expect(panel.textContent).toContain('노트북 CLI'));
  });

  it('발급 폼이 서버로 나가고 서버가 준 평문이 그대로 노출된다', async () => {
    const { user, panel } = await 토큰탭을연다();

    await user.click(within(panel).getByRole('button', { name: '새 액세스 토큰' }));
    const form = await screen.findByRole('dialog', { name: '새 액세스 토큰' });
    await user.type(within(form).getByLabelText('이름'), 'CI 스크립트');
    await user.click(within(form).getByRole('radio', { name: '읽기 전용' }));
    await user.click(within(form).getByRole('button', { name: '발급' }));

    await waitFor(() =>
      expect(sent.filter((one) => one.path === '/api/auth/tokens' && one.method === 'POST')).toHaveLength(1),
    );
    // **`owner` 가 실리지 않는다** — 대상은 세션이 정한다.
    expect(sent[0]?.body).toEqual({ name: 'CI 스크립트', scope: 'read-only', expiresInDays: 90 });

    // 화면이 지어낸 값이 아니라 서버가 준 평문이 서야 한다.
    expect((await screen.findByTestId('token-plaintext')).textContent).toBe('dl_pat_서버가준값');
  });

  it('L2 확인을 지난 폐기가 서버로 나간다', async () => {
    const { user, panel } = await 토큰탭을연다();
    await waitFor(() => expect(panel.textContent).toContain('노트북 CLI'));

    await user.click(within(panel).getByRole('button', { name: '노트북 CLI 폐기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    await waitFor(() =>
      expect(sent).toContainEqual({ path: '/api/auth/tokens/t1', method: 'DELETE', body: undefined }),
    );
  });
});
