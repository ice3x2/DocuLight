import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { RosterGroup } from '../src/api/client.js';
import { AppShell } from '../src/shell/AppShell.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

type FixtureRole = 'superuser' | 'ordinary' | 'workspace-manager';
interface FixtureConfig { role: FixtureRole; empty: boolean; noCallbacks: boolean }
const params = new URLSearchParams(location.search);
const members = Array.from({ length: 14 }, (_, index) => ({
  id: `member-${index + 1}`,
  name: `구성원 ${index + 1} — 여러 줄로 자연스럽게 감싸지는 매우 긴 한글 표시 이름`,
  status: 'active' as const,
}));
const groups: RosterGroup[] = [
  { id: 'system-superusers', name: '운영 정책으로 관리되는 매우 긴 시스템 그룹 이름', system: true, members },
  { id: 'ordinary-design', name: '제품 경험 설계 및 장기 문서 검토 그룹', system: false, members: [] },
  ...Array.from({ length: 12 }, (_, index): RosterGroup => ({
    id: `group-${index + 1}`,
    name: `일반 그룹 ${index + 1} — 마지막 행 스크롤 도달 확인용 긴 이름`,
    system: false,
    members: members.slice(0, (index % 5) + 1),
  })),
];

declare global {
  interface Window {
    __issue68: { added: Array<[string, string]>; removed: string[] };
    __issue68Configure: (next: FixtureConfig) => void;
  }
}

function Fixture() {
  const [config, setConfig] = useState<FixtureConfig>({ role: 'superuser', empty: false, noCallbacks: false });
  window.__issue68Configure = (next) => {
    window.__issue68 = { added: [], removed: [] };
    setConfig(next);
  };
  const viewer = config.role === 'superuser'
    ? { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }
    : config.role === 'workspace-manager'
      ? { superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }
      : { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };
  return (
    <main data-issue68-component-bundle data-role={config.role} data-run-nonce={params.get('nonce') ?? ''}>
      <AppShell
        key={JSON.stringify(config)}
        viewer={viewer}
        groupRoster={config.empty ? [] : groups}
        {...(config.noCallbacks ? {} : {
          onGroupRemove: (id: string) => window.__issue68.removed.push(id),
          onGroupAddMember: (groupId: string, userId: string) => window.__issue68.added.push([groupId, userId]),
        })}
      />
    </main>
  );
}

window.__issue68 = { added: [], removed: [] };
const root = document.getElementById('root');
if (root === null) throw new Error('fixture root missing');
createRoot(root).render(<Fixture />);
