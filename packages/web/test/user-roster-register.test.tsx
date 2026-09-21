import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { UserRoster } from '../src/principal/UserRoster.js';
import { SETTINGS_CATEGORIES } from '../src/shell/shell-contract.js';

afterEach(cleanup);

const runtimePassword = (salt: number) => Array.from(
  { length: 16 },
  (_, index) => String.fromCharCode(65 + ((index * 7 + salt) % 26)),
).join('');

const 명부 = [
  { id: 'u1', name: '활성자', status: 'active' as const },
  { id: 'u2', name: '대기자', status: 'pending' as const },
  { id: 'u3', name: '정지자', status: 'suspended' as const },
  { id: 'u4', name: '거절자', status: 'rejected' as const },
];

describe('FR-AUTH-003 — 직접 등록은 사용자 관리 안의 조작이다', () => {
  it('AC-1: 명부와 같은 자리에 등록 자리가 선다', () => {
    render(<UserRoster users={명부} />);

    // 명부를 그리는 부품이 등록도 담는다 — 자리가 갈리면 그것이 곧
    // 두 번째 화면이다.
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('heading', { name: '사용자 관리' })).toBeDefined();
    expect(screen.getByLabelText('새 사용자 이름')).toBeDefined();
    expect(screen.getByLabelText('임시 비밀번호')).toBeDefined();
    expect(screen.getByRole('heading', { name: '사용자 직접 등록' })).toBeDefined();
  });

  it('네 상태를 의미 배지로 표시하고 명부가 비면 중립 안내를 표시한다', () => {
    const { rerender } = render(<UserRoster users={명부} onRegister={async () => ({ ok: true, id: 'fixture', refreshFailed: false })} />);

    expect(screen.getAllByTestId('roster-status').map((badge) => [badge.textContent, badge.getAttribute('data-variant')])).toEqual([
      ['활성', 'success'],
      ['대기', 'warning'],
      ['정지', 'neutral'],
      ['거절', 'danger'],
    ]);
    expect(screen.getByRole('table', { name: '사용자 관리' }).getAttribute('data-slot')).toBe('table');

    rerender(<UserRoster users={[]} onRegister={async () => ({ ok: true, id: 'fixture', refreshFailed: false })} />);
    expect(screen.getByRole('note', { name: '빈 상태 안내' }).textContent).toBe('표시할 사용자 항목이 없습니다.');
    expect(screen.getByRole('heading', { name: '사용자 직접 등록' })).toBeDefined();
  });

  it('AC-2 · AC-3: 등록을 위한 새 카테고리가 목록에 없다', () => {
    const 이름들 = SETTINGS_CATEGORIES.map((one) => `${one.id} ${one.label}`);

    expect(이름들.filter((one) => /등록|register|사용자 추가/i.test(one))).toEqual([]);
  });

  it('채워서 누르면 그 값이 밖으로 나간다', async () => {
    const 나간것: { name: string; password: string }[] = [];
    const 합성비밀번호 = runtimePassword(1);
    render(<UserRoster users={명부} onRegister={async (one) => { 나간것.push(one); return { ok: true, id: 'fixture', refreshFailed: false }; }} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('새 사용자 이름'), '새사람');
    await user.type(screen.getByLabelText('임시 비밀번호'), 합성비밀번호);
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(나간것).toEqual([{ name: '새사람', password: 합성비밀번호 }]);
  });

  it('이름이나 비밀번호가 비면 누를 수 없다 — 서버가 거절할 요청을 보내지 않는다', async () => {
    render(<UserRoster users={명부} onRegister={async () => ({ ok: true, id: 'fixture', refreshFailed: false })} />);
    const 등록 = screen.getByRole('button', { name: '등록' }) as HTMLButtonElement;

    expect(등록.disabled).toBe(true);

    await userEvent.setup().type(screen.getByLabelText('새 사용자 이름'), '새사람');
    expect(등록.disabled).toBe(true);
  });

  it('비밀번호 칸이 가려진다 — 어깨너머로 읽히면 그 계정이 열린다', () => {
    render(<UserRoster users={명부} />);

    expect((screen.getByLabelText('새 사용자 이름') as HTMLInputElement).autocomplete).toBe('username');
    const password = screen.getByLabelText('임시 비밀번호') as HTMLInputElement;
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('new-password');
    expect(password.getAttribute('aria-invalid')).not.toBe('true');
  });

  it('등록 handler가 없으면 사용할 수 없는 이유를 설명하고 값을 보내지 않는다', async () => {
    render(<UserRoster users={명부} />);
    const user = userEvent.setup();
    const 합성비밀번호 = runtimePassword(2);

    await user.type(screen.getByLabelText('새 사용자 이름'), '새사람');
    await user.type(screen.getByLabelText('임시 비밀번호'), 합성비밀번호);

    expect((screen.getByRole('button', { name: '등록' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('등록 기능을 사용할 수 없습니다.')).toBeDefined();
  });

  it('공백을 포함한 원값과 합성 중 Enter를 보존하고 명시적 버튼 조작만 한 번 보낸다', async () => {
    const 나간것: { name: string; password: string }[] = [];
    const 합성비밀번호 = ` ${runtimePassword(3)} `;
    render(<UserRoster users={명부} onRegister={async (one) => { 나간것.push(one); return { ok: true, id: 'fixture', refreshFailed: false }; }} />);
    const 이름 = screen.getByLabelText('새 사용자 이름') as HTMLInputElement;
    const 비밀번호 = screen.getByLabelText('임시 비밀번호') as HTMLInputElement;

    fireEvent.compositionStart(이름);
    fireEvent.input(이름, { target: { value: ' 한글 이름 ' }, isComposing: true });
    fireEvent.keyDown(이름, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
    fireEvent.compositionEnd(이름, { data: ' 한글 이름 ' });
    fireEvent.input(비밀번호, { target: { value: 합성비밀번호 } });

    expect(나간것).toEqual([]);
    expect(이름.value).toBe(' 한글 이름 ');
    await userEvent.setup().click(screen.getByRole('button', { name: '등록' }));
    expect(나간것).toEqual([{ name: ' 한글 이름 ', password: 합성비밀번호 }]);
  });

  it('AC-4: 등록 자리를 감추지 않는다 — 이 화면 자체가 슈퍼유저 전용이다', () => {
    // 카테고리 관문이 이미 슈퍼유저를 요구하므로(`IR-SHELL-002`) 여기서
    // 다시 판정하면 같은 규칙이 두 곳에 살고 한쪽만 고쳐진다.
    const 사용자관리 = SETTINGS_CATEGORIES.find((one) => one.id === 'users')!;

    expect(사용자관리.gate).toBe('superuser');
  });

  it('명부가 비어 있어도 등록 자리는 선다 — 첫 사용자를 넣을 자리가 있어야 한다', () => {
    render(<UserRoster />);

    expect(within(screen.getByRole('table')).queryAllByRole('row').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('새 사용자 이름')).toBeDefined();
  });
});
