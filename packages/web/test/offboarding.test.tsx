import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OffboardingCard } from '../src/principal/OffboardingCard.js';
import type { OffboardingCardBody } from '../src/api/client.js';

afterEach(cleanup);

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 카드 = (over: Partial<OffboardingCardBody> = {}): OffboardingCardBody => ({
  principalId: 'u1',
  principalName: '떠나는이',
  steps: [
    { id: 'suspend', done: false },
    { id: 'tokens', done: false },
    { id: 'memberships', done: false },
    { id: 'acl', done: false, remaining: 3 },
  ],
  ...over,
});

describe('FR-PRINCIPAL-003 — 네 단계를 한 화면에서 안내한다', () => {
  it('AC-1: 네 단계가 순서대로 그려진다', () => {
    render(<OffboardingCard card={카드()} />);

    const 단계 = screen.getAllByTestId('offboarding-step').map((one) => one.textContent);

    expect(단계).toEqual(['계정 비활성화', '액세스 토큰 무효화', '그룹 멤버십 제거', '권한 일괄 회수']);
  });

  it('AC-7: 퇴사 처리 라는 말을 쓰지 않는다', () => {
    render(<OffboardingCard card={카드()} />);

    const 화면 = screen.getByRole('region', { name: '떠나는이 오프보딩' });

    expect(화면.textContent ?? '').not.toContain('퇴사');
  });

  it('AC-5: ACL 단계는 진입 버튼과 건수만 갖는다', async () => {
    const 보낸것: string[] = [];
    const user = userEvent.setup();
    render(<OffboardingCard card={카드()} onRevokeAll={(id) => 보낸것.push(id)} />);

    await user.click(screen.getByRole('button', { name: '권한 일괄 회수 (3건)' }));

    expect(보낸것).toEqual(['u1']);
  });

  it('AC-6: 카드가 영향 범위 표를 그리지 않는다', () => {
    render(<OffboardingCard card={카드()} />);

    // 워크스페이스·경로·레벨·부여자·부여 시각은 주체 일괄 회수 화면의
    // 것이다 — 여기 그리면 중복 구현이 된다.
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('AC-4: 이미 끝난 단계는 완료로 표시되고 그 버튼이 사라진다', () => {
    render(
      <OffboardingCard
        card={카드({
          steps: [
            { id: 'suspend', done: true },
            { id: 'tokens', done: true },
            { id: 'memberships', done: false },
            { id: 'acl', done: true, remaining: 0 },
          ],
        })}
      />,
    );

    const 단계 = screen.getAllByTestId('offboarding-step');

    expect(단계.map((one) => one.getAttribute('data-done'))).toEqual(['true', 'true', 'false', 'true']);
    expect(screen.queryByRole('button', { name: '계정 비활성화' })).toBeNull();
    expect(screen.getByTestId('offboarding-acl-done')).toBeDefined();
  });
});

describe('CON-PRINCIPAL-004 — 카드는 하나뿐이고 상태를 들지 않는다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  it('AC-1: 오프보딩 카드를 그리는 부품이 하나다', () => {
    // 낱말이 아니라 **그리는 자리**를 센다 — 「이 흐름은 오프보딩이다」를
    // 주석에 적은 파일까지 세면 규칙을 설명하는 것이 위반이 된다.
    const 그리는것 = sources(join(WEB, 'src'))
      .filter((file) => readFileSync(file, 'utf8').includes('offboarding-step'))
      .map((file) => file.slice(join(WEB, 'src').length + 1));

    expect(그리는것).toEqual([join('principal', 'OffboardingCard.tsx')]);
  });

  /**
   * 재는 것은 **완료 여부의 출처**다.
   *
   * 초판은 소스에 `useState` 가 없는지를 쟀는데, 그 판정식은 확인
   * 다이얼로그가 열렸는지 같은 **일시적 화면 상태**까지 함께 막는다 —
   * AC-3·AC-4 가 금지하는 것은 진행 상태의 보관이지 화면 상태가 아니다.
   * 겸해 그 판정식은 `let 완료 = ...` 로 진행 상태를 드는 구현을 그대로
   * 통과시킨다: 소스 문자열 검사는 재려는 것과 재는 것이 어긋나 있었다.
   */
  it('AC-4: 단계별 완료 여부가 오직 받은 값에서만 나온다', async () => {
    const 진행중 = {
      principalId: 'u1',
      principalName: '한범',
      steps: [
        { id: 'suspend' as const, done: false },
        { id: 'tokens' as const, done: false },
        { id: 'memberships' as const, done: false, groups: ['기획팀원'] },
        { id: 'acl' as const, done: false, remaining: 2 },
      ],
    };
    const { rerender } = render(<OffboardingCard card={진행중} />);
    const 완료표시 = () =>
      screen.getAllByTestId('offboarding-step').map((li) => li.getAttribute('data-done'));

    expect(완료표시()).toEqual(['false', 'false', 'false', 'false']);

    // 조작을 실제로 수행해도 새 값을 받기 전에는 아무것도 완료로 바뀌지
    // 않는다 — 바뀌면 화면이 서버와 어긋난 자기 진행 상태를 든 것이다.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(screen.getByRole('button', { name: /그룹 멤버십 제거/ }));

    // **확인이 열려 있는 동안에도** 아무것도 완료가 아니다 — 닫힌 뒤에만
    // 재면 열린 동안 완료로 그리는 구현이 통과한다.
    expect(완료표시()).toEqual(['false', 'false', 'false', 'false']);

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(완료표시()).toEqual(['false', 'false', 'false', 'false']);

    // 새 값이 오면 그대로 따라간다.
    rerender(
      <OffboardingCard
        card={{
          ...진행중,
          steps: 진행중.steps.map((step) =>
            step.id === 'suspend' ? { ...step, done: true } : step,
          ),
        }}
      />,
    );

    expect(완료표시()).toEqual(['true', 'false', 'false', 'false']);
  });

  it('AC-3: 진행 상태를 보관하는 저장 호출이 카드에 없다', () => {
    const code = readFileSync(join(WEB, 'src', 'principal', 'OffboardingCard.tsx'), 'utf8');

    // 서버에 진행을 적어 두는 경로가 있으면 그것이 곧 AC-3 이 금지한 칸이다.
    expect(code).not.toContain('localStorage');
    expect(code).not.toContain('sessionStorage');
    expect(code).not.toContain('fetch(');
  });
});

