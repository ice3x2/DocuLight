import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstallWizard } from '../src/auth/InstallWizard.js';
import { App } from '../src/App.js';
import { ApiError } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  // 전역 스텁을 되돌린다 — 안 되돌리면 뒤따르는 시험으로 새고, 그 새는
  // 것이 시험 순서에 따라 원인 불명으로 나타난다.
  vi.unstubAllGlobals();
});

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
    render(<InstallWizard onVerifyToken={vi.fn()} onCommit={vi.fn()} />);

    const 선택 = screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement;

    expect([...선택.options].map((one) => one.value)).toEqual(['none', 'view', 'edit']);
  });

  it('AC-2: 기본값이 편집이다', () => {
    render(<InstallWizard onVerifyToken={vi.fn()} onCommit={vi.fn()} />);

    // 기본값의 정본은 도메인(`DEFAULT_GROUP_LEVEL`)이고 화면은 그것을
    // 따른다 — 화면이 자기 값을 들면 둘이 갈리고 아무도 눈치채지 못한다.
    expect((screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement).value).toBe('edit');
  });

  it('AC-4: 자유 가입 + 편집 조합에 경고가 붙는다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn()} onCommit={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');

    expect(screen.getAllByTestId('grant-warning')).toHaveLength(1);
  });

  it('AC-4: 보기로 낮추면 그 경고가 사라진다 — 조합이 아니라 값 하나로 뜨면 안 된다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn()} onCommit={vi.fn()} />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText('가입 모드'), 'open');
    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'view');

    expect(screen.queryAllByTestId('grant-warning')).toHaveLength(0);
  });
});

