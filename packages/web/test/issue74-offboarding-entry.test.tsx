import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';

import { BulkRevokePanel } from '../src/acl/BulkRevokePanel.js';
import { ApiError, type OffboardingCardBody, type PrincipalRow, type RosterUser } from '../src/api/client.js';
import { OffboardingCard } from '../src/principal/OffboardingCard.js';
import { OffboardingSurface } from '../src/principal/OffboardingSurface.js';
import { UserRoster } from '../src/principal/UserRoster.js';
import { AppShell } from '../src/shell/AppShell.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IR-PRINCIPAL-001 authority loss and request guards', () => {
  it('suspension POST 401 immediately clears the Surface and invalidates authentication', async () => {
    const authLost = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') return new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/roster/users/u-2/status' && init?.method === 'POST') return new Response(null, { status: 401 });
      throw new Error(`unexpected ${url}`);
    }));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="user" onBack={vi.fn()} onAcl={vi.fn()} onAuthenticationLoss={authLost} />);
    await waitFor(() => expect(container.querySelector("[data-step='suspend'] button")).not.toBeNull());
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-step='suspend'] button")!);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(authLost).toHaveBeenCalledOnce());
    expect(container.querySelector('[data-offboarding-card]')).toBeNull();
  });

  it.each([0, 1])('DELETE 401 at index %i clears state and stops the stage3 tail', async (failureIndex) => {
    const authLost = vi.fn();
    const deleted: string[] = [];
    const projected = { ...card(), steps: card().steps.map((step) => step.id === 'memberships' ? { ...step, groups: ['a', 'b', 'c'] } : step) };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') return new Response(JSON.stringify(projected), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/roster/groups') return new Response(JSON.stringify(['a', 'b', 'c'].map((name, index) => ({ id: `g-${index}`, name, system: false, members: [{ id: 'u-2', name: 'user', status: 'active' }] }))), { status: 200, headers: { 'content-type': 'application/json' } });
      if (init?.method === 'DELETE') {
        deleted.push(url);
        return new Response(null, { status: deleted.length - 1 === failureIndex ? 401 : 204 });
      }
      throw new Error(`unexpected ${url}`);
    }));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="user" onBack={vi.fn()} onAcl={vi.fn()} onAuthenticationLoss={authLost} />);
    await waitFor(() => expect(container.querySelector("[data-step='memberships'] button")).not.toBeNull());
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-step='memberships'] button")!);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(authLost).toHaveBeenCalledOnce());
    expect(deleted).toHaveLength(failureIndex + 1);
    expect(container.querySelector('[data-offboarding-card]')).toBeNull();
    expect(container.querySelector('[data-offboarding-outcomes]')).toBeNull();
  });

  it('same-tick stage1 confirms issue one POST', async () => {
    let release!: () => void;
    const suspend = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())} onSuspend={suspend} />);
    fireEvent.click(screen.getByRole('button', { name: '계정 비활성화' }));
    const confirm = within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!;
    act(() => { confirm.click(); confirm.click(); });
    await waitFor(() => expect(suspend).toHaveBeenCalledTimes(1));
    release();
  });

  it('same-tick stage3 confirms issue one preflight and one DELETE', async () => {
    let release!: (rows: readonly { id: string; name: string }[]) => void;
    const load = vi.fn()
      .mockResolvedValueOnce([{ id: 'g-1', name: 'group' }])
      .mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const remove = vi.fn().mockResolvedValue(undefined);
    const projected = { ...card(), steps: card().steps.map((step) => step.id === 'memberships' ? { ...step, groups: ['group'] } : step) };
    const { container } = render(<OffboardingCard card={projected} onLoadMemberships={load} onRemoveMembership={remove} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-step='memberships'] button")!);
    const confirm = within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!;
    act(() => { confirm.click(); confirm.click(); });
    expect(load).toHaveBeenCalledTimes(2);
    release([{ id: 'g-1', name: 'group' }]);
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  });
  it('accepted self-suspend followed by refresh 401 clears every stale offboarding control', async () => {
    let gets = 0;
    const authLost = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') {
        gets += 1;
        if (gets === 4) return new Response(null, { status: 401 });
        return new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/roster/users/u-2/status' && init?.method === 'POST') return new Response(null, { status: 204 });
      throw new Error(`unexpected ${url}`);
    }));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="stale" onBack={vi.fn()} onAcl={vi.fn()} onAuthenticationLoss={authLost} />);
    await waitFor(() => expect(container.querySelector("[data-step='suspend'] button")).not.toBeNull());
    const action = container.querySelector<HTMLButtonElement>("[data-step='suspend'] button")!;
    fireEvent.click(action);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(authLost).toHaveBeenCalledOnce());
    expect(container.querySelector('[data-offboarding-card]')).toBeNull();
    expect(container.querySelector('[data-offboarding-outcomes]')).toBeNull();
  });

  it('mid-plan roster 401 closes L2 and clears stale card and actions', async () => {
    let rosters = 0;
    const authLost = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') return new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/roster/groups') {
        rosters += 1;
        if (rosters === 2) return new Response(null, { status: 401 });
        return new Response(JSON.stringify([{ id: 'g-1', name: '기획팀', system: false, members: [{ id: 'u-2', name: 'user', status: 'active' }] }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`unexpected ${url}`);
    }));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="stale" onBack={vi.fn()} onAcl={vi.fn()} onAuthenticationLoss={authLost} />);
    await waitFor(() => expect(container.querySelector("[data-step='memberships'] button")).not.toBeNull());
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-step='memberships'] button")!);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(authLost).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(container.querySelector('[data-offboarding-card]')).toBeNull();
  });

  it('same-tick click and Enter start only one stage preflight per user', async () => {
    let resolveCard!: (value: OffboardingCardBody) => void;
    const loadCard = vi.fn(() => new Promise<OffboardingCardBody>((resolve) => { resolveCard = resolve; }));
    const { container } = render(<OffboardingCard card={card()} onLoadCard={loadCard} />);
    const suspend = container.querySelector<HTMLButtonElement>("[data-step='suspend'] button")!;
    fireEvent.click(suspend);
    fireEvent.keyDown(suspend, { key: 'Enter' });
    fireEvent.click(suspend);
    expect(loadCard).toHaveBeenCalledTimes(1);
    resolveCard(card());
  });

  it('same-tick stage3 activation starts only one roster preflight', () => {
    const load = vi.fn(() => new Promise<readonly { id: string; name: string }[]>(() => undefined));
    const { container } = render(<OffboardingCard card={card()} onLoadMemberships={load} />);
    const membership = container.querySelector<HTMLButtonElement>("[data-step='memberships'] button")!;
    fireEvent.click(membership);
    fireEvent.click(membership);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stage3 submit preflight 500 closes old consent and shows a safe retry message', async () => {
    const load = vi.fn().mockResolvedValueOnce([{ id: 'g-1', name: 'group' }]).mockRejectedValueOnce(new ApiError(500));
    const projected = { ...card(), steps: card().steps.map((step) => step.id === 'memberships' ? { ...step, groups: ['group'] } : step) };
    const { container } = render(<OffboardingCard card={projected} onLoadMemberships={load} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-step='memberships'] button")!);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getAllByRole('button').at(-1)!);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(container.querySelector('[data-offboarding-outcomes]')).toBeNull();
  });
});

