import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ControlledDocumentArea as DocumentArea } from './support/document-area.js';
import {
  closeTab,
  openInActiveTab,
  openInNewTab,
  needsConfirmBeforeReplace,
  type OpenTab,
  type TabState,
} from '../src/document/tab-state.js';

afterEach(cleanup);

const doc = (id: string, name: string): OpenTab => ({
  nodeId: id,
  name,
  breadcrumb: ['기획팀', '회의', name],
  save: 'saved',
});

const stateOf = (...tabs: OpenTab[]): TabState => ({
  tabs,
  activeId: tabs[0]?.nodeId ?? null,
});

describe('FR-SHELL-005 — 상단 문서 탭', () => {
  it('AC-1: 문서를 열면 탭 스트립에 그 문서의 탭이 생긴다', () => {
    const opened = openInNewTab(stateOf(), doc('n1', '회의록.md'));

    expect(opened.tabs.map((t) => t.name)).toEqual(['회의록.md']);
    expect(opened.activeId).toBe('n1');
  });

  it('AC-2: 탭을 클릭하면 본문이 그 문서로 전환된다', async () => {
    const user = userEvent.setup();
    render(<DocumentArea initial={stateOf(doc('n1', '가.md'), doc('n2', '나.md'))} />);

    const strip = screen.getByRole('tablist', { name: '열린 문서' });
    await user.click(within(strip).getByRole('tab', { name: /나\.md/ }));

    expect(screen.getByRole('tabpanel', { name: /나\.md/ })).toBeDefined();
    expect(screen.queryByRole('tabpanel', { name: /가\.md/ })).toBeNull();
  });

  it('AC-3: 탭을 닫으면 탭 스트립에서 사라진다', () => {
    const closed = closeTab(stateOf(doc('n1', '가.md'), doc('n2', '나.md')), 'n1');

    expect(closed.tabs.map((t) => t.nodeId)).toEqual(['n2']);
  });

  it('AC-3: 활성 탭을 닫으면 활성이 남은 탭으로 옮겨간다 — 빈 활성은 본문을 잃는다', () => {
    const two = stateOf(doc('n1', '가.md'), doc('n2', '나.md'));

    expect(closeTab(two, 'n1').activeId).toBe('n2');
    expect(closeTab(two, 'n2').activeId).toBe('n1');
  });

  it('마지막 탭을 닫으면 활성이 없다 — 없는 문서를 활성으로 두면 본문이 유령을 그린다', () => {
    expect(closeTab(stateOf(doc('n1', '가.md')), 'n1')).toEqual({ tabs: [], activeId: null });
  });
});

describe('FR-SHELL-012 — 트리 클릭은 활성 탭 교체, Ctrl+클릭은 새 탭', () => {
  it('AC-1: 트리 클릭은 새 탭을 만들지 않고 활성 탭의 내용을 바꾼다', () => {
    const before = stateOf(doc('n1', '가.md'));
    const after = openInActiveTab(before, doc('n2', '나.md'));

    expect(after.tabs).toHaveLength(1);
    expect(after.tabs[0]?.nodeId).toBe('n2');
    expect(after.activeId).toBe('n2');
  });

  it('AC-2: Ctrl+클릭은 새 탭을 만든다', () => {
    const after = openInNewTab(stateOf(doc('n1', '가.md')), doc('n2', '나.md'));

    expect(after.tabs.map((t) => t.nodeId)).toEqual(['n1', 'n2']);
    expect(after.activeId).toBe('n2');
  });

  it('열린 탭이 없으면 트리 클릭도 탭을 만든다 — 교체할 대상이 없다', () => {
    expect(openInActiveTab(stateOf(), doc('n1', '가.md')).tabs).toHaveLength(1);
  });

  it('AC-3: 충돌로 자동 저장이 멈춘 탭은 즉시 교체하지 않는다', () => {
    const conflicted = { ...doc('n1', '가.md'), save: 'conflict' as const };

    expect(needsConfirmBeforeReplace(conflicted)).toBe(true);
  });

  it('AC-4: 저장이 거부된 탭도 즉시 교체하지 않는다', () => {
    const rejected = { ...doc('n1', '가.md'), save: 'rejected' as const };

    expect(needsConfirmBeforeReplace(rejected)).toBe(true);
  });

  it('저장된 탭과 저장 중인 탭은 확인 없이 교체된다 — 되찾을 수 없는 것이 없다', () => {
    expect(needsConfirmBeforeReplace(doc('n1', '가.md'))).toBe(false);
    expect(needsConfirmBeforeReplace({ ...doc('n1', '가.md'), save: 'saving' })).toBe(false);
  });

  it('이미 열린 문서를 다시 열면 탭이 늘지 않고 그 탭이 활성이 된다', () => {
    const two = stateOf(doc('n1', '가.md'), doc('n2', '나.md'));

    // 같은 문서가 탭 두 개로 열리면 어느 쪽이 진짜 편집 대상인지 갈린다.
    expect(openInNewTab(two, doc('n1', '가.md')).tabs).toHaveLength(2);
    expect(openInNewTab(two, doc('n1', '가.md')).activeId).toBe('n1');
  });
});

describe('IR-SHELL-003 — 탭 스트립과 문서 헤더는 2단으로 분리한다', () => {
  it('AC-1: 탭 스트립과 문서 헤더가 서로 다른 행이다', () => {
    render(<DocumentArea initial={stateOf(doc('n1', '가.md'))} />);

    const strip = screen.getByRole('tablist', { name: '열린 문서' });
    const header = screen.getByRole('banner', { name: '문서 헤더' });

    // 한쪽이 다른 쪽 안에 들어 있으면 그것은 2단이 아니라 1단이다.
    expect(strip.contains(header)).toBe(false);
    expect(header.contains(strip)).toBe(false);
  });

  it('AC-2: 문서 헤더에 브레드크럼과 저장 상태가 있다', () => {
    render(<DocumentArea initial={stateOf(doc('n1', '가.md'))} />);
    const header = screen.getByRole('banner', { name: '문서 헤더' });

    expect(within(header).getByRole('navigation', { name: '브레드크럼' }).textContent).toContain('기획팀');
    expect(within(header).getByRole('status').textContent).toBeTruthy();
  });

  it('AC-3: 탭이 늘어도 헤더의 브레드크럼과 저장 상태가 남는다', () => {
    const many = Array.from({ length: 12 }, (_, i) => doc(`n${i}`, `문서${i}.md`));
    render(<DocumentArea initial={stateOf(...many)} />);
    const header = screen.getByRole('banner', { name: '문서 헤더' });

    expect(within(header).getByRole('navigation', { name: '브레드크럼' })).toBeDefined();
    expect(within(header).getByRole('status')).toBeDefined();
  });

  it('AC-4: 헤더의 ⋯ 메뉴가 활성 문서를 대상으로 한다', async () => {
    const user = userEvent.setup();
    render(<DocumentArea initial={stateOf(doc('n1', '가.md'), doc('n2', '나.md'))} />);

    const strip = screen.getByRole('tablist', { name: '열린 문서' });
    await user.click(within(strip).getByRole('tab', { name: /나\.md/ }));

    const header = screen.getByRole('banner', { name: '문서 헤더' });
    expect(within(header).getByRole('button', { name: '나.md 문서 메뉴' })).toBeDefined();
  });

  it('열린 문서가 없으면 헤더가 서지 않는다 — 대상 없는 헤더는 빈 브레드크럼을 그린다', () => {
    render(<DocumentArea initial={stateOf()} />);

    expect(screen.queryByRole('banner', { name: '문서 헤더' })).toBeNull();
  });
});