describe('SEC-AUTH-012 — 토큰 입력 자리가 있고 오타 뒤에도 다시 시도할 수 있다', () => {
  it('AC-3 · AC-4: 거절 사유를 보이고 두 번째 시도가 실제로 나간다', async () => {
    // **`disabled` 를 재지 않는다.** 이 부품은 어디에도 그 속성을 걸지
    // 않으므로 그 단언은 구성상 참이라 절대 실패하지 못한다 — 거절 처리를
    // 통째로 지워도 통과한다. 재야 하는 것은 관측 가능한 둘이다:
    // 사유가 뜨는가, 그리고 다시 칠 수 있는가.
    const 검증 = vi.fn().mockRejectedValueOnce(new Error('bad-token')).mockResolvedValue('세션-2');
    render(<InstallWizard onVerifyToken={검증} onCommit={vi.fn()} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    // 문단이 조용히 붙으면 스크린리더 사용자는 버튼이 죽었다고 읽는다.
    expect((await screen.findByRole('alert')).textContent).toMatch(/토큰/);
    expect(screen.getByLabelText('설치 토큰').getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    // 오타 한 번에 서버를 재기동해야 하는 상태가 되면 안 된다.
    await user.click(screen.getByRole('button', { name: '설치' }));

    expect(검증).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('alertdialog')).toBeDefined();
  });

  it('비밀번호 칸이 가려진다', () => {
    render(<InstallWizard onVerifyToken={vi.fn()} onCommit={vi.fn()} />);

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
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('s')} onCommit={vi.fn()} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    const 요약 = (await screen.findByTestId('install-summary')).textContent ?? '';

    expect(요약).toContain('설치자');
    expect(요약).toContain('편집');
  });

  it('AC-4 · AC-5: 적용 하위 노드 수를 싣지 않고 지연 효과를 고지한다', async () => {
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('s')} onCommit={vi.fn()} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));

    const 관문 = (await screen.findByRole('alertdialog')).textContent ?? '';

    // 갓 만든 워크스페이스에는 하위가 없어 그 수치가 뜻 없는 자리에 서고,
    // 사용자는 0 을 실패로 읽는다.
    expect(관문).not.toMatch(/하위 노드|적용 대상|\d+\s*건/);

    // **지연 효과 고지가 붙으면 안 된다** — 설치는 즉시·비가역이라 그
    // 문구가 거짓이 된다. 대신 그 사실을 그대로 말한다.
    expect(관문).not.toMatch(/지금은 아무 일도/);
    expect(screen.getByTestId('install-immediate').textContent).toMatch(/되돌릴 수 없/);
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

describe('SEC-AUTH-010 AC-1 — 설치 전 인스턴스가 설치 화면에 닿는다', () => {
  /** 세션 조회가 관문의 503 을 받는 상태. 설치 전 새 인스턴스가 그것이다. */
  const 응답 = (body: unknown, status: number) =>
    vi.stubGlobal(
      'fetch',
      // **매번 새 인스턴스를 낸다.** 같은 Response 를 재사용하면 두 번째
      // `.json()` 이 「body already read」로 죽고 그것이 조용히 삼켜진다.
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );

  const 설치전 = () => 응답({ state: 'uninstalled' }, 503);

  it('503 은 로딩이 아니라 설치 화면으로 간다', async () => {
    설치전();
    render(<App />);

    // 401 만 보면 새 인스턴스가 영원히 로딩 상태에 머물고, 설치 화면에
    // 닿는 길이 아예 없다 — 그러면 아무도 로그인할 수 없다.
    const 화면 = await screen.findByRole('main');

    expect(화면.getAttribute('data-pre-auth')).toBe('install');
  });

  it('그 화면에 마법사가 실제로 서 있다', async () => {
    설치전();
    render(<App />);

    expect(await screen.findByLabelText('설치 토큰')).toBeDefined();
  });

  it('표식 없는 503 은 설치 화면이 아니다 — 잠깐 죽은 서버가 초기화로 읽히면 안 된다', async () => {
    응답({}, 503);
    render(<App />);

    // 리버스 프록시·드레이닝·과부하가 내는 503 이다. 그때 설치 화면을
    // 세우면 로그인한 사용자에게 슈퍼유저 생성 폼이 뜬다.
    expect(await screen.findByText((_, el) => el?.getAttribute('data-state') === 'loading')).toBeDefined();
    expect(screen.queryByLabelText('설치 토큰')).toBeNull();
  });
});

describe('커밋 실패가 화면에 나온다 — 되돌릴 수 없어 보이는 조작에서 침묵이 가장 나쁘다', () => {
  const 실패로설치 = async (error: unknown) => {
    const 커밋 = vi.fn().mockRejectedValue(error);
    render(<InstallWizard onVerifyToken={vi.fn().mockResolvedValue('s')} onCommit={커밋} />);
    const user = userEvent.setup();

    await 채운다(user);
    await user.click(screen.getByRole('button', { name: '설치' }));
    await user.click(await screen.findByRole('button', { name: '실행' }));

    return (await screen.findByRole('alert')).textContent ?? '';
  };

  it('사유를 아는 거절은 그 사유대로 안내한다', async () => {
    // 서버가 정보 노출을 감수하고 `rule` 을 내주기로 한 자리다. 화면이
    // 그것을 버리면 서로 다른 실패가 한 문장으로 접혀 그 결정이 헛돈다.
    //
    // **이 시험이 재는 것은 사전뿐이다** — 전선 값 `empty-password` 를
    // 문구로 옮기는 대응 관계 하나다. 서버가 정말 그 문자열을 내는지는
    // 여기서 재지 못한다. 두 꾸러미가 서로를 import 하지 않아 이름이
    // 바뀌어도 컴파일이 막지 않으므로, 생산하는 쪽은 서버의
    // `test/http/install-routes.test.ts` 가 따로 못박는다.
    expect(await 실패로설치(new ApiError(400, undefined, { rule: 'empty-password' }))).toMatch(
      /비밀번호/,
    );
  });

  it('커밋 실패는 설치 토큰 칸을 invalid 로 표시하지 않는다 — 맞게 넣은 값을 다시 치게 된다', async () => {
    await 실패로설치(new ApiError(400, undefined, { rule: 'empty-password' }));

    // 문구는 「비밀번호를 입력하십시오」인데 보조기술에는 토큰 칸이
    // 틀렸다고 통보되던 자리다. 화면 문구와 표식이 서로 다른 칸을 가리키면
    // 스크린리더 사용자는 표식을 믿는다.
    expect(screen.getByLabelText('설치 토큰').getAttribute('aria-invalid')).not.toBe('true');
    expect(screen.getByLabelText('비밀번호').getAttribute('aria-invalid')).toBe('true');
  });

  it('타입이 틀린 칸은 그 칸을 지목한다 — 열거 문구를 답하면 맞는 칸을 고치게 된다', async () => {
    expect(await 실패로설치(new ApiError(400, undefined, { rule: 'bad-field' }))).toMatch(
      /이름|비밀번호|워크스페이스/,
    );
  });

  it('진행 중 커밋의 패자에게 「이미 설치됨」을 보이지 않는다 — 그러면 창을 닫는다', async () => {
    const 문구 = await 실패로설치(new ApiError(409, undefined, { rule: 'commit-in-flight' }));

    expect(문구).toMatch(/진행|잠시/);
    expect(문구).not.toMatch(/이미 설치/);
  });

  it('모르는 사유는 일반 문구로 떨어진다 — 사전에 없다고 침묵하지 않는다', async () => {
    expect(await 실패로설치(new Error('네트워크'))).toMatch(/설치를 마치지 못했/);
  });
});
