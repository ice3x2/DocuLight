import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewWorkspaceForm } from '../src/workspace/NewWorkspaceForm.js';
import type { PrincipalRow } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const serving = (rows: readonly PrincipalRow[]) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );

/** 이름을 채우고 관리자를 고른 뒤 제출까지 간다. */
const 제출한다 = async (over: Record<string, unknown> = {}) => {
  serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
  const 만들었다 = vi.fn();
  render(<NewWorkspaceForm onCreate={만들었다} {...over} />);

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('이름'), '기획팀');
  await user.type(screen.getByLabelText('사용자·그룹 검색'), '한범');
  await user.click(await screen.findByText('한범'));
  await user.click(screen.getByRole('button', { name: '만들기' }));
  return { user, 만들었다 };
};

describe('FR-CONFIRM-019 — 워크스페이스 생성 시점의 부여도 확인 1개를 받는다', () => {
  it('AC-1 · AC-3: 생성 버튼만으로는 부여가 실행되지 않는다', async () => {
    const { 만들었다 } = await 제출한다();

    expect(screen.getByRole('alertdialog')).toBeDefined();
    // 폼의 제출 버튼이 관문을 대신한다고 인정하면 규칙 전체가 무력화된다.
    expect(만들었다).not.toHaveBeenCalled();
  });

  it('AC-2: 관리자 지정과 기본 그룹 초기 권한이 한 다이얼로그에 함께 선다', async () => {
    const { user } = await 제출한다();

    // 확인은 **하나**다 — 둘로 나누면 사용자가 첫 확인만 읽고 둘째를
    // 기계적으로 넘긴다.
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    const gate = screen.getByRole('alertdialog');
    expect(gate.textContent ?? '').toContain('한범');
    expect(gate.textContent ?? '').toContain('없음');

    await user.click(within(gate).getByRole('button', { name: '실행' }));
  });

  it('AC-4: 적용 하위 노드 수가 표시되지 않는다', async () => {
    await 제출한다();

    const gate = screen.getByRole('alertdialog');
    // 갓 만든 워크스페이스에는 하위가 없다 — 0 을 그리면 그 수치가 뜻
    // 없는 자리에 서고, 사용자는 그것을 실패로 읽는다.
    expect(gate.querySelector('[data-testid="reached-count"]')).toBeNull();
    expect(gate.textContent ?? '').not.toContain('적용 하위 노드');
  });

  it('AC-5: 지연 효과 고지가 표시된다', async () => {
    await 제출한다();

    expect(screen.getByTestId('delayed-notice')).toBeDefined();
  });

  it('확인을 통과해야 생성된다', async () => {
    const { user, 만들었다 } = await 제출한다();

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(만들었다).toHaveBeenCalledWith({
      name: '기획팀',
      administratorId: 'u1',
      defaultGroupLevel: 'none',
    });
  });

  it('경고가 있어도 확인은 여전히 하나다', async () => {
    serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
    const 만들었다 = vi.fn();
    render(<NewWorkspaceForm signupMode="open" onCreate={만들었다} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('이름'), '기획팀');
    await user.type(screen.getByLabelText('사용자·그룹 검색'), '한범');
    await user.click(await screen.findByText('한범'));
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'edit');
    await user.click(screen.getByRole('button', { name: '만들기' }));

    // 경고는 그 하나 안에 실린다 — 확인을 둘 세우면 AC-2 가 깨진다.
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('alertdialog').textContent ?? '').toContain('가입');
  });
});
