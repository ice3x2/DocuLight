import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RelocationDialog } from '../src/shell/RelocationDialog.js';

afterEach(cleanup);

const 목적지 = [
  { id: 'd1', path: '기획팀/설계' },
  { id: 'd2', path: '기획팀/보관' },
];

const 열기 = (over: Record<string, unknown> = {}) =>
  render(
    <RelocationDialog
      kind="copy"
      open
      sourceName="회의록.md"
      destinations={목적지}
      {...over}
    />,
  );

describe('SEC-SHELL-003 — 복사 다이얼로그는 숨은 노드를 알리지 않는다', () => {
  const NOTICE = '권한에 따라 일부 항목이 제외될 수 있습니다';

  it('AC-3: 숨은 노드가 있든 없든 같은 문구가 선다', () => {
    // 두 상황을 **같은 소품 집합**으로 그린다 — 화면에 숨은 노드의 유무를
    // 전달할 칸 자체가 없다는 것이 이 AC 의 이행이다.
    const { container: 좁은쪽 } = 열기({ relocation: { kind: 'copy', reachable: 2 } });
    const { container: 넓은쪽 } = 열기({ relocation: { kind: 'copy', reachable: 40 } });

    for (const container of [좁은쪽, 넓은쪽]) {
      expect(container.querySelector('[data-testid="copy-notice"]')?.textContent).toBe(NOTICE);
    }
  });

  it('AC-2 · AC-3: 조건부 후행 문구가 붙지 않는다', () => {
    열기({ relocation: { kind: 'copy', reachable: 2 }, result: { copied: 3 } });

    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toContain('제외됨');
    expect(text).not.toContain('일부가 제외');
    // 분모가 붙으면 그 차액이 곧 숨은 노드의 개수다.
    expect(text).not.toMatch(/\d+\s*개 중/);
  });

  it('AC-4: 복사가 끝나면 복사된 항목 수가 토스트로 뜬다', () => {
    열기({ result: { copied: 3 } });

    expect(screen.getByRole('status').textContent).toContain('3개');
  });

  it('AC-4: 복사 전에는 토스트가 없다 — 없는 결과를 0 으로 그리면 실패로 읽힌다', () => {
    열기();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('이동 다이얼로그에는 그 문구가 없다 — 이동은 원본을 옮기므로 제외가 성립하지 않는다', () => {
    열기({ kind: 'move', relocation: { kind: 'move', before: 2, after: 5 } });

    expect(screen.queryByTestId('copy-notice')).toBeNull();
  });
});

describe('FR-ACL-006 — 목적지를 고르면 프리뷰가 그 목적지 기준이 된다', () => {
  it('AC-2: 목적지 선택이 그대로 올라간다', async () => {
    const 골랐다 = vi.fn();
    열기({ kind: 'move', onDestination: 골랐다 });

    await userEvent.setup().selectOptions(screen.getByLabelText('목적지'), 'd2');

    expect(골랐다).toHaveBeenCalledWith('d2');
  });

  it('AC-1: 프리뷰가 다이얼로그 안에 선다', () => {
    열기({ kind: 'move', relocation: { kind: 'move', before: 2, after: 5 } });

    const preview = screen.getByTestId('relocation-preview').textContent ?? '';
    expect(preview).toContain('2명');
    expect(preview).toContain('5명');
  });

  it('목적지를 아직 고르지 않았으면 실행할 수 없다', () => {
    열기({ kind: 'move' });

    expect((screen.getByRole('button', { name: '이동' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('GitHub #66 — 기존 소품의 이동·복사 표현', () => {
  it('목적지 라벨과 placeholder를 유지하고 선택한 전체 경로를 별도로 보여준다', () => {
    열기({ destinationId: 'd1', relocation: { kind: 'copy', reachable: 3 } });

    const select = screen.getByLabelText('목적지') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.options[0]?.textContent).toBe('선택하세요');
    expect(select.value).toBe('d1');
    expect(screen.getByTestId('selected-destination-path').textContent).toBe('기획팀/설계');
  });

  it('선택 전과 제공된 빈 목록을 사실 문구로 구분한다', () => {
    const { rerender } = 열기();
    expect(screen.getByText('목적지를 선택하세요.')).toBeDefined();

    rerender(
      <RelocationDialog kind="copy" open sourceName="회의록.md" destinations={[]} />,
    );
    expect(screen.getByText('제공된 목적지가 없습니다.')).toBeDefined();
  });

  it('프리뷰가 없으면 loading이나 0으로 꾸미지 않고 미전달 사실을 밝힌다', () => {
    열기({ destinationId: 'd1' });

    expect(screen.getByText('영향 정보가 전달되지 않았습니다.')).toBeDefined();
    expect(screen.queryByText(/불러오는 중/)).toBeNull();
    expect(screen.queryByText('0명')).toBeNull();
  });

  it('제목·닫기·취소·주요 동작에 조작 이름을 쓴다', () => {
    열기({ kind: 'move', destinationId: 'd1', relocation: { kind: 'move', before: 2, after: 2 } });

    expect(screen.getByRole('heading', { name: '회의록.md 이동' })).toBeDefined();
    expect(screen.getByRole('button', { name: '이동 닫기' })).toBeDefined();
    expect(screen.getByRole('button', { name: '취소' })).toBeDefined();
    expect(screen.getByRole('button', { name: '이동' })).toBeDefined();
  });

  it('Escape와 닫기 버튼이 기존 취소 callback을 사용한다', async () => {
    const 취소했다 = vi.fn();
    열기({ onCancel: 취소했다 });
    const user = userEvent.setup();

    await user.keyboard('{Escape}');
    expect(취소했다).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '복사 닫기' }));
    expect(취소했다).toHaveBeenCalledTimes(2);
  });

  it('이동 화면은 복사 결과 수를 이동한 수로 바꾸어 말하지 않는다', () => {
    열기({ kind: 'move', result: { copied: 9 } });

    expect(screen.queryByText(/9개 항목을 이동/)).toBeNull();
  });
});

describe('FR-CONFIRM-005 — 입력 폼은 확인 관문이 아니다', () => {
  it.each([
    ['move', '이동', { kind: 'move', before: 2, after: 5 }],
    ['copy', '복사', { kind: 'copy', reachable: 4 }],
  ] as const)('L2 %s 관문을 Escape로 닫으면 invoking %s 버튼으로 초점이 복귀하고 parent callback은 0회다', async (kind, operation, relocation) => {
    const 실행했다 = vi.fn();
    const 부모를닫았다 = vi.fn();
    열기({ kind, destinationId: 'd1', relocation, grade: 'L2', onConfirm: 실행했다, onCancel: 부모를닫았다 });
    const primary = screen.getByRole('button', { name: operation, exact: true });
    const user = userEvent.setup();

    await user.click(primary);
    expect(screen.getByRole('alertdialog')).toBeDefined();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(primary);
    expect(부모를닫았다).not.toHaveBeenCalled();
    expect(실행했다).not.toHaveBeenCalled();
  });

  it('AC-1: 목적지를 고르고 실행을 눌러도 확인 단계가 한 번 더 선다', async () => {
    const 실행했다 = vi.fn();
    열기({
      kind: 'move',
      destinationId: 'd1',
      relocation: { kind: 'move', before: 2, after: 5 },
      grade: 'L2',
      onConfirm: 실행했다,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: '이동' }));

    expect(screen.getByRole('alertdialog')).toBeDefined();
    // 폼의 실행 버튼이 관문을 대신하지 않는다 — 대신한다고 인정하면
    // 워크스페이스 생성 폼의 생성 버튼도 관문이 되어 규칙이 무력화된다.
    expect(실행했다).not.toHaveBeenCalled();
  });

  it('AC-4: 확인을 통과해야 실행된다 — 클릭 1회로 지나가는 경로가 없다', async () => {
    const 실행했다 = vi.fn();
    열기({
      kind: 'move',
      destinationId: 'd1',
      relocation: { kind: 'move', before: 2, after: 5 },
      grade: 'L2',
      onConfirm: 실행했다,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '이동' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect(실행했다).toHaveBeenCalledTimes(1);
  });

  it('AC-3: 목적지가 미리 채워져 있어도 확인 단계가 선다', async () => {
    const 실행했다 = vi.fn();
    // 드래그앤드롭으로 들어온 자리 — 사용자가 목적지를 고르는 조작을 하지
    // 않았다.
    열기({
      kind: 'copy',
      destinationId: 'd2',
      relocation: { kind: 'copy', reachable: 4 },
      grade: 'L2',
      onConfirm: 실행했다,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: '복사' }));

    expect(screen.getByRole('alertdialog')).toBeDefined();
    expect(실행했다).not.toHaveBeenCalled();
  });

  it('AC-2: 목적지 선택과 프리뷰 자체에는 확인이 붙지 않는다', async () => {
    const 골랐다 = vi.fn();
    열기({ kind: 'move', onDestination: 골랐다 });

    await userEvent.setup().selectOptions(screen.getByLabelText('목적지'), 'd2');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(골랐다).toHaveBeenCalledWith('d2');
  });

  it('FR-CONFIRM-016 AC-3: 수치가 변하지 않는 이동은 확인 없이 실행된다', async () => {
    const 실행했다 = vi.fn();
    열기({
      kind: 'move',
      destinationId: 'd1',
      relocation: { kind: 'move', before: 4, after: 4 },
      grade: 'L1',
      onConfirm: 실행했다,
    });

    await userEvent.setup().click(screen.getByRole('button', { name: '이동' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(실행했다).toHaveBeenCalledTimes(1);
  });
});
