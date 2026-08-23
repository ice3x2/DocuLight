import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { UserRoster } from '../src/principal/UserRoster.js';
import { SETTINGS_CATEGORIES } from '../src/shell/shell-contract.js';

afterEach(cleanup);

const 명부 = [{ id: 'u1', name: '한범', status: 'active' as const }];

describe('FR-AUTH-003 — 직접 등록은 사용자 관리 안의 조작이다', () => {
  it('AC-1: 명부와 같은 자리에 등록 자리가 선다', () => {
    render(<UserRoster users={명부} />);

    // 명부를 그리는 부품이 등록도 담는다 — 자리가 갈리면 그것이 곧
    // 두 번째 화면이다.
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByLabelText('새 사용자 이름')).toBeDefined();
    expect(screen.getByLabelText('임시 비밀번호')).toBeDefined();
  });

  it('AC-2 · AC-3: 등록을 위한 새 카테고리가 목록에 없다', () => {
    const 이름들 = SETTINGS_CATEGORIES.map((one) => `${one.id} ${one.label}`);

    expect(이름들.filter((one) => /등록|register|사용자 추가/i.test(one))).toEqual([]);
  });

  it('채워서 누르면 그 값이 밖으로 나간다', async () => {
    const 나간것: { name: string; password: string }[] = [];
    render(<UserRoster users={명부} onRegister={(one) => 나간것.push(one)} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('새 사용자 이름'), '새사람');
    await user.type(screen.getByLabelText('임시 비밀번호'), 'x'.repeat(10));
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(나간것).toEqual([{ name: '새사람', password: 'x'.repeat(10) }]);
  });

  it('이름이나 비밀번호가 비면 누를 수 없다 — 서버가 거절할 요청을 보내지 않는다', async () => {
    render(<UserRoster users={명부} onRegister={() => undefined} />);
    const 등록 = screen.getByRole('button', { name: '등록' }) as HTMLButtonElement;

    expect(등록.disabled).toBe(true);

    await userEvent.setup().type(screen.getByLabelText('새 사용자 이름'), '새사람');
    expect(등록.disabled).toBe(true);
  });

  it('비밀번호 칸이 가려진다 — 어깨너머로 읽히면 그 계정이 열린다', () => {
    render(<UserRoster users={명부} />);

    expect((screen.getByLabelText('임시 비밀번호') as HTMLInputElement).type).toBe('password');
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
