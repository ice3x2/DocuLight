import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { AuditLogPanel } from '../src/audit/AuditLogPanel.js';
import type { AuditRowBody, AuditViewBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const 행 = (over: Partial<AuditRowBody> = {}): AuditRowBody => ({
  id: 'a1',
  occurredAt: '2026-08-23 01:02:03',
  operation: 'node.copy',
  actor: '한범',
  target: '설계/회의록.md',
  counterpart: null,
  ...over,
});

const view = (rows: AuditRowBody[]): AuditViewBody => ({
  groups: [
    { operation: 'node.copy', actor: '한범', occurredAt: '2026-08-23 01:02:03', rows },
  ],
  operations: ['node.copy', 'node.create'],
});

describe('SEC-AUDIT-001 — 나간 것과 들어온 것이 화면에서 구별된다', () => {
  /** 낱행을 펼친다 — 접힌 줄에는 낱행이 없다 (`IR-AUDIT-003`). */
  const 펼친다 = async (rows: AuditRowBody[]) => {
    render(<AuditLogPanel view={view(rows)} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /node.copy/ }));
  };

  it('AC-1: 원본 자리 행이 반출로 읽히도록 대상 역할이 보인다', async () => {
    await 펼친다([행({ targetRole: 'origin', counterpart: '다른 워크스페이스의 노드' })]);

    expect(screen.getByTestId('audit-role').textContent).toBe('원본');
  });

  it('AC-2: 사본 자리 행이 유입으로 읽히도록 대상 역할이 보인다', async () => {
    await 펼친다([행({ targetRole: 'copy', counterpart: '다른 워크스페이스의 노드' })]);

    expect(screen.getByTestId('audit-role').textContent).toBe('사본');
  });

  it('`DR-AUDIT-002` AC-5: 상대 노드가 없는 행에는 역할 자리도 없다', async () => {
    await 펼친다([행()]);

    expect(screen.queryByTestId('audit-role')).toBeNull();
  });

  it('`SEC-AUDIT-009` AC-3 · AC-4: 역할이 보이되 거르거나 정렬하는 자리는 없다', () => {
    render(<AuditLogPanel view={view([행({ targetRole: 'origin', counterpart: '다른 워크스페이스의 노드' })])} />);

    // 보이는 것과 축이 되는 것은 다르다 — 축이 되면 distinct 집합이
    // 곱집합으로 부푼다.
    expect(screen.queryByLabelText(/대상 역할|상대 노드/)).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });
});

describe('IR-AUDIT-001 — 조작 필터가 실제로 거른다', () => {
  const 요청 = () => {
    const calls: string[] = [];
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const full = String(url);
        calls.push(full);
        const path = full.split('?')[0]!;
        if (path === '/api/session')
          return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
        if (path === '/api/tree') return Promise.resolve(json([]));
        if (path === '/api/audit-log') return Promise.resolve(json(view([행()])));
        return Promise.resolve(json(null, 404));
      }),
    );
    return calls;
  };

  it('AC-1: 선택한 조작이 서버 요청에 실린다', async () => {
    const calls = 요청();
    const user = userEvent.setup();

    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '감사 로그' }));
    await within(modal).findByTestId('audit-group');

    // 거르는 자리는 서버 하나다 — 받아 놓고 화면에서 거르면 거르기 전의
    // 행이 이미 브라우저에 와 있게 된다.
    await user.selectOptions(within(modal).getByLabelText('조작'), 'node.create');

    await waitFor(() =>
      expect(calls.some((url) => url.includes('/api/audit-log?operation=node.create'))).toBe(true),
    );
  });
});
