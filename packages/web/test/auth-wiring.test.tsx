import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

/**
 * 인증 왕복 배선 (원장 §4 **수용 기준 14**).
 *
 * 이 축은 다른 배선 시험과 전제가 정반대다 — 나머지는 **로그인된 상태**를
 * 전제로 출발하는데, 여기서는 그 상태가 되는 과정 자체를 잰다. 그래서
 * `/api/session` 이 401 로 시작한다.
 *
 * 이 시험이 없으면 「로그인할 수 없는 빌드」가 나머지 열셋을 전부 통과한다.
 * 원장 §4 의 〔판정 필요 · 2026-08-19〕가 정확히 그 사실을 적어 두었다.
 */
const routes = new Map<string, (init?: RequestInit) => Response>();
let sent: { path: string; method: string; body: unknown }[];
/** 로그인했는가 — 서버 상태를 흉내 낸다. */
let 로그인됨: boolean;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  routes.clear();
  sent = [];
  로그인됨 = false;
  vi.spyOn(window.history, 'pushState').mockImplementation(() => undefined);

  routes.set('/api/session', () =>
    로그인됨
      ? json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 })
      : json(null, 401),
  );
  routes.set('/api/tree', () =>
    json([{ workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [] }]),
  );
  routes.set('/api/favorites', () => json([]));

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
});

const 자격을넣는다 = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(await screen.findByLabelText('이름'), '한범');
  await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(10));
  await user.click(screen.getByRole('button', { name: '로그인' }));
};

describe('수용 기준 14 — 로그인 (R57)', () => {
  it('자격이 서버로 나간다', async () => {
    routes.set('/api/auth/login', () => {
      로그인됨 = true;
      return json({ ok: true });
    });
    const user = userEvent.setup();
    render(<App />);

    await 자격을넣는다(user);

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/auth/login',
        method: 'POST',
        body: { name: '한범', password: 'x'.repeat(10) },
      }),
    );
  });

  it('로그인하면 앱 화면으로 넘어간다', async () => {
    routes.set('/api/auth/login', () => {
      로그인됨 = true;
      return json({ ok: true });
    });
    const user = userEvent.setup();
    render(<App />);

    await 자격을넣는다(user);

    // 나갔다는 것만으로는 부족하다 — 세션을 다시 받지 않으면 사용자는
    // 로그인 화면에 그대로 남고, 그 화면은 아무 말도 하지 않는다.
    await waitFor(() => expect(screen.getByRole('tree', { name: '문서 트리' })).toBeDefined());
    expect(screen.queryByLabelText('비밀번호')).toBeNull();
  });

  it('R60 · R60-b: active 가 아닌 계정은 상태에 맞는 안내와 함께 차단된다', async () => {
    routes.set('/api/auth/login', () =>
      json({ reason: '가입 신청이 아직 승인되지 않았습니다' }, 401),
    );
    const user = userEvent.setup();
    render(<App />);

    await 자격을넣는다(user);

    // 「이름 또는 비밀번호가 올바르지 않습니다」로 뭉개면 승인을 기다리는
    // 사용자가 자기 자격을 의심하며 계속 다시 친다.
    expect((await screen.findByRole('alert')).textContent).toContain(
      '가입 신청이 아직 승인되지 않았습니다',
    );
    expect(screen.queryByRole('tree', { name: '문서 트리' })).toBeNull();
  });
});

describe('수용 기준 14 — 로그아웃 (R145) · 비밀번호 변경 (R144)', () => {
  const 로그인한채로연다 = async () => {
    로그인됨 = true;
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tree', { name: '문서 트리' });
    await user.click(screen.getByRole('button', { name: '설정' }));
    await user.click(await screen.findByRole('tab', { name: '계정' }));
    return user;
  };

  it('SEC-AUTH-019 AC-1 · AC-2: 로그아웃하면 서버로 나가고 인증 상태가 풀린다', async () => {
    routes.set('/api/auth/logout', () => {
      로그인됨 = false;
      return json(null, 204);
    });
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '로그아웃' }));

    await waitFor(() =>
      expect(sent).toContainEqual({ path: '/api/auth/logout', method: 'POST', body: undefined }),
    );
    // 나간 것만 재면 화면이 그대로 앱에 머무는 구현이 통과한다.
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());
  });

  it('SEC-AUTH-018 AC-1 · AC-2: 비밀번호를 바꾸면 서버로 나가고 다시 로그인 화면으로 간다', async () => {
    routes.set('/api/auth/password', () => {
      // 서버가 그 계정의 모든 세션을 끊는다 — 이 세션도 함께 끊긴다.
      로그인됨 = false;
      return json(null, 204);
    });
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    await user.type(await screen.findByLabelText('현재 비밀번호'), 'x'.repeat(10));
    await user.type(screen.getByLabelText('새 비밀번호'), 'y'.repeat(12));
    await user.click(screen.getByRole('button', { name: '바꾸기' }));

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/auth/password',
        method: 'POST',
        body: { current: 'x'.repeat(10), next: 'y'.repeat(12) },
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());
  });

  it('현재 비밀번호가 틀리면 그 사유를 보이고 화면에 머문다', async () => {
    routes.set('/api/auth/password', () => json({ rule: 'wrong-password' }, 400));
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    await user.type(await screen.findByLabelText('현재 비밀번호'), '틀림');
    await user.type(screen.getByLabelText('새 비밀번호'), 'y'.repeat(12));
    await user.click(screen.getByRole('button', { name: '바꾸기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('현재 비밀번호');
    // 실패했는데 화면을 닫으면 사용자는 바뀐 줄 안다.
    expect(screen.getByLabelText('새 비밀번호')).toBeDefined();
  });
});
