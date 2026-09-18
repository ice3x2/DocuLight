import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstanceSettings } from '../src/settings/InstanceSettings.js';
import { App } from '../src/App.js';

const CURRENT = {
  'signup-mode': 'approval',
  'upload-size-limit-bytes': '104857600',
  'retained-version-count': '20',
  'trash-retention-days': '30',
  'audit-retention-days': '365',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const impact = (total: number, receipt: string, overrides: Record<string, unknown> = {}) => ({
  beforeRetention: { 'trash-retention-days': '30', 'audit-retention-days': '365' },
  proposedRetention: { 'trash-retention-days': '7', 'audit-retention-days': '365' },
  shortened: ['trash-retention-days'],
  impact: { trashNodes: total, auditRows: 0, findings: 0, total },
  grade: total === 0 ? 'L2' : 'L3',
  typingToken: total === 0 ? null : String(total),
  receipt,
  computedAt: '2026-09-18T12:00:00.000Z',
  ...overrides,
});

type Step = Response | (() => Promise<Response>);

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

let steps: Step[];
let requests: Array<{ url: string; method: string; body?: unknown; headers: Headers }>;

beforeEach(() => {
  steps = [json(CURRENT)];
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push({
      url,
      method: init?.method ?? 'GET',
      ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
      headers: new Headers(init?.headers),
    });
    const next = steps.shift();
    if (next === undefined) throw new Error(`unexpected fetch ${init?.method ?? 'GET'} ${url}`);
    return typeof next === 'function' ? next() : next;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function setTrashAndSubmit(value = '7') {
  const form = await screen.findByRole('form');
  const input = document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(form);
  return { form, input };
}

const previewRequests = () => requests.filter((one) =>
  one.method === 'POST' && one.url.endsWith('/settings/retention-impact'));
const putRequests = () => requests.filter((one) => one.method === 'PUT' && one.url.endsWith('/settings'));

describe('FR-CONFIRM-024 — retention impact confirmation UI', () => {
  it('completes L2 with initial cancel focus, receipt-only PUT, readback, and no outside-click dismissal', async () => {
    steps = [
      json(CURRENT), json(CURRENT), json(impact(0, 'receipt-zero')),
      new Response(null, { status: 204 }), json({ ...CURRENT, 'trash-retention-days': '7' }),
    ];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();
    const dialog = await screen.findByRole('alertdialog');
    expect((document.activeElement as HTMLButtonElement)?.type).toBe('button');
    expect(within(dialog).getAllByRole('button', { name: '계속 편집' })).toHaveLength(1);
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByRole('alertdialog')).toBe(dialog);

    const confirm = screen.getByTestId('retention-impact-confirm');
    await user.dblClick(confirm);
    await waitFor(() => expect(putRequests()).toHaveLength(1));
    expect(putRequests()[0]?.headers.get('X-Retention-Impact-Receipt')).toBe('receipt-zero');
    expect(putRequests()[0]?.headers.has('X-Retention-Impact-Token')).toBe(false);
    await waitFor(() => expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('7'));
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'POST', 'PUT', 'GET']);
  });

  it('opens a cancellable pending shell, disables save, and renders zero-impact L2 without a typing field', async () => {
    const pending = deferredResponse();
    steps = [json(CURRENT), json(CURRENT), () => pending.promise];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    const { form, input } = await setTrashAndSubmit();

    expect(await screen.findByRole('alertdialog')).toBeDefined();
    const pendingDialog = screen.getByRole('alertdialog');
    expect(pendingDialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(pendingDialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByTestId('retention-impact-pending').getAttribute('aria-live')).toBe('polite');
    expect(screen.getByTestId('retention-impact-pending').textContent).toMatch(/계산|확인|불러/);
    expect(screen.queryByTestId('retention-impact-confirm')).toBeNull();
    expect(input.disabled).toBe(true);
    const save = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    fireEvent.keyDown(form, { key: 'Enter', code: 'Enter' });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(previewRequests()).toHaveLength(1);
    expect(putRequests()).toHaveLength(0);
    pending.resolve(json(impact(0, 'receipt-zero')));

    expect((await screen.findByTestId('retention-impact-total')).textContent).toContain('0');
    expect(screen.getByTestId('retention-impact-breakdown').textContent).toMatch(/0.*0.*0/);
    expect(screen.getByTestId('delayed-notice')).toBeDefined();
    expect(screen.queryByTestId('retention-impact-token')).toBeNull();
    expect(previewRequests()).toHaveLength(1);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement?.getAttribute('type')).toBe('submit');
  });

  it('starts a new authoritative POST on every reopen and ignores a late response from a cancelled generation', async () => {
    const first = deferredResponse();
    steps = [json(CURRENT), json(CURRENT), () => first.promise, json(CURRENT), json(impact(3, 'receipt-new'))];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();
    expect(await screen.findByTestId('retention-impact-pending')).toBeDefined();
    await user.keyboard('{Escape}');

    fireEvent.submit(screen.getByRole('form'));
    expect((await screen.findByTestId('retention-impact-total')).textContent).toContain('3');
    expect(previewRequests()).toHaveLength(2);

    first.resolve(json(impact(1, 'receipt-old')));
    await Promise.resolve();
    expect(screen.getByTestId('retention-impact-total').textContent).toContain('3');
    expect(screen.getByTestId('retention-impact-token').getAttribute('aria-label')).toContain('3');
  });

  it('requires the exact plain L3 token, sends receipt/token headers, and blocks stale confirmation until explicit re-review', async () => {
    steps = [
      json(CURRENT),
      json(CURRENT),
      json(impact(2, 'receipt-two')),
      json({ code: 'retention-confirmation-stale' }, 409),
      json(impact(3, 'receipt-three')),
      new Response(null, { status: 204 }),
      json({ ...CURRENT, 'trash-retention-days': '7' }),
    ];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();

    const token = await screen.findByTestId('retention-impact-token');
    expect(token.getAttribute('aria-label')).toContain('2');
    expect(token.getAttribute('aria-describedby')).toBeTruthy();
    const confirm = screen.getByTestId('retention-impact-confirm');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(token, '2\u00a0000');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.clear(token);
    await user.type(token, '02');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    for (const outerWhitespace of [' 2', '2 ']) {
      fireEvent.change(token, { target: { value: outerWhitespace } });
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(confirm);
      fireEvent.keyDown(token, { key: 'Enter', code: 'Enter' });
      expect(putRequests()).toHaveLength(0);
    }
    await user.clear(token);
    fireEvent.compositionStart(token);
    fireEvent.change(token, { target: { value: '2' } });
    fireEvent.keyDown(token, { key: 'Enter', isComposing: true });
    expect(putRequests()).toHaveLength(0);
    fireEvent.compositionEnd(token);
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirm);

    expect((await screen.findByTestId('retention-impact-stale')).getAttribute('role')).toBe('alert');
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('retention-impact-token') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('retention-impact-stale').textContent).toMatch(/변경|달라|새로/);
    expect(previewRequests()).toHaveLength(1);
    expect(putRequests()[0]?.headers.get('X-Retention-Impact-Receipt')).toBe('receipt-two');
    expect(putRequests()[0]?.headers.get('X-Retention-Impact-Token')).toBe('2');

    await user.click(screen.getByTestId('retention-impact-review'));
    expect((await screen.findByTestId('retention-impact-total')).textContent).toContain('3');
    expect(previewRequests()).toHaveLength(2);
    const freshToken = screen.getByTestId('retention-impact-token');
    expect((freshToken as HTMLInputElement).value).toBe('');
    await user.type(freshToken, '3');
    await user.click(screen.getByTestId('retention-impact-confirm'));

    await waitFor(() => expect(putRequests()).toHaveLength(2));
    expect(putRequests()[1]?.headers.get('X-Retention-Impact-Receipt')).toBe('receipt-three');
    expect(putRequests()[1]?.headers.get('X-Retention-Impact-Token')).toBe('3');
  });

  it('discards typed consent and acknowledgement after same-total identity staleness', async () => {
    steps = [
      json(CURRENT), json(CURRENT), json(impact(2, 'membership-a')),
      json({ code: 'retention-confirmation-stale' }, 409),
      json(impact(2, 'membership-b')),
    ];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();
    const token = await screen.findByTestId('retention-impact-token');
    await user.type(token, '2');
    await user.click(screen.getByTestId('retention-impact-confirm'));
    expect(await screen.findByTestId('retention-impact-stale')).toBeDefined();
    expect((screen.getByTestId('retention-impact-token') as HTMLInputElement).value).toBe('');

    await user.click(screen.getByTestId('retention-impact-review'));
    expect((await screen.findByTestId('retention-impact-total')).textContent).toContain('2');
    expect((screen.getByTestId('retention-impact-token') as HTMLInputElement).value).toBe('');
    expect((screen.getByTestId('retention-impact-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(previewRequests()).toHaveLength(2);
    expect(putRequests()).toHaveLength(1);
  });

  it('blocks Escape and cancel while the confirmed PUT is pending and latches duplicate confirmation', async () => {
    const put = deferredResponse();
    steps = [json(CURRENT), json(CURRENT), json(impact(0, 'receipt-zero')), () => put.promise, json({ ...CURRENT, 'trash-retention-days': '7' })];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();
    const confirm = await screen.findByTestId('retention-impact-confirm');
    await user.dblClick(confirm);
    expect(putRequests()).toHaveLength(1);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect((screen.getByTestId('retention-impact-cancel') as HTMLButtonElement).disabled).toBe(true);
    put.resolve(new Response(null, { status: 204 }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('retries a failed preview in place, preserves draft, and returns focus for continued editing', async () => {
    steps = [json(CURRENT), json(CURRENT), json({}, 503), json(impact(0, 'receipt-retry'))];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    const { input } = await setTrashAndSubmit();
    expect(await screen.findByTestId('retention-impact-error')).toBeDefined();
    expect(input.value).toBe('7');
    await user.click(screen.getByTestId('retention-impact-retry'));
    expect(await screen.findByTestId('retention-impact-total')).toBeDefined();
    expect(previewRequests()).toHaveLength(2);
    await user.click(screen.getByTestId('retention-impact-cancel'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '저장' }));
    expect(input.value).toBe('7');
  });

  it('ignores late preview and PUT completions after ownership is unmounted', async () => {
    const latePreview = deferredResponse();
    steps = [json(CURRENT), json(CURRENT), () => latePreview.promise];
    const view = render(<InstanceSettings />);
    await setTrashAndSubmit();
    expect(await screen.findByTestId('retention-impact-pending')).toBeDefined();
    view.unmount();
    latePreview.resolve(json(impact(0, 'late-preview')));
    await Promise.resolve();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(putRequests()).toHaveLength(0);

    cleanup();
    const latePut = deferredResponse();
    steps = [json(CURRENT), json(CURRENT), json(impact(0, 'owned')), () => latePut.promise];
    const second = render(<InstanceSettings />);
    await setTrashAndSubmit();
    fireEvent.click(await screen.findByTestId('retention-impact-confirm'));
    expect(putRequests()).toHaveLength(1);
    second.unmount();
    const getCountBeforeLateCompletion = requests.filter((one) => one.method === 'GET').length;
    latePut.resolve(new Response(null, { status: 204 }));
    await Promise.resolve();
    expect(requests.filter((one) => one.method === 'GET')).toHaveLength(getCountBeforeLateCompletion);
  });

  it('isolates late preview across same-actor new-session and A-to-B-to-A owner generations', async () => {
    const lateA = deferredResponse();
    const actorB = { ...CURRENT, 'trash-retention-days': '60' };
    steps = [json(CURRENT), json(CURRENT), () => lateA.promise, json(actorB), json(CURRENT)];
    const view = render(<InstanceSettings key="actor-a-session-1" />);
    await setTrashAndSubmit();
    expect(await screen.findByTestId('retention-impact-pending')).toBeDefined();

    view.rerender(<InstanceSettings key="actor-b-session-1" />);
    await waitFor(() => expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('60'));
    lateA.resolve(json(impact(0, 'late-owner-a')));
    await Promise.resolve();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('60');

    view.rerender(<InstanceSettings key="actor-a-session-2" />);
    await waitFor(() => expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('30'));
    expect(putRequests()).toHaveLength(0);
  });

  it('prevents a late accepted PUT from mutating the next owner UI or triggering its readback', async () => {
    const latePut = deferredResponse();
    const actorB = { ...CURRENT, 'trash-retention-days': '60' };
    steps = [json(CURRENT), json(CURRENT), json(impact(0, 'owner-a')), () => latePut.promise, json(actorB)];
    const user = userEvent.setup();
    const view = render(<InstanceSettings key="owner-a" />);
    await setTrashAndSubmit();
    await user.click(await screen.findByTestId('retention-impact-confirm'));
    expect(putRequests()).toHaveLength(1);

    view.rerender(<InstanceSettings key="owner-b" />);
    await waitFor(() => expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('60'));
    const getCount = requests.filter((one) => one.method === 'GET').length;
    latePut.resolve(new Response(null, { status: 204 }));
    await Promise.resolve();
    expect(requests.filter((one) => one.method === 'GET')).toHaveLength(getCount);
    expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('60');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('reconciles an uncertain retention PUT by GET and retries an accepted-readback failure with GET only', async () => {
    const accepted = { ...CURRENT, 'trash-retention-days': '7' };
    steps = [
      json(CURRENT), json(CURRENT), json(impact(0, 'receipt-zero')),
      () => Promise.reject(new TypeError('connection lost')), json(accepted),
      json(CURRENT), json(impact(0, 'receipt-two')), new Response(null, { status: 204 }),
      json({}, 503), json(accepted),
    ];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();
    await user.click(await screen.findByTestId('retention-impact-confirm'));
    await user.click(await screen.findByTestId('retention-impact-check-result'));
    await waitFor(() => expect((document.getElementById('instance-setting-trash-retention-days') as HTMLInputElement).value).toBe('7'));
    expect(putRequests()).toHaveLength(1);

    fireEvent.change(document.getElementById('instance-setting-trash-retention-days')!, { target: { value: '6' } });
    fireEvent.submit(screen.getByRole('form'));
    await user.click(await screen.findByTestId('retention-impact-confirm'));
    await user.click(await screen.findByTestId('retention-impact-readback-retry'));
    await waitFor(() => expect(putRequests()).toHaveLength(2));
    expect(requests.slice(-2).map((one) => one.method)).toEqual(['GET', 'GET']);
  });

  it('keeps focus trapped, cancels with Escape, and announces preview errors without permitting PUT', async () => {
    steps = [json(CURRENT), json(CURRENT), json({ code: 'retention-impact-unavailable' }, 503)];
    const user = userEvent.setup();
    render(<InstanceSettings />);
    await setTrashAndSubmit();

    const dialog = await screen.findByRole('alertdialog');
    const error = await screen.findByTestId('retention-impact-error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(putRequests()).toHaveLength(0);
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});

describe('FR-CONFIRM-024 — real App/AppShell authentication ownership', () => {
  it('drops pending preview and accepted PUT results across same-actor new sessions and A-to-B-to-A login generations', async () => {
    const latePreview = deferredResponse();
    const latePut = deferredResponse();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let signedIn = true;
    let actor: 'actor-a' | 'actor-b' = 'actor-a';
    let nextActor: 'actor-a' | 'actor-b' = 'actor-a';
    let previewCalls = 0;
    let loginGeneration = 0;
    const settingsSentinels = new Map([
      [0, [
        { actor: 'actor-a', retention: '30', sentinel: 'actor-a-session-1-initial' },
        { actor: 'actor-a', retention: '30', sentinel: 'actor-a-session-1-submit' },
      ]],
      [1, [
        { actor: 'actor-a', retention: '30', sentinel: 'actor-a-session-2-initial' },
        { actor: 'actor-a', retention: '30', sentinel: 'actor-a-session-2-submit' },
      ]],
      [2, [{ actor: 'actor-b', retention: '60', sentinel: 'actor-b-session-1-initial' }]],
      [3, [{ actor: 'actor-a', retention: '30', sentinel: 'actor-a-session-3-initial' }]],
    ] as const);
    const consumedSettingsSentinels: string[] = [];
    const settingsGetsByGeneration = new Map<number, number>();
    const appRequests: Array<{ actor: string; method: string; path: string }> = [];
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : undefined;
      const parsed = new URL(request?.url ?? String(input), 'http://local');
      const method = init?.method ?? request?.method ?? 'GET';
      appRequests.push({ actor, method, path: parsed.pathname });
      if (parsed.pathname === '/api/session') return Promise.resolve(signedIn
        ? json({ superuser: true, workspaceCount: 0, adminWorkspaceCount: 0 })
        : json({ code: 'unauthenticated' }, 401));
      if (parsed.pathname === '/api/auth/me') return Promise.resolve(json({ userId: actor }));
      if (parsed.pathname === '/api/auth/login' && method === 'POST') {
        actor = nextActor;
        signedIn = true;
        loginGeneration += 1;
        return Promise.resolve(json({ ok: true }));
      }
      if (parsed.pathname === '/api/settings' && method === 'GET') {
        const generationGets = settingsGetsByGeneration.get(loginGeneration) ?? 0;
        const expected = settingsSentinels.get(loginGeneration)?.[generationGets];
        if (expected === undefined) {
          throw new Error(`unexpected settings GET for generation ${loginGeneration} actor ${actor}`);
        }
        expect(actor).toBe(expected.actor);
        consumedSettingsSentinels.push(expected.sentinel);
        settingsGetsByGeneration.set(loginGeneration, generationGets + 1);
        return Promise.resolve(json({ ...CURRENT, 'trash-retention-days': expected.retention }));
      }
      if (parsed.pathname === '/api/settings/retention-impact' && method === 'POST') {
        previewCalls += 1;
        return previewCalls === 1 ? latePreview.promise : Promise.resolve(json(impact(0, `receipt-${actor}`)));
      }
      if (parsed.pathname === '/api/settings' && method === 'PUT') return latePut.promise;
      if (['/api/tree', '/api/favorites', '/api/tags', '/api/trash', '/api/workspaces'].includes(parsed.pathname)) {
        return Promise.resolve(json([]));
      }
      if (parsed.pathname === '/api/personal-settings') return Promise.resolve(json({}));
      return Promise.resolve(json({ code: 'fixture-not-found' }, 404));
    }));

    const user = userEvent.setup();
    render(<App queryClient={client} />);
    const openInstanceSettings = async () => {
      await user.click(await screen.findByRole('button', { name: '설정' }));
      const shell = await screen.findByRole('dialog', { name: '설정' });
      await user.click(within(shell).getByRole('tab', { name: '인스턴스 설정' }));
      return within(shell).findByRole('form', { name: '인스턴스 설정' });
    };
    const expireAndLogin = async (as: 'actor-a' | 'actor-b') => {
      signedIn = false;
      nextActor = as;
      await act(async () => { await client.invalidateQueries({ queryKey: ['session'] }); });
      const login = await screen.findByRole('main', { name: '로그인' });
      await user.type(within(login).getByLabelText('이름'), as);
      await user.type(within(login).getByLabelText('비밀번호'), 'fixture-password');
      await user.click(within(login).getByRole('button', { name: '로그인' }));
      await screen.findByRole('button', { name: '설정' });
    };

    let form = await openInstanceSettings();
    fireEvent.change(within(form).getByLabelText('휴지통 보존 일수'), { target: { value: '7' } });
    fireEvent.submit(form);
    expect(await screen.findByTestId('retention-impact-pending')).toBeDefined();

    await expireAndLogin('actor-a');
    form = await openInstanceSettings();
    expect((within(form).getByLabelText('휴지통 보존 일수') as HTMLInputElement).value).toBe('30');
    latePreview.resolve(json(impact(0, 'late-actor-a-preview')));
    await act(async () => { await latePreview.promise; });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((within(form).getByLabelText('휴지통 보존 일수') as HTMLInputElement).value).toBe('30');

    fireEvent.change(within(form).getByLabelText('휴지통 보존 일수'), { target: { value: '7' } });
    fireEvent.submit(form);
    await user.click(await screen.findByTestId('retention-impact-confirm'));
    expect(appRequests.filter((entry) => entry.method === 'PUT' && entry.path === '/api/settings')).toHaveLength(1);

    await expireAndLogin('actor-b');
    form = await openInstanceSettings();
    expect((within(form).getByLabelText('휴지통 보존 일수') as HTMLInputElement).value).toBe('60');
    await expireAndLogin('actor-a');
    form = await openInstanceSettings();
    expect((within(form).getByLabelText('휴지통 보존 일수') as HTMLInputElement).value).toBe('30');
    expect(consumedSettingsSentinels).toEqual([
      'actor-a-session-1-initial', 'actor-a-session-1-submit',
      'actor-a-session-2-initial', 'actor-a-session-2-submit',
      'actor-b-session-1-initial', 'actor-a-session-3-initial',
    ]);
    const settingsGetsBeforeLatePut = appRequests.filter((entry) =>
      entry.method === 'GET' && entry.path === '/api/settings');
    const formState = () => Array.from(form.elements).map((element) => {
      const control = element as HTMLInputElement | HTMLSelectElement | HTMLButtonElement;
      return {
        tag: control.tagName,
        id: control.id,
        name: control.getAttribute('name'),
        type: control.getAttribute('type'),
        value: 'value' in control ? control.value : null,
        checked: 'checked' in control ? control.checked : null,
        disabled: control.disabled,
      };
    });
    const formBeforeLatePut = formState();
    const cacheBeforeLatePut = structuredClone(client.getQueriesData());
    const successToastsBeforeLatePut = within(form).queryAllByText('설정을 저장했습니다.')
      .map((element) => element.textContent);
    latePut.resolve(new Response(null, { status: 204 }));
    await act(async () => { await latePut.promise; });
    await act(async () => { await Promise.resolve(); });
    expect(appRequests.filter((entry) => entry.method === 'GET' && entry.path === '/api/settings'))
      .toEqual(settingsGetsBeforeLatePut);
    expect(consumedSettingsSentinels).toEqual([
      'actor-a-session-1-initial', 'actor-a-session-1-submit',
      'actor-a-session-2-initial', 'actor-a-session-2-submit',
      'actor-b-session-1-initial', 'actor-a-session-3-initial',
    ]);
    expect(formState()).toEqual(formBeforeLatePut);
    expect(structuredClone(client.getQueriesData())).toEqual(cacheBeforeLatePut);
    expect(within(form).queryAllByText('설정을 저장했습니다.').map((element) => element.textContent))
      .toEqual(successToastsBeforeLatePut);
  });
});
