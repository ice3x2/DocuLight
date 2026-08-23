import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BulkRevokePanel } from '../src/acl/BulkRevokePanel.js';
import type { PrincipalRow, RevocationRow } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const 사람 = (id: string, name: string): PrincipalRow => ({
  id,
  name,
  kind: 'user',
  status: 'active',
});

const 행 = (entryId: string): RevocationRow => ({
  entryId,
  workspaceId: 'ws1',
  workspaceName: '기획팀',
  path: '열린방/회의록.md',
  level: 'view',
  grantedBy: '설치자',
  grantedAt: '2026-08-20T01:02:03.000Z',
});

const 패널 = (over: Record<string, unknown> = {}) => {
  const 걷는다 = vi.fn();
  render(
    <BulkRevokePanel
      workspaceId="ws1"
      subjects={[사람('u1', '한범'), 사람('u2', '지원')]}
      revocation={{ scope: 'instance', rows: [행('e1'), 행('e2'), 행('e3')] }}
      onRevoke={걷는다}
      {...over}
    />,
  );
  return { 걷는다, user: userEvent.setup() };
};

describe('FR-CONFIRM-020 — 주체 다건 일괄 회수', () => {
  it('AC-1: 여러 주체를 함께 실을 수 있다', () => {
    패널();

    expect(screen.getByTestId('revocation-subjects').textContent ?? '').toContain('한범');
    expect(screen.getByTestId('revocation-subjects').textContent ?? '').toContain('지원');
  });

  it('AC-3: 시스템 그룹 안내는 주체마다 각각 선다', () => {
    패널({
      subjects: [
        { id: 'default', name: 'default', kind: 'group', status: 'active', system: true },
        { id: 'superuser', name: 'superuser', kind: 'group', status: 'active', system: true },
        사람('u1', '한범'),
      ],
    });

    // 묶음 하나로 접으면 어느 주체가 시스템 그룹인지 알 수 없다.
    expect(screen.getAllByTestId('system-group-notice')).toHaveLength(2);
  });

  it('AC-4: 임의 노드를 다중 선택해 회수하는 자리가 없다', () => {
    패널();

    // 이 화면의 축은 **주체**다. 노드 축 선택칸이 서면 그 자체로 다른
    // 조작이 되고, 요구가 명시적으로 제공하지 않기로 한 것이다.
    expect(screen.queryByLabelText(/노드 선택/)).toBeNull();
    expect(screen.queryByRole('table', { name: /노드/ })).toBeNull();
  });
});

describe('FR-CONFIRM-021 · FR-CONFIRM-022 — 묶음 확인 1회와 건수 토큰', () => {
  it('FR-CONFIRM-021 AC-1 · AC-2: 주체가 몇이든 확인은 한 번이다', async () => {
    const { user } = 패널();

    await user.click(screen.getByRole('button', { name: /회수/ }));

    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  });

  it('FR-CONFIRM-022 AC-1 · AC-3: 토큰이 항목 수 그대로이고 분모가 없다', async () => {
    const { user } = 패널();

    await user.click(screen.getByRole('button', { name: /회수/ }));

    const gate = screen.getByRole('alertdialog');
    expect(gate.getAttribute('data-grade')).toBe('L3');
    expect(within(gate).getByLabelText(/3 를 입력/)).toBeDefined();
    expect(gate.textContent ?? '').not.toContain('3 /');
  });

  it('FR-CONFIRM-022 AC-2: 주체 수와 항목 수가 함께 선다', async () => {
    const { user } = 패널();

    await user.click(screen.getByRole('button', { name: /회수/ }));

    const text = screen.getByRole('alertdialog').textContent ?? '';
    expect(text).toContain('주체 2');
    expect(text).toContain('항목 3');
  });

  it('토큰을 쳐야 실행된다', async () => {
    const { user, 걷는다 } = 패널();

    await user.click(screen.getByRole('button', { name: /회수/ }));
    const gate = screen.getByRole('alertdialog');
    expect((within(gate).getByRole('button', { name: '실행' }) as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(gate).getByLabelText(/3 를 입력/), '3');
    await user.click(within(gate).getByRole('button', { name: '실행' }));

    expect(걷는다).toHaveBeenCalledWith(['u1', 'u2']);
  });

  it('FR-CONFIRM-022 AC-5: 영향 건수가 0 이면 강등이 아니라 차단이다', () => {
    패널({ revocation: { scope: 'instance', rows: [] } });

    // `L2` 로 내려가 「확인만 하고 아무 일도 안 일어나는」 경로가 생기면
    // 그 무해한 통과가 곧 0 건이라는 신호다.
    expect((screen.getByRole('button', { name: /회수/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('FR-CONFIRM-022 AC-6: 일부만 0 건인 선택은 총합으로 판정한다', async () => {
    // 주체 셋 중 둘이 0 건이어도 총합 1 이면 실행할 수 있다 — 주체별로
    // 판정하면 0 건인 주체가 조용히 빠지고 그 사실이 신호가 된다.
    const { user } = 패널({
      subjects: [사람('u1', '한범'), 사람('u2', '지원'), 사람('u3', '민수')],
      revocation: { scope: 'instance', rows: [행('e1')] },
    });

    await user.click(screen.getByRole('button', { name: /회수/ }));

    expect(within(screen.getByRole('alertdialog')).getByLabelText(/1 를 입력/)).toBeDefined();
  });
});
