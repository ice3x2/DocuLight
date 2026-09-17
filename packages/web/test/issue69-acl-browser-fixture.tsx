import React from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell } from '../src/shell/AppShell.js';
import type { PrincipalRow } from '../src/api/client.js';
import '../src/styles/index.css';
import '../src/styles/shell.css';

const subjects: PrincipalRow[] = [
  { id: 'u-long', name: '아주 긴 한글 이름을 가진 품질 보증 담당 사용자', kind: 'user', status: 'active' },
  { id: 'g-system', name: '기본 시스템 그룹', kind: 'group', status: 'active', system: true },
];

createRoot(document.getElementById('root')!).render(
  <AppShell
    viewer={{ superuser: true, workspaceCount: 2, adminWorkspaceCount: 2 }}
    aclAudit={{
      contextKey: 'browser-user:0:ready:ws-1:u-long,g-system',
      managedScope: { state: 'ready', workspaceId: 'ws-1' },
      subjects,
      revocationPlan: {
        state: 'ready',
        data: {
          subjects: [
            { subject: subjects[0]!, response: { scope: 'instance', rows: [{ entryId: 'e-1', workspaceId: 'ws-1', workspaceName: '긴 이름의 기획 워크스페이스', path: '상위 폴더/매우 긴 한글 문서 이름이 줄바꿈되어야 합니다.md', level: 'admin', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }] } },
            { subject: subjects[1]!, response: { scope: 'instance', rows: [] } },
          ],
        },
      },
      simulationSubject: subjects[0]!,
      simulationQuery: { state: 'ready', data: { subjectId: 'u-long', nodes: [{ nodeId: 'n-1', workspaceId: 'ws-1', workspaceName: '긴 이름의 기획 워크스페이스', path: '상위 폴더/읽을 수 없는 긴 문서.md', level: null, source: null }] } },
      inheritanceQuery: { state: 'ready', data: { rows: [{ nodeId: 'n-2', workspaceId: 'ws-1', workspaceName: '긴 이름의 기획 워크스페이스', path: '상속이 끊긴 매우 긴 디렉터리 경로', aclAccessors: 0 }] } },
      onRevokePick: () => {},
      onRevokeRemove: () => {},
      onPreviewRevocation: async () => ({
        subjects: [
          { subject: subjects[0]!, response: { scope: 'instance', rows: [{ entryId: 'e-1', workspaceId: 'ws-1', workspaceName: '긴 이름의 기획 워크스페이스', path: '상위 폴더/매우 긴 한글 문서 이름이 줄바꿈되어야 합니다.md', level: 'admin', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }] } },
          { subject: subjects[1]!, response: { scope: 'instance', rows: [] } },
        ],
      }),
      onRevokeSubject: async (id) => {
        if (id === 'g-system') throw new Error('fixture partial result');
        return { revocation: { scope: 'instance', rows: [{ entryId: 'e-1', workspaceId: 'ws-1', workspaceName: '긴 이름의 기획 워크스페이스', path: '상위 폴더/매우 긴 한글 문서 이름이 줄바꿈되어야 합니다.md', level: 'admin', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }] }, refreshFailed: false };
      },
      onSimulatePick: () => {},
    }}
  />,
);
