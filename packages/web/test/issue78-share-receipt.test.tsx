import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PrincipalRow, ShareViewBody } from '../src/api/client.js';
import { ShareModal, type ShareActionResult, type ShareQueryState } from '../src/acl/ShareModal.js';

const fetchPrincipals = vi.fn();
vi.mock('../src/api/client.js', async (load) => ({
  ...(await load<typeof import('../src/api/client.js')>()),
  fetchPrincipals: (...args: unknown[]) => fetchPrincipals(...args),
}));

afterEach(() => { cleanup(); fetchPrincipals.mockReset(); });

const principal: PrincipalRow = { id: 'receipt-target', name: 'Receipt target', kind: 'user', status: 'active', system: false };
const editorView: ShareViewBody = { metrics: { reachable: 2, viaAcl: 1 }, rows: null, level: 'edit', nodeKind: 'file', inheritsAcl: true, reached: 1 };
const ready: ShareQueryState = { state: 'ready', nodeId: 'n1', view: editorView };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; };

async function pickAndGrant(user: ReturnType<typeof userEvent.setup>) {
  await user.type(document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!, 'Re');
  await waitFor(() => expect(document.querySelector('[data-share-dialog] [cmdk-item]')).not.toBeNull());
  await user.click(document.querySelector<HTMLElement>('[data-share-dialog] [cmdk-item]')!);
  await user.click(screen.getByRole('button', { name: '추가' }));
}

