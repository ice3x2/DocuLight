import { Fragment, useId, useLayoutEffect, useRef } from 'react';
import { Button, Field, Select } from '../components/ui/index.js';
import { personalFieldsOf, type PersonalSettingField } from '../shell/shell-contract.js';
import type { EditorPreferenceLoadState, EditorPreferenceSaveState, EditorPreferenceSaveStates } from './editor-preferences.js';

export type ThemeSaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved' } | { state: 'error'; onRetry: () => void };
export type ThemeLoadState = { state: 'loading' } | { state: 'ready' } | { state: 'error'; onRetry: () => void };

function EditorSaveStatus({ id, controlId, shouldFocus, state, onAnchored }: { id: string; controlId: string; shouldFocus: boolean; state: EditorPreferenceSaveState; onAnchored: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const anchored = useRef(false);
  useLayoutEffect(() => {
    const anchor = ref.current;
    if (state.state === 'saving' && shouldFocus) { anchor?.focus(); anchored.current = true; onAnchored(); }
    if (state.state !== 'saving' && anchored.current && document.activeElement === anchor) { document.getElementById(controlId)?.focus(); anchored.current = false; }
  }, [controlId, onAnchored, shouldFocus, state.state]);
  const role = state.state === 'error' ? 'alert' : 'status';
  return <p ref={ref} id={id} role={role} tabIndex={-1} data-personal-setting-status={state.state === 'error' ? 'error' : state.state === 'saved' ? 'saved' : true}
    onBlur={(event) => { if (event.relatedTarget instanceof HTMLElement && event.relatedTarget !== document.body && event.relatedTarget.id !== controlId) anchored.current = false; }}>
    {state.state === 'saving' ? '저장 중…' : state.state === 'saved' ? '저장됨' : state.state === 'error' && state.outcome === 'auth-ended' ? '로그인이 필요합니다. 다시 로그인한 뒤 설정을 확인하세요.' : state.state === 'error' ? <>{state.outcome === 'rejected' ? '설정을 저장하지 못했습니다. 마지막 확인값으로 복원했습니다.' : '저장 여부를 확인하지 못했습니다. 마지막 확인값을 표시합니다.'}{' '}<Button variant="secondary" onClick={state.onRetry}>저장 다시 시도</Button></> : null}
  </p>;
}

export function PersonalSettings({ category, values = {}, onPick, themeLoadState = { state: 'ready' }, themeSaveState = { state: 'idle' }, editorLoadState = { state: 'ready' }, editorSaveStates = {} }: {
  category: PersonalSettingField['category']; values?: Readonly<Record<string, string>>; onPick?: (key: string, value: string) => void;
  themeLoadState?: ThemeLoadState; themeSaveState?: ThemeSaveState; editorLoadState?: EditorPreferenceLoadState; editorSaveStates?: EditorPreferenceSaveStates;
}) {
  const prefix = useId();
  const lastFocusedEditorKey = useRef<string | null>(null);
  const loadStatusId = `${prefix}-${category}-load-status`;
  const editorAuthEnded = Object.values(editorSaveStates).some((state) => state?.state === 'error' && state.outcome === 'auth-ended');
  const editorAuthKey = Object.entries(editorSaveStates).find(([, state]) => state?.state === 'error' && state.outcome === 'auth-ended')?.[0];
  const editorAuthId = editorAuthKey === undefined ? undefined : `${prefix}-${editorAuthKey}-status`;
  const loadState = category === 'editor' ? editorLoadState : themeLoadState;
  return <section data-personal-settings data-category={category} data-testid="personal-settings">
    <h2>{category === 'editor' ? '에디터' : '외모(테마)'}</h2>
    <div data-personal-settings-fields>{personalFieldsOf(category).map((field) => {
      const saveState = category === 'editor' ? editorSaveStates[field.key as keyof EditorPreferenceSaveStates] : undefined;
      const statusId = `${prefix}-${field.key}-status`;
      const controlId = `${prefix}-${field.key}`;
      return <Fragment key={field.key}><Field label={field.label}><Select id={controlId} value={values[field.key] ?? field.fallback}
        disabled={loadState.state !== 'ready' || editorAuthEnded || saveState?.state === 'saving'} aria-busy={saveState?.state === 'saving' ? 'true' : undefined}
        aria-describedby={loadState.state !== 'ready' ? loadStatusId : editorAuthEnded ? editorAuthId : saveState !== undefined && saveState.state !== 'idle' ? statusId : undefined} onChange={(event) => { if (category === 'editor') lastFocusedEditorKey.current = document.activeElement === event.currentTarget ? field.key : null; onPick?.(field.key, event.target.value); }}>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
        {saveState !== undefined && saveState.state !== 'idle' && (!(saveState.state === 'error' && saveState.outcome === 'auth-ended') || field.key === editorAuthKey) && <EditorSaveStatus id={statusId} controlId={controlId} state={saveState} shouldFocus={lastFocusedEditorKey.current === field.key} onAnchored={() => { lastFocusedEditorKey.current = null; }} />}
      </Fragment>;
    })}</div>
    {loadState.state === 'loading' && <p id={loadStatusId} role="status" data-personal-setting-status>{category === 'editor' ? '에디터 설정을 불러오는 중…' : '테마 설정을 불러오는 중…'}</p>}
    {loadState.state === 'error' && <p id={loadStatusId} role="alert" data-personal-setting-status="error">{category === 'editor' ? '에디터 설정을 불러오지 못했습니다.' : '테마 설정을 불러오지 못했습니다.'}{' '}<Button variant="secondary" onClick={loadState.onRetry}>다시 불러오기</Button></p>}
    {category === 'appearance' && themeSaveState.state === 'saving' && <p role="status" data-personal-setting-status>테마 저장 중…</p>}
    {category === 'appearance' && themeSaveState.state === 'saved' && <p role="status" data-personal-setting-status="saved">테마 저장됨</p>}
    {category === 'appearance' && themeSaveState.state === 'error' && <p role="alert" data-personal-setting-status="error">테마를 저장하지 못했습니다. 마지막 저장값으로 복원했습니다. <Button variant="secondary" onClick={themeSaveState.onRetry}>테마 저장 다시 시도</Button></p>}
  </section>;
}
