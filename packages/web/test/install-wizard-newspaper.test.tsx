import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstallWizard } from '../src/auth/InstallWizard.js';
import { ApiError } from '../src/api/client.js';
import { PreAuthScreen } from '../src/auth/PreAuthScreen.js';
import { ConfirmGate } from '../src/confirm/ConfirmGate.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const next = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '다음' }));
};

const reachAccount = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('설치 토큰', { selector: 'input' }), 'token-value');
  await next(user);
  await screen.findByRole('heading', { name: '최초 슈퍼유저 계정' });
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};

const reachPolicy = async (user: ReturnType<typeof userEvent.setup>) => {
  await reachAccount(user);
  await user.type(screen.getByLabelText('슈퍼유저 이름'), '아주 긴 한글 설치 관리자 이름');
  await user.type(screen.getByLabelText('비밀번호'), 'secret-value');
  await user.type(screen.getByLabelText('비밀번호 확인'), 'secret-value');
  await next(user);
  await screen.findByRole('heading', { name: '초기 정책' });
};

describe('IR-SHELL-009 AC-4 — 설치 마법사는 지정된 다섯 단계를 보존한다', () => {
  it('L2 커밋 pending 동안 맞춤 상태를 보이고 취소와 dismiss를 막는다', async () => {
    const pending = deferred<void>();
    const cancel = vi.fn();
    render(
      <ConfirmGate
        open
        grade="L2"
        title="설치 확인"
        confirmLabel="설치하고 부여"
        pendingLabel="설치 중…"
        onConfirm={() => pending.promise}
        onCancel={cancel}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설치하고 부여' }));

    expect(screen.getByRole('button', { name: '설치 중…' })).toBeDefined();
    expect((screen.getByRole('button', { name: '취소' }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    fireEvent.pointerDown(document.querySelector('[data-slot="alert-dialog-overlay"]')!);
    expect(cancel).not.toHaveBeenCalled();

    await act(async () => { pending.resolve(); await pending.promise; });
  });
  it('토큰 검증 뒤 계정→정책→검토로 진행하고 커밋 성공 뒤 완료에서만 시작한다', async () => {
    const verify = vi.fn().mockResolvedValue('session-1');
    const commit = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn();
    render(<InstallWizard onVerifyToken={verify} onCommit={commit} onStart={start} />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: '설치 토큰' })).toBeDefined();
    expect(screen.getByText('1/4')).toBeDefined();
    await user.type(screen.getByLabelText('설치 토큰', { selector: 'input' }), 'token-value');
    await next(user);
    expect(verify).toHaveBeenCalledWith('token-value');

    await user.type(await screen.findByLabelText('슈퍼유저 이름'), '설치자');
    expect(screen.getByText('2/4')).toBeDefined();
    await user.type(screen.getByLabelText('비밀번호'), 'secret-value');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'secret-value');
    await next(user);
    expect(await screen.findByRole('heading', { name: '초기 정책' })).toBeDefined();
    expect(screen.getByText('3/4')).toBeDefined();
    expect(screen.getByText('workspace')).toBeDefined();
    expect(commit).not.toHaveBeenCalled();

    await next(user);
    const reviewHeading = await screen.findByRole('heading', { name: '검토' });
    expect(screen.getByText('4/4')).toBeDefined();
    const review = reviewHeading.closest('section')!;
    expect(review.textContent).toContain('설치자');
    expect(review.textContent).toContain('승인 후 가입');
    expect(review.textContent).toContain('workspace');
    expect(review.textContent).toContain('편집');
    expect(review.textContent).toContain('로그인·API·MCP 경로가 열립니다');
    expect(screen.queryByText('secret-value')).toBeNull();
    expect(screen.queryByText('token-value')).toBeNull();

    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    expect(commit).not.toHaveBeenCalled();
    const gate = await screen.findByRole('alertdialog');
    expect(gate.textContent).toContain('workspace 를 만들고 권한을 부여합니다');
    expect(gate.textContent).toContain('설치가 즉시 실행되며 되돌릴 수 없습니다');
    expect(gate.textContent).toContain('이후 기본 그룹 사용자가 이 워크스페이스의 문서에 접근할 때 적용됩니다');
    expect(gate.textContent).toContain('관리자 설치자');
    expect(gate.textContent).toContain('default 그룹 초기 권한 편집');
    expect(gate.textContent).not.toMatch(/하위 노드|적용 대상|영향 \d+건/);
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
    expect(gate.textContent).not.toContain('지금은 아무 일도');
    await user.click(screen.getByRole('button', { name: '설치하고 부여' }));

    expect(await screen.findByRole('heading', { name: '완료' })).toBeDefined();
    expect(screen.getByText(/설치 토큰은 사용되어 더 이상 유효하지 않습니다/)).toBeDefined();
    expect(commit).toHaveBeenCalledWith({
      installSession: 'session-1',
      superuserName: '설치자',
      password: 'secret-value',
      workspaceName: 'workspace',
      defaultGroupLevel: 'edit',
      signupMode: 'approval',
    });
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '이전' })).toBeNull();
    await user.click(screen.getByRole('button', { name: '시작하기' }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('PreAuthScreen도 커밋 성공 뒤 완료를 유지하고 시작하기 전에는 이동하지 않는다', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    const start = vi.fn();
    render(
      <PreAuthScreen
        screen="install"
        onInstallVerify={vi.fn().mockResolvedValue('session-1')}
        onInstallCommit={commit}
        onInstallStart={start}
      />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('설치 토큰', { selector: 'input' }), 'token-value');
    await next(user);
    await user.type(await screen.findByLabelText('슈퍼유저 이름'), '설치자');
    await user.type(screen.getByLabelText('비밀번호'), 'secret-value');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'secret-value');
    await next(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));

    expect(await screen.findByRole('heading', { name: '완료' })).toBeDefined();
    expect(commit).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '시작하기' }));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('토큰 확인 중에는 busy 상태로 중복 요청을 막는다', async () => {
    const pending = deferred<string>();
    const verify = vi.fn(() => pending.promise);
    render(<InstallWizard onVerifyToken={verify} onCommit={vi.fn()} onStart={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('설치 토큰', { selector: 'input' }), 'token-value');
    const button = screen.getByRole('button', { name: '다음' });
    await user.dblClick(button);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(button.textContent).toContain('토큰 확인 중');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    pending.resolve('session-1');
    expect(await screen.findByRole('heading', { name: '최초 슈퍼유저 계정' })).toBeDefined();
  });

  it('토큰을 바꾸면 진행 중이던 응답을 버리고 새 토큰만 세션을 만든다', async () => {
    const oldAttempt = deferred<string>();
    const verify = vi.fn()
      .mockImplementationOnce(() => oldAttempt.promise)
      .mockResolvedValueOnce('new-session');
    const commit = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={verify} onCommit={commit} onStart={vi.fn()} />);
    const user = userEvent.setup();
    const token = screen.getByLabelText('설치 토큰', { selector: 'input' });
    await user.type(token, 'old-token');
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.clear(token);
    await user.type(token, 'new-token');
    await act(async () => {
      oldAttempt.resolve('old-session');
      await oldAttempt.promise;
    });
    expect(screen.getByRole('heading', { name: '설치 토큰' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByRole('heading', { name: '최초 슈퍼유저 계정' })).toBeDefined();
    expect(verify).toHaveBeenNthCalledWith(2, 'new-token');
    await user.type(screen.getByLabelText('슈퍼유저 이름'), '설치자');
    await user.type(screen.getByLabelText('비밀번호'), 'secret-value');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'secret-value');
    await next(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ installSession: 'new-session' }));
  });

  it.each([
    ['open', '자유 가입'],
    ['approval', '승인 후 가입'],
    ['invite-only', '슈퍼유저 직접 등록'],
  ])('가입 모드 %s를 그대로 커밋한다', async (mode, label) => {
    const commit = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    const signup = screen.getByLabelText('가입 모드') as HTMLSelectElement;
    expect([...signup.options].map(({ value }) => value)).toEqual(['open', 'approval', 'invite-only']);
    expect([...signup.options].find(({ value }) => value === mode)?.text).toBe(label);
    expect([...signup.options].map(({ value }) => value)).not.toContain('admin');
    await user.selectOptions(signup, mode);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ signupMode: mode }));
  });

  it.each(['none', 'view', 'edit'])('기본 그룹 권한 %s를 그대로 커밋한다', async (level) => {
    const commit = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    const permission = screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement;
    expect([...permission.options].map(({ value }) => value)).toEqual(['none', 'view', 'edit']);
    await user.selectOptions(permission, level);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ defaultGroupLevel: level }));
  });

  it('open+edit에서만 정책과 검토 양쪽에 권한 경고를 표시한다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={vi.fn()} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');
    expect(screen.getAllByTestId('grant-warning')).toHaveLength(1);
    await next(user);
    expect(screen.getAllByTestId('grant-warning')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'view');
    expect(screen.queryByTestId('grant-warning')).toBeNull();
    await next(user);
    expect(screen.queryByTestId('grant-warning')).toBeNull();
  });

  it.each([
    ['approval', 'edit'],
    ['invite-only', 'edit'],
  ])('%s+%s 조합에는 권한 경고를 표시하지 않는다', async (mode, level) => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={vi.fn()} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await user.selectOptions(screen.getByLabelText('가입 모드'), mode);
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), level);
    expect(screen.queryByTestId('grant-warning')).toBeNull();
    await next(user);
    expect(screen.queryByTestId('grant-warning')).toBeNull();
  });

  it.each([
    ['invalid', new ApiError(401), true, '올바르지 않습니다'],
    ['transport', new Error('offline'), false, '확인하지 못했습니다'],
    ['rate-limit', new ApiError(429), false, '요청이 많습니다'],
  ])('토큰 %s 실패는 구분된 안전 문구와 수동 재시도를 제공한다', async (_kind, error, invalid, message) => {
    const verify = vi.fn().mockRejectedValue(error);
    render(<InstallWizard onVerifyToken={verify} onCommit={vi.fn()} />);
    const user = userEvent.setup();
    const token = screen.getByLabelText('설치 토큰', { selector: 'input' });
    await user.type(token, 'token-value');
    await next(user);
    expect(await screen.findByText(new RegExp(message))).toBeDefined();
    expect(token.getAttribute('aria-invalid') === 'true').toBe(invalid);
    await act(async () => { await Promise.resolve(); });
    expect(verify).toHaveBeenCalledTimes(1);
    await next(user);
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it('2→1→2와 3→2→3과 4→3→4에서 입력값을 보존한다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={vi.fn()} onStart={vi.fn()} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'view');

    await user.click(screen.getByRole('button', { name: '이전' }));
    expect((screen.getByLabelText('슈퍼유저 이름') as HTMLInputElement).value).toBe('아주 긴 한글 설치 관리자 이름');
    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).value).toBe('secret-value');
    expect((screen.getByLabelText('비밀번호 확인') as HTMLInputElement).value).toBe('secret-value');
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect((screen.getByLabelText('설치 토큰', { selector: 'input' }) as HTMLInputElement).value).toBe('token-value');
    await next(user);
    await screen.findByRole('heading', { name: '최초 슈퍼유저 계정' });
    await next(user);
    expect((screen.getByLabelText('가입 모드') as HTMLSelectElement).value).toBe('open');
    expect((screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement).value).toBe('view');
    await next(user);
    await user.click(screen.getByRole('button', { name: '이전' }));
    expect((screen.getByLabelText('가입 모드') as HTMLSelectElement).value).toBe('open');
  });

  it('비밀번호 불일치는 단계 2에 머물고 커밋을 차단한다', async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} onStart={vi.fn()} />);
    const user = userEvent.setup();
    await reachAccount(user);
    await user.type(screen.getByLabelText('슈퍼유저 이름'), '설치자');
    await user.type(screen.getByLabelText('비밀번호'), 'one-password');
    await user.type(screen.getByLabelText('비밀번호 확인'), 'other-password');
    await next(user);

    expect(await screen.findByText('비밀번호가 일치하지 않습니다.')).toBeDefined();
    expect(screen.getByRole('heading', { name: '최초 슈퍼유저 계정' })).toBeDefined();
    expect(commit).not.toHaveBeenCalled();
  });

  it('검토 취소는 값을 보존하고 설치 완료로 초점을 복원하며 진행 중 중복 커밋을 막는다', async () => {
    let resolveCommit!: () => void;
    const commit = vi.fn(() => new Promise<void>((resolve) => { resolveCommit = resolve; }));
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} onStart={vi.fn()} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await next(user);
    const open = screen.getByRole('button', { name: '설치 완료' });
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' })));
    await user.click(await screen.findByRole('button', { name: '취소' }));
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(screen.getByText('아주 긴 한글 설치 관리자 이름')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'none');
    await next(user);
    expect(screen.getByText('없음')).toBeDefined();
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    expect((await screen.findByRole('alertdialog')).textContent).toContain('default 그룹 초기 권한 없음');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(open));
    expect(screen.getByText('아주 긴 한글 설치 관리자 이름')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    const confirm = await screen.findByRole('button', { name: '설치하고 부여' });
    await user.dblClick(confirm);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect((screen.getByRole('button', { name: '취소' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: '설치 중…' })).toBeDefined();
    await user.keyboard('{Escape}');
    fireEvent.pointerDown(document.querySelector('[data-slot="alert-dialog-overlay"]')!);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(commit).toHaveBeenCalledTimes(1);
    resolveCommit();
    expect(await screen.findByRole('heading', { name: '완료' })).toBeDefined();
    expect(commit).toHaveBeenCalledWith(expect.objectContaining({ defaultGroupLevel: 'none' }));
  });

  it('세션 401은 값을 보존한 채 토큰 단계로, 그 밖의 실패는 검토 단계로 돌아간다', async () => {
    const commit = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new ApiError(401));
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} onStart={vi.fn()} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(await screen.findByRole('heading', { name: '검토' })).toBeDefined();
    expect(screen.getByRole('alert').textContent).toContain('설치를 마치지 못했습니다');

    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(await screen.findByRole('heading', { name: '설치 토큰' })).toBeDefined();
    await next(user);
    expect((await screen.findByLabelText('슈퍼유저 이름') as HTMLInputElement).value).toBe('아주 긴 한글 설치 관리자 이름');
  });

  it.each([
    ['already-installed', '이미 설치가 끝난 인스턴스입니다.'],
    ['commit-in-flight', '설치가 이미 진행 중입니다. 잠시 뒤 다시 확인하십시오.'],
    ['workspace-failed', '기본 워크스페이스를 만들지 못했습니다. 서버 로그를 확인하십시오.'],
    ['unknown-choice', '가입 모드나 초기 권한 값이 올바르지 않습니다.'],
    ['bad-field', '이름 · 비밀번호 · 워크스페이스 이름은 글자로 넣어 주십시오.'],
  ])('commit rule %s를 검토 단계의 안전 문구로 매핑한다', async (rule, message) => {
    const commit = vi.fn().mockRejectedValue(new ApiError(400, undefined, { rule }));
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.getByRole('heading', { name: '검토' })).toBeDefined();
  });

  it('empty-password는 비밀번호 필드로 돌아가 invalid 연결과 초점을 제공한다', async () => {
    const commit = vi.fn().mockRejectedValue(new ApiError(400, undefined, { rule: 'empty-password' }));
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('session-1')} onCommit={commit} />);
    const user = userEvent.setup();
    await reachPolicy(user);
    await next(user);
    await user.click(screen.getByRole('button', { name: '설치 완료' }));
    await user.click(await screen.findByRole('button', { name: '설치하고 부여' }));
    const password = await screen.findByLabelText('비밀번호');
    expect(password.getAttribute('aria-invalid')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(password));
  });
});