describe('FR-CONFIRM-009 · FR-CONFIRM-023 — 오프보딩의 확인 단계', () => {
  const 카드 = (over: Record<string, unknown> = {}) => ({
    principalId: 'u1',
    principalName: '한범',
    steps: [
      { id: 'suspend' as const, done: false },
      { id: 'tokens' as const, done: false },
      { id: 'memberships' as const, done: false, groups: ['기획팀원', '설계팀원'] },
      { id: 'acl' as const, done: false, remaining: 3 },
    ],
    ...over,
  });

  it('FR-CONFIRM-009 AC-1 · AC-2: 멤버십 제거는 확인을 받고 그룹 이름을 모두 나열한다', async () => {
    const 뺐다 = vi.fn();
    render(<OffboardingCard card={카드()} onRemoveMemberships={뺐다} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /그룹 멤버십 제거/ }));

    const gate = screen.getByRole('alertdialog');
    expect(gate.getAttribute('data-grade')).toBe('L2');
    expect(gate.textContent ?? '').toContain('기획팀원');
    expect(gate.textContent ?? '').toContain('설계팀원');
    expect(뺐다).not.toHaveBeenCalled();
  });

  it('확인을 통과해야 실행된다', async () => {
    const 뺐다 = vi.fn();
    render(<OffboardingCard card={카드()} onRemoveMemberships={뺐다} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /그룹 멤버십 제거/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(뺐다).toHaveBeenCalledWith('u1');
  });

  it('FR-CONFIRM-023 AC-1: 앞 세 단계를 여러 사람에게 한꺼번에 거는 자리가 없다', () => {
    render(<OffboardingCard card={카드()} />);

    // 카드는 **주체 하나**를 받는다 — 다건 선택칸이 서면 그 자체로 다른
    // 조작이 되고, 다건은 4단계에만 제공한다.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByLabelText(/여러 사용자|일괄 비활성화|일괄 멤버십/)).toBeNull();
  });

  it('FR-CONFIRM-023 AC-4: 2단계는 별도 조작도 확인도 갖지 않는다', () => {
    render(<OffboardingCard card={카드()} />);

    // 1단계의 자동 결과라 누를 것이 없다 — 버튼을 두면 사용자가 그것을
    // 눌러야 진행된다고 읽는다.
    expect(screen.queryByRole('button', { name: /액세스 토큰/ })).toBeNull();
  });

  it('이미 끝난 단계에는 실행 버튼이 없다', () => {
    render(
      <OffboardingCard
        card={카드({
          steps: [
            { id: 'suspend' as const, done: true },
            { id: 'tokens' as const, done: true },
            { id: 'memberships' as const, done: true, groups: [] },
            { id: 'acl' as const, done: true, remaining: 0 },
          ],
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /그룹 멤버십 제거/ })).toBeNull();
  });
});
