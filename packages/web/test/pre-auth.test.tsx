import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import { PreAuthScreen, PRE_AUTH_SCREENS } from '../src/auth/PreAuthScreen.js';
import { EmptyState, EMPTY_STATE } from '../src/tree/EmptyState.js';
import type { Viewer } from '../src/shell/shell-contract.js';

afterEach(cleanup);

const VIEWER: Viewer = { superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 };

describe('IR-AUTH-001 — 인증 전 화면은 모달이 아니라 전체 화면이다', () => {
  it('AC-1 · AC-2 · AC-3: 세 화면이 모두 전체 화면으로 선다', () => {
    expect(PRE_AUTH_SCREENS.map((s) => s.id).sort()).toEqual(['install', 'login', 'signup']);

    for (const screenSpec of PRE_AUTH_SCREENS) {
      cleanup();
      render(<PreAuthScreen screen={screenSpec.id} />);

      // 모달이면 `dialog` 로 선다 — 전체 화면은 그렇지 않다.
      expect(screen.queryByRole('dialog'), `${screenSpec.id} 가 모달이다`).toBeNull();
      expect(screen.getByRole('main', { name: screenSpec.label })).toBeDefined();
    }
  });

  it('AC-4: 인증 전 화면 뒤에 셸이 깔리지 않는다', () => {
    render(<PreAuthScreen screen="login" />);

    // 깔려 있으면 사용자가 로그인 전에 트리·탭의 껍데기를 보게 되고,
    // 그것이 「내용이 없다」로 읽힌다.
    expect(screen.queryByRole('complementary', { name: '좌측 사이드바' })).toBeNull();
    expect(document.querySelector('[data-shell="root"]')).toBeNull();
  });

  it('AC-5: 좌하단 기어가 노출되지 않는다', () => {
    render(<PreAuthScreen screen="login" />);

    expect(screen.queryByRole('button', { name: '설정' })).toBeNull();
    expect(document.querySelector('[data-shell="settings-corner"]')).toBeNull();
  });
});

describe('FR-AUTH-005 — 접근 가능한 노드가 0개인 사용자의 빈 상태 안내', () => {
  it('AC-1: 접근 가능한 것이 없으면 빈 트리 대신 안내가 선다', () => {
    render(<AppShell viewer={VIEWER} workspaces={[]} />);

    expect(screen.getByRole('note', { name: '빈 상태 안내' })).toBeDefined();
    expect(screen.queryByRole('tree', { name: '문서 트리' })).toBeNull();
  });

  it('AC-2 · AC-3: 상황 설명과 관리자 문의 안내를 담는다', () => {
    render(<EmptyState />);
    const note = screen.getByRole('note', { name: '빈 상태 안내' });

    expect(note.textContent).toContain(EMPTY_STATE.situation);
    expect(note.textContent).toContain(EMPTY_STATE.contact);
    // 빈 화면에 아무 말도 없으면 사용자는 그것을 고장으로 읽는다.
    expect(EMPTY_STATE.situation.length).toBeGreaterThan(0);
    expect(EMPTY_STATE.contact).toContain('관리자');
  });

  it('AC-4: 하나라도 접근 가능해지면 일반 트리가 선다', () => {
    render(
      <AppShell
        viewer={{ ...VIEWER, workspaceCount: 1 }}
        workspaces={[{ workspace: { id: 'ws-1', name: '기획팀' }, visibility: 'full', roots: [] }]}
      />,
    );

    expect(screen.getByRole('tree', { name: '문서 트리' })).toBeDefined();
    expect(screen.queryByRole('note', { name: '빈 상태 안내' })).toBeNull();
  });
});