describe('IR-PRINCIPAL-001 authoritative identity and exact handoff adapter', () => {
  it('uses the authoritative card name in the ready surface heading', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...card(), principalName: 'authoritative' }), { status: 200, headers: { 'content-type': 'application/json' } })));
    render(<OffboardingSurface principalId="u-2" principalName="stale" onBack={vi.fn()} onAcl={vi.fn()} />);
    expect((await screen.findByRole('heading', { name: /authoritative/ })).textContent).toContain('authoritative');
    expect(screen.queryByRole('heading', { name: /stale/ })).toBeNull();
  });

  it('does not append through onRevokePick when the exact replace adapter is absent', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/shell/AppShell.tsx'), 'utf8');
    expect(source).not.toMatch(/else\s+aclAudit\?\.onRevokePick\?\.\(subject\)/);
  });

  it('renders stage4 unavailable when no exact replacement adapter exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="user" onBack={vi.fn()} />);
    await waitFor(() => expect(container.querySelector('[data-offboarding-unavailable]')).not.toBeNull());
    expect(container.querySelector("[data-step='acl'] button")).toBeNull();
  });

  it('keeps search principals three-state and uses a separate offboarding subject status', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/api/client.ts'), 'utf8');
    expect(source).toMatch(/type PrincipalStatus = 'active' \| 'pending' \| 'suspended';/);
    expect(source).toMatch(/interface OffboardingSubject[\s\S]*status: RosterUserStatus/);
  });
});

