import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NewWorkspaceForm } from '../src/workspace/NewWorkspaceForm.js';
import { WorkspaceManagementPanel } from '../src/workspace/WorkspaceList.js';
import { ApiError, type PrincipalRow } from '../src/api/client.js';

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
const 제출한다 = async (over: Record<string, unknown> = {}, waitForDialog = true) => {
  serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
  const 만들었다 = vi.fn();
  const 경고를받았다 = vi.fn().mockResolvedValue([]);
  render(<NewWorkspaceForm onCreate={만들었다} onLoadWarnings={경고를받았다} {...over} />);

  const user = userEvent.setup();
  await user.type(screen.getByLabelText('이름 (필수)'), '기획팀');
  await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
  await user.click(await screen.findByText('한범'));
  await user.click(screen.getByRole('button', { name: '만들기' }));
  if (waitForDialog) await screen.findByRole('alertdialog');
  return { user, 만들었다, 경고를받았다 };
};

describe('FR-CONFIRM-019 — 워크스페이스 생성 시점의 부여도 확인 1개를 받는다', () => {
  it('IR-WORKSPACE-001: 목록에서 명시적으로 진입하고 취소하면 목록·선택·스크롤·진입 초점을 복원한다', async () => {
    serving([]);
    render(<div data-settings-content=""><WorkspaceManagementPanel mode="all" selectedId="w1"
      query={{ state: 'ready', rows: [{ id: 'w1', name: '기존 공간', adminless: false }] }}
      onSelect={vi.fn()} onCreate={vi.fn()} onLoadCreationWarnings={vi.fn().mockResolvedValue([])} /></div>);
    const user = userEvent.setup();
    const content = document.querySelector<HTMLElement>('[data-settings-content]')!;
    content.scrollTop = 93;
    const entry = screen.getByRole('button', { name: '새 워크스페이스' });

    await user.click(entry);
    expect(screen.queryByRole('list', { name: '전체 워크스페이스' })).toBeNull();
    expect(screen.getByRole('form', { name: '새 워크스페이스' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '전체 워크스페이스로 돌아가기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
    content.scrollTop = 0;
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('list', { name: '전체 워크스페이스' })).toBeTruthy();
    expect(within(screen.getByRole('list', { name: '전체 워크스페이스' })).getByText('기존 공간').closest('[aria-current]')?.getAttribute('aria-current')).toBe('true');
    expect(content.scrollTop).toBe(93);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '새 워크스페이스' }));
  });

  it('IR-WORKSPACE-001: 관리자 검색은 실제 시스템 슈퍼유저 그룹 범위를 사용한다', async () => {
    serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
    render(<NewWorkspaceForm onCreate={vi.fn()} onLoadWarnings={vi.fn().mockResolvedValue([])} />);

    await userEvent.setup().type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const requestUrl = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]);
    expect(new URL(requestUrl, 'http://localhost').searchParams.get('for')).toBe('group:system-superuser');
  });

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

    만들었다.mockResolvedValue({ workspace: { id: 'workspace-new', name: '기획팀', createdAt: '2026-09-18' } });

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
    render(<NewWorkspaceForm onCreate={만들었다} onLoadWarnings={vi.fn().mockResolvedValue(['open-signup-edit'])} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('이름 (필수)'), '기획팀');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
    await user.click(await screen.findByText('한범'));
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'edit');
    await user.click(screen.getByRole('button', { name: '만들기' }));

    await screen.findByRole('alertdialog');

    // 경고는 그 하나 안에 실린다 — 확인을 둘 세우면 AC-2 가 깨진다.
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(screen.getByRole('alertdialog').textContent ?? '').toContain('가입');
  });

  it('IR-WORKSPACE-001 AC-6: NFC·끝 공백·코드포인트 경계와 제어문자를 검증하고 invalid 초안을 보존한다', async () => {
    serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
    const onCreate = vi.fn();
    const onLoadWarnings = vi.fn().mockResolvedValue([]);
    render(<NewWorkspaceForm onCreate={onCreate} onLoadWarnings={onLoadWarnings} />);
    const user = userEvent.setup();
    const name = screen.getByLabelText('이름 (필수)');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '한범');
    await user.click(await screen.findByText('한범'));

    fireEvent.change(name, { target: { value: '😀'.repeat(121) } });
    await user.click(screen.getByRole('button', { name: '만들기' }));
    expect(screen.getByRole('alert').textContent).toContain('120자');
    expect((name as HTMLInputElement).value).toBe('😀'.repeat(121));
    expect(onLoadWarnings).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();

    fireEvent.change(name, { target: { value: '  e\u0301quipe / CON  ' } });
    await user.click(screen.getByRole('button', { name: '만들기' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(screen.getByTestId('grant-summary').textContent).toContain('équipe / CON');
  });

  it('fresh warning 조회 실패는 POST를 막고 같은 읽기만 다시 시도한다', async () => {
    const onLoadWarnings = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([]);
    const onCreate = vi.fn();
    const { user } = await 제출한다({ onLoadWarnings, onCreate }, false);
    await waitFor(() => expect(onLoadWarnings).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('확인 정보를 불러오지 못했습니다');

    await user.click(screen.getByRole('button', { name: '확인 정보 다시 불러오기' }));
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
    expect(onLoadWarnings).toHaveBeenCalledTimes(2);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('이전 tuple의 늦은 warning 응답과 재시도는 현재 tuple의 확인을 열지 않는다', async () => {
    let resolveOld!: (warnings: readonly []) => void;
    const old = new Promise<readonly []>((resolve) => { resolveOld = resolve; });
    const onLoadWarnings = vi.fn().mockReturnValueOnce(old);
    const { user } = await 제출한다({ onLoadWarnings }, false);
    await waitFor(() => expect(onLoadWarnings).toHaveBeenCalledOnce());

    await user.clear(screen.getByLabelText('이름 (필수)'));
    await user.type(screen.getByLabelText('이름 (필수)'), '바뀐 공간');
    resolveOld([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('button', { name: '확인 정보 다시 불러오기' })).toBeNull();
  });

  it('fresh warning을 기다리는 동안 loading 상태를 알리고 중복 제출을 막는다', async () => {
    let finish!: (warnings: readonly []) => void;
    const onLoadWarnings = vi.fn(() => new Promise<readonly []>((resolve) => { finish = resolve; }));
    const { user } = await 제출한다({ onLoadWarnings }, false);

    expect(screen.getByRole('status').textContent).toBe('권한 부여 내용을 확인하는 중입니다');
    expect((screen.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '취소' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '전체 워크스페이스로 돌아가기' }) as HTMLButtonElement).disabled).toBe(false);
    finish([]);
    expect(await screen.findByRole('alertdialog')).toBeTruthy();
  });

  it('L2 취소는 frozen 요약의 readonly 의미와 이름 caret 선택 범위를 보존한다', async () => {
    serving([{ id: 'u1', name: '서버팀', kind: 'user', status: 'active' }]);
    render(<NewWorkspaceForm onCreate={vi.fn()} onLoadWarnings={vi.fn().mockResolvedValue([])} />);
    const user = userEvent.setup();
    const name = screen.getByLabelText('이름 (필수)') as HTMLInputElement;
    await user.type(name, '긴 워크스페이스 이름');
    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '서버팀');
    await user.click(await screen.findByText('서버팀'));
    name.setSelectionRange(2, 5);
    await user.click(screen.getByRole('button', { name: '만들기' }));
    const gate = await screen.findByRole('alertdialog');
    const summary = screen.getByTestId('grant-summary');
    expect(summary.getAttribute('aria-readonly')).toBe('true');
    expect(summary.getAttribute('aria-label')).toBe('확정된 워크스페이스 생성 내용');

    await user.click(within(gate).getByRole('button', { name: '취소' }));
    expect([name.selectionStart, name.selectionEnd]).toEqual([2, 5]);
  });

  it('picker의 필드 이름과 선택된 pending 상태, 없음의 효과를 설명한다', async () => {
    serving([{ id: 'u1', name: '대기 관리자', kind: 'user', status: 'pending' }]);
    render(<NewWorkspaceForm onCreate={vi.fn()} onLoadWarnings={vi.fn().mockResolvedValue([])} />);
    const user = userEvent.setup();

    await user.type(screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' }), '대기');
    await user.click(await screen.findByText('대기 관리자'));

    expect(screen.getByText(/대기 관리자.*사용자.*대기/)).toBeTruthy();
    expect(screen.getByText(/없음을 선택하면 기본 그룹 ACL을 만들지 않습니다/)).toBeTruthy();
  });

  it('세 필드의 필수 의미와 loading 도움말을 접근 가능한 설명으로 연결한다', () => {
    render(<NewWorkspaceForm onCreate={vi.fn()} onLoadWarnings={vi.fn().mockResolvedValue([])} />);
    const name = screen.getByRole('textbox', { name: '이름 (필수)' });
    const administrator = screen.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' });
    expect(name).toHaveProperty('required', true);
    expect(administrator.getAttribute('aria-required')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBeTruthy();
    expect(administrator.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(/지정 관리자와 슈퍼유저는 계속 접근/)).toBeTruthy();
  });

  it('unknown-administrator는 선택을 해제하고 다시 선택하도록 설명한다', async () => {
    const onCreate = vi.fn().mockRejectedValue(new ApiError(400, undefined, { rule: 'unknown-administrator' }));
    const { user } = await 제출한다({ onCreate });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(await screen.findByText(/관리자를 다시 선택/)).toBeTruthy();
    expect(screen.queryByText(/한범.*사용자/)).toBeNull();
    expect((screen.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('열 때와 실행할 때 경고를 다시 읽고 바뀌면 새 활성화를 요구한다', async () => {
    const onLoadWarnings = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['suspended-subject'])
      .mockResolvedValueOnce(['suspended-subject']);
    const onCreate = vi.fn().mockResolvedValue({ workspace: { id: 'w1', name: '기획팀', createdAt: '2026-09-18' } });
    const { user } = await 제출한다({ onLoadWarnings, onCreate });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(await screen.findByText(/확인 정보가 바뀌었습니다/)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
  });

  it('실행 직전 warning 재조회 실패도 POST 없이 읽기 재시도만 제공한다', async () => {
    const onLoadWarnings = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network'));
    const onCreate = vi.fn();
    const { user } = await 제출한다({ onLoadWarnings, onCreate });

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(await screen.findByText(/생성 요청은 보내지 않았습니다/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '확인 정보 다시 불러오기' })).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('응답을 잃은 생성 tuple은 값을 바꿀 때까지 다시 보내지 않는다', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('lost response'));
    const { user } = await 제출한다({ onCreate });
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(await screen.findByText(/전체 워크스페이스 목록을 확인/)).toBeTruthy();
    expect((screen.getByRole('button', { name: '만들기' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('pending 동안 빠른 click과 Enter가 하나의 생성만 보낸다', async () => {
    let finish!: (value: { workspace: { id: string; name: string; createdAt: string } }) => void;
    const onCreate = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const { user } = await 제출한다({ onCreate });
    const execute = within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' });
    await user.dblClick(execute);
    fireEvent.keyDown(execute, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalledOnce();
    finish({ workspace: { id: 'w1', name: '기획팀', createdAt: '2026-09-18' } });
  });
});
