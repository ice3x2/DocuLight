import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';

import { InheritanceAuditPanel } from '../src/acl/InheritanceAuditPanel.js';
import { restoreInheritance, type RestoreInheritancePreview } from '../src/api/client.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const row = { nodeId: 'n1', workspaceId: 'ws1', workspaceName: '기획실', path: '닫힌방', aclAccessors: 2 };
const preview: RestoreInheritancePreview = {
  nodeId: 'n1', workspace: { id: 'ws1', name: '기획실' }, path: '닫힌방', kind: 'directory',
  retainedDirectAcl: [{ principalId: 'u1', principalName: '직접 사용자', principalKind: 'user', level: 'edit', source: null }],
  incomingParentAcl: [{ principalId: 'g1', principalName: '기획 독자', principalKind: 'group', level: 'view', source: '기획실' }],
  applicableDescendants: 0, revision: 'v1.proof',
};

describe('IR-ACL-005 restore inheritance L2', () => {
  it('maps definite 4xx rejection separately from uncertain 5xx/transport outcomes', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 409, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }))
      .mockRejectedValueOnce(new TypeError('network')));
    await expect(restoreInheritance('n1', 'v1.proof')).resolves.toEqual({ status: 'rejected' });
    await expect(restoreInheritance('n1', 'v1.proof')).resolves.toEqual({ status: 'unconfirmed' });
    await expect(restoreInheritance('n1', 'v1.proof')).resolves.toEqual({ status: 'unconfirmed' });
  });
  it('loads a fresh complete preview and shows exactly one L2 without a typing token', async () => {
    const load = vi.fn().mockResolvedValue(preview);
    render(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [row] } }} onLoadRestorePreview={load} onRestoreInheritance={vi.fn()} onRefresh={vi.fn()} contextKey="auth:1" />);

    await userEvent.setup().click(screen.getByRole('button', { name: /닫힌방.*상속으로 되돌리기/ }));
    const dialog = await screen.findByRole('alertdialog', { name: '상속으로 되돌리기' });
    expect(load).toHaveBeenCalledWith('n1');
    expect(within(dialog).getByText('기획실')).toBeDefined();
    expect(within(dialog).getByText('디렉터리')).toBeDefined();
    expect(within(dialog).getByText(/직접 사용자/)).toBeDefined();
    expect(within(dialog).getByText(/기획 독자/)).toBeDefined();
    expect(within(dialog).getByText(/적용 하위 노드 0개/)).toBeDefined();
    expect(within(dialog).getByText('직접 부여한 권한은 유지됩니다.')).toBeDefined();
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '취소' }));
  });

  it('rechecks the preview before POST and requires reopen when impact became stale', async () => {
    const changed = { ...preview, revision: 'v1.changed', incomingParentAcl: [...preview.incomingParentAcl, { principalId: 'u2', principalName: '새 사용자', principalKind: 'user' as const, level: 'view' as const, source: '기획실' }] };
    const load = vi.fn().mockResolvedValueOnce(preview).mockResolvedValueOnce(changed);
    const restore = vi.fn();
    render(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [row] } }} onLoadRestorePreview={load} onRestoreInheritance={restore} onRefresh={vi.fn()} contextKey="auth:1" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /상속으로 되돌리기/ }));
    await user.click(await screen.findByRole('button', { name: '상속 복원' }));
    expect((await screen.findByRole('alert')).textContent).toContain('영향이 변경되었습니다');
    expect(restore).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('separates confirmed mutation from refresh failure and prevents duplicate writes', async () => {
    const deferred: { resolve?: () => void } = {};
    const restore = vi.fn(() => new Promise<{ status: 'completed' }>((resolve) => { deferred.resolve = () => resolve({ status: 'completed' }); }));
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    render(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [row] } }} onLoadRestorePreview={vi.fn().mockResolvedValue(preview)} onRestoreInheritance={restore} onRefresh={refresh} contextKey="auth:1" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /상속으로 되돌리기/ }));
    const confirm = await screen.findByRole('button', { name: '상속 복원' });
    await user.dblClick(confirm);
    expect(restore).toHaveBeenCalledTimes(1);
    deferred.resolve?.();
    expect((await screen.findByRole('status')).textContent).toContain('상속을 복원했지만 목록을 새로 불러오지 못했습니다');
    expect((screen.getByRole('button', { name: /닫힌방.*상속으로 되돌리기/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cancel sends no POST, restores focus, and auth generation closes stale consent', async () => {
    const restore = vi.fn();
    const props = { query: { state: 'ready' as const, data: { rows: [row] } }, onLoadRestorePreview: vi.fn().mockResolvedValue(preview), onRestoreInheritance: restore, onRefresh: vi.fn() };
    const view = render(<InheritanceAuditPanel {...props} contextKey="auth:1" />);
    const trigger = screen.getByRole('button', { name: /상속으로 되돌리기/ });
    await userEvent.setup().click(trigger);
    await userEvent.setup().click(await screen.findByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(restore).not.toHaveBeenCalled();
    await userEvent.setup().click(trigger);
    view.rerender(<InheritanceAuditPanel {...props} contextKey="auth:2" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('drops a late preview from the previous authentication generation', async () => {
    let release: ((value: RestoreInheritancePreview) => void) | undefined;
    const load = vi.fn(() => new Promise<RestoreInheritancePreview>((resolve) => { release = resolve; }));
    const props = { query: { state: 'ready' as const, data: { rows: [row] } }, onLoadRestorePreview: load, onRestoreInheritance: vi.fn(), onRefresh: vi.fn() };
    const view = render(<InheritanceAuditPanel {...props} contextKey="auth:1" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /상속으로 되돌리기/ }));
    view.rerender(<InheritanceAuditPanel {...props} contextKey="auth:2" />);
    release?.(preview);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('drops a late preview rejection from the previous authentication generation', async () => {
    let reject: ((reason: Error) => void) | undefined;
    const load = vi.fn(() => new Promise<RestoreInheritancePreview>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const props = { query: { state: 'ready' as const, data: { rows: [row] } }, onLoadRestorePreview: load, onRestoreInheritance: vi.fn(), onRefresh: vi.fn() };
    const view = render(<InheritanceAuditPanel {...props} contextKey="auth:1" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /상속으로 되돌리기/ }));
    view.rerender(<InheritanceAuditPanel {...props} contextKey="auth:2" />);
    await act(async () => { reject?.(new Error('old account failed')); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops a late pre-submit rejection after authentication changes', async () => {
    let reject: ((reason: Error) => void) | undefined;
    const load = vi.fn().mockResolvedValueOnce(preview).mockImplementationOnce(() => new Promise<RestoreInheritancePreview>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const props = { query: { state: 'ready' as const, data: { rows: [row] } }, onLoadRestorePreview: load, onRestoreInheritance: vi.fn(), onRefresh: vi.fn() };
    const view = render(<InheritanceAuditPanel {...props} contextKey="auth:1" />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /상속으로 되돌리기/ })); await user.click(await screen.findByRole('button', { name: '상속 복원' }));
    view.rerender(<InheritanceAuditPanel {...props} contextKey="auth:2" />);
    await act(async () => { reject?.(new Error('old account failed')); });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('moves focus to the section heading when the restored row was the last one', async () => {
    const load = vi.fn().mockResolvedValue(preview);
    const restore = vi.fn().mockResolvedValue({ status: 'completed' as const });
    let view: ReturnType<typeof render>;
    const onRefresh = async () => { view.rerender(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [] } }} onLoadRestorePreview={load} onRestoreInheritance={restore} onRefresh={onRefresh} contextKey="auth:1" />); };
    view = render(<InheritanceAuditPanel query={{ state: 'ready', data: { rows: [row] } }} onLoadRestorePreview={load} onRestoreInheritance={restore} onRefresh={onRefresh} contextKey="auth:1" />);
    const user = userEvent.setup(); await user.click(screen.getByRole('button', { name: /상속으로 되돌리기/ })); await user.click(await screen.findByRole('button', { name: '상속 복원' }));
    await waitFor(() => expect(document.activeElement?.textContent).toBe('상속 끊김 목록'));
  });

  it('hides an open preview in the same commit that changes authentication context', async () => {
    const props = { query: { state: 'ready' as const, data: { rows: [row] } }, onLoadRestorePreview: vi.fn().mockResolvedValue(preview), onRestoreInheritance: vi.fn(), onRefresh: vi.fn() };
    const view = render(<InheritanceAuditPanel {...props} contextKey="auth:1" />);
    await userEvent.setup().click(screen.getByRole('button', { name: /상속으로 되돌리기/ })); await screen.findByRole('alertdialog');
    flushSync(() => { view.rerender(<InheritanceAuditPanel {...props} contextKey="auth:2" />); });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByText('직접 사용자')).toBeNull();
  });
});
