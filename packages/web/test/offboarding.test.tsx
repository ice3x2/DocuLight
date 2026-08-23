import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('AC-3 · AC-4: 카드가 진행 상태를 자기 안에 들지 않는다', () => {
    const code = readFileSync(join(WEB, 'src', 'principal', 'OffboardingCard.tsx'), 'utf8');

    // `useState` 가 들어오는 순간 화면이 파생과 어긋난 자기 상태를 갖는다.
    expect(code).not.toContain('useState');
    expect(code).not.toContain('useReducer');
  });
});
