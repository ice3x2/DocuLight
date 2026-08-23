import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { AuditLogPanel } from '../src/audit/AuditLogPanel.js';
import type { AuditViewBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 행 = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  occurredAt: '2026-08-23 01:02:03',
  operation: 'acl.grant',
  actor: '한범',
  target: '설계/회의록.md',
  counterpart: null,
  ...over,
});

const view = (over: Partial<AuditViewBody> = {}): AuditViewBody => ({
  groups: [
    {
      operation: 'acl.grant',
      actor: '한범',
      occurredAt: '2026-08-23 01:02:03',
      rows: [행('a1'), 행('a2'), 행('a3')],
    },
  ],
  operations: ['acl.grant', 'node.purge'],
  ...over,
});

describe('IR-AUDIT-003 — 표시는 묶음 접기다', () => {
  it('AC-2: 한 조작에서 나온 행들이 접힌 1줄로 선다', () => {
    render(<AuditLogPanel view={view()} />);

    expect(screen.getAllByTestId('audit-group')).toHaveLength(1);
    // 접힌 상태에서는 낱행이 보이지 않는다.
    expect(screen.queryAllByTestId('audit-row')).toHaveLength(0);
  });

  it('AC-3: 펼치면 낱행이 모두 보인다', async () => {
    render(<AuditLogPanel view={view()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /acl.grant/ }));

    expect(screen.getAllByTestId('audit-row')).toHaveLength(3);
  });

  it('`SEC-AUDIT-011` AC-1~AC-4: 건수가 낱행 수이고 분모도 총계도 없다', () => {
    render(<AuditLogPanel view={view()} />);

    const 라벨 = screen.getByRole('button', { name: /acl.grant/ }).textContent ?? '';
    expect(라벨).toContain('3건');
    // 분모가 붙거나 「이 밖에 N건 더」가 붙으면 그 차액이 곧 스코프 밖 행의
    // 개수다.
    expect(라벨).not.toMatch(/\/\s*\d/);
    expect(라벨).not.toContain('밖에');
    expect(라벨).not.toContain('전체');
  });

  it('AC-5: 묶음 키가 화면에 노출되지 않는다', () => {
    const { container } = render(<AuditLogPanel view={view()} />);

    // 키를 보이면 그것으로 거르는 필터가 곧 생기고, 기록에 없는 축으로
    // 감사를 가르게 된다.
    expect(container.textContent ?? '').not.toContain('groupKey');
    expect(container.querySelector('[data-group-key]')).toBeNull();
  });
});

describe('IR-AUDIT-001 · SEC-AUDIT-004 · SEC-AUDIT-009 — 필터의 축', () => {
  it('`IR-AUDIT-001` AC-1 · AC-2: 선택지가 서버가 준 distinct 집합 그대로다', () => {
    render(<AuditLogPanel view={view({ operations: ['acl.grant', 'node.copy', '아직없던조작'] })} />);

    const 선택지 = within(screen.getByLabelText('조작'))
      .getAllByRole('option')
      .map((option) => option.textContent);

    // 「전체」 하나만 화면의 것이고 나머지는 전부 서버가 준 값이다.
    expect(선택지).toEqual(['전체', 'acl.grant', 'node.copy', '아직없던조작']);
  });

  it('`SEC-AUDIT-009` AC-2 · AC-3 · AC-4: 상대 노드·대상 역할로 거르거나 정렬하는 자리가 없다', () => {
    render(<AuditLogPanel view={view()} />);

    expect(screen.queryByLabelText(/상대 노드|대상 역할/)).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('`SEC-AUDIT-004` AC-1 · AC-2: 외부로 나간 건수를 세거나 거르는 자리가 없다', () => {
    render(
      <AuditLogPanel
        view={view({
          groups: [
            {
              operation: 'node.copy',
              actor: '한범',
              occurredAt: '2026-08-23 01:02:03',
              rows: [행('c1', { counterpart: '다른 워크스페이스의 노드', targetRole: 'origin' })],
            },
          ],
        })}
      />,
    );

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('반출');
    expect(text).not.toMatch(/외부\s*\d+/);
    expect(screen.queryByLabelText(/외부/)).toBeNull();
  });
});

describe('CON-AUDIT-001 — 셋을 각자의 이름으로 부른다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  it('AC-1: 한정어 없는 「감사 목록」이 화면 라벨과 코드 식별자에 없다', () => {
    for (const file of sources(join(WEB, 'src'))) {
      // 금지 자체를 적는 자리는 그 낱말을 인용할 수밖에 없다.
      if (file.endsWith(join('audit', 'AuditLogPanel.tsx'))) continue;

      const code = readFileSync(file, 'utf8');
      // 「상속 끊김 노드 감사 목록」은 한정어가 붙은 이름이라 걸리지 않는다.
      const 벌거벗은 = code.match(/(?<!노드 )감사 목록/g) ?? [];
      expect({ file, 벌거벗은 }).toEqual({ file, 벌거벗은: [] });
    }
  });

  it('AC-4: 감사 로그 화면이 그 이름으로 불린다', () => {
    render(<AuditLogPanel view={view()} />);

    expect(screen.getByRole('heading', { name: '감사 로그' })).toBeDefined();
  });
});

describe('앱 배선 — 감사 로그가 서버에서 온다', () => {
  it('설정 모달의 감사 로그 카테고리가 서버 응답을 그린다', async () => {
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const routes = new Map<string, () => Response>([
      ['/api/session', () => json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 })],
      ['/api/tree', () => json([])],
      ['/api/audit-log', () => json(view())],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL | Request) => {
        const path = String(url).split('?')[0]!;
        const handler = routes.get(path);
        return Promise.resolve(handler === undefined ? json(null, 404) : handler());
      }),
    );

    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('button', { name: '설정' })).toBeDefined());
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '감사 로그' }));

    // 배선이 없으면 이 자리는 카테고리 이름만 적힌 자리표다.
    expect(await within(modal).findByTestId('audit-group')).toBeDefined();
  });
});
