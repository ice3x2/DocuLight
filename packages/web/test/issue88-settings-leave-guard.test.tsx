import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell, invokeSettingsLeaveCallback, nextSettingsLeaveGuard } from '../src/shell/AppShell.js';
import { InstanceSettings, type SettingsLeaveGuardRegistration } from '../src/settings/InstanceSettings.js';
import type { Viewer } from '../src/shell/shell-contract.js';

const ROOT: Viewer = { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 };
const CURRENT = {
  'signup-mode': 'approval',
  'upload-size-limit-bytes': '104857600',
  'retained-version-count': '20',
  'trash-retention-days': '30',
  'audit-retention-days': '365',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(CURRENT))));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDirtyInstanceSettings() {
  const user = userEvent.setup();
  render(<StrictMode><AppShell viewer={ROOT} indexQueueContextKey="root:session-1:superuser" /></StrictMode>);
  await user.click(screen.getByRole('button', { name: '설정' }));
  const settings = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(settings).getByRole('tab', { name: '인스턴스 설정' }));
  const upload = await within(settings).findByLabelText('업로드 크기 제한');
  upload.focus();
  fireEvent.change(upload, { target: { value: 'invalid partial input' } });
  expect(within(settings).getByText('변경 1건')).toBeDefined();
  return { user, settings, upload };
}

