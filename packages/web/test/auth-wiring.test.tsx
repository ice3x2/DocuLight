import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { QueryClient } from '@tanstack/react-query';

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
const routes = new Map<string, (init?: RequestInit) => Response | Promise<Response>>();
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
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/auth/password',
        method: 'POST',
        body: { current: 'x'.repeat(10), next: 'y'.repeat(12) },
      }),
    );
    await waitFor(() => expect(screen.getByLabelText('비밀번호')).toBeDefined());
  });

  /**
   * 원장 `G33` ① — 비밀번호 변경은 그 계정의 세션과 PAT 를 함께 끊는다.
   *
   * 그 파급을 **누르기 전에** 알려야 한다. 누른 뒤에 알면 사용자는 MCP
   * 자동화가 죽고 나서야 그 사실을 알게 되고, 그때는 되돌릴 수 없다.
   */
  it('폼이 사후 파급을 미리 알린다 — 모든 세션과 모든 액세스 토큰이 끊긴다', async () => {
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    const 폼 = (await screen.findByLabelText('현재 비밀번호')).closest('form');

    expect(폼?.textContent, '세션이 끊긴다는 사실이 화면에 없다').toContain('모든 세션');
    expect(폼?.textContent, '액세스 토큰이 끊긴다는 사실이 화면에 없다').toContain(
      '액세스 토큰',
    );
  });

  it('현재 비밀번호가 틀리면 그 사유를 보이고 화면에 머문다', async () => {
    routes.set('/api/auth/password', () => json({ rule: 'wrong-password' }, 400));
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    await user.type(await screen.findByLabelText('현재 비밀번호'), '틀림');
    await user.type(screen.getByLabelText('새 비밀번호'), 'y'.repeat(12));
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('현재 비밀번호');
    // 실패했는데 화면을 닫으면 사용자는 바뀐 줄 안다.
    expect(screen.getByLabelText('새 비밀번호')).toBeDefined();
  });

  it.each([
    ['rule-less 400', 400, undefined],
    ['401', 401, undefined],
    ['429', 429, undefined],
    ['500', 500, undefined],
    ['unknown rule', 400, 'future-rule'],
  ])('%s는 App 어댑터부터 폼까지 일반 오류로 보존한다', async (_name, status, rule) => {
    routes.set('/api/auth/password', () => json(rule === undefined ? {} : { rule }, status));
    const user = await 로그인한채로연다();

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    await user.type(await screen.findByLabelText('현재 비밀번호'), '현재-값');
    await user.type(screen.getByLabelText('새 비밀번호'), '새-값');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하십시오.');
    expect(alert.textContent).not.toContain('계정을 찾을 수 없습니다');
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
  });

  it('전송 자체가 거부되면 App은 성공 후 세션 갱신을 하지 않고 폼에 일반 오류를 남긴다', async () => {
    let sessionReads = 0;
    routes.set('/api/session', () => {
      sessionReads += 1;
      return json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 });
    });
    routes.set('/api/auth/password', () => {
      throw new TypeError('network unavailable');
    });
    const user = await 로그인한채로연다();
    const readsBeforeSubmit = sessionReads;

    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
    await user.type(await screen.findByLabelText('현재 비밀번호'), '현재-값');
    await user.type(screen.getByLabelText('새 비밀번호'), '새-값');
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      '비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도하십시오.',
    );
    expect(sent.filter(({ path }) => path === '/api/auth/password')).toHaveLength(1);
    expect(sessionReads).toBe(readsBeforeSubmit);
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
  });

  it.each(['wrong-password', 'empty-password', 'self-only', 'unknown-account'])(
    'HTTP 400의 알려진 %s 규칙만 기존 안내로 분류한다',
    async (rule) => {
      routes.set('/api/auth/password', () => json({ rule }, 400));
      const user = await 로그인한채로연다();
      await user.click(screen.getByRole('button', { name: '비밀번호 변경' }));
      await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

      expect((await screen.findByRole('alert')).textContent).not.toContain(
        '비밀번호를 바꾸지 못했습니다',
      );
    },
  );
});

