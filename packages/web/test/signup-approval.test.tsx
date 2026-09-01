import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SignupApproval } from '../src/principal/SignupApproval.js';
import { SETTINGS_CATEGORIES } from '../src/shell/shell-contract.js';

afterEach(cleanup);

/**
 * 가입 승인 화면 (`SEC-AUTH-004` · `FR-AUTH-002` · 설계서 `04` §2.10).
 *
 * **명부와 다른 화면이다.** 설계가 이것을 별도 카테고리로 두었고, 그 이유는
 * 조작이 동질적(승인 또는 거절 둘뿐)이고 대상이 대기 건수로 한정되기
 * 때문이다 — 사용자 관리 테이블과 같은 자리에 두면 그 구분이 사라진다.
 */
const 넷 = [
  { id: 'u1', name: '활성자', status: 'active' as const },
  { id: 'u2', name: '대기자', status: 'pending' as const },
  { id: 'u3', name: '정지자', status: 'suspended' as const },
  { id: 'u4', name: '거절자', status: 'rejected' as const },
];

const 행 = (이름: string) => screen.getByRole('row', { name: new RegExp(이름) });

describe('설계서 §2.10 — 가입 승인은 자기 카테고리를 갖는다', () => {
  it('그 카테고리가 계약에 있고 슈퍼유저 전용이다', () => {
    const 하나 = SETTINGS_CATEGORIES.find((one) => one.id === 'signup-approval');

    expect(하나?.label).toBe('가입 승인');
    expect(하나?.section).toBe('instance');
    expect(하나?.gate).toBe('superuser');
  });

  it('대기 중 · 거절됨 두 탭으로 갈린다', () => {
    render(<SignupApproval users={넷} />);

    // 한 목록에 뭉치면 지금 무엇을 해야 하는 건지 화면이 답하지 못한다.
    expect(screen.getByRole('tab', { name: /대기 중/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /거절됨/ })).toBeDefined();
  });

  it('탭 이름에 건수가 붙는다 (`R139-f`)', () => {
    render(<SignupApproval users={넷} />);

    expect(screen.getByRole('tab', { name: /대기 중/ }).textContent).toContain('1');
    expect(screen.getByRole('tab', { name: /거절됨/ }).textContent).toContain('1');
  });

  it('대기 중 탭에는 `pending` 만 선다', () => {
    render(<SignupApproval users={넷} />);

    expect(screen.getByRole('row', { name: /대기자/ })).toBeDefined();
    for (const 이름 of ['활성자', '정지자', '거절자']) {
      expect(screen.queryByRole('row', { name: new RegExp(이름) })).toBeNull();
    }
  });
});

describe('SEC-AUTH-004 — 승인과 거절', () => {
  it('승인하면 그 계정 id 가 밖으로 나간다', async () => {
    const 승인한것: string[] = [];
    render(<SignupApproval users={넷} onApprove={(id) => 승인한것.push(id)} />);

    await userEvent.setup().click(within(행('대기자')).getByRole('button', { name: '승인' }));

    expect(승인한것).toEqual(['u2']);
  });

  it('거절하면 상태 전환이 나간다', async () => {
    const 바꾼것: { id: string; status: string }[] = [];
    render(<SignupApproval users={넷} onStatus={(id, status) => 바꾼것.push({ id, status })} />);

    await userEvent.setup().click(within(행('대기자')).getByRole('button', { name: '거절' }));

    // 계정과 이력은 보존된다 — 삭제가 아니라 상태 전환이다 (`R60`).
    expect(바꾼것).toEqual([{ id: 'u2', status: 'rejected' }]);
  });

  it('조작을 넘기지 않으면 그 버튼이 서지 않는다 — 눌러도 아무 일이 없는 자리를 두지 않는다', () => {
    render(<SignupApproval users={넷} />);

    expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
    expect(screen.queryByRole('button', { name: '거절' })).toBeNull();
  });
});

describe('FR-AUTH-002 — 거절됨 탭에서 재심사한다', () => {
  const 거절됨탭으로 = async () => {
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /거절됨/ }));
    return user;
  };

  it('거절됨 탭에는 `rejected` 만 서고 재심사가 붙는다', async () => {
    const 되돌린것: string[] = [];
    render(<SignupApproval users={넷} onReopen={(id) => 되돌린것.push(id)} />);
    const user = await 거절됨탭으로();

    expect(screen.queryByRole('row', { name: /대기자/ })).toBeNull();
    await user.click(within(행('거절자')).getByRole('button', { name: '재심사' }));

    expect(되돌린것).toEqual(['u4']);
  });

  it('거절됨 탭에는 승인 버튼이 없다 — 그 상태에서 바로 승인하는 경로는 없다', async () => {
    render(<SignupApproval users={넷} onApprove={() => undefined} onReopen={() => undefined} />);
    await 거절됨탭으로();

    // `R60-b` 는 `rejected → pending → active` 를 정한다. 여기서 바로
    // 승인하면 거절 이력을 건너뛰고 그 사실이 아무 데도 남지 않는다.
    expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
  });
});

describe('설계서 §2.10 — 빈 상태는 원인을 설명한다', () => {
  it('자유 가입 모드면 대기열이 왜 비었는지 말한다', () => {
    render(<SignupApproval users={[]} signupMode="open" />);

    // 「항목이 없습니다」로 끝내면 사용자는 시스템 고장으로 오인한다.
    const 안내 = screen.getByRole('note', { name: '빈 상태 안내' });
    expect(안내.textContent).toContain('자유 가입');
    expect(안내.textContent).toContain('가입 모드');
  });

  it('승인 모드인데 비었으면 그렇게 말한다 — 원인이 다르면 문구도 다르다', () => {
    render(<SignupApproval users={[]} signupMode="approval" />);

    const 안내 = screen.getByRole('note', { name: '빈 상태 안내' });
    expect(안내.textContent).not.toContain('자유 가입');
    expect(안내.textContent).toContain('신청');
  });

  it('모드를 모르면 원인을 지어내지 않는다', () => {
    render(<SignupApproval users={[]} />);

    const 안내 = screen.getByRole('note', { name: '빈 상태 안내' });
    expect(안내.textContent).not.toContain('자유 가입');
  });
});
