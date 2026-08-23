import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmGate } from '../src/confirm/ConfirmGate.js';

afterEach(cleanup);

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 세우기 = (props: Partial<Parameters<typeof ConfirmGate>[0]> = {}) => {
  const 실행: string[] = [];
  const view = render(
    <ConfirmGate
      open
      grade="L2"
      title="영구 삭제"
      onConfirm={() => 실행.push('했다')}
      onCancel={() => undefined}
      {...props}
    />,
  );
  return { 실행, view };
};

describe('FR-CONFIRM-001 — 세 등급을 한 부품이 그린다', () => {
  it('AC-2: L2 는 다이얼로그를 세우고 승인해야 실행된다', async () => {
    const { 실행 } = 세우기({ grade: 'L2' });
    const user = userEvent.setup();

    expect(screen.getByRole('alertdialog', { name: '영구 삭제' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: '실행' }));

    expect(실행).toEqual(['했다']);
  });

  it('AC-3: L3 은 토큰을 쳐야 실행이 열린다', async () => {
    const { 실행 } = 세우기({ grade: 'L3', token: '42' });
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: '실행' })).toHaveProperty('disabled', true);
    await user.type(screen.getByLabelText('42 를 입력하세요'), '42');

    expect(screen.getByRole('button', { name: '실행' })).toHaveProperty('disabled', false);
    await user.click(screen.getByRole('button', { name: '실행' }));
    expect(실행).toEqual(['했다']);
  });

  it('AC-3: 틀린 토큰으로는 열리지 않는다', async () => {
    세우기({ grade: 'L3', token: '42' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('42 를 입력하세요'), '41');

    expect(screen.getByRole('button', { name: '실행' })).toHaveProperty('disabled', true);
  });

  it('AC-1: 닫혀 있으면 아무것도 그리지 않는다', () => {
    세우기({ open: false });

    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('AC-4: 등급이 속성으로 드러난다 — 같은 이름에 다른 절차가 붙지 않는다', () => {
    세우기({ grade: 'L3', token: '1' });

    expect(screen.getByRole('alertdialog').getAttribute('data-grade')).toBe('L3');
  });
});

describe('FR-CONFIRM-004 — 열 때 재조회하고 달라지면 잠근다', () => {
  it('AC-1: 열리면 재조회를 부른다', () => {
    const 물음: string[] = [];
    render(
      <ConfirmGate
        open
        grade="L2"
        title="영구 삭제"
        onRecount={() => 물음.push('물었다')}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(물음.length).toBeGreaterThan(0);
  });

  it('AC-3: 값이 같으면 잠기지 않는다', () => {
    const { view } = 세우기({ counts: { reached: 3 } });

    view.rerender(
      <ConfirmGate
        open
        grade="L2"
        title="영구 삭제"
        counts={{ reached: 3 }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.queryByTestId('confirm-locked')).toBeNull();
    expect(screen.getByRole('button', { name: '실행' })).toHaveProperty('disabled', false);
  });

  it('AC-2: 값이 달라지면 실행이 잠기고 갱신된 값이 보인다', () => {
    const { view } = 세우기({ counts: { reached: 3 } });

    view.rerender(
      <ConfirmGate
        open
        grade="L2"
        title="영구 삭제"
        counts={{ reached: 9 }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByTestId('confirm-locked')).toBeDefined();
    expect(screen.getByTestId('reached-count').textContent).toContain('9');
    expect(screen.getByRole('button', { name: '실행' })).toHaveProperty('disabled', true);
  });

  it('AC-4 · AC-5: 잠긴 L3 의 토큰이 갱신된 수치로 바뀐다', () => {
    const { view } = 세우기({ grade: 'L3', token: '3', counts: { affected: 3 } });
    expect(screen.getByLabelText('3 를 입력하세요')).toBeDefined();

    view.rerender(
      <ConfirmGate
        open
        grade="L3"
        title="영구 삭제"
        token="9"
        counts={{ affected: 9 }}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );

    // 이전 수치를 치면 열리지 않는다 — 라벨 자체가 새 값을 요구한다.
    expect(screen.getByLabelText('9 를 입력하세요')).toBeDefined();
    expect(screen.queryByLabelText('3 를 입력하세요')).toBeNull();
  });
});

describe('FR-CONFIRM-008 — 지연 효과는 등급과 무관하게 고지한다', () => {
  it.each(['L1', 'L2', 'L3'] as const)('AC-3: %s 에서도 고지가 나온다', (grade) => {
    세우기({ grade, delayedEffect: true, ...(grade === 'L3' ? { token: '1' } : {}) });

    const 고지 = screen.getByTestId('delayed-notice').textContent ?? '';

    expect(고지).toContain('지금은 아무 일도 일어나지 않습니다');
    expect(고지).toContain('다음 정리 시점');
  });

  it('지연 효과가 아니면 그 고지가 없다', () => {
    세우기({ delayedEffect: false });

    expect(screen.queryByTestId('delayed-notice')).toBeNull();
  });
});

describe('SEC-CONFIRM-003 · IR-CONFIRM-001 — 수치 표기의 금지', () => {
  it('SEC-CONFIRM-003 AC-1: 적용 하위 노드 수가 분수로 표시되지 않는다', () => {
    세우기({ counts: { reached: 24 } });

    const 문구 = screen.getByTestId('reached-count').textContent ?? '';

    expect(문구).toContain('24');
    expect(문구).not.toMatch(/\d+\s*\/\s*\d+/);
  });

  it('SEC-CONFIRM-003 AC-2: 도달하지 못한 건수를 실을 자리가 없다', () => {
    세우기({ counts: { reached: 24 } });

    expect(screen.getByRole('alertdialog').textContent ?? '').not.toMatch(/적용되지 않/);
  });

  it('IR-CONFIRM-001 AC-1 · AC-2: 수치에 시점 접미가 붙지 않는다', () => {
    const sources = (at: string): string[] =>
      readdirSync(at).flatMap((name) => {
        const full = join(at, name);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.tsx?$/.test(name) ? [full] : [];
      });

    // 「12명(08-12 기준)」 같은 표기가 어느 화면에도 없다.
    const 어긴것 = sources(join(WEB, 'src'))
      .filter((file) => /명\s*\([^)]*기준|기준\)/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(join(WEB, 'src').length + 1));

    expect(어긴것).toEqual([]);
  });
});

describe('FR-CONFIRM-005 — 입력 폼은 관문이 아니다', () => {
  it('AC-4: 이 부품 없이 실행되는 경로를 만들지 않는다 — 취소가 언제나 있다', async () => {
    const 취소: string[] = [];
    const user = userEvent.setup();
    render(
      <ConfirmGate
        open
        grade="L2"
        title="옮기기"
        onConfirm={() => undefined}
        onCancel={() => 취소.push('말았다')}
      />,
    );

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(취소).toEqual(['말았다']);
  });
});