const card = (status: 'active' | 'pending' | 'suspended' | 'rejected' = 'active'): OffboardingCardBody & { principalStatus: typeof status } => ({
  principalId: 'u-2', principalName: '같은 이름', principalStatus: status,
  steps: [
    { id: 'suspend', done: status === 'suspended' },
    { id: 'tokens', done: status !== 'active' },
    { id: 'memberships', done: false, groups: ['기획팀'] },
    { id: 'acl', done: false, remaining: 2 },
  ],
});

describe('IR-PRINCIPAL-001 AC-1 — 두 실제 진입점은 stable user ID를 연다', () => {
  it('사용자 명부의 중복 이름 행에서 누른 정확한 ID를 연다', async () => {
    const users: RosterUser[] = [
      { id: 'u-1', name: '같은 이름', status: 'active' },
      { id: 'u-2', name: '같은 이름', status: 'suspended' },
    ];
    const open = vi.fn();
    const Roster = UserRoster as unknown as ComponentType<{ users: RosterUser[]; onOffboard: (id: string) => void }>;
    render(<Roster users={users} onOffboard={open} />);

    await userEvent.setup().click(screen.getAllByRole('button', { name: '오프보딩 열기' })[1]!);
    expect(open).toHaveBeenCalledWith('u-2');
  });

  it('권한 회수 선택 목록은 사용자만 오프보딩으로 열고 그룹에는 진입점을 만들지 않는다', async () => {
    const user: PrincipalRow = { id: 'u-2', name: '같은 이름', kind: 'user', status: 'active', system: false };
    const group: PrincipalRow = { id: 'g-1', name: '같은 이름', kind: 'group', status: 'active', system: false };
    const open = vi.fn();
    const Panel = BulkRevokePanel as unknown as ComponentType<Record<string, unknown>>;
    render(<Panel contextKey="ctx" workspaceId="ws" subjects={[user, group]}
      plan={{ state: 'ready', data: { subjects: [{ subject: user, response: { scope: 'instance', rows: [] } }, { subject: group, response: { scope: 'instance', rows: [] } }] } }}
      onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn()} onRevokeSubject={vi.fn()} onOffboard={open} />);

    const buttons = screen.getAllByRole('button', { name: '오프보딩 열기' });
    expect(buttons).toHaveLength(1);
    await userEvent.setup().click(buttons[0]!);
    expect(open).toHaveBeenCalledWith(user);
  });
});

describe('IR-PRINCIPAL-001 AC-2/5 — exact 상태와 단계형 카드', () => {
  it('pending은 정지 완료가 아니며 네 행에 명시적 상태와 신문형 제목을 표시한다', () => {
    render(<OffboardingCard card={card('pending')} />);

    expect(screen.getByRole('heading', { name: '같은 이름 오프보딩' })).toBeDefined();
    const rows = screen.getAllByTestId('offboarding-step');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.getAttribute('data-done')).toBe('false');
    expect(rows[0]!.textContent).toContain('대기 계정');
    expect(rows[1]!.textContent).toContain('자동 차단');
  });

  it('계정 정지는 L2 Cancel에서 실행하지 않고 취소 뒤 단계 버튼으로 초점을 복원한다', async () => {
    const suspend = vi.fn();
    const ModernCard = OffboardingCard as unknown as ComponentType<{
      card: ReturnType<typeof card>;
      onLoadCard: () => Promise<ReturnType<typeof card>>;
      onSuspend: (id: string) => Promise<void>;
    }>;
    render(<ModernCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())} onSuspend={suspend} />);
    const button = screen.getByRole('button', { name: '계정 비활성화' });
    await userEvent.setup().click(button);
    const gate = await screen.findByRole('alertdialog');
    expect(gate.getAttribute('data-grade')).toBe('L2');
    expect(document.activeElement).toBe(within(gate).getByRole('button', { name: '취소' }));
    await userEvent.setup().click(within(gate).getByRole('button', { name: '취소' }));
    expect(suspend).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});

describe('IR-PRINCIPAL-001 AC-1/5 — 실제 설정 제품 경로', () => {
  it('사용자 관리에서 카드를 조회해 목록을 대체하고 제목에 초점을 둔다', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requested.push(String(input));
      return new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    render(<AppShell viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }} userRoster={[{ id: 'u-2', name: '같은 이름', status: 'active' }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '사용자 관리' }));
    await user.click(within(settings).getByRole('button', { name: '오프보딩 열기' }));

    const heading = await within(settings).findByRole('heading', { name: '같은 이름 오프보딩' });
    expect(requested).toContain('/api/principals/u-2/offboarding');
    expect(document.activeElement).toBe(heading);
    expect(within(settings).queryByRole('table', { name: '사용자 관리' })).toBeNull();

    await user.click(within(settings).getByRole('button', { name: '사용자 목록으로' }));
    const restored = within(settings).getByRole('button', { name: '오프보딩 열기' });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(restored);
  });
});

