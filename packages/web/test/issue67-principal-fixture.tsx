import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { RosterUser } from '../src/api/client.js';
import { AppShell } from '../src/shell/AppShell.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

type FixtureRole = 'superuser' | 'ordinary' | 'workspace-manager';
interface FixtureConfig { empty: boolean; noRegister: boolean; role: FixtureRole; signupMode?: string }

const params = new URLSearchParams(location.search);
const initial: FixtureConfig = { empty: false, noRegister: false, role: 'superuser' };
const runtimePassword = (salt: number) => Array.from(
  { length: 16 },
  (_, index) => String.fromCharCode(65 + ((index * 7 + salt) % 26)),
).join('');
const registrationPassword = ` ${runtimePassword(3)} `;
const fullUsers: RosterUser[] = [
  { id: 'active-id', name: '활성 사용자 이름이 매우 길어도 마지막 글자와 상태가 모두 보이는 사람', status: 'active' },
  { id: 'pending-id', name: 'Pending User With An Intentionally Very Long Latin Display Name', status: 'pending' },
  { id: 'suspended-id', name: '정지 사용자', status: 'suspended' },
  { id: 'rejected-id', name: '거절 사용자', status: 'rejected' },
  ...Array.from({ length: 12 }, (_, index): RosterUser => ({
    id: `extra-${index}`,
    name: `추가 명부 사용자 ${index + 1} — 긴 이름 줄바꿈 확인`,
    status: index % 4 === 0 ? 'active' : index % 4 === 1 ? 'pending' : index % 4 === 2 ? 'suspended' : 'rejected',
  })),
];

declare global {
  interface Window {
    __issue67: {
      approveIds: string[];
      registerCount: number;
      registerExact: boolean;
      rejectIds: string[];
      reopenIds: string[];
    };
    __issue67Configure: (next: FixtureConfig) => void;
  }
}

function resetObservations() {
  window.__issue67 = { approveIds: [], registerCount: 0, registerExact: false, rejectIds: [], reopenIds: [] };
}

function Fixture() {
  const [config, setConfig] = useState(initial);
  window.__issue67Configure = (next) => { resetObservations(); setConfig(next); };
  const viewer = config.role === 'superuser'
    ? { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }
    : config.role === 'workspace-manager'
      ? { superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }
      : { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

  return (
    <main data-issue67-component-bundle data-role={config.role} data-run-nonce={params.get('nonce') ?? ''}>
      <AppShell
        key={JSON.stringify(config)}
        viewer={viewer}
        userRoster={config.empty ? [] : fullUsers}
        {...(config.signupMode === undefined ? {} : { signupMode: config.signupMode })}
        {...(config.noRegister ? {} : { onRegisterUser: async (input: { name: string; password: string }) => {
          window.__issue67.registerCount += 1;
          window.__issue67.registerExact = input.name === ' 한글 이름 ' && input.password === registrationPassword;
          return { ok: true as const, id: 'fixture-registration', refreshFailed: false };
        } })}
        onApproveUser={async (id) => { window.__issue67.approveIds.push(id); return { ok: true, refreshFailed: false }; }}
        onReopenUser={async (id) => { window.__issue67.reopenIds.push(id); return { ok: true, refreshFailed: false }; }}
        onUserStatus={async (id, status) => { if (status === 'rejected') window.__issue67.rejectIds.push(id); return { ok: true, refreshFailed: false }; }}
      />
    </main>
  );
}

resetObservations();
createRoot(document.getElementById('root')!).render(<Fixture />);
