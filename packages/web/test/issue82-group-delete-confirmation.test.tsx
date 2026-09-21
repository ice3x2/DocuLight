import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroupRoster } from '../src/principal/GroupRoster.js';

afterEach(cleanup);

const group = {
  id: 'group-1', name: 'Delete 삭제 대상', system: false, systemType: null,
  mode: 'managed' as const, canAdd: true, effectiveMembersComplete: true,
  members: [], effectiveMembers: [],
};

const preview = { id: group.id, name: group.name, system: false as const, memberCount: 0, aclEntryCount: 0 };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

describe('IR-PRINCIPAL-004 group deletion L3', () => {
  it('reads fresh impact, requires the exact raw current name and a deliberate button activation, then final-checks and deletes once', async () => {
    const load = vi.fn(async () => preview);
    const remove = vi.fn(async () => ({ ok: true as const, refreshFailed: false }));
    render(<GroupRoster groups={[group]} onLoadDeletePreview={load} onRemove={remove} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    expect(await screen.findByText('멤버의 계정은 삭제되지 않습니다.')).toBeDefined();
    expect(screen.getByText('이 그룹에 부여된 권한 항목 0건이 함께 제거됩니다. 되돌릴 수 없습니다.')).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();

    const token = screen.getByRole('textbox', { name: '정확한 그룹 이름 Delete 삭제 대상 입력' });
    for (const wrong of ['Delete 삭제 대상 ', 'Delete 삭제대상', 'DELETE 삭제 대상', 'Delete 삭제 대상']) {
      await user.clear(token);
      await user.type(token, wrong);
      expect((screen.getByRole('button', { name: '그룹 삭제' }) as HTMLButtonElement).disabled).toBe(true);
    }
    await user.clear(token);
    fireEvent.paste(token, { clipboardData: { getData: () => group.name } });
    fireEvent.change(token, { target: { value: group.name } });
    expect(remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(token);

    await user.click(screen.getByRole('button', { name: '그룹 삭제' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith(group.id);
  });

  it('sends zero DELETE for cancel, Escape, outside interaction, composing Enter and same-tick duplicate acceptance', async () => {
    const load = vi.fn(async () => preview);
    const remove = vi.fn(async () => ({ ok: true as const, refreshFailed: false }));
    const view = render(<GroupRoster groups={[group]} onLoadDeletePreview={load} onRemove={remove} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    const input = await screen.findByRole('textbox');
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.compositionEnd(input);
    fireEvent.pointerDown(document.body);
    expect(remove).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    await user.click(await screen.findByRole('button', { name: '취소' }));
    expect(remove).not.toHaveBeenCalled();
    view.unmount();
  });

  it('invalidates typed consent when identity, name, member count, or ACL count changes and requires cancel/reopen', async () => {
    const changed = { ...preview, aclEntryCount: 1 };
    const load = vi.fn().mockResolvedValueOnce(preview).mockResolvedValueOnce(changed);
    const remove = vi.fn(async () => ({ ok: true as const, refreshFailed: false }));
    render(<GroupRoster groups={[group]} onLoadDeletePreview={load} onRemove={remove} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    const input = await screen.findByRole('textbox');
    await user.type(input, group.name);
    await user.click(screen.getByRole('button', { name: '그룹 삭제' }));

    expect(await screen.findByText('삭제 영향이 바뀌었습니다. 취소하고 다시 확인하십시오.')).toBeDefined();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(remove).not.toHaveBeenCalled();
  });

  it('uses a synchronous duplicate guard and rejects a final preview completion owned by an obsolete auth/category context', async () => {
    const finalRead = deferred<typeof preview>();
    const load = vi.fn().mockResolvedValueOnce(preview).mockReturnValueOnce(finalRead.promise);
    const remove = vi.fn(async () => ({ ok: true as const, refreshFailed: false }));
    const view = render(<GroupRoster
      groups={[group]}
      requestContext={{ principalId: 'root', authGeneration: 1, categoryGeneration: 1, queryGeneration: 1 }}
      onLoadDeletePreview={load}
      onRemove={remove}
    />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    await user.type(await screen.findByRole('textbox'), group.name);
    const action = screen.getByRole('button', { name: '그룹 삭제' });
    fireEvent.click(action);
    fireEvent.click(action);
    expect(load).toHaveBeenCalledTimes(2);
    expect(remove).not.toHaveBeenCalled();

    view.rerender(<GroupRoster
      groups={[]}
      requestContext={{ principalId: 'other', authGeneration: 2, categoryGeneration: 2, queryGeneration: 2 }}
      onLoadDeletePreview={load}
      onRemove={remove}
    />);
    finalRead.resolve(preview);
    await waitFor(() => expect(remove).not.toHaveBeenCalled());
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('keeps accepted deletion separate from refresh failure and leaves a stale row nonactionable', async () => {
    const load = vi.fn(async () => preview);
    const remove = vi.fn(async () => ({ ok: true as const, refreshFailed: true }));
    render(<GroupRoster groups={[group]} onLoadDeletePreview={load} onRemove={remove} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }));
    await user.type(await screen.findByRole('textbox'), group.name);
    await user.click(screen.getByRole('button', { name: '그룹 삭제' }));
    expect(await screen.findByText('그룹을 삭제했습니다.')).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('그룹 목록을 새로 불러오지 못했습니다.');
    expect((screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' }) as HTMLButtonElement).disabled).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('restores focus by stable row ID after an accepted removal when the delete action owned focus', async () => {
    const next = { ...group, id: 'group-2', name: '다음 그룹' };
    const load = vi.fn(async () => preview);
    let view: ReturnType<typeof render>;
    const remove = vi.fn(async () => {
      view.rerender(<GroupRoster groups={[next]} onLoadDeletePreview={load} onRemove={remove} />);
      return { ok: true as const, refreshFailed: false };
    });
    view = render(<GroupRoster groups={[group, next]} onLoadDeletePreview={load} onRemove={remove} />);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' });
    trigger.focus();
    await user.click(trigger);
    await user.type(await screen.findByRole('textbox'), group.name);
    await user.click(screen.getByRole('button', { name: '그룹 삭제' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음 그룹 삭제' })));
  });

  it('does not steal focus when the confirmation no longer owns it at write completion', async () => {
    const write = deferred<{ ok: true; refreshFailed: false }>();
    const load = vi.fn(async () => preview);
    const remove = vi.fn(() => write.promise);
    const view = render(<><button type="button" data-safe-focus>안전한 대상</button><GroupRoster groups={[group]} onLoadDeletePreview={load} onRemove={remove} /></>);
    const user = userEvent.setup();
    const trigger = screen.getByRole('button', { name: 'Delete 삭제 대상 삭제' });
    trigger.focus();
    await user.click(trigger);
    await user.type(await screen.findByRole('textbox'), group.name);
    await user.click(screen.getByRole('button', { name: '그룹 삭제' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    const safe = view.container.querySelector<HTMLButtonElement>('[data-safe-focus]')!;
    safe.focus();
    write.resolve({ ok: true, refreshFailed: false });
    await screen.findByText('그룹을 삭제했습니다.');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(document.activeElement).toBe(safe);
  });
});
