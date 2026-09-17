import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { SignupApproval } from '../src/principal/SignupApproval.js';
import { AppShell } from '../src/shell/AppShell.js';
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
    expect(screen.getByRole('heading', { name: '가입 승인' })).toBeDefined();
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

    await userEvent.setup().click(within(행('대기자')).getByRole('button', { name: '대기자 승인' }));

    expect(승인한것).toEqual(['u2']);
  });

  it('거절하면 상태 전환이 나간다', async () => {
    const 바꾼것: { id: string; status: string }[] = [];
    render(<SignupApproval users={넷} onStatus={(id, status) => 바꾼것.push({ id, status })} />);

    await userEvent.setup().click(within(행('대기자')).getByRole('button', { name: '대기자 거절' }));

    // 계정과 이력은 보존된다 — 삭제가 아니라 상태 전환이다 (`R60`).
    expect(바꾼것).toEqual([{ id: 'u2', status: 'rejected' }]);
  });

  it('조작을 넘기지 않으면 그 버튼이 서지 않는다 — 눌러도 아무 일이 없는 자리를 두지 않는다', () => {
    render(<SignupApproval users={넷} />);

    expect(screen.queryByRole('button', { name: /승인/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /거절/ })).toBeNull();
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
    await user.click(within(행('거절자')).getByRole('button', { name: '거절자 재심사' }));

    expect(되돌린것).toEqual(['u4']);
  });

  it('거절됨 탭에는 승인 버튼이 없다 — 그 상태에서 바로 승인하는 경로는 없다', async () => {
    render(<SignupApproval users={넷} onApprove={() => undefined} onReopen={() => undefined} />);
    await 거절됨탭으로();

    // `R60-b` 는 `rejected → pending → active` 를 정한다. 여기서 바로
    // 승인하면 거절 이력을 건너뛰고 그 사실이 아무 데도 남지 않는다.
    expect(screen.queryByRole('button', { name: /승인/ })).toBeNull();
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

  it('직접 등록 모드와 알 수 없는 모드의 현재 문구를 정확히 구분한다', () => {
    const { rerender } = render(<SignupApproval users={[]} signupMode="invite-only" />);

    expect(screen.getByRole('note', { name: '빈 상태 안내' }).textContent).toBe(
      '현재 슈퍼유저 직접 등록 모드라 가입 신청을 받지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
    );
    rerender(<SignupApproval users={[]} signupMode="future-mode" />);
    expect(screen.getByRole('note', { name: '빈 상태 안내' }).textContent).toBe('승인 대기 중인 계정이 없습니다.');
  });

  it('모드를 모르면 원인을 지어내지 않는다', () => {
    render(<SignupApproval users={[]} />);

    const 안내 = screen.getByRole('note', { name: '빈 상태 안내' });
    expect(안내.textContent).not.toContain('자유 가입');
  });
});

describe('IR-SHELL-006 — 승인 목록의 공통 표·탭 표현', () => {
  it('탭 건수·선택 상태와 대기 표의 이름/조작 계약을 유지한다', () => {
    render(<SignupApproval users={넷} onApprove={() => undefined} onStatus={() => undefined} />);

    const pending = screen.getByRole('tab', { name: '대기 중 (1)' });
    const rejected = screen.getByRole('tab', { name: '거절됨 (1)' });
    expect(pending.getAttribute('data-state')).toBe('active');
    expect(rejected.getAttribute('data-state')).toBe('inactive');
    expect(screen.getByRole('table', { name: '승인 대기' }).getAttribute('data-slot')).toBe('table');
    expect(within(행('대기자')).getByRole('button', { name: '대기자 승인' })).toBeDefined();
    expect(within(행('대기자')).getByRole('button', { name: '대기자 거절' })).toBeDefined();
  });

  it('비어 있는 거절 탭도 접근 가능하고 정확한 문구를 표시한다', async () => {
    render(<SignupApproval users={[]} />);

    await userEvent.setup().click(screen.getByRole('tab', { name: '거절됨 (0)' }));
    expect(screen.getByRole('note', { name: '빈 상태 안내' }).textContent).toBe('거절된 계정이 없습니다.');
  });

  it('설정의 중첩 탭에서 화살표가 승인 탭만 바꾸고 바깥 카테고리를 바꾸지 않는다', async () => {
    render(<AppShell viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }} userRoster={넷} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '설정' }));
    const dialog = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(dialog).getByRole('tab', { name: '가입 승인' }));
    const pending = within(dialog).getByRole('tab', { name: '대기 중 (1)' });
    pending.focus();
    await user.keyboard('{ArrowRight}');

    expect(within(dialog).getByRole('tab', { name: '가입 승인' }).getAttribute('data-state')).toBe('active');
    expect(within(dialog).getByRole('tab', { name: '거절됨 (1)' }).getAttribute('data-state')).toBe('active');
  });
});