describe('IR-PRINCIPAL-001 AC-3 — ordinary-group fresh ID plan', () => {
  it('대화상자 열기/실행 직전에 ID 계획을 다시 읽고 첫 실패에서 tail을 멈춘다', async () => {
    let rosterGets = 0;
    const deleted: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') return new Response(JSON.stringify({
        ...card(),
        steps: card().steps.map((step) => step.id === 'memberships'
          ? { ...step, groups: ['중복 이름', '중복 이름', '긴 그룹 이름 '.repeat(12)] }
          : step),
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url === '/api/roster/groups') {
        rosterGets += 1;
        return new Response(JSON.stringify([
          { id: 'system', name: 'default', system: true, members: [{ id: 'u-2', name: '같은 이름', status: 'active' }] },
          { id: 'g-1', name: '중복 이름', system: false, members: [{ id: 'u-2', name: '같은 이름', status: 'active' }] },
          { id: 'g-2', name: '중복 이름', system: false, members: [{ id: 'u-2', name: '같은 이름', status: 'active' }] },
          { id: 'g-3', name: '긴 그룹 이름 '.repeat(12), system: false, members: [{ id: 'u-2', name: '같은 이름', status: 'active' }] },
        ]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (init?.method === 'DELETE') {
        deleted.push(url);
        return new Response(null, { status: url.includes('g-2') ? 400 : 204 });
      }
      throw new Error(`unexpected ${url}`);
    }));
    render(<OffboardingSurface principalId="u-2" principalName="같은 이름" onBack={vi.fn()} onAcl={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '그룹 멤버십 제거' }));
    const gate = await screen.findByRole('alertdialog');
    expect(rosterGets).toBe(1);
    expect(within(gate).getAllByText('중복 이름')).toHaveLength(2);
    expect(gate.textContent).not.toContain('default');
    await user.click(within(gate).getByRole('button', { name: '실행' }));
    expect(await screen.findByText(/결과 확인 필요/)).toBeDefined();
    expect(rosterGets).toBe(2);
    expect(deleted).toEqual(['/api/roster/groups/g-1/members/u-2', '/api/roster/groups/g-2/members/u-2']);
  });
});

describe('IR-PRINCIPAL-001 AC-5 수치화된 단계 화면 레이아웃', () => {
  it('결정된 글꼴, 간격, 행, 초점, 좁은 폭, 강제 색상 계약을 CSS로 고정한다', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/shell.css'), 'utf8');

    expect(css).toContain('[data-offboarding-card]');
    expect(css).toMatch(/data-offboarding-header[^}]*h2[^}]*font-size:\s*18px[^}]*font-weight:\s*600[^}]*line-height:\s*26px/s);
    expect(css).toMatch(/data-offboarding-steps[^}]*gap:\s*24px/s);
    expect(css).toMatch(/data-testid='offboarding-step'[^}]*min-height:\s*64px[^}]*padding:\s*16px/s);
    expect(css).toMatch(/data-offboarding-number[^}]*width:\s*24px[^}]*height:\s*24px/s);
    expect(css).toMatch(/data-offboarding-copy[^}]*min-width:\s*0/s);
    expect(css).toMatch(/data-offboarding-card[^}]*:focus-visible[^}]*outline:\s*2px[^}]*outline-offset:\s*2px/s);
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toMatch(/@media \(forced-colors: active\)[\s\S]*data-offboarding-card/);
  });
});

describe('IR-PRINCIPAL-001 AC-2 마지막 활성 슈퍼유저 floor', () => {
  it('409를 정해진 안전 문구로 표시한다', async () => {
    render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())}
      onSuspend={vi.fn().mockRejectedValue(new ApiError(409, undefined, { rule: 'last-active-superuser' }))} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));

    expect((await screen.findByRole('alert')).textContent).toContain('활성 슈퍼유저가 최소 한 명 남아 있어야 합니다.');
  });
});

