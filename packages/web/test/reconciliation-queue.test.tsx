import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { AuditLogPanel } from '../src/audit/AuditLogPanel.js';
import { SETTINGS_CATEGORIES } from '../src/shell/shell-contract.js';
import type { AuditViewBody, ReconciliationQueueBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view: AuditViewBody = {
  groups: [
    {
      operation: 'acl.grant',
      actor: '한범',
      occurredAt: '2026-08-23 01:02:03',
      rows: [
        {
          id: 'a1',
          occurredAt: '2026-08-23 01:02:03',
          operation: 'acl.grant',
          actor: '한범',
          target: '설계/회의록.md',
          counterpart: null,
        },
      ],
    },
  ],
  operations: ['acl.grant'],
};

const queue = (count: number): ReconciliationQueueBody => ({
  items: Array.from({ length: count }, (_, index) => ({
    id: `f${index}`,
    type: 'missing-file',
  })),
});

describe('IR-AUDIT-002 — 재조정 대기열의 소재', () => {
  it('AC-1: 감사 로그 카테고리 안에서 패널 내부 전환으로 열린다', async () => {
    render(<AuditLogPanel view={view} queue={queue(2)} />);

    // 처음 보이는 것은 감사 로그다 — 대기열은 같은 패널의 두 번째 화면이다.
    expect(screen.queryByTestId('queue-item')).toBeNull();

    await userEvent.setup().click(screen.getByRole('button', { name: '재조정 대기열' }));

    expect(screen.getAllByTestId('queue-item')).toHaveLength(2);
  });

  it('AC-2: 대기열 항목이 감사 로그 표의 행으로 섞이지 않는다', async () => {
    render(<AuditLogPanel view={view} queue={queue(2)} />);

    // 감사 로그 화면에는 대기열 항목이 없고,
    expect(screen.queryAllByTestId('queue-item')).toHaveLength(0);
    expect(screen.getAllByTestId('audit-group')).toHaveLength(1);

    await userEvent.setup().click(screen.getByRole('button', { name: '재조정 대기열' }));

    // 대기열 화면에는 감사 묶음이 없다. 한 표에 두 종류가 서면 조작 필터가
    // 어느 쪽을 거르는지 사람마다 다르게 읽는다.
    expect(screen.queryAllByTestId('audit-group')).toHaveLength(0);
  });

  it('AC-4: 재조정 대기열이 인스턴스 구역의 별도 카테고리로 서지 않는다', () => {
    const 이름들 = SETTINGS_CATEGORIES.map((category) => `${category.id} ${category.label}`);

    // 「색인 대기열」은 다른 것이다 — 「재조정」이 붙은 이름만 본다.
    expect(이름들.filter((name) => /재조정|reconcil/i.test(name))).toEqual([]);
  });

  it('AC-3: 카테고리 구성과 표시 권한이 이 화면 때문에 바뀌지 않는다', () => {
    const 감사 = SETTINGS_CATEGORIES.find((category) => category.id === 'audit-log')!;

    expect({ section: 감사.section, gate: 감사.gate }).toEqual({
      section: 'workspace',
      gate: 'workspace-admin',
    });
  });
});

describe('IR-AUDIT-002 — 미해소 건수 배지', () => {
  const 앱 = (body: ReconciliationQueueBody) => {
    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const routes = new Map<string, () => Response>([
      ['/api/session', () => json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 })],
      ['/api/tree', () => json([])],
      ['/api/audit-log', () => json(view)],
      ['/api/reconciliation-queue', () => json(body)],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const path = String(url).split('?')[0]!;
        const handler = routes.get(path);
        return Promise.resolve(handler === undefined ? json(null, 404) : handler());
      }),
    );
  };

  const 배지 = async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    return await within(modal).findByTestId('queue-badge');
  };

  it('AC-5 · AC-6: 좌측 카테고리의 배지 수가 볼 수 있는 미해소 항목 수와 같다', async () => {
    앱(queue(3));

    expect((await 배지()).textContent).toBe('3');
  });

  it('AC-5: 미해소가 없어도 배지가 자리를 지킨다', async () => {
    앱(queue(0));

    expect((await 배지()).textContent).toBe('0');
  });

  it('AC-7: 배지가 전역 총계나 분모를 표시하지 않는다', async () => {
    앱(queue(3));

    const 글자 = (await 배지()).textContent ?? '';
    // 분모가 붙으면 그 차액이 곧 다른 워크스페이스의 규모를 알린다.
    expect(글자).not.toMatch(/\/|전체|중/);
    expect(글자).toBe('3');
  });
});
