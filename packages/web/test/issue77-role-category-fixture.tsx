import { createRoot } from 'react-dom/client';

import { AppShell } from '../src/shell/AppShell.js';
import type { TabState } from '../src/document/tab-state.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const documents: TabState = { tabs: [], activeId: null };

function Fixture() {
  return (
    <AppShell
      viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 0 }}
      documents={documents}
      onDocuments={() => {}}
      personalSettings={{ theme: 'system', 'default-view-mode': 'view', 'default-edit-subview': 'live-preview' }}
    />
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
