import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  finishSession: undefined as undefined | ((value: string) => void),
  finishSave: undefined as undefined | ((value: { hash: string }) => void),
  openEditSession: vi.fn(() => new Promise<string>((resolve) => { api.finishSession = resolve; })),
  saveBody: vi.fn(() => new Promise<{ hash: string }>((resolve) => { api.finishSave = resolve; })),
  loadDocument: vi.fn(),
}));

vi.mock('../src/api/client.js', () => ({
  ApiError: class ApiError extends Error {},
  openEditSession: api.openEditSession,
  saveBody: api.saveBody,
  loadDocument: api.loadDocument,
}));

import { useAutosave } from '../src/document/useAutosave.js';

describe('IR-SHELL-009 exact owner continuation gate', () => {
  beforeEach(() => {
    api.finishSession = undefined;
    api.finishSave = undefined;
    api.openEditSession.mockClear();
    api.saveBody.mockClear();
  });

  it('drops a delayed edit-session continuation before save dispatch', async () => {
    let allowed = true;
    const onSaved = vi.fn();
    const { result } = renderHook(() => useAutosave('n1', 'h1', onSaved, undefined, () => allowed));

    act(() => result.current.saveNow('owner-a bytes'));
    expect(api.openEditSession).toHaveBeenCalledOnce();
    allowed = false;
    await act(async () => { api.finishSession?.('session-a'); });

    expect(api.saveBody).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('drops a delayed save response after the owner generation changes', async () => {
    let allowed = true;
    const onSaved = vi.fn();
    api.openEditSession.mockResolvedValueOnce('session-a');
    const { result } = renderHook(() => useAutosave('n1', 'h1', onSaved, undefined, () => allowed));

    act(() => result.current.saveNow('owner-a bytes'));
    await vi.waitFor(() => expect(api.saveBody).toHaveBeenCalledOnce());
    allowed = false;
    await act(async () => { api.finishSave?.({ hash: 'late-hash' }); });

    expect(onSaved).not.toHaveBeenCalled();
    expect(result.current.status).toBe('dirty');
  });
});
