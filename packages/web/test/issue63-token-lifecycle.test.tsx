import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import type { Viewer } from '../src/shell/shell-contract.js';
import { TokenPanel } from '../src/settings/TokenPanel.js';
import type { TokenRowView } from '../src/settings/token-contract.js';

afterEach(cleanup);

const viewer: Viewer = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };
const owner = { userId: 'owner-a', generation: 3 } as const;
const row: TokenRowView = {
  id: 'token-1',
  name: '노트북 CLI',
  scope: 'read-only',
  expiresAt: '2099-09-17T00:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe('issue #63 B3/B4 — typed query and revoke outcomes', () => {
  it('distinguishes loading, error with retry, and a successful empty list', async () => {
    const retry = vi.fn();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'loading' }} />,
    );
    expect(screen.getByRole('status').textContent).toContain('불러오는 중');

    rerender(<TokenPanel owner={owner} query={{ state: 'error', onRetry: retry }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} />);
    expect(screen.getByText('발급된 액세스 토큰이 없습니다.')).toBeDefined();
    expect((screen.getByRole('button', { name: '새 액세스 토큰' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('awaits revoke, prevents duplicates, retains a failed target, and separates refresh failure', async () => {
    const pending = deferred<{ ok: true } | { ok: false }>();
    const revoke = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [row] }} onRevoke={revoke} />,
    );

    await user.click(screen.getByRole('button', { name: '노트북 CLI 폐기' }));
    const gate = await screen.findByRole('alertdialog');
    await user.click(within(gate).getByRole('button', { name: '실행' }));
    expect((within(gate).getByRole('button', { name: '처리 중' }) as HTMLButtonElement).disabled).toBe(true);
    expect(revoke).toHaveBeenCalledTimes(1);

    pending.resolve({ ok: false });
    await screen.findByText('토큰을 폐기하지 못했습니다. 다시 시도하십시오.');
    expect(screen.getByRole('button', { name: '노트북 CLI 폐기' })).toBeDefined();

    const succeeded = vi.fn(async () => ({ ok: true as const }));
    rerender(<TokenPanel owner={owner} query={{ state: 'ready', rows: [row] }} onRevoke={succeeded} />);
    await user.click(screen.getByRole('button', { name: '노트북 CLI 폐기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    rerender(<TokenPanel owner={owner} query={{ state: 'error', onRetry: vi.fn() }} onRevoke={succeeded} />);
    expect(await screen.findByText('토큰 목록을 불러오지 못했습니다.')).toBeDefined();
    expect(screen.queryByText('토큰을 폐기하지 못했습니다. 다시 시도하십시오.')).toBeNull();
  });
});

describe('issue #63 B1/B2 — inline secret lifecycle and parent departures', () => {
  it('keeps the form inline, validates after submit, and guards one pending issuance', async () => {
    const pending = deferred<{ token: string } | undefined>();
    const issue = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    render(<TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={issue} />);

    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    expect(screen.queryByRole('dialog', { name: '새 액세스 토큰' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '발급' }));
    expect(screen.getByText('이름을 입력하십시오.')).toBeDefined();
    expect(issue).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('이름'), ' 자동화 토큰 ');
    await user.click(screen.getByRole('button', { name: '발급' }));
    await user.click(screen.getByRole('button', { name: '발급 중' }));
    expect(issue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toContain('발급하는 중');

    pending.resolve(undefined);
    await screen.findByText('토큰을 발급하지 못했습니다. 입력을 확인하고 다시 시도하십시오.');
    expect((screen.getByLabelText('이름') as HTMLInputElement).value).toBe(' 자동화 토큰 ');
  });

  it('moves focus through form, reveal, discard, and back to the list', async () => {
    const user = userEvent.setup();
    render(<TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={async () => ({ token: 'dl_pat_focus' })} />);

    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    expect(document.activeElement).toBe(screen.getByLabelText('이름'));
    await user.type(screen.getByLabelText('이름'), 'focus');
    await user.click(screen.getByRole('button', { name: '발급' }));
    expect(document.activeElement).toBe(await screen.findByDisplayValue('dl_pat_focus'));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '계속 보기' }));
    await user.click(screen.getByRole('button', { name: '계속 보기' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '복사하고 닫기' }));
    await user.click(screen.getByRole('button', { name: '닫기' }));
    await user.click(screen.getByRole('button', { name: '그래도 닫기' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 액세스 토큰' }));
  });

  it('returns focus to New token when the issuance form is cancelled', async () => {
    const user = userEvent.setup();
    render(<TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={async () => ({ token: 'unused' })} />);

    const newToken = screen.getByRole('button', { name: '새 액세스 토큰' });
    await user.click(newToken);
    expect(document.activeElement).toBe(screen.getByLabelText('이름'));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 액세스 토큰' }));
    expect(screen.queryByLabelText('이름')).toBeNull();
  });

  it('ignores a late issue result after the authenticated owner generation changes', async () => {
    const pending = deferred<{ token: string } | undefined>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />,
    );
    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(screen.getByLabelText('이름'), '옛 사용자');
    await user.click(screen.getByRole('button', { name: '발급' }));

    rerender(
      <TokenPanel owner={{ userId: 'owner-b', generation: 4 }} query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />,
    );
    pending.resolve({ token: 'dl_pat_must_never_repaint' });
    await waitFor(() => expect(document.body.textContent).not.toContain('dl_pat_must_never_repaint'));
  });

  it('ignores a late issue result after the same owner starts a new authentication generation', async () => {
    const pending = deferred<{ token: string } | undefined>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />,
    );
    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(screen.getByLabelText('이름'), '이전 로그인');
    await user.click(screen.getByRole('button', { name: '발급' }));
    rerender(<TokenPanel owner={{ userId: owner.userId, generation: owner.generation + 1 }} query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />);
    await act(async () => { pending.resolve({ token: 'dl_pat_same_id_stale' }); await pending.promise; await Promise.resolve(); });
    expect(document.body.textContent).not.toContain('dl_pat_same_id_stale');
  });

  it('ignores a late issue result after logout removes the authenticated owner', async () => {
    const pending = deferred<{ token: string } | undefined>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />,
    );
    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(screen.getByLabelText('이름'), 'logout pending');
    await user.click(screen.getByRole('button', { name: '발급' }));
    rerender(<TokenPanel query={{ state: 'ready', rows: [] }} onIssue={() => pending.promise} />);
    await act(async () => {
      pending.resolve({ token: 'dl_pat_logged_out_stale' });
      await pending.promise;
      await Promise.resolve();
    });
    expect(document.body.textContent?.includes('dl_pat_logged_out_stale')).toBe(false);
    expect(screen.queryByTestId('token-plaintext')).toBeNull();
  });

  it('ignores a late revoke outcome after the authenticated owner generation changes', async () => {
    const pending = deferred<{ ok: true } | { ok: false }>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [row] }} onRevoke={() => pending.promise} />,
    );
    await user.click(screen.getByRole('button', { name: '노트북 CLI 폐기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    rerender(<TokenPanel owner={{ userId: 'owner-b', generation: 4 }} query={{ state: 'ready', rows: [] }} onRevoke={() => pending.promise} />);
    await act(async () => {
      pending.resolve({ ok: false });
      await pending.promise;
      await Promise.resolve();
    });
    expect(document.body.textContent).not.toContain('토큰을 폐기하지 못했습니다.');
  });

  it('ignores a late revoke outcome after the same owner starts a new authentication generation', async () => {
    const pending = deferred<{ ok: true } | { ok: false }>();
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [row] }} onRevoke={() => pending.promise} />,
    );
    await user.click(screen.getByRole('button', { name: '노트북 CLI 폐기' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    rerender(<TokenPanel owner={{ userId: owner.userId, generation: owner.generation + 1 }} query={{ state: 'ready', rows: [] }} onRevoke={() => pending.promise} />);
    await act(async () => {
      pending.resolve({ ok: false });
      await pending.promise;
      await Promise.resolve();
    });
    expect(document.body.textContent).not.toContain('토큰을 폐기하지 못했습니다.');
  });

  it('intercepts category and settings-close intent while revealing, then performs the exact accepted intent once', async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        viewer={viewer}
        tokenOwner={owner}
        tokenQuery={{ state: 'ready', rows: [] }}
        onIssueToken={async () => ({ token: 'dl_pat_inline_once' })}
      />,
    );
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '액세스 토큰' }));
    await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(within(settings).getByLabelText('이름'), 'CLI');
    await user.click(within(settings).getByRole('button', { name: '발급' }));
    expect(await within(settings).findByDisplayValue('dl_pat_inline_once')).toBeDefined();

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    expect(within(settings).getByTestId('token-close-reconfirm').textContent).toContain('아직 복사하지 않았다면 지금이 마지막입니다.');
    expect(within(settings).getByRole('tabpanel', { name: '액세스 토큰' })).toBeDefined();
    await user.click(within(settings).getByRole('button', { name: '계속 보기' }));

    await user.click(within(settings).getByRole('button', { name: '설정 닫기' }));
    await user.click(within(settings).getByRole('button', { name: '그래도 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull());
    expect(document.body.textContent).not.toContain('dl_pat_inline_once');

    await user.click(screen.getByRole('button', { name: '설정' }));
    const reopened = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(reopened).getByRole('tab', { name: '액세스 토큰' }));
    expect(within(reopened).getByText('평문은 다시 볼 수 없습니다. 필요하면 새로 발급해야 합니다.')).toBeDefined();
  });

  it('blocks Escape and outside dismissal while revealing without opening discard confirmation', async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        viewer={viewer}
        tokenOwner={owner}
        tokenQuery={{ state: 'ready', rows: [] }}
        onIssueToken={async () => ({ token: 'dl_pat_escape_guard' })}
      />,
    );
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '액세스 토큰' }));
    await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(within(settings).getByLabelText('이름'), 'CLI');
    await user.click(within(settings).getByRole('button', { name: '발급' }));
    expect(await within(settings).findByDisplayValue('dl_pat_escape_guard')).toBeDefined();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
    expect(within(settings).queryByTestId('token-close-reconfirm')).toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
    expect(within(settings).queryByTestId('token-close-reconfirm')).toBeNull();
  });

  it('preserves discard and plaintext on Escape or outside interaction, and Back completes only its exact list destination', async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        viewer={viewer}
        tokenOwner={owner}
        tokenQuery={{ state: 'ready', rows: [] }}
        onIssueToken={async () => ({ token: 'dl_pat_discard_guard' })}
      />,
    );
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '액세스 토큰' }));
    await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(within(settings).getByLabelText('이름'), 'Back');
    await user.click(within(settings).getByRole('button', { name: '발급' }));
    const plaintext = await within(settings).findByDisplayValue('dl_pat_discard_guard');

    // The inline close control is the reveal's Back-to-list intent.
    await user.click(within(settings).getByRole('button', { name: '닫기', exact: true }));
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
    expect((plaintext as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
    expect((plaintext as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();

    await user.click(within(settings).getByRole('button', { name: '계속 보기' }));
    expect((within(settings).getByTestId('token-plaintext') as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
    await user.click(within(settings).getByRole('button', { name: '닫기', exact: true }));
    await user.click(within(settings).getByRole('button', { name: '그래도 닫기' }));
    expect(within(settings).getByRole('button', { name: '새 액세스 토큰' })).toBeDefined();
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
  });

  it.each([
    ['logout', undefined],
    ['different owner', { userId: 'owner-b', generation: owner.generation + 1 }],
    ['same owner new generation', { userId: owner.userId, generation: owner.generation + 1 }],
  ] as const)('erases plaintext immediately and ignores a late clipboard result after %s', async (_label, nextOwner) => {
    const clipboard = deferred<void>();
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValueOnce(clipboard.promise);
    const user = userEvent.setup();
    const { rerender } = render(
      <TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={async () => ({ token: 'dl_pat_owner_boundary' })} />,
    );
    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(screen.getByLabelText('이름'), 'owner boundary');
    await user.click(screen.getByRole('button', { name: '발급' }));
    await screen.findByTestId('token-plaintext');
    await user.click(screen.getByRole('button', { name: '복사하고 닫기' }));

    rerender(<TokenPanel {...(nextOwner === undefined ? {} : { owner: nextOwner })} query={{ state: 'ready', rows: [] }} onIssue={async () => ({ token: 'unused' })} />);
    expect(screen.queryByTestId('token-plaintext')).toBeNull();
    expect(document.body.textContent?.includes('dl_pat_owner_boundary')).toBe(false);
    await act(async () => {
      clipboard.resolve();
      await clipboard.promise;
      await Promise.resolve();
    });
    expect(screen.queryByTestId('token-plaintext')).toBeNull();
    expect(document.body.textContent?.includes('dl_pat_owner_boundary')).toBe(false);
  });

  it('keeps the one-time value out of URL, storage, live messages, duplicate DOM, and enumerable global state', async () => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({ route: 'settings' }, '', '/settings-safe');
    const secret = ['dl', 'pat', 'volatile', 'only'].join('_');
    const user = userEvent.setup();
    render(<TokenPanel owner={owner} query={{ state: 'ready', rows: [] }} onIssue={async () => ({ token: secret })} />);
    await user.click(screen.getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(screen.getByLabelText('이름'), 'storage boundary');
    await user.click(screen.getByRole('button', { name: '발급' }));
    const plaintext = await screen.findByTestId('token-plaintext') as HTMLTextAreaElement;
    expect(plaintext.value.length).toBeGreaterThan(0);

    const liveText = [...document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"], [aria-live]')]
      .map((node) => node.textContent ?? '').join('');
    const globalStringLeak = Object.keys(window).some((key) => {
      const value = (window as unknown as Record<string, unknown>)[key];
      return typeof value === 'string' && value.includes(secret);
    });
    expect(document.querySelectorAll('[data-testid="token-plaintext"]').length).toBe(1);
    expect(window.location.href.includes(secret)).toBe(false);
    expect(JSON.stringify(window.history.state).includes(secret)).toBe(false);
    expect([...Object.entries(localStorage), ...Object.entries(sessionStorage)].some(([key, value]) => key.includes(secret) || value.includes(secret))).toBe(false);
    expect(liveText.includes(secret)).toBe(false);
    expect(globalStringLeak).toBe(false);
  });

  it.each(['fulfill', 'reject'] as const)('invalidates a deferred category destination when clipboard settles with %s', async (outcome) => {
    const clipboard = deferred<void>();
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValueOnce(clipboard.promise);
    const user = userEvent.setup();
    render(
      <AppShell viewer={viewer} tokenOwner={owner} tokenQuery={{ state: 'ready', rows: [] }} onIssueToken={async () => ({ token: `dl_pat_late_${outcome}` })} />,
    );
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '액세스 토큰' }));
    await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(within(settings).getByLabelText('이름'), 'CLI');
    await user.click(within(settings).getByRole('button', { name: '발급' }));
    await within(settings).findByDisplayValue(`dl_pat_late_${outcome}`);
    await user.click(within(settings).getByRole('button', { name: '복사하고 닫기' }));
    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();

    await act(async () => {
      if (outcome === 'fulfill') clipboard.resolve();
      else clipboard.reject(new Error('denied'));
      await clipboard.promise.catch(() => undefined);
      await Promise.resolve();
    });

    if (outcome === 'fulfill') {
      expect(within(settings).getByRole('button', { name: '새 액세스 토큰' })).toBeDefined();
      await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
      await user.type(within(settings).getByLabelText('이름'), '다음');
      await user.click(within(settings).getByRole('button', { name: '발급' }));
      await within(settings).findByDisplayValue(`dl_pat_late_${outcome}`);
      expect(within(settings).queryByTestId('token-close-reconfirm')).toBeNull();
    } else {
      expect(within(settings).getByTestId('token-copy-failed')).toBeDefined();
    }

    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();
    await user.click(within(settings).getByRole('button', { name: '그래도 닫기' }));
    expect(within(settings).getByRole('tabpanel', { name: '에디터' })).toBeDefined();
  });

  it.each(['fulfill', 'reject'] as const)('invalidates a deferred settings-close destination when clipboard settles with %s', async (outcome) => {
    const clipboard = deferred<void>();
    vi.spyOn(navigator.clipboard, 'writeText').mockReturnValueOnce(clipboard.promise);
    const user = userEvent.setup();
    render(<AppShell viewer={viewer} tokenOwner={owner} tokenQuery={{ state: 'ready', rows: [] }} onIssueToken={async () => ({ token: `dl_pat_close_${outcome}` })} />);
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '액세스 토큰' }));
    await user.click(within(settings).getByRole('button', { name: '새 액세스 토큰' }));
    await user.type(within(settings).getByLabelText('이름'), 'CLI');
    await user.click(within(settings).getByRole('button', { name: '발급' }));
    await within(settings).findByDisplayValue(`dl_pat_close_${outcome}`);
    await user.click(within(settings).getByRole('button', { name: '복사하고 닫기' }));
    await user.click(within(settings).getByRole('button', { name: '설정 닫기' }));
    expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();
    await act(async () => {
      if (outcome === 'fulfill') clipboard.resolve();
      else clipboard.reject(new Error('denied'));
      await clipboard.promise.catch(() => undefined);
      await Promise.resolve();
    });
    expect(screen.getByRole('dialog', { name: '설정' })).toBeDefined();
    await user.click(within(settings).getByRole('button', { name: '설정 닫기' }));
    if (outcome === 'reject') {
      expect(within(settings).getByTestId('token-close-reconfirm')).toBeDefined();
      await user.click(within(settings).getByRole('button', { name: '그래도 닫기' }));
    }
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull());
  });
});
