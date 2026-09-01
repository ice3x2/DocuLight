import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('IR-AUTH-001 AC-1 — 로그인 화면에서 자격을 입력해 로그인한다', () => {
  it('이름·비밀번호 입력과 제출 버튼이 선다', () => {
    render(<PreAuthScreen screen="login" />);

    expect(screen.getByLabelText('이름')).toBeDefined();
    expect(screen.getByLabelText('비밀번호')).toBeDefined();
    expect(screen.getByRole('button', { name: '로그인' })).toBeDefined();
  });

  it('비밀번호 입력은 가려진다 — 어깨너머로 읽히면 그 계정이 그대로 열린다', () => {
    render(<PreAuthScreen screen="login" />);

    expect(screen.getByLabelText('비밀번호').getAttribute('type')).toBe('password');
  });

  it('넣은 자격을 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    const 받은것: { name: string; password: string }[] = [];
    render(<PreAuthScreen screen="login" onLogin={async (input) => void 받은것.push(input)} />);

    await user.type(screen.getByLabelText('이름'), '한범');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(10));
    await user.click(screen.getByRole('button', { name: '로그인' }));

    expect(받은것).toEqual([{ name: '한범', password: 'x'.repeat(10) }]);
  });

  it('R60 · R60-b: 거절 사유를 그대로 보인다 — 화면이 사유를 다시 짓지 않는다', async () => {
    const user = userEvent.setup();
    render(
      <PreAuthScreen
        screen="login"
        onLogin={async () => '가입 신청이 아직 승인되지 않았습니다'}
      />,
    );

    await user.type(screen.getByLabelText('이름'), '한범');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(10));
    await user.click(screen.getByRole('button', { name: '로그인' }));

    // 상태별 안내는 서버가 소유한다(`account-gate`). 화면이 자기 문구를
    // 지어 두면 상태가 늘 때마다 두 곳이 갈리고, 갈린 쪽은 「이름 또는
    // 비밀번호가 올바르지 않습니다」로 뭉개져 사용자가 무엇을 해야 할지
    // 모르게 된다.
    expect((await screen.findByRole('alert')).textContent).toContain(
      '가입 신청이 아직 승인되지 않았습니다',
    );
  });
});

describe('IR-AUTH-001 AC-2 — 가입 신청 폼에서 실제로 신청한다', () => {
  it('이름·비밀번호 입력과 신청 버튼이 선다', () => {
    render(<PreAuthScreen screen="signup" />);

    expect(screen.getByLabelText('이름')).toBeDefined();
    expect(screen.getByLabelText('비밀번호').getAttribute('type')).toBe('password');
    expect(screen.getByRole('button', { name: '가입 신청' })).toBeDefined();
  });

  it('넣은 값을 그대로 넘긴다', async () => {
    const user = userEvent.setup();
    const 받은것: { name: string; password: string }[] = [];
    render(<PreAuthScreen screen="signup" onSignup={async (input) => void 받은것.push(input)} />);

    await user.type(screen.getByLabelText('이름'), '신청자');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(12));
    await user.click(screen.getByRole('button', { name: '가입 신청' }));

    expect(받은것).toEqual([{ name: '신청자', password: 'x'.repeat(12) }]);
  });

  it('신청이 받아들여지면 승인을 기다리라고 알린다', async () => {
    const user = userEvent.setup();
    render(<PreAuthScreen screen="signup" onSignup={async () => undefined} />);

    await user.type(screen.getByLabelText('이름'), '신청자');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(12));
    await user.click(screen.getByRole('button', { name: '가입 신청' }));

    // 아무 말도 없으면 사용자는 신청이 나갔는지 알 수 없어 다시 누른다.
    expect((await screen.findByRole('status')).textContent).toContain('승인');
  });

  it('거절되면 그 사유가 선다', async () => {
    const user = userEvent.setup();
    render(<PreAuthScreen screen="signup" onSignup={async () => '지금은 신청을 받지 않습니다'} />);

    await user.type(screen.getByLabelText('이름'), '신청자');
    await user.type(screen.getByLabelText('비밀번호'), 'x'.repeat(12));
    await user.click(screen.getByRole('button', { name: '가입 신청' }));

    expect((await screen.findByRole('alert')).textContent).toContain('신청을 받지 않습니다');
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
