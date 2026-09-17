import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client.js';
import { useEditorPreferenceController } from '../src/settings/editor-preferences.js';

const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe('IR-SHELL-004 editor preference persistence', () => {
  it('locks the same key synchronously while allowing the other key to save', async () => {
    const view = deferred<number>(); const edit = deferred<number>();
    const save = vi.fn((key: string) => key === 'default-view-mode' ? view.promise : edit.promise); const merge = vi.fn();
    const { result } = renderHook(() => useEditorPreferenceController({ userId: 'u1', settings: { 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }, loadState: 'ready', retryLoad: vi.fn(), save, cancelReads: vi.fn(), mergeCache: merge }));
    act(() => { result.current.onPick('default-view-mode', 'edit'); result.current.onPick('default-view-mode', 'view'); result.current.onPick('default-edit-subview', 'source'); });
    expect(save).toHaveBeenCalledTimes(2); expect(result.current.values).toMatchObject({ 'default-view-mode': 'edit', 'default-edit-subview': 'source' });
    await act(async () => { view.resolve(204); edit.resolve(204); await Promise.all([view.promise, edit.promise]); });
    await waitFor(() => expect(merge).toHaveBeenCalledTimes(2)); expect(result.current.saveStates['default-view-mode']).toEqual({ state: 'saved' });
  });

  it.each([['rejected', () => Promise.reject(new ApiError(400)), 'rejected'], ['unexpected 200', () => Promise.resolve(200), 'unknown'], ...[403, 404, 409, 413, 429, 500].map((status) => [`HTTP ${status}`, () => Promise.reject(new ApiError(status)), 'unknown'] as const), ['transport', () => Promise.reject(new TypeError('offline')), 'unknown']] as const)('restores confirmed value for %s and retries the same assignment', async (_name, save, outcome) => {
    const retrySave = vi.fn(save); const { result } = renderHook(() => useEditorPreferenceController({ userId: 'u1', settings: { 'default-view-mode': 'view' }, loadState: 'ready', retryLoad: vi.fn(), save: retrySave, cancelReads: vi.fn(), mergeCache: vi.fn() }));
    act(() => result.current.onPick('default-view-mode', 'edit')); await waitFor(() => expect(result.current.saveStates['default-view-mode'].state).toBe('error'));
    expect(result.current.values['default-view-mode']).toBe('view'); expect(result.current.saveStates['default-view-mode']).toMatchObject({ state: 'error', outcome });
    act(() => { const state = result.current.saveStates['default-view-mode']; if (state.state === 'error' && state.outcome !== 'auth-ended') state.onRetry(); }); expect(retrySave).toHaveBeenCalledTimes(2);
  });

  it('ends authentication on 401 and ignores a late response from an older user generation', async () => {
    const late = deferred<number>(); const save = vi.fn(() => late.promise); const merge = vi.fn();
    const props = { userId: 'u1' as string | undefined, settings: { 'default-view-mode': 'view' }, loadState: 'ready' as const };
    const { result, rerender } = renderHook((input) => useEditorPreferenceController({ ...input, retryLoad: vi.fn(), save, cancelReads: vi.fn(), mergeCache: merge }), { initialProps: props });
    act(() => result.current.onPick('default-view-mode', 'edit')); rerender({ ...props, userId: 'u2', settings: { 'default-view-mode': 'view' } });
    await act(async () => { late.resolve(204); await late.promise; }); expect(merge).not.toHaveBeenCalled();
    const auth = renderHook(() => useEditorPreferenceController({ ...props, retryLoad: vi.fn(), save: () => Promise.reject(new ApiError(401)), cancelReads: vi.fn(), mergeCache: vi.fn() }));
    act(() => auth.result.current.onPick('default-view-mode', 'edit')); await waitFor(() => expect(auth.result.current.saveStates['default-view-mode']).toEqual({ state: 'error', outcome: 'auth-ended' })); expect(auth.result.current.disabled).toBe(true);
  });

  it('atomically clears both attempted values when either concurrent key returns 401', async () => {
    const first = deferred<number>(); const second = deferred<number>();
    const { result } = renderHook(() => useEditorPreferenceController({ userId: 'u1', authGeneration: 1, settings: { 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }, loadState: 'ready', retryLoad: vi.fn(), save: (key) => key === 'default-view-mode' ? first.promise : second.promise, cancelReads: vi.fn(), mergeCache: vi.fn() }));
    act(() => { result.current.onPick('default-view-mode', 'edit'); result.current.onPick('default-edit-subview', 'source'); });
    await act(async () => { first.reject(new ApiError(401)); try { await first.promise; } catch {} });
    await waitFor(() => expect(result.current.disabled).toBe(true));
    expect(result.current.values).toMatchObject({ 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' });
    second.resolve(204);
  });

  it('waits for post-204 read cancellation before merging and isolates the same user across auth generations', async () => {
    const postWriteCancel = deferred<void>(); let cancels = 0; const merge = vi.fn();
    const props = { userId: 'u1', authGeneration: 1, settings: { 'default-view-mode': 'view' }, loadState: 'ready' as const };
    const { result, rerender } = renderHook((input) => useEditorPreferenceController({ ...input, retryLoad: vi.fn(), save: () => Promise.resolve(204), cancelReads: () => ++cancels === 2 ? postWriteCancel.promise : undefined, mergeCache: merge }), { initialProps: props });
    act(() => result.current.onPick('default-view-mode', 'edit'));
    await waitFor(() => expect(cancels).toBe(2)); expect(merge).not.toHaveBeenCalled();
    rerender({ ...props, authGeneration: 2 });
    await act(async () => { postWriteCancel.resolve(); await postWriteCancel.promise; });
    expect(merge).not.toHaveBeenCalled();
    expect(result.current.values['default-view-mode']).toBe('view');
  });
  it('keeps an accepted 204 saved when query cancellation itself fails', async () => {
    let calls = 0; const merge = vi.fn();
    const { result } = renderHook(() => useEditorPreferenceController({ userId: 'u1', authGeneration: 1, settings: { 'default-view-mode': 'view' }, loadState: 'ready', retryLoad: vi.fn(), save: () => Promise.resolve(204), cancelReads: () => ++calls === 2 ? Promise.reject(new Error('query failure')) : undefined, mergeCache: merge }));
    act(() => result.current.onPick('default-view-mode', 'edit'));
    await waitFor(() => expect(result.current.saveStates['default-view-mode']).toEqual({ state: 'saved' }));
    expect(merge).toHaveBeenCalledWith('default-view-mode', 'edit');
  });
  it('never sends a retained retry after user or authentication generation changes', async () => {
    const save = vi.fn(() => Promise.reject(new ApiError(400)));
    const props = { userId: 'u1', authGeneration: 1, settings: { 'default-view-mode': 'view' }, loadState: 'ready' as const };
    const { result, rerender } = renderHook((input) => useEditorPreferenceController({ ...input, retryLoad: vi.fn(), save, cancelReads: vi.fn(), mergeCache: vi.fn() }), { initialProps: props });
    act(() => result.current.onPick('default-view-mode', 'edit'));
    await waitFor(() => expect(result.current.saveStates['default-view-mode'].state).toBe('error'));
    const retry = result.current.saveStates['default-view-mode'];
    rerender({ ...props, authGeneration: 2 });
    act(() => { if (retry.state === 'error' && retry.outcome !== 'auth-ended') retry.onRetry(); });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('never sends a retained retry after the sibling key ends authentication', async () => {
    const save = vi.fn((key: string) => Promise.reject(new ApiError(key === 'default-view-mode' ? 400 : 401)));
    const { result } = renderHook(() => useEditorPreferenceController({ userId: 'u1', authGeneration: 1, settings: { 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }, loadState: 'ready', retryLoad: vi.fn(), save, cancelReads: vi.fn(), mergeCache: vi.fn() }));
    act(() => result.current.onPick('default-view-mode', 'edit'));
    await waitFor(() => expect(result.current.saveStates['default-view-mode']).toMatchObject({ state: 'error', outcome: 'rejected' }));
    const retry = result.current.saveStates['default-view-mode'];
    act(() => result.current.onPick('default-edit-subview', 'source'));
    await waitFor(() => expect(result.current.disabled).toBe(true));
    act(() => { if (retry.state === 'error' && retry.outcome !== 'auth-ended') retry.onRetry(); });
    expect(save).toHaveBeenCalledTimes(2);
  });
  it('never runs a retained load retry after its owner generation changes', () => {
    const retryLoad = vi.fn(); const props = { userId: 'u1', authGeneration: 1, settings: {}, loadState: 'error' as const };
    const { result, rerender } = renderHook((input) => useEditorPreferenceController({ ...input, retryLoad, save: vi.fn(), cancelReads: vi.fn(), mergeCache: vi.fn() }), { initialProps: props });
    const retry = result.current.loadState.state === 'error' ? result.current.loadState.onRetry : () => {};
    rerender({ ...props, authGeneration: 2 });
    act(() => retry());
    expect(retryLoad).not.toHaveBeenCalled();
  });
});
