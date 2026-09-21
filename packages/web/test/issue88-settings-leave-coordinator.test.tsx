import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';

const fixture = vi.hoisted(() => ({
  continueCalls: vi.fn(),
  throwOnContinue: false,
}));

vi.mock('../src/settings/InstanceSettings.js', () => ({
  InstanceSettings: ({ registerLeaveGuard }: {
    registerLeaveGuard?: (registration: {
      ownerId: string;
      dirtyCount: number;
      onContinue: () => void;
      onCancel: () => void;
    }) => () => void;
  }) => {
    const [draft, setDraft] = useState('draft-kept-at-boundary');
    const generation = useRef(41);
    useEffect(() => registerLeaveGuard?.({
      ownerId: 'coordinator-fixture',
      dirtyCount: 1,
      onContinue: () => {
        fixture.continueCalls();
        if (fixture.throwOnContinue) throw new Error('fixture discard failure');
        generation.current += 1;
        setDraft('discarded');
      },
      onCancel: () => undefined,
    }), [registerLeaveGuard]);
    return <form aria-label="인스턴스 설정" data-generation={generation.current}>
      <label>임시 값<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    </form>;
  },
}));

const ROOT = { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 };

afterEach(() => {
  cleanup();
  fixture.continueCalls.mockReset();
  fixture.throwOnContinue = false;
});

async function openFixture() {
  const user = userEvent.setup();
  const view = render(<AppShell viewer={ROOT} indexQueueContextKey="root:coordinator-fixture" />);
  await user.click(screen.getByRole('button', { name: '설정' }));
  const settings = await screen.findByRole('dialog', { name: '설정' });
  await user.click(within(settings).getByRole('tab', { name: '인스턴스 설정' }));
  const form = await within(settings).findByRole('form', { name: '인스턴스 설정' });
  return { user, view, settings, form };
}

describe('IR-SHELL-013 rendered leave coordinator', () => {
  it('revalidates a requested category before invoking child discard', async () => {
    const { user, view, settings, form } = await openFixture();
    const input = within(form).getByLabelText('임시 값') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'revoked-target-draft');
    await user.click(within(settings).getByRole('tab', { name: '워크스페이스' }));
    expect(screen.getByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeDefined();

    view.rerender(<AppShell
      viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 0 }}
      indexQueueContextKey="root:coordinator-fixture"
    />);
    await user.click(within(screen.getByRole('alertdialog', { name: '저장하지 않은 변경' }))
      .getByRole('button', { name: '변경 버리고 나가기' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeNull());
    expect(fixture.continueCalls).not.toHaveBeenCalled();
    expect(form.isConnected).toBe(true);
    expect((within(form).getByLabelText('임시 값') as HTMLInputElement).value).toBe('revoked-target-draft');
    expect(form.getAttribute('data-generation')).toBe('41');
    expect(within(settings).getByRole('alert').textContent).toContain('더 이상 사용할 수 없습니다');
  });

  it('contains child discard failure in the rendered coordinator', async () => {
    fixture.throwOnContinue = true;
    const { user, settings, form } = await openFixture();
    const input = within(form).getByLabelText('임시 값') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'callback-failure-draft');
    await user.click(within(settings).getByRole('tab', { name: '에디터' }));
    await user.click(within(screen.getByRole('alertdialog', { name: '저장하지 않은 변경' }))
      .getByRole('button', { name: '변경 버리고 나가기' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '저장하지 않은 변경' })).toBeNull());
    expect(fixture.continueCalls).toHaveBeenCalledOnce();
    expect(form.isConnected).toBe(true);
    expect((within(form).getByLabelText('임시 값') as HTMLInputElement).value).toBe('callback-failure-draft');
    expect(form.getAttribute('data-generation')).toBe('41');
    expect(within(settings).getByRole('alert').textContent).toContain('그대로 유지됩니다');
  });
});
