import { createRoot } from 'react-dom/client';

import { AppShell } from '../src/shell/AppShell.js';
import type { TabState } from '../src/document/tab-state.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

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
  return (
    <AppShell
      viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }}
      documents={initial}
      onDocuments={() => {}}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
