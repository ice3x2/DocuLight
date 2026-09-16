import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';

import { App } from '../src/App.js';
import { QUERY_KEYS } from '../src/api/queries.js';
import {
  ThemeRuntime,
  applyThemePreference,
  cachedTheme,
  clearThemeMemory,
  rememberTheme,
} from '../src/theme/runtime.js';

type MediaListener = (event: MediaQueryListEvent) => void;

let systemDark = false;
let mediaListeners: Set<MediaListener>;

const setSystemDark = (dark: boolean) => {
  systemDark = dark;
  for (const listener of mediaListeners) {
    listener({ matches: dark, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent);
  }
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const newTestClient = () => new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
});

beforeEach(() => {
  systemDark = false;
  mediaListeners = new Set();
  clearThemeMemory();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('color-scheme');
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: systemDark,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => mediaListeners.delete(listener),
    addListener: (listener: MediaListener) => mediaListeners.add(listener),
    removeListener: (listener: MediaListener) => mediaListeners.delete(listener),
    dispatchEvent: () => true,
  })));
});

afterEach(() => {
  cleanup();
  clearThemeMemory();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('IR-SHELL-007 — 사용자별 테마 런타임', () => {
  it('AC-1: system은 실행 중 OS 변경을 따르고 고정 선택은 따르지 않는다', () => {
    const view = render(<ThemeRuntime settingsResolved userId="u1" preference="system" />);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');

    setSystemDark(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    view.rerender(<ThemeRuntime settingsResolved userId="u1" preference="light" />);
    expect(document.documentElement.dataset.theme).toBe('light');
    setSystemDark(false);
    setSystemDark(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('AC-2 · AC-3: 인증 전에는 OS, 같은 사용자 조회 중에는 탭 메모리, DB 응답 뒤에는 DB가 이긴다', () => {
    setSystemDark(true);
    const view = render(<ThemeRuntime settingsResolved={false} />);
    expect(document.documentElement.dataset.theme).toBe('dark');

    rememberTheme('u1', 'light');
    view.rerender(<ThemeRuntime settingsResolved={false} userId="u1" />);
    expect(document.documentElement.dataset.theme).toBe('light');

    view.rerender(<ThemeRuntime settingsResolved userId="u1" preference="dark" />);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(cachedTheme('u1')).toBe('dark');
  });

  it('AC-3: 로그아웃과 사용자 교체는 이전 사용자 캐시를 지우고 system으로 돌아간다', () => {
    const view = render(<ThemeRuntime settingsResolved userId="u1" preference="dark" />);
    expect(cachedTheme('u1')).toBe('dark');

    view.rerender(<ThemeRuntime settingsResolved={false} userId="u2" />);
    expect(cachedTheme('u1')).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('light');

    rememberTheme('u2', 'dark');
    view.rerender(<ThemeRuntime settingsResolved={false} />);
    expect(cachedTheme('u2')).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('AC-3: 테마 런타임은 localStorage에 이전 사용자의 힌트를 남기지 않는다', () => {
    const persistentWrite = vi.spyOn(Storage.prototype, 'setItem');
    rememberTheme('u1', 'dark');
    applyThemePreference('dark');

    expect(persistentWrite).not.toHaveBeenCalled();
  });

  it('AC-5: 테마 전환은 기존 자식 인스턴스를 다시 마운트하지 않는다', () => {
    let mounts = 0;
    function EditorProbe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div data-testid="editor-probe" />;
    }

    const view = render(
      <><ThemeRuntime settingsResolved userId="u1" preference="light" /><EditorProbe /></>,
    );
    view.rerender(
      <><ThemeRuntime settingsResolved userId="u1" preference="dark" /><EditorProbe /></>,
    );

    expect(screen.getByTestId('editor-probe')).toBeDefined();
    expect(mounts).toBe(1);
  });

  it('사용자 ID가 개인 설정 React Query 키에 포함된다', () => {
    expect(QUERY_KEYS.personalSettings('u1')).toEqual(['personal-settings', 'u1']);
    expect(QUERY_KEYS.personalSettings('u2')).toEqual(['personal-settings', 'u2']);
  });
});

describe('IR-SHELL-007 AC-4 — DB 저장 상태와 복원', () => {
  const routes = new Map<string, (init?: RequestInit) => Response | Promise<Response>>();

  beforeEach(() => {
    routes.clear();
    routes.set('/api/session', () => json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => json({ userId: 'u1' }));
    routes.set('/api/tree', () => json([{ workspace: { id: 'ws1', name: '문서함' }, visibility: 'full', roots: [] }]));
    routes.set('/api/personal-settings', () => json({ theme: 'dark' }));
    vi.stubGlobal('fetch', vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      return Promise.resolve(routes.get(path)?.(init) ?? json(null, 404));
    }));
  });

  const openAppearance = async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await user.click(await screen.findByRole('button', { name: '설정' }));
    await user.click(within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name: '외모(테마)' }));
    return user;
  };

  const openAppearanceWhileLoading = async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: '설정' }));
    await user.click(within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name: '외모(테마)' }));
    return user;
  };

  it('AC-3: a 401 session refetch clears user A before user B logs in', async () => {
    let currentUser = 'u1';
    let expired = false;
    routes.set('/api/session', () => expired
      ? json(null, 401)
      : json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }));
    routes.set('/api/auth/me', () => json({ userId: currentUser }));
    routes.set('/api/personal-settings', () => json({ theme: currentUser === 'u1' ? 'dark' : 'light' }));
    routes.set('/api/auth/login', () => {
      currentUser = 'u2';
      expired = false;
      return json({ ok: true });
    });

    const user = userEvent.setup();
    const client = newTestClient();
    render(<App queryClient={client} />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    expired = true;
    await client.refetchQueries({ queryKey: QUERY_KEYS.session });
    await screen.findByRole('main', { name: '로그인' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(cachedTheme('u1')).toBeUndefined();

    await user.type(screen.getByLabelText('이름'), 'user-b');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(10));
    await user.click(screen.getByRole('button', { name: '로그인' }));

    await screen.findByRole('tree', { name: '문서 트리' });
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(cachedTheme('u1')).toBeUndefined();
  });

  it('AC-4: theme selection stays disabled with a linked loading state until settings resolve', async () => {
    let finish!: (response: Response) => void;
    routes.set('/api/personal-settings', () => new Promise<Response>((resolve) => { finish = resolve; }));
    await openAppearanceWhileLoading();

    const select = screen.getByLabelText('테마');
    const loading = screen.getByRole('status');
    expect(select).toHaveProperty('disabled', true);
    expect(loading.textContent).toBe('테마 설정을 불러오는 중…');
    expect(select.getAttribute('aria-describedby')).toBe(loading.id);

    finish(json({ theme: 'dark' }));
    await waitFor(() => expect(select).toHaveProperty('disabled', false));
    expect(select).toHaveProperty('value', 'dark');
  });

  it('AC-4: initial settings failure stays disabled and exposes a working retry', async () => {
    let attempts = 0;
    routes.set('/api/personal-settings', () => {
      attempts += 1;
      return attempts === 1 ? json({ reason: 'temporary' }, 500) : json({ theme: 'light' });
    });
    const user = await openAppearanceWhileLoading();

    const select = screen.getByLabelText('테마');
    expect(select).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('테마 설정을 불러오지 못했습니다.');

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => expect(select).toHaveProperty('disabled', false));
    expect(select).toHaveProperty('value', 'light');
    expect(attempts).toBe(2);
  });

  it('AC-4: identity failure blocks theme selection and retries identity before settings', async () => {
    let identityAttempts = 0;
    let personalAttempts = 0;
    let finishIdentity!: (response: Response) => void;
    routes.set('/api/auth/me', () => {
      identityAttempts += 1;
      return identityAttempts === 1
        ? json({ reason: 'temporary' }, 500)
        : new Promise<Response>((resolve) => { finishIdentity = resolve; });
    });
    routes.set('/api/personal-settings', () => {
      personalAttempts += 1;
      return json({ theme: 'dark' });
    });
    const user = await openAppearanceWhileLoading();

    const select = screen.getByLabelText('테마');
    expect(select).toHaveProperty('disabled', true);
    expect(screen.getByRole('alert').textContent).toContain('테마 설정을 불러오지 못했습니다.');
    expect(personalAttempts).toBe(0);

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(screen.getByRole('status').textContent).toBe('테마 설정을 불러오는 중…');
    finishIdentity(json({ userId: 'u1' }));
    await waitFor(() => expect(select).toHaveProperty('disabled', false));
    expect(select).toHaveProperty('value', 'dark');
    expect(identityAttempts).toBe(2);
    expect(personalAttempts).toBe(1);
  });

  it('AC-4: an older settings GET cannot overwrite a later successful PATCH', async () => {
    let getCount = 0;
    let finishStaleGet!: (response: Response) => void;
    routes.set('/api/personal-settings', (init) => {
      if (init?.method === 'PATCH') return json(null, 204);
      getCount += 1;
      if (getCount === 1) return json({ theme: 'dark' });
      return new Promise<Response>((resolve) => { finishStaleGet = resolve; });
    });
    const client = newTestClient();
    const user = userEvent.setup();
    render(<App queryClient={client} />);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await user.click(await screen.findByRole('button', { name: '설정' }));
    await user.click(within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name: '외모(테마)' }));

    void client.refetchQueries({ queryKey: QUERY_KEYS.personalSettings('u1') });
    await waitFor(() => expect(getCount).toBe(2));
    await user.selectOptions(screen.getByLabelText('테마'), 'light');
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('테마 저장됨'));

    finishStaleGet(json({ theme: 'dark' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByLabelText('테마')).toHaveProperty('value', 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('선택을 즉시 미리 반영하고 저장 성공 뒤 저장됨을 표시한다', async () => {
    let finish!: (response: Response) => void;
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH'
      ? new Promise<Response>((resolve) => { finish = resolve; })
      : json({ theme: 'dark' }));
    const user = await openAppearance();

    await user.selectOptions(screen.getByLabelText('테마'), 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByRole('status').textContent).toContain('저장 중');

    finish(json(null, 204));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('저장됨'));
  });

  it('저장 실패 시 마지막 DB 선택으로 복원하고 지속 오류와 재시도를 제공한다', async () => {
    let attempts = 0;
    routes.set('/api/personal-settings', (init) => {
      if (init?.method !== 'PATCH') return json({ theme: 'dark' });
      attempts += 1;
      return attempts === 1 ? json({ reason: 'temporary' }, 500) : json(null, 204);
    });
    const user = await openAppearance();

    await user.selectOptions(screen.getByLabelText('테마'), 'light');
    expect((await screen.findByRole('alert')).textContent).toContain('저장하지 못했습니다');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(screen.getByRole('button', { name: '테마 저장 다시 시도' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('저장됨'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(attempts).toBe(2);
  });

  it('늦게 끝난 이전 저장 응답은 더 최신 선택을 덮어쓰지 않는다', async () => {
    const finishes: Array<(response: Response) => void> = [];
    routes.set('/api/personal-settings', (init) => init?.method === 'PATCH'
      ? new Promise<Response>((resolve) => { finishes.push(resolve); })
      : json({ theme: 'dark' }));
    const user = await openAppearance();

    await user.selectOptions(screen.getByLabelText('테마'), 'light');
    await user.selectOptions(screen.getByLabelText('테마'), 'system');
    expect(finishes).toHaveLength(2);

    finishes[1]!(json(null, 204));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('저장됨'));
    finishes[0]!(json(null, 204));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByLabelText('테마')).toHaveProperty('value', 'system');
  });
});
