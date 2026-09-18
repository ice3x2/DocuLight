import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstanceSettings } from '../src/settings/InstanceSettings.js';
import { INSTANCE_SETTING_FIELDS } from '../src/shell/shell-contract.js';

const CURRENT = {
  'signup-mode': 'approval',
  'upload-size-limit-bytes': '104857600',
  'retained-version-count': '20',
  'trash-retention-days': '30',
  'audit-retention-days': '365',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type FetchStep = Response | (() => Promise<Response>);

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

let steps: FetchStep[];
let requests: Array<{ method: string; body?: Record<string, string> }>;

beforeEach(() => {
  steps = [json(CURRENT)];
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    requests.push({
      method: init?.method ?? 'GET',
      ...(init?.body === undefined ? {} : { body: JSON.parse(String(init.body)) }),
    });
    const step = steps.shift();
    if (step === undefined) throw new Error('unexpected fetch');
    return typeof step === 'function' ? step() : step;
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('GitHub #71 instance policy form', () => {
  it('renders the exact five settings with native controls, units and no invented defaults', async () => {
    render(<InstanceSettings />);

    const form = await screen.findByRole('form', { name: '인스턴스 설정' });
    expect(within(form).getAllByRole('combobox')).toHaveLength(1);
    expect(within(form).getAllByRole('textbox')).toHaveLength(4);
    expect(within(form).getAllByRole('textbox').every((input) => input.getAttribute('inputmode') === 'decimal')).toBe(true);
    expect(within(form).getAllByRole('textbox').every((input) => input.getAttribute('type') === 'text')).toBe(true);
    expect(within(form).getAllByText(/./).filter((node) => node.tagName === 'LABEL').map((node) => node.textContent)).toEqual(
      INSTANCE_SETTING_FIELDS.map((field) => field.label),
    );
    expect((within(form).getByLabelText('가입 모드') as HTMLSelectElement).value).toBe('approval');
    expect(within(form).getAllByRole('option').map((option) => ({ value: (option as HTMLOptionElement).value, label: option.textContent }))).toEqual([
      { value: 'open', label: '자유 가입' },
      { value: 'approval', label: '가입 요청 + 슈퍼유저 승인' },
      { value: 'invite-only', label: '슈퍼유저 직접 등록' },
    ]);
    const descriptions = ['업로드 크기 제한', '보관 버전 개수', '휴지통 보존 일수', '감사 로그 보존 기간'].map((label) => {
      const id = within(form).getByLabelText(label).getAttribute('aria-describedby');
      return id === null ? '' : document.getElementById(id)?.textContent ?? '';
    });
    expect(descriptions).toEqual([
      '바이트 단위 · 제한을 넘는 업로드는 거부됩니다.',
      '개 단위 · 한도를 넘는 가장 오래된 버전부터 정리됩니다.',
      '일 단위 · 0은 무제한',
      '일 단위 · 0은 무제한',
    ]);
    expect(within(form).queryByDisplayValue('')).toBeNull();
  });

  it.each([undefined, 'bogus'])('shows an unavailable stored signup mode without inventing a fallback (%s)', async (raw) => {
    const stored: Record<string, string> = { ...CURRENT };
    if (raw === undefined) delete stored['signup-mode'];
    else stored['signup-mode'] = raw;
    steps = [json(stored)];
    render(<InstanceSettings />);

    const signup = await screen.findByRole('combobox');
    expect((signup as HTMLSelectElement).value).toBe(raw ?? '');
    expect((signup as HTMLSelectElement).value).not.toBe('open');
    expect(signup.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('option', { name: '현재 저장값을 사용할 수 없음' }).hasAttribute('disabled')).toBe(true);
  });

  it('keeps load failure distinct from an editable empty form and can retry', async () => {
    steps = [json(null, 503), json(CURRENT)];
    const user = userEvent.setup();
    render(<InstanceSettings />);

    expect((await screen.findByRole('alert')).textContent).toContain('설정을 불러오지 못했습니다');
    expect(screen.queryByRole('form', { name: '인스턴스 설정' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(await screen.findByRole('form', { name: '인스턴스 설정' })).toBeDefined();
  });

  it('validates numeric domains and the audit-to-trash invariant before any PUT', async () => {
    const user = userEvent.setup();
    render(<InstanceSettings />);
    const upload = await screen.findByLabelText('업로드 크기 제한');

    await user.clear(upload);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('0보다 큰 유한한 숫자를 입력하세요.')).toBeDefined();
    expect(document.activeElement).toBe(upload);

    await user.type(upload, '1.5');
    const trash = screen.getByLabelText('휴지통 보존 일수');
    const audit = screen.getByLabelText('감사 로그 보존 기간');
    await user.clear(trash);
    await user.type(trash, '0');
    await user.clear(audit);
    await user.type(audit, '30');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(await screen.findByText('감사 로그 보존 기간은 휴지통 보존 기간보다 짧을 수 없습니다. 0은 무제한입니다.')).toBeDefined();
    expect(trash.getAttribute('aria-describedby')).toContain('instance-setting-retention-error');
    expect(audit.getAttribute('aria-describedby')).toContain('instance-setting-retention-error');
    expect(requests.filter((one) => one.method === 'PUT')).toHaveLength(0);
  });

  it.each([' ', 'NaN', 'Infinity', '-'])('preserves and rejects the invalid numeric text %j', async (raw) => {
    render(<InstanceSettings />);
    const upload = await screen.findByLabelText('업로드 크기 제한');

    fireEvent.change(upload, { target: { value: raw } });
    fireEvent.submit(screen.getByRole('form', { name: '인스턴스 설정' }));

    expect((upload as HTMLInputElement).value).toBe(raw);
    expect(upload.getAttribute('aria-invalid')).toBe('true');
    expect(requests.filter((one) => one.method === 'PUT')).toHaveLength(0);
  });

  it('validates on blur but not during unfinished composition', async () => {
    render(<InstanceSettings />);
    const upload = await screen.findByLabelText('업로드 크기 제한');

    fireEvent.compositionStart(upload);
    fireEvent.change(upload, { target: { value: '-' } });
    fireEvent.blur(upload);
    expect(upload.getAttribute('aria-invalid')).toBeNull();

    fireEvent.compositionEnd(upload);
    fireEvent.blur(upload);
    expect(upload.getAttribute('aria-invalid')).toBe('true');
  });

  it('resets to the confirmed baseline and sends only changed known keys in one PUT', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), new Response(null, { status: 204 }), json({ ...CURRENT, 'signup-mode': 'open' })];
    render(<InstanceSettings />);

    const signup = await screen.findByLabelText('가입 모드');
    await user.selectOptions(signup, 'open');
    expect(screen.getByText('변경 1건')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '되돌리기' }));
    expect((signup as HTMLSelectElement).value).toBe('approval');

    await user.selectOptions(signup, 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('설정을 저장했습니다.');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET']);
    expect(requests[2]?.body).toEqual({ 'signup-mode': 'open' });
  });

  it('blocks every semantic retention reduction until a fresh authoritative impact count exists', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT)];
    render(<InstanceSettings />);

    const trash = await screen.findByLabelText('휴지통 보존 일수');
    await user.clear(trash);
    await user.type(trash, '7');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toContain('영향 건수를 새로 확인할 수 없어 보존 기간 축소를 저장하지 않았습니다');
    expect(screen.getByText(/다음 정리 시점에 삭제될 수 있습니다/)).toBeDefined();
    expect((trash as HTMLInputElement).value).toBe('7');
    expect(requests.filter((one) => one.method === 'PUT')).toHaveLength(0);
  });

  it('rechecks a stale apparent reduction and permits a deliberate expansion against the fresh baseline', async () => {
    const user = userEvent.setup();
    const remote = { ...CURRENT, 'trash-retention-days': '10' };
    steps = [json(CURRENT), json(remote), json(remote), new Response(null, { status: 204 }), json({ ...remote, 'trash-retention-days': '20' })];
    render(<InstanceSettings />);

    const trash = await screen.findByLabelText('휴지통 보존 일수');
    await user.clear(trash);
    await user.type(trash, '20');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toContain('다른 변경을 발견했습니다');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET']);

    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('설정을 저장했습니다.');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'GET', 'PUT', 'GET']);
    expect(requests[3]?.body).toEqual({ 'trash-retention-days': '20' });
  });

  it('announces preflight, PUT, and accepted readback as distinct pending phases', async () => {
    const user = userEvent.setup();
    const preflight = deferredResponse();
    const put = deferredResponse();
    const readback = deferredResponse();
    steps = [json(CURRENT), () => preflight.promise, () => put.promise, () => readback.promise];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('status').textContent).toBe('저장 전 최신 값을 확인하는 중입니다.');

    preflight.resolve(json(CURRENT));
    await screen.findByText('설정을 저장하는 중입니다.');
    put.resolve(new Response(null, { status: 204 }));
    await screen.findByText('저장은 수락되었고 최신 값을 확인하는 중입니다.');
    readback.resolve(json({ ...CURRENT, 'signup-mode': 'open' }));
    await screen.findByText('설정을 저장했습니다.');
  });

  it('revalidates the full pair after merging a fresh untouched retention companion', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json({ ...CURRENT, 'audit-retention-days': '45' })];
    render(<InstanceSettings />);

    const trash = await screen.findByLabelText('휴지통 보존 일수');
    await user.clear(trash);
    await user.type(trash, '60');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect((screen.getByLabelText('감사 로그 보존 기간') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true'));
    expect(requests.filter((one) => one.method === 'PUT')).toHaveLength(0);
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET']);
  });

  it('does not authorize a retention change against an invalid fresh baseline', async () => {
    const user = userEvent.setup();
    const invalid = { ...CURRENT, 'trash-retention-days': 'unknown' };
    steps = [json(invalid), json(invalid)];
    render(<InstanceSettings />);

    const trash = await screen.findByLabelText('휴지통 보존 일수');
    await user.clear(trash);
    await user.type(trash, '30');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toContain('기준값');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET']);
  });

  it.each([400, 500])('reports HTTP %i as a rejected request rather than a transport-uncertain save', async (status) => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), json(null, status)];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toContain('저장 요청을 완료하지 못했습니다');
    expect(screen.queryByRole('button', { name: '저장 상태 확인' })).toBeNull();
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT']);
  });

  it('stops the privileged form after an HTTP 403 role loss', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), json(null, 403)];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await screen.findByRole('alert');
    expect(screen.queryByRole('form', { name: '인스턴스 설정' })).toBeNull();
  });

  it('reports an accepted PUT with failed readback separately and retries GET only', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), new Response(null, { status: 204 }), json(null, 503), json({ ...CURRENT, 'signup-mode': 'open' })];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByLabelText('가입 모드'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('alert')).textContent).toContain('저장 요청은 수락되었지만 최신 값을 다시 읽지 못했습니다');
    await user.click(screen.getByRole('button', { name: '최신 값 다시 읽기' }));
    expect(await screen.findByText('설정을 저장했습니다.')).toBeDefined();
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET', 'GET']);
  });

  it('preserves newer edits across an accepted-write readback retry', async () => {
    const user = userEvent.setup();
    steps = [
      json(CURRENT),
      json(CURRENT),
      new Response(null, { status: 204 }),
      json(null, 503),
      json({ ...CURRENT, 'signup-mode': 'open' }),
    ];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('alert');
    const upload = screen.getAllByRole('textbox')[0]!;
    await user.clear(upload);
    await user.type(upload, '209715200');
    expect(screen.getByRole('button', { name: '되돌리기' }).hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: '저장' }));

    await screen.findByText('변경 1건');
    expect(screen.getByText('이전 저장을 확인했습니다. 새 변경은 아직 저장되지 않았습니다.')).toBeDefined();
    expect((upload as HTMLInputElement).value).toBe('209715200');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET', 'GET']);
  });

  it('reads before a deliberate re-save after an uncertain PUT', async () => {
    const user = userEvent.setup();
    steps = [
      json(CURRENT),
      json(CURRENT),
      () => Promise.reject(new TypeError('network')),
      json(CURRENT),
      json(CURRENT),
      new Response(null, { status: 204 }),
      json({ ...CURRENT, 'signup-mode': 'open' }),
    ];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByLabelText('가입 모드'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect((await screen.findByRole('alert')).textContent).toContain('저장 결과를 확인해야 합니다');
    await user.click(screen.getByRole('button', { name: '저장 상태 확인' }));
    expect(await screen.findByText('저장 여부를 확인했습니다. 다시 저장할 수 있습니다.')).toBeDefined();
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET']);

    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('설정을 저장했습니다.');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET', 'GET', 'PUT', 'GET']);
  });

  it('requires reconciliation before saving edits made after an uncertain PUT', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), () => Promise.reject(new TypeError('network')), json(CURRENT)];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('alert');

    const upload = screen.getAllByRole('textbox')[0]!;
    await user.clear(upload);
    await user.type(upload, '209715200');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await screen.findByText('저장 여부를 확인했습니다. 다시 저장할 수 있습니다.');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET']);
  });

  it('preserves newer edits when reconciliation finds the uncertain snapshot accepted', async () => {
    const user = userEvent.setup();
    steps = [json(CURRENT), json(CURRENT), () => Promise.reject(new TypeError('network')), json({ ...CURRENT, 'signup-mode': 'open' })];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('alert');

    const upload = screen.getAllByRole('textbox')[0]!;
    await user.clear(upload);
    await user.type(upload, '209715200');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await screen.findByText('변경 1건');
    expect(screen.getByText('이전 저장을 확인했습니다. 새 변경은 아직 저장되지 않았습니다.')).toBeDefined();
    expect((upload as HTMLInputElement).value).toBe('209715200');
    expect(requests.map((one) => one.method)).toEqual(['GET', 'GET', 'PUT', 'GET']);
  });

  it('adopts unrelated remote changes while retaining the intended uncertain patch', async () => {
    const user = userEvent.setup();
    const remote = { ...CURRENT, 'upload-size-limit-bytes': '209715200' };
    steps = [
      json(CURRENT),
      json(CURRENT),
      () => Promise.reject(new TypeError('network')),
      json(remote),
      json(remote),
      new Response(null, { status: 204 }),
      json({ ...remote, 'signup-mode': 'open' }),
    ];
    render(<InstanceSettings />);

    await user.selectOptions(await screen.findByRole('combobox'), 'open');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: '저장 상태 확인' }));

    expect((screen.getAllByRole('textbox')[0] as HTMLInputElement).value).toBe('209715200');
    expect(screen.getByText('변경 1건')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '저장' }));
    await screen.findByText('설정을 저장했습니다.');
    expect(requests.at(-2)?.body).toEqual({ 'signup-mode': 'open' });
  });

  it('does not submit when Enter occurs during composition', async () => {
    render(<InstanceSettings />);
    const upload = await screen.findByLabelText('업로드 크기 제한');
    fireEvent.compositionStart(upload);
    fireEvent.keyDown(upload, { key: 'Enter', code: 'Enter', isComposing: true });
    fireEvent.compositionEnd(upload);
    expect(requests.map((one) => one.method)).toEqual(['GET']);
  });
});
