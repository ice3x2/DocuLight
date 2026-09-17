import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell } from '../src/shell/AppShell.js';
import type { TabState } from '../src/document/tab-state.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';
import type { EditorPreferenceLoadState, EditorPreferenceSaveStates } from '../src/settings/editor-preferences.js';

const tabs = Array.from({ length: 18 }, (_, index) => ({
  nodeId: `fixture-${index}`,
  name: `긴 문서 탭 ${index + 1}.md`,
  breadcrumb: [
    '신문지 워크스페이스',
    '매우 긴 한글 부서 이름과 프로젝트 경로',
    '분기별 기록과 검토 자료',
    `긴 문서 탭 ${index + 1}.md`,
  ],
  save: index === 0 ? ('conflict' as const) : ('saved' as const),
}));

const initial: TabState = { tabs, activeId: tabs[0]!.nodeId };

function Fixture() {
  const [personalSettings, setPersonalSettings] = useState<Record<string, string>>({
    'default-view-mode': 'view',
    'default-edit-subview': 'live-preview',
    theme: 'system',
  });
  const [editorLoadState, setEditorLoadState] = useState<EditorPreferenceLoadState>({ state: 'ready' });
  const [editorSaveStates, setEditorSaveStates] = useState<EditorPreferenceSaveStates>({});
  (window as typeof window & { __issue62EditorState?: (state: string) => void }).__issue62EditorState = (state) => {
    setEditorLoadState(state === 'loading' ? { state: 'loading' } : state === 'load-error' ? { state: 'error', onRetry: () => setEditorLoadState({ state: 'ready' }) } : { state: 'ready' });
    setEditorSaveStates(state === 'saving' ? { 'default-view-mode': { state: 'saving' } }
      : state === 'saved' ? { 'default-view-mode': { state: 'saved' } }
      : state === 'rejected' ? { 'default-view-mode': { state: 'error', outcome: 'rejected', onRetry: () => {} } }
      : state === 'unknown' ? { 'default-view-mode': { state: 'error', outcome: 'unknown', onRetry: () => {} } }
      : state === 'auth-ended' ? { 'default-view-mode': { state: 'error', outcome: 'auth-ended' } } : {});
  };
  (window as typeof window & { __issue62SetTheme?: (theme: string) => void }).__issue62SetTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    setPersonalSettings((current) => ({ ...current, theme }));
  };

  return (
    <AppShell
      viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }}
      documents={initial}
      onDocuments={() => {}}
      personalSettings={personalSettings}
      editorLoadState={editorLoadState}
      editorSaveStates={editorSaveStates}
      onPersonalSetting={(key, value) => {
        setPersonalSettings((current) => ({ ...current, [key]: value }));
      }}
      onPasswordChange={async (input) => {
        const evidenceWindow = window as typeof window & {
          __issue62PasswordSubmits?: Array<{ current: string; next: string }>;
          __issue62ResolvePassword?: () => void;
        };
        evidenceWindow.__issue62PasswordSubmits ??= [];
        evidenceWindow.__issue62PasswordSubmits.push(input);
        if (input.next === 'wrong-password') return 'wrong-password';
        if (input.next === 'empty-password') return 'empty-password';
        if (input.next === 'request-error') throw new Error('fixture request failure');
        if (input.next === 'pending-password') {
          await new Promise<void>((resolve) => { evidenceWindow.__issue62ResolvePassword = resolve; });
          evidenceWindow.__issue62ResolvePassword = undefined;
        }
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