describe('IR-PRINCIPAL-001 review fixes — authority, snapshots, and identity', () => {
  it('워크스페이스 관리자는 권한 회수에서 오프보딩 진입점과 GET을 받지 않는다', async () => {
    const selected: PrincipalRow = { id: 'u-2', name: '같은 이름', kind: 'user', status: 'active', system: false };
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    render(<AppShell viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }} aclAudit={{
      contextKey: 'ctx', managedScope: { state: 'ready', workspaceId: 'ws' }, subjects: [selected],
      revocationPlan: { state: 'ready', data: { subjects: [{ subject: selected, response: { scope: 'workspace', rows: [] } }] } },
      onRevokePick: vi.fn(), onRevokeRemove: vi.fn(), onPreviewRevocation: vi.fn(), onRevokeSubject: vi.fn(),
    }} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '권한 감사' }));
    expect(within(settings).queryByRole('button', { name: '오프보딩 열기' })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('이름까지 포함한 stage1 snapshot이 달라지면 POST하지 않는다', async () => {
    const suspend = vi.fn();
    const load = vi.fn().mockResolvedValueOnce(card()).mockResolvedValueOnce({ ...card(), principalName: '바뀐 이름' });
    render(<OffboardingCard card={card()} onLoadCard={load} onSuspend={suspend} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    expect(suspend).not.toHaveBeenCalled();
    expect((await screen.findByRole('alert')).textContent).toContain('계정 상태가 바뀌었습니다');
  });

  it('fresh snapshot이 이미 suspended면 POST하지 않는다', async () => {
    const suspend = vi.fn();
    render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card('suspended'))} onSuspend={suspend} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '계정 비활성화' }));
    expect(suspend).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await screen.findByRole('alert')).textContent).toContain('이미 비활성화');
  });

  it('POST 수락 뒤 refresh 실패를 보존하고 재시도는 POST 없이 read만 반복한다', async () => {
    const suspend = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockRejectedValueOnce(new Error('read')).mockResolvedValueOnce(undefined);
    render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())} onSuspend={suspend} onRefresh={refresh} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    const retry = await screen.findByRole('button', { name: '상태 새로 고침 다시 시도' });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    await user.click(retry);
    expect(suspend).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('normalized ID/name 집합을 비교하되 frozen 실행 순서를 보존하고 결과에 이름과 ID를 함께 표시한다', async () => {
    const plans = [
      [{ id: 'g-2', name: '기획팀' }, { id: 'g-1', name: '기획팀' }],
      [{ id: 'g-1', name: '기획팀' }, { id: 'g-2', name: '기획팀' }],
    ];
    const removed: string[] = [];
    const projected = { ...card(), steps: card().steps.map((step) => step.id === 'memberships' ? { ...step, groups: ['기획팀', '기획팀'] } : step) };
    render(<OffboardingCard card={projected} onLoadMemberships={vi.fn(async () => plans.shift()!)}
      onRemoveMembership={vi.fn(async (id) => { removed.push(id); })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '그룹 멤버십 제거' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    expect(removed).toEqual(['g-2', 'g-1']);
    expect(screen.getByText(/기획팀 \(g-2\).*제거 요청 수락/)).toBeDefined();
  });

  it('카드 그룹 이름 투영과 roster 계획이 다르면 실행 대화상자를 열지 않는다', async () => {
    render(<OffboardingCard card={card()} onLoadMemberships={vi.fn().mockResolvedValue([{ id: 'g-9', name: '다른팀' }])} />);
    await userEvent.setup().click(screen.getByRole('button', { name: '그룹 멤버십 제거' }));
    expect((await screen.findByRole('alert')).textContent).toContain('그룹 멤버십이 바뀌었습니다');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Surface와 카드의 aria-labelledby가 실제 Surface h2를 가리킨다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } })));
    const { container } = render(<OffboardingSurface principalId="u-2" principalName="같은 이름" onBack={vi.fn()} onAcl={vi.fn()} />);
    await screen.findByRole('button', { name: '계정 비활성화' });
    for (const section of container.querySelectorAll<HTMLElement>('[aria-labelledby]')) {
      expect(document.getElementById(section.getAttribute('aria-labelledby')!)).not.toBeNull();
    }
  });

  it('실제 Surface에서 accepted suspend 뒤 refresh 실패가 카드를 가리지 않고 read-only retry를 제공한다', async () => {
    let cardGets = 0;
    let patches = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/principals/u-2/offboarding') {
        cardGets += 1;
        if (cardGets === 4) return new Response(null, { status: 500 });
        return new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url === '/api/roster/users/u-2/status' && init?.method === 'POST') {
        patches += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`unexpected ${url}`);
    }));
    render(<OffboardingSurface principalId="u-2" principalName="같은 이름" onBack={vi.fn()} onAcl={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    expect(await screen.findByRole('button', { name: '상태 새로 고침 다시 시도' })).toBeDefined();
    expect(screen.getAllByTestId('offboarding-step')).toHaveLength(4);
    expect(patches).toBe(1);
  });

  it('rejected principal을 suspended로 위조하지 않고 ACL handoff에 보낸다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(card('rejected')), { status: 200, headers: { 'content-type': 'application/json' } })));
    const handoff = vi.fn();
    render(<OffboardingSurface principalId="u-2" principalName="같은 이름" onBack={vi.fn()} onAcl={handoff} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: /권한 일괄 회수/ }));
    expect(handoff).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-2', status: 'rejected' }));
  });

  it('사용자 카드의 ACL handoff는 기존 선택을 union하지 않고 exact [target]으로 교체한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(card()), { status: 200, headers: { 'content-type': 'application/json' } })));
    const replace = vi.fn();
    render(<AppShell viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }}
      userRoster={[{ id: 'u-2', name: '같은 이름', status: 'active' }]}
      aclAudit={{ onRevokeReplace: replace } as never} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설정' }));
    const settings = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(settings).getByRole('tab', { name: '사용자 관리' }));
    await user.click(within(settings).getByRole('button', { name: '오프보딩 열기' }));
    await user.click(await within(settings).findByRole('button', { name: /권한 일괄 회수/ }));
    expect(replace).toHaveBeenCalledWith([expect.objectContaining({ id: 'u-2', name: '같은 이름', status: 'active' })]);
  });

  it('stage1 mutation error는 alert, success는 stage row에 초점을 둔다', async () => {
    const user = userEvent.setup();
    const failed = render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())}
      onSuspend={vi.fn().mockRejectedValue(new Error('fail'))} />);
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
    failed.unmount();

    render(<OffboardingCard card={card()} onLoadCard={vi.fn().mockResolvedValue(card())}
      onSuspend={vi.fn().mockResolvedValue(undefined)} onRefresh={vi.fn().mockResolvedValue(undefined)} />);
    await user.click(screen.getByRole('button', { name: '계정 비활성화' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    await waitFor(() => expect(document.activeElement?.getAttribute('data-step')).toBe('suspend'));
  });

  it('stage3 partial outcome 완료 뒤 결과 region에 초점을 둔다', async () => {
    render(<OffboardingCard card={card()} onLoadMemberships={vi.fn()
      .mockResolvedValueOnce([{ id: 'g-1', name: '기획팀' }])
      .mockResolvedValueOnce([{ id: 'g-1', name: '기획팀' }])}
      onRemoveMembership={vi.fn().mockRejectedValue(new Error('drop'))} onRefresh={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '그룹 멤버십 제거' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '실행' }));
    const outcomes = await screen.findByRole('region', { name: '그룹 제거 결과' });
    await waitFor(() => expect(document.activeElement).toBe(outcomes));
  });

  it('handoff된 ACL L3를 취소하면 보존된 오프보딩 카드로 돌아가도록 알린다', async () => {
    const subject: PrincipalRow = { id: 'u-2', name: '같은 이름', kind: 'user', status: 'active', system: false };
    const exit = vi.fn();
    render(<BulkRevokePanel contextKey="handoff" workspaceId="ws" subjects={[subject]}
      plan={{ state: 'ready', data: { subjects: [{ subject, response: { subject: { id: subject.id, aclRevokePreservesSuperuserBypass: false }, scope: 'workspace', rows: [{ entryId: 'e-1', workspaceId: 'ws', workspaceName: '업무', path: null, level: 'view', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }] } }] } }}
      onPick={vi.fn()} onRemove={vi.fn()} onPreview={vi.fn().mockResolvedValue({ subjects: [{ subject, response: { subject: { id: subject.id, aclRevokePreservesSuperuserBypass: false }, scope: 'workspace', rows: [{ entryId: 'e-1', workspaceId: 'ws', workspaceName: '업무', path: null, level: 'view', grantedBy: null, grantedAt: '2026-09-18T00:00:00.000Z' }] } }] })}
      onRevokeSubject={vi.fn()} onFlowExit={exit} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '권한 전부 회수' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: '취소' }));
    expect(exit).toHaveBeenCalledOnce();
  });
});
