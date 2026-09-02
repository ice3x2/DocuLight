import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuditLogPanel } from '../src/audit/AuditLogPanel.js';
import type { AuditViewBody } from '../src/api/client.js';

/**
 * 감사 낱행이 **주체와 레벨을 그린다** (`IR-AUDIT-004`).
 *
 * 원장 `G15` 가 종결하면서 Phase 1 잔여로 지목한 것이 이 두 칸이다 — 서버는
 * 두 값을 실어 보내는데 화면이 그리지 않아, 목록이 「누가 언제 어느 노드에」
 * 까지만 답하고 「누구에게 무엇을」을 답하지 못했다.
 *
 * 두 칸은 **보이기만 한다** — 거르거나 정렬하거나 세는 자리는 두지 않는다
 * (`SEC-AUDIT-009` 가 세운 형태를 따른다).
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 행 = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  occurredAt: '2026-09-02 01:02:03',
  operation: 'acl.grant',
  actor: '선희',
  target: '설계/회의록.md',
  counterpart: null,
  ...over,
});

const view = (rows: Record<string, unknown>[]): AuditViewBody => ({
  groups: [{ operation: 'acl.grant', actor: '선희', occurredAt: '2026-09-02 01:02:03', rows: rows as never }],
  operations: ['acl.grant'],
});

/** 접힌 줄을 펼쳐 낱행을 세운다 — 낱행은 펼쳐야 보인다 (`IR-AUDIT-003` AC-2). */
const 펼친다 = async () => {
  await userEvent.setup().click(screen.getByRole('button', { name: /acl.grant/ }));
};

describe('IR-AUDIT-004 — 낱행이 주체와 레벨을 그린다', () => {
  it('AC-1: 주체 칸이 채워진 낱행이 그 주체를 보인다', async () => {
    render(<AuditLogPanel view={view([행('a1', { subject: '한범', level: 'view' })])} />);
    await 펼친다();

    expect(screen.getByTestId('audit-subject').textContent).toContain('한범');
  });

  it('AC-2 · AC-7: 레벨이 제품의 다른 화면과 같은 이름으로 보인다', async () => {
    render(
      <AuditLogPanel
        view={view([
          행('a1', { subject: '한범', level: 'view' }),
          행('a2', { subject: '도윤', level: 'edit' }),
          행('a3', { subject: '개발팀', level: 'admin' }),
        ])}
      />,
    );
    await 펼친다();

    // `ShareModal` 이 쓰는 세 이름 그대로다. 원문(`view`·`edit`·`admin`)이
    // 그대로 나오면 화면마다 같은 레벨을 다른 말로 부르게 된다.
    expect(screen.getAllByTestId('audit-level').map((one) => one.textContent)).toEqual([
      '보기',
      '편집',
      '관리',
    ]);
  });

  it('AC-7: 레벨 이름을 이 화면이 따로 적지 않는다 — 한 자리에서 온다', () => {
    // 문자열만 재면 같은 대응을 두 번째로 적어 넣어도 통과한다. 그러면
    // 레벨이 하나 늘 때 한쪽만 늘고, 그 어긋남은 아무도 눈치채지 못한다.
    const 화면 = readFileSync(join(WEB, 'src', 'audit', 'AuditLogPanel.tsx'), 'utf8');

    expect(화면).toContain('레벨이름');
    expect(화면).not.toMatch(/'관리'|"관리"/);
  });

  it('AC-6: 주체나 레벨이 빈 낱행은 그 자리를 그리지 않는다', async () => {
    render(<AuditLogPanel view={view([행('a1', { operation: 'node.create' })])} />);
    await 펼친다();

    // 자리표(`-`)로 채우면 화면이 없는 사실을 그리게 된다.
    expect(screen.queryByTestId('audit-subject')).toBeNull();
    expect(screen.queryByTestId('audit-level')).toBeNull();
  });

  it('AC-10: 받은 사람이 행위자와 다른 자리에 서서 둘이 구별된다', async () => {
    // 회수 낱행 — 회수한 사람은 `선희`(묶음의 행위자), 받은 사람은 `한범`.
    // 한 자리에 담기면 「누가 걷었나」와 「누구 것이 걷혔나」가 섞인다.
    render(<AuditLogPanel view={view([행('a1', { subject: '한범', level: 'edit' })])} />);

    const 묶음버튼 = screen.getByRole('button', { name: /acl.grant/ });
    expect(묶음버튼.textContent).toContain('선희');
    expect(묶음버튼.textContent).not.toContain('한범');

    await 펼친다();

    const 주체 = screen.getByTestId('audit-subject');
    expect(주체.textContent).toContain('한범');
    expect(주체.textContent).not.toContain('선희');
  });

  it('AC-4: 주체를 이름으로 바꾸려고 낱행마다 요청을 보내지 않는다', async () => {
    const fetch가 = vi.fn(() => Promise.reject(new Error('감사 화면이 요청을 보냈다')));
    vi.stubGlobal('fetch', fetch가);

    render(
      <AuditLogPanel
        view={view([
          행('a1', { subject: '한범', level: 'view' }),
          행('a2', { subject: '도윤', level: 'edit' }),
        ])}
      />,
    );
    await 펼친다();

    // 해석은 서버가 응답을 만들 때 끝낸다. 화면이 여기서 명부를 두드리면
    // 목록 한 줄마다 요청이 붙고, 그 창구 자체가 스코프 없는 명부 경로다.
    expect(fetch가).not.toHaveBeenCalled();
  });
});

