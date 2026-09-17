import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../api/client.js';

export type EditorPreferenceKey = 'default-view-mode' | 'default-edit-subview';
export type EditorPreferenceLoadState = { state: 'loading' } | { state: 'ready' } | { state: 'error'; onRetry: () => void };
export type EditorPreferenceSaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved' } | { state: 'error'; outcome: 'rejected' | 'unknown'; onRetry: () => void } | { state: 'error'; outcome: 'auth-ended' };
export type EditorPreferenceSaveStates = Partial<Record<EditorPreferenceKey, EditorPreferenceSaveState>>;

const keys: readonly EditorPreferenceKey[] = ['default-view-mode', 'default-edit-subview'];

export function useEditorPreferenceController(input: {
  userId: string | undefined;
  authGeneration?: number;
  settings: Readonly<Record<string, string>>;
  loadState: 'loading' | 'ready' | 'error';
  retryLoad: () => void;
  save: (key: EditorPreferenceKey, value: string) => Promise<number>;
  cancelReads: () => void | Promise<void>;
  mergeCache: (key: EditorPreferenceKey, value: string) => void;
}) {
  const [overlays, setOverlays] = useState<Partial<Record<EditorPreferenceKey, string>>>({});
  const [saveStates, setSaveStates] = useState<EditorPreferenceSaveStates>({});
  const locks = useRef(new Set<EditorPreferenceKey>());
  const generation = useRef(0);
  const currentIdentity = useRef({ userId: input.userId, authGeneration: input.authGeneration });
  currentIdentity.current = { userId: input.userId, authGeneration: input.authGeneration };
  const authEnded = keys.some((key) => saveStates[key]?.state === 'error' && saveStates[key]?.outcome === 'auth-ended');

  useEffect(() => {
    generation.current += 1;
    locks.current.clear();
    setOverlays({});
    setSaveStates({});
  }, [input.userId, input.authGeneration]);

  const persist = useCallback((key: EditorPreferenceKey, value: string) => {
    if (input.userId === undefined || authEnded || locks.current.has(key)) return;
    if (currentIdentity.current.userId !== input.userId || currentIdentity.current.authGeneration !== input.authGeneration) return;
    locks.current.add(key);
    const requestGeneration = generation.current;
    const owner = input.userId;
    const ownerAuthGeneration = input.authGeneration;
    const isCurrent = () => generation.current === requestGeneration && currentIdentity.current.userId === owner && currentIdentity.current.authGeneration === ownerAuthGeneration;
    setOverlays((was) => ({ ...was, [key]: value }));
    setSaveStates((was) => ({ ...was, [key]: { state: 'saving' } }));
    void Promise.resolve(input.cancelReads()).catch(() => undefined);
    void input.save(key, value).then(async (status) => {
      if (status !== 204) throw new Error(`unexpected status ${status}`);
      if (!isCurrent()) return;
      await Promise.resolve(input.cancelReads()).catch(() => undefined);
      if (!isCurrent()) return;
      input.mergeCache(key, value);
      locks.current.delete(key);
      setOverlays((was) => { const next = { ...was }; delete next[key]; return next; });
      setSaveStates((was) => ({ ...was, [key]: { state: 'saved' } }));
    }).catch((error: unknown) => {
      if (!isCurrent()) return;
      setOverlays((was) => { const next = { ...was }; delete next[key]; return next; });
      locks.current.delete(key);
      if (error instanceof ApiError && error.status === 401) {
        setSaveStates({ [key]: { state: 'error', outcome: 'auth-ended' } });
        setOverlays({});
        locks.current.clear();
        generation.current += 1;
        return;
      }
      const outcome = error instanceof ApiError && error.status === 400 ? 'rejected' : 'unknown';
      setSaveStates((was) => ({ ...was, [key]: { state: 'error', outcome, onRetry: () => {
        if (generation.current === requestGeneration) persist(key, value);
      } } }));
    });
  }, [authEnded, input]);

  const values = useMemo(() => ({ ...input.settings, ...overlays }), [input.settings, overlays]);
  const loadOwner = input.userId; const loadGeneration = input.authGeneration;
  const loadState: EditorPreferenceLoadState = input.loadState === 'error' ? { state: 'error', onRetry: () => {
    if (currentIdentity.current.userId === loadOwner && currentIdentity.current.authGeneration === loadGeneration) input.retryLoad();
  } } : { state: input.loadState };
  return { values, loadState, saveStates, disabled: input.loadState !== 'ready' || authEnded, onPick: persist };
}
