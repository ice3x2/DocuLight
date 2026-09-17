import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import type { Viewer } from '../src/shell/shell-contract.js';

afterEach(cleanup);

const root: Viewer = { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 };

async function open(viewer: Viewer = root) {
  const user = userEvent.setup();
  const view = render(<AppShell viewer={viewer} />);
  const trigger = screen.getByRole('button', { name: '설정' });
  await user.click(trigger);
  return { user, trigger, view, dialog: await screen.findByRole('dialog', { name: '설정' }) };
}

describe('IR-SHELL-008 AC-1/2 · IR-SHELL-002 — 신문지 설정 셸', () => {
  it.each([
    [{ superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 }, 4],
    [{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }, 5],
    [{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }, 8],
    [{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }, 14],
    [{ superuser: true, workspaceCount: 0, adminWorkspaceCount: 0 }, 11],
    [{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 0 }, 12],
  ] satisfies Array<[Viewer, number]>)('권한별 허용 카테고리만 DOM에 둔다: %o', async (viewer, count) => {
    const { dialog } = await open(viewer);
    expect(within(dialog).getAllByRole('tab')).toHaveLength(count);
  });

  it('14개 항목을 세 그룹과 한 개의 세로 탭 집합으로 렌더링한다', async () => {
    const { dialog } = await open();
    const list = within(dialog).getByRole('tablist', { name: '설정 카테고리' });
    expect(list.getAttribute('aria-orientation')).toBe('vertical');
    expect(within(list).getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
      '개인',
      '워크스페이스 관리',
      '인스턴스',
    ]);
    expect(within(list).getAllByRole('tab').map((node) => node.textContent)).toEqual([
      '에디터', '외모(테마)', '액세스 토큰', '계정', '휴지통',
      '워크스페이스', '권한 감사', '감사 로그',
      '사용자 관리', '그룹 관리', '가입 승인', '전체 워크스페이스', '인스턴스 설정', '색인 대기열',
    ]);
  });

  it('설정 전용 제목·설명·닫기를 제공하고 닫으면 기어로 초점을 복원한다', async () => {
    const { user, trigger, dialog } = await open();
    expect(within(dialog).getByText('왼쪽에서 설정 항목을 선택하세요.')).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: '설정 닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('열린 탭의 권한이 사라지면 금지 패널을 제거하고 명시적으로 안전한 탭으로 이동한다', async () => {
    const { user, view, dialog } = await open();
    await user.click(within(dialog).getByRole('tab', { name: '사용자 관리' }));
    expect(within(dialog).getByRole('tabpanel', { name: '사용자 관리' })).toBeDefined();

    view.rerender(<AppShell viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 }} />);

    expect(within(dialog).queryByRole('tab', { name: '사용자 관리' })).toBeNull();
    expect(within(dialog).queryByRole('tabpanel', { name: '사용자 관리' })).toBeNull();
    const notice = within(dialog).getByRole('status');
    expect(notice.textContent).toContain('더 이상 사용할 수 없습니다');
    await user.click(within(notice).getByRole('button', { name: '에디터로 이동' }));
    expect(within(dialog).getByRole('tab', { name: '에디터' }).getAttribute('aria-selected')).toBe('true');
  });
});