describe('IR-ACL-004 editor grant receipt lifecycle', () => {
  it('uses an editor-owned receipt directly for one guarded DELETE without requesting a roster', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const refreshView = vi.fn();
    const onRevoke = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open contextKey="editor:1" query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'opaque-entry', canRevoke: true } })}
      onRevoke={onRevoke} onWarnings={async () => []} refreshView={refreshView} />);
    await pickAndGrant(user);
    const toast = await screen.findByRole('status');
    expect(toast.textContent).not.toContain('opaque-entry');
    await user.dblClick(within(toast).getByRole('button', { name: '회수' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
    expect(onRevoke).toHaveBeenCalledWith('opaque-entry');
    expect(refreshView).not.toHaveBeenCalled();
  });

  it('accepts a foreign duplicate receipt without exposing or enabling a revoke action', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'foreign-entry', canRevoke: false } })}
      onWarnings={async () => []} />);
    await pickAndGrant(user);
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toContain('현재 권한으로는 이 항목을 회수할 수 없습니다.');
    expect(within(toast).queryByRole('button', { name: '회수' })).toBeNull();
    expect(toast.textContent).not.toContain('foreign-entry');
  });

  it('discards a late receipt after owner generation changes', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const grant = deferred<ShareActionResult>();
    const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'editor.md', open: true, query: ready, onGrant: () => grant.promise, onWarnings: async () => [] };
    const { rerender } = render(<ShareModal {...props} contextKey="owner:1" />);
    await pickAndGrant(user);
    rerender(<ShareModal {...props} contextKey="owner:2" />);
    await act(async () => { grant.resolve({ ok: true, grantReceipt: { entryId: 'stale-entry', canRevoke: true } }); await grant.promise; });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('button', { name: '회수' })).toBeNull();
  });

  it('keeps the receipt action after a failed DELETE and retries only when the user asks', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const onRevoke = vi.fn().mockResolvedValueOnce({ ok: false as const }).mockResolvedValueOnce({ ok: true as const });
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'retry-entry', canRevoke: true } })}
      onRevoke={onRevoke} onWarnings={async () => []} />);
    await pickAndGrant(user);
    await user.click(within(await screen.findByRole('status')).getByRole('button', { name: '회수' }));
    expect((await screen.findByRole('alert')).textContent).toContain('회수하지 못했습니다');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(2));
  });

  it('locks a receipt action while warnings resolve so duplicate activation cannot send two DELETEs', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const warnings = deferred<readonly []>();
    const onRevoke = vi.fn(async () => ({ ok: true as const }));
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'guarded-entry', canRevoke: true } })}
      onRevoke={onRevoke} onWarnings={(input) => input.entryId === undefined ? Promise.resolve([]) : warnings.promise} />);
    await pickAndGrant(user);
    const undo = within(await screen.findByRole('status')).getByRole('button', { name: '회수' });
    await user.dblClick(undo);
    expect(undo).toHaveProperty('disabled', true);
    await act(async () => { warnings.resolve([]); await warnings.promise; });
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
  });

  it('keeps a usable receipt visible when the independent share refetch fails', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const retry = vi.fn();
    const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'editor.md', open: true, onGrant: async () => ({ ok: true as const, grantReceipt: { entryId: 'durable-entry', canRevoke: true } }), onWarnings: async () => [] };
    const { rerender } = render(<ShareModal {...props} query={ready} />);
    await pickAndGrant(user);
    expect(within(await screen.findByRole('status')).getByRole('button', { name: '회수' })).toBeDefined();
    rerender(<ShareModal {...props} query={{ state: 'error', nodeId: 'n1', onRetry: retry }} />);
    expect(screen.getByRole('alert').textContent).toContain('공유 정보를 불러오지 못했습니다');
    expect(within(screen.getByRole('status')).getByRole('button', { name: '회수' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the receipt action when revoke warning lookup fails and retries only that revoke flow', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const onRevoke = vi.fn(async () => ({ ok: true as const }));
    let entryWarnings = 0;
    const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'warning-entry', canRevoke: true } })}
      onRevoke={onRevoke} onWarnings={async (input) => input.entryId === undefined ? [] : ++entryWarnings === 1 ? undefined : []} />);
    await pickAndGrant(user);
    await user.click(within(await screen.findByRole('status')).getByRole('button', { name: '회수' }));
    expect((await screen.findByRole('alert')).textContent).toContain('회수하지 못했습니다');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' }));
    await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
    expect(entryWarnings).toBe(2);
  });

  it('does not let an old context warning completion unlock the new context revoke', async () => {
    fetchPrincipals.mockResolvedValue([principal]);
    const oldWarnings = deferred<readonly []>(); const newWarnings = deferred<readonly []>();
    let warningCall = 0; const onRevoke = vi.fn(async () => ({ ok: true as const })); const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'editor.md', open: true, query: ready, onGrant: async () => ({ ok: true as const, grantReceipt: { entryId: 'context-entry', canRevoke: true } }), onRevoke, onWarnings: (input: { entryId?: string }) => input.entryId === undefined ? Promise.resolve([]) : ++warningCall === 1 ? oldWarnings.promise : newWarnings.promise };
    const { rerender } = render(<ShareModal {...props} contextKey="owner:1" />); await pickAndGrant(user);
    await user.click(within(await screen.findByRole('status')).getByRole('button', { name: '회수' }));
    rerender(<ShareModal {...props} contextKey="owner:2" />);
    const input = document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!; await user.clear(input); await pickAndGrant(user);
    const newUndo = within(await screen.findByRole('status')).getByRole('button', { name: '회수' }); await user.click(newUndo); expect(newUndo).toHaveProperty('disabled', true);
    await act(async () => { oldWarnings.resolve([]); await oldWarnings.promise; });
    expect(newUndo).toHaveProperty('disabled', true); await user.dblClick(newUndo); expect(warningCall).toBe(2);
    await act(async () => { newWarnings.resolve([]); await newWarnings.promise; }); await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
  });

  it('uses the captured container kind for L2 revoke while the share query is in error', async () => {
    fetchPrincipals.mockResolvedValue([principal]); const onRevoke = vi.fn(async () => ({ ok: true as const })); const retry = vi.fn(); const user = userEvent.setup();
    const directoryView = { ...editorView, nodeKind: 'directory' as const, reached: 4 };
    const props = { nodeId: 'n1', nodeName: 'folder', nodeKind: 'directory' as const, open: true, onGrant: async () => ({ ok: true as const, grantReceipt: { entryId: 'directory-entry', canRevoke: true } }), onRevoke, onWarnings: async () => [], refreshView: async () => directoryView };
    const { rerender } = render(<ShareModal {...props} query={{ state: 'ready', nodeId: 'n1', view: directoryView }} />); await pickAndGrant(user);
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' })); await screen.findByRole('status');
    rerender(<ShareModal {...props} query={{ state: 'error', nodeId: 'n1', onRetry: retry }} />);
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' }));
    expect(await screen.findByRole('alertdialog')).toBeDefined(); expect(onRevoke).not.toHaveBeenCalled();
  });

  it('closes the file revoke attempt after failure during query error so the receipt can retry', async () => {
    fetchPrincipals.mockResolvedValue([principal]); const retry = vi.fn(); const onRevoke = vi.fn().mockResolvedValueOnce({ ok: false as const }).mockResolvedValueOnce({ ok: true as const }); const user = userEvent.setup();
    const props = { nodeId: 'n1', nodeName: 'editor.md', nodeKind: 'file' as const, open: true, onGrant: async () => ({ ok: true as const, grantReceipt: { entryId: 'error-entry', canRevoke: true } }), onRevoke, onWarnings: async () => [] };
    const { rerender } = render(<ShareModal {...props} query={ready} />); await pickAndGrant(user); await screen.findByRole('status'); rerender(<ShareModal {...props} query={{ state: 'error', nodeId: 'n1', onRetry: retry }} />);
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' })); await screen.findByText('권한을 회수하지 못했습니다. 다시 시도하십시오.');
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' })); await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(2));
  });

  it('releases an in-flight grant when a replacement principal owns a new operation generation', async () => {
    const replacement = { ...principal, id: 'replacement', name: 'Replacement user' };
    fetchPrincipals.mockResolvedValue([principal, replacement]);
    const oldGrant = deferred<ShareActionResult>(); const onGrant = vi.fn(() => oldGrant.promise); const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready} onGrant={onGrant} onWarnings={async () => []} />);
    await pickAndGrant(user); expect(screen.getByRole('button', { name: '추가 중…' })).toHaveProperty('disabled', true);
    const input = document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!; await user.clear(input); await user.type(input, 'Replacement');
    await user.click(await screen.findByRole('option', { name: /Replacement user.*사용자/ }));
    expect(screen.getByTestId('selected-principal').textContent).toContain('Replacement user');
    expect(screen.getByRole('button', { name: '추가' })).toHaveProperty('disabled', false);
    await act(async () => { oldGrant.resolve({ ok: true, grantReceipt: { entryId: 'stale-grant', canRevoke: true } }); await oldGrant.promise; });
    expect(screen.getByTestId('selected-principal').textContent).toContain('Replacement user');
    expect(screen.queryByText('stale-grant')).toBeNull();
  });

  it('releases an in-flight receipt revoke when a level change owns a new operation generation', async () => {
    fetchPrincipals.mockResolvedValue([principal]); const revoke = deferred<ShareActionResult>(); const onRevoke = vi.fn(() => revoke.promise); const user = userEvent.setup();
    render(<ShareModal nodeId="n1" nodeName="editor.md" open query={ready}
      onGrant={async () => ({ ok: true, grantReceipt: { entryId: 'pending-revoke', canRevoke: true } })}
      onRevoke={onRevoke} onWarnings={async () => []} />);
    await pickAndGrant(user);
    const input = document.querySelector<HTMLInputElement>('[data-share-dialog] [cmdk-input]')!; await user.clear(input); await user.type(input, 'Re'); await user.click(await screen.findByRole('option', { name: /Receipt target.*사용자/ }));
    await user.click(within(screen.getByRole('status')).getByRole('button', { name: '회수' })); await waitFor(() => expect(onRevoke).toHaveBeenCalledTimes(1));
    await user.selectOptions(screen.getByLabelText('권한'), 'edit');
    expect(screen.getByRole('button', { name: '추가' })).toHaveProperty('disabled', false);
    await act(async () => { revoke.resolve({ ok: false }); await revoke.promise; });
    expect(screen.getByRole('button', { name: '추가' })).toHaveProperty('disabled', false);
  });
});
