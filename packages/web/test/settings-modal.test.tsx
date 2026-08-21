import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import type { Viewer } from '../src/shell/shell-contract.js';

afterEach(cleanup);

const ROOT: Viewer = { superuser: true, workspaceCount: 2, adminWorkspaceCount: 1 };

async function openSettings() {
  const user = userEvent.setup();
  render(<AppShell viewer={ROOT} />);
  await user.click(screen.getByRole('button', { name: '설정' }));
  return { user, modal: await screen.findByRole('dialog', { name: '설정' }) };
}

describe('IR-SHELL-001 — 설정 화면은 별도 페이지가 아니라 모달이다', () => {
  it('AC-1: 닫으면 셸이 그대로 돌아온다 — 페이지 이동이 아니다', async () => {
    const { user, modal } = await openSettings();

    // 열려 있는 동안 배경이 `aria-hidden` 으로 덮이는 것은 모달의 올바른
    // 동작이다. 페이지 이동과 갈리는 지점은 거기가 아니라 **닫았을 때**다 —
    // 이동이었다면 돌아오기 위해 다시 그려야 하고, 그 사이 열린 문서와
    // 사이드바 상태가 사라진다.
    expect(modal).toBeDefined();
    const shell = document.querySelector('[data-shell="root"]');
    expect(shell).not.toBeNull();

    await user.keyboard('{Escape}');

    expect(screen.getByRole('complementary', { name: '좌측 사이드바' })).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
    // 같은 노드가 그대로 남아 있다 — 다시 그린 것이 아니다.
    expect(document.querySelector('[data-shell="root"]')).toBe(shell);
  });

  it('AC-2: 좌측 카테고리 리스트와 우측 설정 패널의 2단이다', async () => {
    const { modal } = await openSettings();

    expect(within(modal).getByRole('tablist', { name: '설정 카테고리' })).toBeDefined();
    expect(within(modal).getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('AC-3: 카테고리를 고르면 우측 패널만 교체되고 카테고리 리스트는 남는다', async () => {
    const { user, modal } = await openSettings();

    await user.click(within(modal).getByRole('tab', { name: '휴지통' }));

    expect(within(modal).getByRole('tabpanel', { name: '휴지통' })).toBeDefined();
    expect(within(modal).queryByRole('tabpanel', { name: '에디터' })).toBeNull();
    // 리스트가 함께 교체되면 다음 카테고리로 갈 길이 사라진다.
    expect(within(modal).getByRole('tab', { name: '에디터' })).toBeDefined();
  });
});