describe('IR-SHELL-004 App editor outcome wiring', () => {
  const openEditor = async () => {
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => json({ userId: 'u1' }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    return user;
  };

  it.each([200, 403, 404, 409, 413, 429, 500])('maps HTTP %s through App to unknown without confirming the attempted value', async (status) => {
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH' ? json(null, status) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview', theme: 'system' }));
    const user = await openEditor();
    const select = await screen.findByLabelText('기본 열람 모드') as HTMLSelectElement;
    await user.selectOptions(select, 'edit');
    expect((await screen.findByRole('alert')).textContent).toContain('저장 여부를 확인하지 못했습니다');
    expect(select.value).toBe('view');
    expect(sent.filter((row) => row.path === '/api/personal-settings')).toHaveLength(1);
  });

  it('maps 401 to one auth-ended alert, disables both fields and exposes no retry', async () => {
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH' ? json(null, 401) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }));
    const user = await openEditor(); const select = await screen.findByLabelText('기본 열람 모드');
    await user.selectOptions(select, 'edit');
    expect(await screen.findAllByText(/로그인이 필요합니다/)).toHaveLength(1);
    expect(screen.getAllByRole('combobox').every((node) => (node as HTMLSelectElement).disabled)).toBe(true);
    expect(screen.queryByRole('button', { name: /저장 다시 시도/ })).toBeNull();
  });

  it('retries the exact rejected 400 assignment once and then adopts 204', async () => {
    let attempts = 0;
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH' ? json(null, ++attempts === 1 ? 400 : 204) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }));
    const user = await openEditor(); const select = await screen.findByLabelText('기본 열람 모드') as HTMLSelectElement;
    await user.selectOptions(select, 'edit');
    await user.click(await screen.findByRole('button', { name: /저장 다시 시도/ }));
    await waitFor(() => expect(select.value).toBe('edit'));
    expect(sent.filter((row) => row.path === '/api/personal-settings').map((row) => row.body)).toEqual([{ 'default-view-mode': 'edit' }, { 'default-view-mode': 'edit' }]);
  });

  it('maps transport rejection to unknown without session cleanup', async () => {
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH' ? Promise.reject(new TypeError('offline')) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }));
    const user = await openEditor(); await user.selectOptions(await screen.findByLabelText('기본 열람 모드'), 'edit');
    expect((await screen.findByRole('alert')).textContent).toContain('저장 여부를 확인하지 못했습니다');
  });

  it('renders preference load failure and retries the exact current-user query', async () => {
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 })); routes.set('/api/auth/me', () => json({ userId: 'u1' }));
    let fail = true; routes.set('/api/personal-settings', () => fail ? json(null, 500) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); const user = userEvent.setup(); render(<App queryClient={client} />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    expect((await screen.findByRole('alert')).textContent).toContain('에디터 설정을 불러오지 못했습니다');
    fail = false; await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect((screen.getByLabelText('기본 열람 모드') as HTMLSelectElement).disabled).toBe(false));
  });

  it('blocks delayed same-key reentry and merges without clobbering theme', async () => {
    let finish!: (response: Response) => void;
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH' ? new Promise<Response>((resolve) => { finish = resolve; }) : json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview', theme: 'dark' }));
    await openEditor(); const select = await screen.findByLabelText('기본 열람 모드');
    fireEvent.change(select, { target: { value: 'edit' } }); fireEvent.change(select, { target: { value: 'view' } });
    expect(sent.filter((row) => row.path === '/api/personal-settings')).toEqual([{ path: '/api/personal-settings', method: 'PATCH', body: { 'default-view-mode': 'edit' } }]);
    finish(json(null, 204)); await waitFor(() => expect(select).toHaveProperty('value', 'edit'));
    expect((await screen.findByLabelText('기본 열람 모드')).getAttribute('aria-busy')).toBeNull();
  });

  it('shows a lost response as unknown then accepts a later authoritative reread without clobbering theme', async () => {
    let stored = 'view'; const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    routes.set('/api/personal-settings', (init) => { if (init?.method === 'PATCH') { stored = 'edit'; return Promise.reject(new TypeError('lost response')); } return json({ 'default-view-mode': stored, 'default-edit-subview': 'live-preview', theme: 'dark' }); });
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 })); routes.set('/api/auth/me', () => json({ userId: 'u1' }));
    const user = userEvent.setup(); render(<App queryClient={client} />); await user.click(await screen.findByRole('button', { name: '설정' }));
    const select = await screen.findByLabelText('기본 열람 모드') as HTMLSelectElement; await user.selectOptions(select, 'edit');
    expect((await screen.findByRole('alert')).textContent).toContain('저장 여부를 확인하지 못했습니다'); expect(select.value).toBe('view');
    await client.invalidateQueries({ queryKey: ['personal-settings', 'u1'] });
    await waitFor(() => expect(select.value).toBe('edit'));
    expect(client.getQueryData(['personal-settings', 'u1'])).toMatchObject({ theme: 'dark', 'default-edit-subview': 'live-preview' });
  });

  it('keeps different-key success independent from a concurrent rejected key', async () => {
    let resolveView!: (response: Response) => void; let resolveSubview!: (response: Response) => void;
    routes.set('/api/personal-settings', (init) => {
      if (init?.method !== 'PATCH') return json({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview', theme: 'system' });
      const body = JSON.parse(String(init.body));
      return new Promise<Response>((resolve) => { if ('default-view-mode' in body) resolveView = resolve; else resolveSubview = resolve; });
    });
    await openEditor();
    const [view, subview] = await screen.findAllByRole('combobox');
    fireEvent.change(view!, { target: { value: 'edit' } });
    fireEvent.change(subview!, { target: { value: 'source' } });
    expect(sent.filter((row) => row.path === '/api/personal-settings')).toHaveLength(2);
    resolveView(json(null, 204)); resolveSubview(json(null, 400));
    await waitFor(() => expect(view).toHaveProperty('value', 'edit'));
    await waitFor(() => expect(subview).toHaveProperty('value', 'live-preview'));
    expect(sent.filter((row) => row.path === '/api/personal-settings')).toHaveLength(2);
  });
});