async function openInstanceSettings() {
  const user = userEvent.setup();
  render(<AppShell viewer={ROOT} indexQueueContextKey="root:session-1:superuser" />);
  await user.click(screen.getByRole('button', { name: '\uc124\uc815' }));
  const settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
  await user.click(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' }));
  await within(settings).findByRole('form');
  return { user, settings };
}

function leaveDialog() {
  return screen.getByRole('alertdialog', { name: '저장하지 않은 변경' });
}

describe('IR-SHELL-013 — secret-free settings leave guard', () => {
  it('AC-1 · AC-6: registration exposes exactly owner, count, and value-free callbacks', async () => {
    const registrations: SettingsLeaveGuardRegistration[] = [];
    render(<InstanceSettings registerLeaveGuard={(registration) => {
      registrations.push(registration);
      return () => undefined;
    }} />);
    const secretDraft = 'fixture-secret-must-not-cross-the-boundary';
    fireEvent.change(await screen.findByLabelText('업로드 크기 제한'), { target: { value: secretDraft } });

    await waitFor(() => expect(registrations.at(-1)?.dirtyCount).toBe(1));
    const latest = registrations.at(-1)!;
    expect(Object.keys(latest).sort()).toEqual(['dirtyCount', 'onCancel', 'onContinue', 'ownerId']);
    expect(typeof latest.onCancel).toBe('function');
    expect(typeof latest.onContinue).toBe('function');
    expect(JSON.stringify(latest)).not.toContain(secretDraft);
  });

  it('AC-1 · AC-2 · AC-3: category departure opens one L2 and cancel preserves the mounted draft and focus', async () => {
    const { user, settings, upload } = await openDirtyInstanceSettings();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));

    const warning = leaveDialog();
    expect(within(warning).getByText('저장하지 않은 변경 1건이 있습니다.')).toBeDefined();
    expect(within(warning).getByRole('button', { name: '계속 편집' })).toBe(document.activeElement);
    expect(within(settings).getByRole('tab', { name: '인스턴스 설정', hidden: true }).getAttribute('aria-selected')).toBe('true');
    expect((upload as HTMLInputElement).value).toBe('invalid partial input');

    await user.click(within(warning).getByRole('button', { name: '계속 편집' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeNull());
    expect((within(settings).getByLabelText('업로드 크기 제한') as HTMLInputElement).value).toBe('invalid partial input');
    expect(document.activeElement).toBe(upload);
  });

  it('AC-2 · AC-4: header close is mediated and explicit discard closes exactly once without saving', async () => {
    const { user, settings } = await openDirtyInstanceSettings();

    await user.click(within(settings).getByRole('button', { name: '설정 닫기' }));
    const warning = leaveDialog();
    expect(within(warning).getByText('이미 요청한 저장은 취소되지 않습니다.')).toBeDefined();
    await user.dblClick(within(warning).getByRole('button', { name: '변경 버리고 나가기' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull());
    expect(vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });

  it('AC-3 · AC-4: composing Enter cannot discard the leave confirmation', async () => {
    const { user, settings } = await openDirtyInstanceSettings();
    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    const warning = leaveDialog();
    const discard = within(warning).getByRole('button', { name: '변경 버리고 나가기' });

    fireEvent.compositionStart(warning);
    expect(fireEvent.keyDown(discard, { key: 'Enter', code: 'Enter', isComposing: true })).toBe(false);
    expect(screen.getByRole('dialog', { name: '설정', hidden: true })).toBeDefined();
    expect(within(settings).getByRole('tab', { name: '인스턴스 설정', hidden: true }).getAttribute('aria-selected')).toBe('true');

    fireEvent.compositionEnd(warning);
    await user.click(discard);
    const remaining = await screen.findByRole('dialog', { name: '설정' });
    expect(within(remaining).getByRole('tab', { name: '에디터' }).getAttribute('aria-selected')).toBe('true');
  });

  it('AC-2 · AC-3: Escape uses the same warning and never clicks through', async () => {
    const background = vi.fn();
    const user = userEvent.setup();
    render(<StrictMode><AppShell viewer={ROOT} indexQueueContextKey="root:session-1:superuser" /><button onClick={background}>배경 조작</button></StrictMode>);
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '인스턴스 설정' }));
    fireEvent.change(await within(settings).findByLabelText('업로드 크기 제한'), { target: { value: '7x' } });
    await user.keyboard('{Escape}');
    const warning = leaveDialog();
    expect(background).not.toHaveBeenCalled();
    await user.click(within(warning).getByRole('button', { name: '계속 편집' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeNull());
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();

    expect(screen.getByRole('button', { name: '배경 조작', hidden: true })).toBeDefined();
  });

  it('AC-1 · AC-4: a dirty-count update keeps the original pending intent valid', async () => {
    const { user, settings } = await openDirtyInstanceSettings();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    const warning = leaveDialog();
    fireEvent.change(within(settings).getByLabelText('휴지통 보존 일수', { selector: 'input' }), {
      target: { value: '31' },
    });

    expect(within(warning).getByText('저장하지 않은 변경 2건이 있습니다.')).toBeDefined();
    await user.click(within(warning).getByRole('button', { name: '변경 버리고 나가기' }));

    const remaining = await screen.findByRole('dialog', { name: '설정' });
    expect(within(remaining).getByRole('tab', { name: '에디터' }).getAttribute('aria-selected')).toBe('true');
  });

  it('AC-4: the first pending category intent wins over later category and close requests', async () => {
    const { user, settings } = await openDirtyInstanceSettings();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    fireEvent.click(within(settings).getByRole('tab', { name: '외모(테마)', hidden: true }));
    fireEvent.click(within(settings).getByRole('button', { name: '설정 닫기', hidden: true }));
    await user.click(within(leaveDialog()).getByRole('button', { name: '변경 버리고 나가기' }));

    const remaining = await screen.findByRole('dialog', { name: '설정' });
    expect(within(remaining).getByRole('tab', { name: '에디터' }).getAttribute('aria-selected')).toBe('true');
  });

  it('AC-5: resetting to clean removes the guard and permits the requested transition', async () => {
    const { user, settings } = await openDirtyInstanceSettings();
    await user.click(within(settings).getByRole('button', { name: '되돌리기' }));
    expect(within(settings).getByText('변경 없음')).toBeDefined();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));

    expect(screen.queryByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeNull();
    expect(within(settings).getByRole('tab', { name: '에디터' }).getAttribute('aria-selected')).toBe('true');
  });

  it('AC-6: editing and leaving never writes draft values to browser storage', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const session = vi.spyOn(Storage.prototype, 'setItem');
    const { user, settings } = await openDirtyInstanceSettings();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));

    expect(local).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
    local.mockRestore();
    session.mockRestore();
  });

  it('AC-5: owner unmount invalidates a pending departure', async () => {
    const user = userEvent.setup();
    const view = render(<AppShell viewer={ROOT} indexQueueContextKey="root:session-1:superuser" />);
    await user.click(screen.getByRole('button', { name: '\uc124\uc815' }));
    const settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    await user.click(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' }));
    fireEvent.change(await within(settings).findByLabelText('\uc5c5\ub85c\ub4dc \ud06c\uae30 \uc81c\ud55c'), { target: { value: 'owner-one' } });
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();

    view.rerender(<AppShell viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }} indexQueueContextKey="member:session-2:member" />);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '\uc800\uc7a5\ud558\uc9c0 \uc54a\uc740 \ubcc0\uacbd' })).toBeNull());
  });

  it('AC-5: replacement owner survives stale cleanup', async () => {
    const user = userEvent.setup();
    const view = render(<AppShell viewer={ROOT} indexQueueContextKey="root:session-1:superuser" />);
    await user.click(screen.getByRole('button', { name: '\uc124\uc815' }));
    let settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    await user.click(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' }));
    await within(settings).findByLabelText('\uc5c5\ub85c\ub4dc \ud06c\uae30 \uc81c\ud55c');

    view.rerender(<AppShell viewer={ROOT} indexQueueContextKey="root:session-2:superuser" />);
    settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    const replacement = await within(settings).findByLabelText('\uc5c5\ub85c\ub4dc \ud06c\uae30 \uc81c\ud55c');
    fireEvent.change(replacement, { target: { value: 'replacement-owner' } });
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();
  });

  it('AC-5: competing owner cannot replace the active owner', async () => {
    const active = { ownerId: 'owner-a', dirtyCount: 1, onContinue: vi.fn(), onCancel: vi.fn(), epoch: 7, category: 'instance' };
    const competing: SettingsLeaveGuardRegistration = { ownerId: 'owner-b', dirtyCount: 2, onContinue: vi.fn(), onCancel: vi.fn() };
    expect(nextSettingsLeaveGuard(active, competing, 'instance', 8)).toBeUndefined();
    expect(active.ownerId).toBe('owner-a');
    expect(active.epoch).toBe(7);
  });

  it('AC-5: same-owner rerenders refresh callbacks without changing lifecycle identity', () => {
    const first = { ownerId: 'owner-a', dirtyCount: 1, onContinue: vi.fn(), onCancel: vi.fn(), epoch: 7, category: 'instance' };
    const refreshed: SettingsLeaveGuardRegistration = { ownerId: 'owner-a', dirtyCount: 2, onContinue: vi.fn(), onCancel: vi.fn() };
    const next = nextSettingsLeaveGuard(first, refreshed, 'instance', 8);
    expect(next).toMatchObject({ ownerId: 'owner-a', dirtyCount: 2, epoch: 7, category: 'instance' });
    expect(next?.onContinue).toBe(refreshed.onContinue);
    expect(next?.onCancel).toBe(refreshed.onCancel);
  });

  it('AC-3 · AC-4: callback failure is contained and reported to the leave coordinator', () => {
    const failure = new Error('fixture callback failure');
    const guard = { ownerId: 'owner-a', dirtyCount: 1, onContinue: () => { throw failure; }, onCancel: vi.fn() };
    expect(invokeSettingsLeaveCallback(guard, 'continue')).toBe(false);
    expect(invokeSettingsLeaveCallback(guard, 'cancel')).toBe(true);
    expect(guard.onCancel).toHaveBeenCalledOnce();
  });

  it('AC-3: a live warning closes when its owner reports dirty count zero', async () => {
    const { user, settings } = await openDirtyInstanceSettings();
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();

    fireEvent.click(within(settings).getByRole('button', { name: '\ub418\ub3cc\ub9ac\uae30', hidden: true }));

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '\uc800\uc7a5\ud558\uc9c0 \uc54a\uc740 \ubcc0\uacbd' })).toBeNull());
    expect(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815', hidden: true }).getAttribute('aria-selected')).toBe('true');
  });

  it.each([
    ['ArrowUp', '\uc804\uccb4 \uc6cc\ud06c\uc2a4\ud398\uc774\uc2a4'],
    ['ArrowDown', '\uc0c9\uc778 \ub300\uae30\uc5f4'],
    ['Home', '\uc5d0\ub514\ud130'],
    ['End', '\uc0c9\uc778 \ub300\uae30\uc5f4'],
  ])('AC-2: Radix category keyboard %s is mediated before activation', async (key, targetName) => {
    const { user, settings } = await openDirtyInstanceSettings();
    const current = within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' });
    current.focus();
    await user.keyboard(`{${key}}`);
    expect(leaveDialog()).toBeDefined();
    expect(within(settings).getByRole('tab', { name: targetName, hidden: true }).getAttribute('aria-selected')).toBe('false');
  });

  it('AC-4: category discard focuses the activated category tab', async () => {
    const { user, settings } = await openDirtyInstanceSettings();
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    await user.click(within(leaveDialog()).getByRole('button', { name: '\ubcc0\uacbd \ubc84\ub9ac\uace0 \ub098\uac00\uae30' }));
    const target = within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' });
    await waitFor(() => expect(document.activeElement).toBe(target));
  });

  it('AC-4: header-close discard restores the settings gear trigger', async () => {
    const { user, settings } = await openDirtyInstanceSettings();
    await user.click(within(settings).getByRole('button', { name: '\uc124\uc815 \ub2eb\uae30' }));
    await user.click(within(leaveDialog()).getByRole('button', { name: '\ubcc0\uacbd \ubc84\ub9ac\uace0 \ub098\uac00\uae30' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '\uc124\uc815' })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '\uc124\uc815' }));
  });

  it('AC-2: the existing PAT reveal guard remains independent from the ordinary dirty-form guard', async () => {
    const user = userEvent.setup();
    render(<AppShell
      viewer={ROOT}
      tokenOwner={{ userId: 'owner-a', generation: 1 }}
      tokenQuery={{ state: 'ready', rows: [] }}
      onIssueToken={async () => ({ token: 'dl_pat_issue88_independence' })}
    />);
    await user.click(screen.getByRole('button', { name: '\uc124\uc815' }));
    const settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    await user.click(within(settings).getByRole('tab', { name: '\uc561\uc138\uc2a4 \ud1a0\ud070' }));
    await user.click(within(settings).getByRole('button', { name: '\uc0c8 \uc561\uc138\uc2a4 \ud1a0\ud070' }));
    await user.type(within(settings).getByLabelText('\uc774\ub984'), 'issue88');
    await user.click(within(settings).getByRole('button', { name: '\ubc1c\uae09' }));
    expect(await within(settings).findByTestId('token-plaintext')).toBeDefined();

    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));

    expect(await within(settings).findByTestId('token-close-reconfirm')).toBeDefined();
    expect(screen.queryByRole('alertdialog', { name: '\uc800\uc7a5\ud558\uc9c0 \uc54a\uc740 \ubcc0\uacbd' })).toBeNull();
  });

  it('AC-2 · AC-3: pending-save state still mediates category leave without losing the draft', async () => {
    let release!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(json(CURRENT))
      .mockReturnValueOnce(pending);
    const { user, settings } = await openInstanceSettings();
    await user.selectOptions(within(settings).getByRole('combobox'), 'open');
    await user.click(within(settings).getByRole('button', { name: '\uc800\uc7a5' }));
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();
    await user.click(within(leaveDialog()).getByRole('button', { name: '\uacc4\uc18d \ud3b8\uc9d1' }));
    expect((within(settings).getByRole('combobox') as HTMLSelectElement).value).toBe('open');
    release(json(CURRENT));
  });

  it('AC-2 · AC-3: uncertain-save state remains guarded until reconciliation', async () => {
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(json(CURRENT))
      .mockResolvedValueOnce(json(CURRENT))
      .mockRejectedValueOnce(new TypeError('fixture network loss'));
    const { user, settings } = await openInstanceSettings();
    await user.selectOptions(within(settings).getByRole('combobox'), 'open');
    await user.click(within(settings).getByRole('button', { name: '\uc800\uc7a5' }));
    await within(settings).findByRole('alert');
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();
    expect((within(settings).getByRole('combobox', { hidden: true }) as HTMLSelectElement).value).toBe('open');
  });

  it('AC-2 · AC-3: accepted-write readback failure remains guarded before refresh', async () => {
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce(json(CURRENT))
      .mockResolvedValueOnce(json(CURRENT))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({}, 503));
    const { user, settings } = await openInstanceSettings();
    await user.selectOptions(within(settings).getByRole('combobox'), 'open');
    await user.click(within(settings).getByRole('button', { name: '\uc800\uc7a5' }));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4));
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();
    expect((within(settings).getByRole('combobox', { hidden: true }) as HTMLSelectElement).value).toBe('open');
  });

  it('AC-5: session switch invalidates the old owner epoch', async () => {
    const user = userEvent.setup();
    const view = render(<AppShell viewer={ROOT} indexQueueContextKey="root:session-old:superuser" />);
    await user.click(screen.getByRole('button', { name: '\uc124\uc815' }));
    let settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    await user.click(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' }));
    fireEvent.change(await within(settings).findByLabelText('\uc5c5\ub85c\ub4dc \ud06c\uae30 \uc81c\ud55c'), { target: { value: 'old-session' } });
    await user.click(within(settings).getByRole('tab', { name: '\uc5d0\ub514\ud130' }));
    expect(leaveDialog()).toBeDefined();

    view.rerender(<AppShell viewer={ROOT} indexQueueContextKey="root:session-new:superuser" />);
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '\uc800\uc7a5\ud558\uc9c0 \uc54a\uc740 \ubcc0\uacbd' })).toBeNull());
    settings = await screen.findByRole('dialog', { name: '\uc124\uc815' });
    expect(within(settings).getByRole('tab', { name: '\uc778\uc2a4\ud134\uc2a4 \uc124\uc815' }).getAttribute('aria-selected')).toBe('true');
  });

});
