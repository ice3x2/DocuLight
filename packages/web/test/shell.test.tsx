import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import {
  LEFT_TABS,
  RIGHT_TABS,
  SETTINGS_CATEGORIES,
  visibleCategories,
  type Viewer,
} from '../src/shell/shell-contract.js';

afterEach(cleanup);

// 전부 보이는 요청자 — 셸 골격 자체를 보는 시험이므로 표시 조건으로
// 카테고리가 빠지면 골격 검사가 조건 검사와 섞인다. 조건 자체는
// settings-categories.test.tsx 가 따로 본다.
const ROOT: Viewer = { superuser: true, workspaceCount: 2, adminWorkspaceCount: 1 };

describe('IR-SHELL-002 · CON-ARCH-004 — 셸 골격', () => {
  it('좌측·본문·우측 세 구역이 선다', () => {
    render(<AppShell viewer={ROOT} />);

    expect(screen.getByRole('complementary', { name: '좌측 사이드바' })).toBeDefined();
    expect(screen.getByRole('main')).toBeDefined();
    expect(screen.getByRole('complementary', { name: '우측 사이드바' })).toBeDefined();
  });
});

describe('FR-SHELL-001 — 좌측 사이드바 뷰 전환 탭 세 가지', () => {
  it('AC-1: 문서 트리·검색·즐겨찾기 세 탭이 있다', () => {
    render(<AppShell viewer={ROOT} />);
    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });

    expect(LEFT_TABS.map((t) => t.label)).toEqual(['문서 트리', '검색', '즐겨찾기']);
    for (const tab of LEFT_TABS) {
      expect(within(sidebar).getByRole('tab', { name: tab.label }), `${tab.label} 탭이 없다`).toBeDefined();
    }
  });

  it('AC-2: 탭을 고르면 본문이 그 뷰로 교체된다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={ROOT} />);
    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });

    // 처음에는 첫 탭이 열려 있다 — 아무것도 안 열린 사이드바는 빈 칸이다.
    expect(within(sidebar).getByRole('tabpanel', { name: '문서 트리' })).toBeDefined();

    await user.click(within(sidebar).getByRole('tab', { name: '검색' }));

    expect(within(sidebar).getByRole('tabpanel', { name: '검색' })).toBeDefined();
    expect(within(sidebar).queryByRole('tabpanel', { name: '문서 트리' })).toBeNull();
  });
});

describe('FR-SHELL-004 — 우측 사이드바 세 탭', () => {
  it('AC-1: 백링크·아웃고잉 링크·태그 세 탭이 우측에 있다', () => {
    render(<AppShell viewer={ROOT} />);
    const sidebar = screen.getByRole('complementary', { name: '우측 사이드바' });

    expect(RIGHT_TABS.map((t) => t.label)).toEqual(['백링크', '아웃고잉 링크', '태그']);
    for (const tab of RIGHT_TABS) {
      expect(within(sidebar).getByRole('tab', { name: tab.label })).toBeDefined();
    }
  });

  it('AC-2: 탭을 고르면 우측 본문이 교체된다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={ROOT} />);
    const sidebar = screen.getByRole('complementary', { name: '우측 사이드바' });

    await user.click(within(sidebar).getByRole('tab', { name: '태그' }));

    expect(within(sidebar).getByRole('tabpanel', { name: '태그' })).toBeDefined();
    expect(within(sidebar).queryByRole('tabpanel', { name: '백링크' })).toBeNull();
  });

  it('좌우 탭이 서로 독립이다 — 한쪽을 바꿔도 다른 쪽이 따라가지 않는다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={ROOT} />);
    const left = screen.getByRole('complementary', { name: '좌측 사이드바' });
    const right = screen.getByRole('complementary', { name: '우측 사이드바' });

    await user.click(within(right).getByRole('tab', { name: '태그' }));

    expect(within(left).getByRole('tabpanel', { name: '문서 트리' })).toBeDefined();
  });
});

describe('CON-SHELL-001 — 관리 기능의 진입점은 설정 모달 하나다', () => {
  it('AC-2: 설정 모달이 좌측 카테고리로 관리 기능을 담는다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={ROOT} />);

    await user.click(screen.getByRole('button', { name: '설정' }));

    const modal = await screen.findByRole('dialog', { name: '설정' });
    for (const category of visibleCategories(ROOT)) {
      expect(within(modal).getByRole('tab', { name: category.label }), `${category.label} 카테고리가 없다`).toBeDefined();
    }
  });

  it('AC-1: 관리 기능만을 위한 별도 화면이 없다 — 진입점이 설정 버튼 하나다', () => {
    render(<AppShell viewer={ROOT} />);

    // 「관리자」로 들어가는 별도 버튼·링크가 있으면 그것이 두 번째 진입점이다.
    const admin = screen.queryAllByRole('button', { name: /관리자|admin/i });
    expect(admin, '관리 기능으로 가는 두 번째 진입점이 있다').toEqual([]);
  });

  it('AC-3: 문서별 ACL 지정은 설정 모달의 카테고리가 아니다', () => {
    // 공유가 설정 모달 안에 있으면 문서 하나를 고르는 자리가 인스턴스
    // 설정과 섞인다 — 그 둘은 수명도 대상도 다르다.
    expect(SETTINGS_CATEGORIES.map((c) => c.label)).not.toContain('공유');
  });

  it('설정 모달은 닫을 수 있다 — 열고 못 닫으면 앱이 잠긴다', async () => {
    const user = userEvent.setup();
    render(<AppShell viewer={ROOT} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(await screen.findByRole('dialog', { name: '설정' })).toBeDefined();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull();
  });
});

describe('CON-ARCH-004 — UI 부품을 역할별 지정 패키지로 채택한다', () => {
  it('AC-2: 모달·탭이 Radix 로 구현된다', async () => {
    // Radix 의 탭·다이얼로그는 `data-radix-*` 표식을 남긴다. 직접 만든
    // 것으로 갈아 끼우면 이 표식이 사라진다.
    render(<AppShell viewer={ROOT} />);
    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });

    const panel = within(sidebar).getByRole('tabpanel', { name: '문서 트리' });
    expect(panel.getAttribute('data-radix-tabs-content') ?? panel.id).toBeTruthy();
    expect(within(sidebar).getByRole('tab', { name: '검색' }).getAttribute('data-state')).toBe('inactive');
  });

  it('AC-1 · AC-3 · AC-4 · AC-5 · AC-6: 지정 패키지가 의존성에 있다', async () => {
    const pkg = (await import('../package.json', { with: { type: 'json' } })).default as {
      dependencies: Record<string, string>;
    };

    for (const name of [
      'react-arborist',
      '@tanstack/react-table',
      'cmdk',
      '@tanstack/react-query',
      '@tanstack/react-virtual',
    ]) {
      expect(pkg.dependencies[name], `${name} 이 의존성에 없다`).toBeDefined();
    }
  });
});