describe('IR-AUTH-001 AC-2 · FR-AUTH-004 AC-5 — 가입 신청이 서버까지 닿는다', () => {
  /** 로그인 화면에서 가입 화면으로 건너간다. 그 길이 없으면 폼에 닿을 수 없다. */
  const 가입화면으로 = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole('button', { name: '가입 신청하기' }));
    return screen.findByRole('main', { name: '가입 신청' });
  };

  it('로그인 화면에서 가입 화면으로 갈 수 있다', async () => {
    const user = userEvent.setup();
    render(<App />);

    const 가입 = await 가입화면으로(user);

    // 갈 길이 없으면 그 화면은 존재해도 아무도 닿지 못한다.
    expect(가입).toBeDefined();
    expect(within(가입).getByRole('button', { name: '가입 신청' })).toBeDefined();
  });

  it('신청이 서버로 나가고 승인 안내가 선다', async () => {
    routes.set('/api/signup', () => json(null, 201));
    const user = userEvent.setup();
    render(<App />);
    await 가입화면으로(user);

    await user.type(screen.getByLabelText('이름'), '신청자');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(12));
    await user.click(screen.getByRole('button', { name: '가입 신청' }));

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/signup',
        method: 'POST',
        body: { name: '신청자', password: 'x'.repeat(12) },
      }),
    );
    expect((await screen.findByRole('status')).textContent).toContain('승인');
  });

  it('가입이 닫혀 있으면 그 사유가 선다', async () => {
    routes.set('/api/signup', () => json(null, 403));
    const user = userEvent.setup();
    render(<App />);
    await 가입화면으로(user);

    await user.type(screen.getByLabelText('이름'), '신청자');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(12));
    await user.click(screen.getByRole('button', { name: '가입 신청' }));

    // 403 을 「이름이 이미 있습니다」로 보이면 사용자는 이름만 바꿔 가며
    // 계속 시도한다 — 그 인스턴스는 아예 신청을 받지 않는데도.
    expect((await screen.findByRole('alert')).textContent).toContain('신청');
  });

  it('가입 화면에서 로그인 화면으로 돌아올 수 있다', async () => {
    const user = userEvent.setup();
    render(<App />);
    await 가입화면으로(user);

    await user.click(screen.getByRole('button', { name: '로그인하기' }));

    expect(await screen.findByRole('main', { name: '로그인' })).toBeDefined();
  });
});

describe('SEC-AUTH-004 · FR-AUTH-002 — 가입 승인이 서버까지 닿는다', () => {
  const 명부를연다 = async () => {
    로그인됨 = true;
    // **슈퍼유저로 붙는다** — 이 카테고리는 그 자격에만 보인다(`R24-a`).
    routes.set('/api/session', () =>
      json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }),
    );
    routes.set('/api/roster/users', () =>
      json([
        { id: 'u2', name: '대기자', status: 'pending' },
        { id: 'u4', name: '거절자', status: 'rejected' },
      ]),
    );
    routes.set('/api/roster/groups', () => json([]));
    routes.set('/api/instance/signup-mode', () => json({ mode: 'approval' }));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('tree', { name: '문서 트리' });
    await user.click(screen.getByRole('button', { name: '설정' }));
    // 명부가 아니라 **가입 승인** 카테고리다 (설계서 `04` §2.10).
    await user.click(await screen.findByRole('tab', { name: '가입 승인' }));
    return user;
  };

  it('승인이 `/api/roster/users/:id/approve` 로 나간다', async () => {
    routes.set('/api/roster/users/u2/approve', () => json(null, 204));
    const user = await 명부를연다();

    await user.click(
      within(await screen.findByRole('row', { name: /대기자/ })).getByRole('button', { name: '대기자 승인' }),
    );

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/roster/users/u2/approve',
        method: 'POST',
        body: undefined,
      }),
    );
  });

  it('재심사가 `/api/roster/users/:id/reopen` 으로 나간다', async () => {
    routes.set('/api/roster/users/u4/reopen', () => json(null, 204));
    const user = await 명부를연다();

    // 거절됨 탭으로 건너간다 — 대기 중 탭에는 그 행이 없다.
    await user.click(screen.getByRole('tab', { name: /거절됨/ }));
    await user.click(
      within(await screen.findByRole('row', { name: /거절자/ })).getByRole('button', { name: '거절자 재심사' }),
    );

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/roster/users/u4/reopen',
        method: 'POST',
        body: undefined,
      }),
    );
  });

  it('거절이 상태 전환으로 나간다', async () => {
    routes.set('/api/roster/users/u2/status', () => json(null, 204));
    const user = await 명부를연다();

    await user.click(
      within(await screen.findByRole('row', { name: /대기자/ })).getByRole('button', { name: '대기자 거절' }),
    );

    await waitFor(() =>
      expect(sent).toContainEqual({
        path: '/api/roster/users/u2/status',
        method: 'POST',
        body: { status: 'rejected' },
      }),
    );
  });
});