describe('IR-AUDIT-004 — 두 칸은 축이 되지 않는다', () => {
  const 채운view = view([행('a1', { subject: '한범', level: 'view' })]);

  it('AC-8: 주체나 레벨로 거르는 필터가 없다', () => {
    render(<AuditLogPanel view={채운view} />);

    expect(screen.queryByLabelText(/주체|레벨|받은 사람/)).toBeNull();
    // 선택칸은 조작 하나뿐이다 — `SEC-AUDIT-009` 가 이미 세운 단언과 같은
    // 자리를 지킨다. 축이 하나 늘면 두 요구가 함께 걸린다.
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('AC-9: 정렬 축도, 그 둘을 세는 배지도 없다', () => {
    const { container } = render(<AuditLogPanel view={채운view} />);

    expect(screen.queryByRole('button', { name: /주체|레벨/ })).toBeNull();
    expect(container.querySelector('[data-sort]')).toBeNull();
    // 「보기 3건」 같은 집계가 서면 레벨이 세는 축이 된다.
    expect(container.textContent ?? '').not.toMatch(/(보기|편집|관리)\s*\d+\s*건/);
  });
});

describe('IR-AUDIT-004 — 서버가 준 값을 그대로 그린다', () => {
  it('AC-5: 이름이 풀리지 않아 식별자가 온 주체도 그대로 보인다', async () => {
    // 서버가 이름을 풀지 못하면 식별자를 보낸다. 화면이 그것을 감추면
    // 「받은 사람이 있었다」는 사실 자체가 사라진다.
    render(<AuditLogPanel view={view([행('a1', { subject: 'grp-9f2c', level: 'view' })])} />);
    await 펼친다();

    expect(screen.getByTestId('audit-subject').textContent).toContain('grp-9f2c');
  });

  it('낱행이 여럿이면 각 줄이 자기 주체를 갖는다', async () => {
    render(
      <AuditLogPanel
        view={view([
          행('a1', { subject: '한범', level: 'view' }),
          행('a2', { subject: '도윤', level: 'admin' }),
        ])}
      />,
    );
    await 펼친다();

    const 줄 = screen.getAllByTestId('audit-row');
    expect(within(줄[0]!).getByTestId('audit-subject').textContent).toContain('한범');
    expect(within(줄[1]!).getByTestId('audit-subject').textContent).toContain('도윤');
  });
});
