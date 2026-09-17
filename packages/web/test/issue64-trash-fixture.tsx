import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppShell } from '../src/shell/AppShell.js';
import type { TrashQueryState, TrashRowView } from '../src/trash/TrashPanel.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const makeRows = (): TrashRowView[] => Array.from({ length: 1_000 }, (_, index) => ({
  nodeId: `trash-${index}`,
  workspaceId: index % 2 === 0 ? 'ws-1' : 'ws-2',
  workspaceName: index % 2 === 0 ? '아주 긴 기획 워크스페이스 이름' : '개발팀',
  originalPath: index === 0
    ? '기획/2026/분기/아주 긴 한글 원본 경로는 말줄임 없이 여러 줄로 자연스럽게 표시되어야 합니다.md'
    : `문서/휴지통 항목-${index}.md`,
  deletedAt: '2026-09-17T01:02:03.000Z',
  deletedBy: `삭제자-${index % 7}`,
  canPurge: index % 3 !== 1,
}));

declare global {
  interface Window {
    __issue64SetQuery: (state: 'loading' | 'error' | 'ready') => void;
    __issue64Reset: () => void;
    __issue64Counts: { restore: number; purge: number };
    __issue64LastAction: { kind: 'restore' | 'purge'; nodeId: string } | null;
  }
}

function Fixture() {
  const [rows, setRows] = useState(makeRows);
  const [queryState, setQueryState] = useState<'loading' | 'error' | 'ready'>('ready');
  const [lens, setLens] = useState<{ scope: 'mine' | 'all'; workspaceId?: string }>({ scope: 'mine' });
  const [restoreFailures, setRestoreFailures] = useState(1);
  const [purgeFailures, setPurgeFailures] = useState(1);
  window.__issue64Counts ??= { restore: 0, purge: 0 };
  window.__issue64LastAction ??= null;
  window.__issue64SetQuery = setQueryState;
  window.__issue64Reset = () => {
    setRows(makeRows());
    setQueryState('ready');
    setLens({ scope: 'mine' });
    setRestoreFailures(1);
    setPurgeFailures(1);
    window.__issue64Counts = { restore: 0, purge: 0 };
    window.__issue64LastAction = null;
  };
  const trashQuery: TrashQueryState = queryState === 'loading'
    ? { state: 'loading' }
    : queryState === 'error'
      ? { state: 'error', onRetry: () => setQueryState('ready') }
      : { state: 'ready' };
  return <AppShell
    viewer={{ superuser: true, workspaceCount: 2, adminWorkspaceCount: 1 }}
    workspaces={[
      { workspace: { id: 'ws-1', name: '아주 긴 기획 워크스페이스 이름' }, visibility: 'full', roots: [] },
      { workspace: { id: 'ws-2', name: '개발팀' }, visibility: 'full', roots: [] },
    ]}
    trash={rows}
    trashQuery={trashQuery}
    trashLens={lens}
    onTrashLens={setLens}
    onTrashRestore={async (id) => {
      window.__issue64LastAction = { kind: 'restore', nodeId: id };
      window.__issue64Counts.restore += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (restoreFailures > 0) { setRestoreFailures(restoreFailures - 1); return { ok: false }; }
      return { ok: true };
    }}
    onTrashPurge={async (id) => {
      window.__issue64LastAction = { kind: 'purge', nodeId: id };
      window.__issue64Counts.purge += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (purgeFailures > 0) { setPurgeFailures(purgeFailures - 1); return { ok: false }; }
      setRows((current) => current.filter((row) => row.nodeId !== id));
      return { ok: true };
    }}
  />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
