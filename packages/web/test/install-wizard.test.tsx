import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstallWizard } from '../src/auth/InstallWizard.js';

afterEach(cleanup);

/**
 * 설치 마법사 (`SEC-AUTH-012` · `SEC-AUTH-015` · `SEC-AUTH-017` ·
 * `FR-CONFIRM-019` AC-6).
 *
 * 이 화면이 없으면 새 인스턴스에서 최초 슈퍼유저를 만들 수 없다 — 콘솔에
 * 나온 토큰을 넣을 자리가 없기 때문이다.
 */

const 채운다 = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText('설치 토큰'), 'token-value');
  await user.type(screen.getByLabelText('슈퍼유저 이름'), '설치자');
  await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(10));
  await user.type(screen.getByLabelText('기본 워크스페이스 이름'), '기본');
};

describe('SEC-AUTH-017 — 초기 권한을 마법사에서 고른다', () => {
  it('AC-1: 없음 · 보기 · 편집 셋을 고를 수 있다', () => {
    render(<InstallWizard />);

    const 선택 = screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement;

    expect([...선택.options].map((one) => one.value)).toEqual(['none', 'view', 'edit']);
  });

  it('AC-2: 기본값이 편집이다', () => {
    render(<InstallWizard />);

    // 기본값의 정본은 도메인(`DEFAULT_GROUP_LEVEL`)이고 화면은 그것을
    // 따른다 — 화면이 자기 값을 들면 둘이 갈리고 아무도 눈치채지 못한다.
    expect((screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement).value).toBe('edit');
  });

  it('AC-4: 자유 가입 + 편집 조합에 경고가 붙는다', async () => {
    render(<InstallWizard />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');

    expect(screen.getAllByTestId('grant-warning')).toHaveLength(1);
  });

  it('AC-4: 보기로 낮추면 그 경고가 사라진다 — 조합이 아니라 값 하나로 뜨면 안 된다', async () => {
    render(<InstallWizard />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'view');

    expect(screen.queryAllByTestId('grant-warning')).toHaveLength(0);
  });
});

describe('SEC-AUTH-012 — 토큰 입력 자리가 있고 오타 뒤에도 다시 시도할 수 있다', () => {
  it('AC-3 · AC-4: 검증이 거절해도 화면이 잠기지 않는다', async () => {
    const 검증 = vi.fn().mockRejectedValueOnce(new Error('bad-token'));
    render(<InstallWizard onVerifyToken={검증} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    // 거절 뒤에도 토큰 칸이 그대로 있고 버튼이 살아 있어야 다시 칠 수 있다.
    expect((screen.getByLabelText('설치 토큰') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: '설치' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('비밀번호 칸이 가려진다', () => {
    render(<InstallWizard />);

    expect((screen.getByLabelText('비밀번호') as HTMLInputElement).type).toBe('password');
  });
});

describe('FR-CONFIRM-019 AC-6 — 설치의 초기 권한도 확인 다이얼로그를 받는다', () => {
  it('제출만으로는 설치가 실행되지 않는다', async () => {
    const 검증 = vi.fn().mockResolvedValue('session-1');
    const 커밋 = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={검증} onCommit={커밋} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    // 제출 버튼은 관문이 아니다 (`FR-CONFIRM-005`) — 그것을 관문으로 치면
    // 규칙 전체가 무력화된다.
    expect(커밋).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toBeDefined();
  });

  it('AC-2 와 같은 규칙 — 관리자와 초기 권한이 한 관문에 함께 실린다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('s')} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    const 요약 = (await screen.findByTestId('install-summary')).textContent ?? '';

    expect(요약).toContain('설치자');
    expect(요약).toContain('편집');
  });

  it('AC-4 · AC-5: 적용 하위 노드 수를 싣지 않고 지연 효과를 고지한다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('s')} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    const 관문 = (await screen.findByRole('alertdialog')).textContent ?? '';

    // 갓 만든 워크스페이스에는 하위가 없어 그 수치가 뜻 없는 자리에 서고,
    // 사용자는 0 을 실패로 읽는다.
    expect(관문).not.toMatch(/하위 노드|적용 대상|\d+\s*건/);
    expect(관문).toMatch(/지금은|아직|나중/);
  });

  it('확인을 누르면 그때 커밋이 나간다', async () => {
    const 커밋 = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('세션-1')} onCommit={커밋} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));
    await user.click(await screen.findByRole('button', { name: '실행' }));

    expect(커밋).toHaveBeenCalledTimes(1);
  });
});

describe('SEC-AUTH-015 — 설치 세션이 커밋 요청에 실린다', () => {
  it('AC-2 · AC-4: 토큰 검증이 준 세션을 그대로 싣는다 — 화면이 지어내지 않는다', async () => {
    const 커밋 = vi.fn().mockResolvedValue(undefined);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('세션-1')} onCommit={커밋} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));
    await user.click(await screen.findByRole('button', { name: '실행' }));

    expect(커밋).toHaveBeenCalledWith(
      expect.objectContaining({
        installSession: '세션-1',
        superuserName: '설치자',
        workspaceName: '기본',
        defaultGroupLevel: 'edit',
      }),
    );
  });

  it('토큰 검증이 거절하면 커밋을 부르지 않는다', async () => {
    const 커밋 = vi.fn();
    render(
      <InstallWizard
        onVerifyToken={vi.fn().mockRejectedValue(new Error('bad-token'))}
        onCommit={커밋}
      />,
    );
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    expect(커밋).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
