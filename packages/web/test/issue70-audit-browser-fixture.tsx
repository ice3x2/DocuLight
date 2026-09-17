import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

import type { AuditReadState } from '../src/audit/AuditLogPanel.js';
import type { AuditViewBody, ReconciliationQueueBody } from '../src/api/client.js';
import { AppShell } from '../src/shell/AppShell.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

type Role = 'manager' | 'super-category' | 'super-zero' | 'ordinary';
type StateName = 'ready' | 'loading' | 'error' | 'empty';

const long = '아주 긴 한글 경로와 이름이 좁은 화면에서도 잘리지 않고 자연스럽게 여러 줄로 이어져야 하는 감사 기록';
const auditData: AuditViewBody = {
  operations: ['acl.grant', '서버에서 새로 추가된 아주 긴 조작 이름'],
  groups: [
    {
      operation: 'acl.grant', actor: `관리자 ${long}`, occurredAt: '2026-09-18 10:00:00',
      rows: [
        { id: 'stable-first', occurredAt: '2026-09-18 10:00:00', operation: 'acl.grant', actor: `관리자 ${long}`, target: `설계/${long}.md`, counterpart: '다른 워크스페이스의 노드', targetRole: 'origin', subject: `수신자 ${long}`, level: 'edit', beforeValue: '<script>이전 값</script>', afterValue: '바뀐 값' },
        { id: 'stable-second', occurredAt: '2026-09-18 10:00:01', operation: 'acl.grant', actor: '관리자 한범', target: null, counterpart: null },
      ],
    },
    {
      operation: 'acl.grant', actor: `관리자 ${long}`, occurredAt: '2026-09-18 10:00:00',
      rows: [{ id: 'duplicate-summary', occurredAt: '2026-09-18 10:00:00', operation: 'acl.grant', actor: `관리자 ${long}`, target: '별도 묶음.md', counterpart: null, subject: '삭제된-주체-id', level: 'historical-level' }],
    },
  ],
};
const queueData: ReconciliationQueueBody = { items: Array.from({ length: 24 }, (_, index) => ({ id: `finding-${index}`, type: index === 23 ? `unknown.future.${long}` : ['unregistered-file', 'missing-file', 'duplicate-workspace-meta', 'uncertain-link'][index % 4]! })) };

const stateOf = <T,>(name: StateName, ready: T, retry: () => void, empty: T): AuditReadState<T> =>
  name === 'error' ? { state: 'error', onRetry: retry } : name === 'loading' ? { state: 'loading' } : { state: 'ready', data: name === 'empty' ? empty : ready };

function Fixture() {
  const [config, setConfig] = useState({ role: 'manager' as Role, audit: 'ready' as StateName, queue: 'ready' as StateName });
  const [operation, setOperation] = useState('');
  const [, rerender] = useState(0);
  const viewer = config.role === 'manager' ? { superuser: false, workspaceCount: 2, adminWorkspaceCount: 1 }
    : config.role === 'super-category' ? { superuser: true, workspaceCount: 2, adminWorkspaceCount: 1 }
      : config.role === 'super-zero' ? { superuser: true, workspaceCount: 0, adminWorkspaceCount: 0 }
        : { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

  window.__issue70Configure = (next) => setConfig((was) => ({ ...was, ...next }));
  window.__issue70State = { operation, config, auditRetries: window.__issue70State?.auditRetries ?? 0, queueRetries: window.__issue70State?.queueRetries ?? 0 };
  const audit = stateOf(config.audit, auditData, () => { window.__issue70State.auditRetries += 1; rerender((value) => value + 1); }, { groups: [], operations: auditData.operations });
  const queue = stateOf(config.queue, queueData, () => { window.__issue70State.queueRetries += 1; rerender((value) => value + 1); }, { items: [] });

  return <div data-issue70-fixture data-role={config.role} data-audit={config.audit} data-queue={config.queue}>
    <AppShell viewer={viewer} audit={audit} queueState={queue} auditOperation={operation} onAuditOperation={(next) => { setOperation(next); window.__issue70State.operation = next; }} />
  </div>;
}

declare global {
  interface Window {
    __issue70Configure: (next: Partial<{ role: Role; audit: StateName; queue: StateName }>) => void;
    __issue70State: { operation: string; config: { role: Role; audit: StateName; queue: StateName }; auditRetries: number; queueRetries: number };
  }
}

createRoot(document.getElementById('root')!).render(<Fixture />);
