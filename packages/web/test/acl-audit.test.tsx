import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BulkRevokePanel } from '../src/acl/BulkRevokePanel.js';
import { InheritanceAuditPanel } from '../src/acl/InheritanceAuditPanel.js';
import { RelocationPreview } from '../src/acl/RelocationPreview.js';
import { SimulationPanel } from '../src/acl/SimulationPanel.js';
import type { PrincipalRow } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 서버가 준 검색 결과를 그대로 흉내 낸다. */
const serving = (rows: readonly PrincipalRow[]) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
};

const 고른다 = async (name: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('사용자·그룹 검색'), name);
  await screen.findByText(name);
  await user.click(screen.getByText(name));
};

describe('이동·복사 프리뷰 (`FR-ACL-006` · `FR-ACL-002` · `IR-ACL-001` AC-3)', () => {
  it('이동은 전후 두 수치를 함께 보인다 (`FR-ACL-006` AC-1)', () => {
    render(<RelocationPreview relocation={{ kind: 'move', before: 3, after: 5 }} />);

    const preview = screen.getByTestId('relocation-preview');
    expect(preview.textContent ?? '').toContain('3명');
    expect(preview.textContent ?? '').toContain('5명');
  });

  it('수치가 변하지 않는 이동도 같은 형식이다 (`FR-ACL-006` AC-6)', () => {
    const { container } = render(<RelocationPreview relocation={{ kind: 'move', before: 4, after: 4 }} />);

    // 형식이 같다는 것은 자리 수가 같다는 뜻이다 — 「변화 없음」 한 줄로
    // 접으면 사용자가 전후를 대조할 수 없다.
    expect(container.querySelectorAll('[data-testid="relocation-count"]')).toHaveLength(2);
  });

  it('복사는 목적지 기준 수치 하나를 보인다 (`FR-ACL-002` AC-1)', () => {
    render(<RelocationPreview relocation={{ kind: 'copy', reachable: 7 }} />);

    const text = screen.getByTestId('relocation-preview').textContent ?? '';
    expect(text).toContain('7명');
    // 라벨 단언을 이동 렌더에만 걸면 「한 부품이라 같다」가 구조 논증으로만
    // 남는다 — 복사 경로에서도 직접 잰다 (`FR-ACL-002` AC-5).
    expect(text).toContain('접근 가능');
    expect(text).not.toContain('접근 가능자');
    expect(text).not.toContain('ACL 접근자');
  });

  it('지표명은 접근 가능 이고 다른 라벨을 쓰지 않는다 (`FR-ACL-006` AC-5 · `FR-ACL-002` AC-5)', () => {
    render(<RelocationPreview relocation={{ kind: 'move', before: 1, after: 2 }} />);

    const text = screen.getByTestId('relocation-preview').textContent ?? '';
    expect(text).toContain('접근 가능');
    // 「접근 가능자」·「접근자」 같은 변형이 섞이면 같은 지표가 화면마다 다른
    // 이름으로 불린다.
    expect(text).not.toContain('접근 가능자');
    expect(text).not.toContain('ACL 접근자');
  });

  it('명단을 그릴 자리가 없다 (`FR-ACL-006` AC-3 · `SEC-ACL-015` AC-4)', () => {
    render(
      <RelocationPreview
        relocation={{ kind: 'move', before: 1, after: 2 }}
        // 명단을 실어 보내도 그리지 않는다 — 소품에 칸이 있으면 그 칸이
        // 곧 누출 경로가 된다.
        {...({ roster: ['한범', '지원'] } as Record<string, unknown>)}
      />,
    );

    // 부재만 재면 부품이 아무것도 안 그려도 통과한다 — 그릴 것은 그리고
    // 명단만 안 그린다는 것이 이 AC 다.
    expect(screen.getByTestId('relocation-preview').textContent ?? '').toContain('2명');
    expect(screen.queryByText('한범')).toBeNull();
    expect(screen.queryByText('지원')).toBeNull();
  });

  it('관리 보유자에게만 시뮬레이션으로 가는 안내가 붙는다 (`FR-ACL-006` AC-4)', () => {
    const { rerender } = render(
      <RelocationPreview relocation={{ kind: 'move', before: 1, after: 2 }} level="edit" />,
    );
    expect(screen.queryByTestId('roster-elsewhere')).toBeNull();

    rerender(<RelocationPreview relocation={{ kind: 'move', before: 1, after: 2 }} level="admin" />);
    expect(screen.getByTestId('roster-elsewhere').textContent ?? '').toContain('시뮬레이션');
  });
});

describe('주체 축 일괄 회수 (`FR-ACL-003` · `FR-PRINCIPAL-004` · `FR-PRINCIPAL-010`)', () => {
  const 행 = {
    entryId: 'e1',
    workspaceId: 'ws1',
    workspaceName: '기획팀',
    path: '열린방/회의록.md',
    level: 'view' as const,
    grantedBy: '설치자',
    grantedAt: '2026-08-20T01:02:03.000Z',
  };

  it('영향 범위 표가 다섯 열을 갖는다 (`FR-ACL-003` AC-4)', () => {
    render(<BulkRevokePanel workspaceId="ws1" revocation={{ scope: 'instance', rows: [행] }} />);

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['워크스페이스', '경로', '레벨', '부여자', '부여 시각']);
    const row = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    expect(row.textContent ?? '').toContain('기획팀');
    expect(row.textContent ?? '').toContain('열린방/회의록.md');
  });

  it('슈퍼유저에게는 전 인스턴스임을 밝힌다 (`FR-PRINCIPAL-004` AC-2 · AC-3)', () => {
    render(<BulkRevokePanel workspaceId="ws1" revocation={{ scope: 'instance', rows: [행] }} />);

    const 문구 = screen.getByTestId('revocation-scope').textContent ?? '';
    expect(문구).toContain('전 인스턴스');
    // 슈퍼유저에게 관리 범위 한정 문구를 그대로 보이면 부분 회수로 오해한다.
    expect(문구).not.toContain('관리하는 워크스페이스에만');
  });

  it('워크스페이스 관리자에게는 자기 관리 범위임을 밝힌다 (`FR-PRINCIPAL-004` AC-1)', () => {
    render(<BulkRevokePanel workspaceId="ws1" revocation={{ scope: 'managed-workspaces', rows: [행] }} />);

    const 문구 = screen.getByTestId('revocation-scope').textContent ?? '';
    expect(문구).toContain('관리하는 워크스페이스');
    expect(문구).not.toContain('전 인스턴스');
  });

  it('주체는 공용 부품으로 고른다 (`CON-PRINCIPAL-006` AC-1)', async () => {
    serving([{ id: 'g-default', name: 'default', kind: 'group', status: 'active' }]);
    const 골랐다 = vi.fn();
    render(<BulkRevokePanel workspaceId="ws1" onPick={골랐다} />);

    await 고른다('default');

    expect(골랐다).toHaveBeenCalledWith(expect.objectContaining({ id: 'g-default' }));
  });

  it('시스템 그룹도 회수 대상이다 (`FR-PRINCIPAL-010` AC-1)', () => {
    const 걷는다 = vi.fn();
    render(
      <BulkRevokePanel
        workspaceId="ws1"
        subject={{ id: 'g-default', name: 'default', kind: 'group', status: 'active' }}
        revocation={{ scope: 'instance', rows: [행] }}
        onRevoke={걷는다}
      />,
    );

    const 버튼 = screen.getByRole('button', { name: /회수/ });
    expect((버튼 as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/시스템 그룹은 회수할 수 없/)).toBeNull();
  });

  it('걷을 것이 없으면 실행할 수 없다 — 빈 실행은 감사 행만 남긴다', () => {
    render(
      <BulkRevokePanel
        workspaceId="ws1"
        subject={{ id: 'u1', name: '한범', kind: 'user', status: 'active' }}
        revocation={{ scope: 'instance', rows: [] }}
      />,
    );

    expect((screen.getByRole('button', { name: /회수/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('유효 권한 시뮬레이션 (`FR-ACL-004`)', () => {
  const 노드 = (over: Record<string, unknown> = {}) => ({
    nodeId: 'n1',
    workspaceId: 'ws1',
    workspaceName: '기획팀',
    path: '열린방/회의록.md',
    level: 'edit' as const,
    source: 'direct' as const,
    ...over,
  });

  it('상속으로 받은 권한과 직접 부여를 구별해 보인다 (AC-5)', () => {
    render(
      <SimulationPanel
        workspaceId="ws1"
        simulation={{
          subjectId: 'u1',
          nodes: [노드(), 노드({ nodeId: 'n2', path: '열린방', source: 'inherited' })],
        }}
      />,
    );

    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows[1]!.textContent ?? '').toContain('직접 부여');
    expect(rows[2]!.textContent ?? '').toContain('상속');
    expect(rows[2]!.textContent ?? '').not.toContain('직접 부여');
  });

  it('볼 수 없는 노드도 행으로 보인다 (AC-6)', () => {
    render(
      <SimulationPanel
        workspaceId="ws1"
        simulation={{ subjectId: 'u1', nodes: [노드({ level: null, source: null })] }}
      />,
    );

    expect(within(screen.getByRole('table')).getAllByRole('row')[1]!.textContent ?? '').toContain('볼 수 없음');
  });

  it('주체는 공용 부품으로 고른다 (`CON-PRINCIPAL-006` AC-1)', async () => {
    serving([{ id: 'u1', name: '한범', kind: 'user', status: 'active' }]);
    const 골랐다 = vi.fn();
    render(<SimulationPanel workspaceId="ws1" onPick={골랐다} />);

    await 고른다('한범');

    expect(골랐다).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });
});

describe('상속 끊김 감사 (`FR-ACL-005` · `IR-ACL-001` AC-4 · AC-6)', () => {
  const 행 = (over: Record<string, unknown> = {}) => ({
    nodeId: 'n1',
    workspaceId: 'ws1',
    workspaceName: '기획팀',
    path: '닫힌방',
    aclAccessors: 2,
    ...over,
  });

  it('지표명은 ACL 접근자 이고 접근 가능 을 쓰지 않는다 (`FR-ACL-005` AC-4)', () => {
    render(<InheritanceAuditPanel audit={{ rows: [행()] }} />);

    const text = screen.getByTestId('broken-row-n1').textContent ?? '';
    expect(text).toContain('ACL 접근자');
    expect(text).toContain('2명');
    expect(text).not.toContain('접근 가능');
  });

  it('ACL 접근자가 0 인 행은 고립 노드 문구를 따른다 (`FR-ACL-005` AC-5 · `IR-ACL-001` AC-6)', () => {
    render(<InheritanceAuditPanel audit={{ rows: [행({ aclAccessors: 0 })] }} />);

    const text = screen.getByTestId('broken-row-n1').textContent ?? '';
    expect(text).toContain('권한으로 접근할 수 있는 사람이 없습니다');
    expect(text).toContain('워크스페이스 관리자와 슈퍼유저');
    // 이 목록을 보고 있는 요청자 자신이 반례라 거짓 진술이 된다.
    expect(text).not.toContain('아무도 볼 수 없');
  });

  it('행마다 상속으로 되돌리기를 실행한다 (`FR-ACL-005` AC-2)', async () => {
    const 되돌린다 = vi.fn();
    render(<InheritanceAuditPanel audit={{ rows: [행()] }} onRestore={되돌린다} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /닫힌방.*되돌리기/ }));

    expect(되돌린다).toHaveBeenCalledWith('n1');
  });

  it('끊긴 노드가 없으면 그 사실을 말한다 — 빈 표는 조회 실패와 구별되지 않는다', () => {
    render(<InheritanceAuditPanel audit={{ rows: [] }} />);

    expect(screen.getByTestId('broken-empty').textContent ?? '').toContain('상속이 끊긴 노드가 없습니다');
  });
});

describe('권한 감사 구역 (`IR-SHELL-002` · `FR-ACL-003`~`FR-ACL-005`)', () => {
  it('세 화면이 한 구역의 탭으로 선다', async () => {
    const { AclAuditPanel } = await import('../src/acl/AclAuditPanel.js');
    render(<AclAuditPanel workspaceId="ws1" />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      '권한 회수',
      '유효 권한 시뮬레이션',
      '상속 끊김',
    ]);
  });

  it('탭을 바꾸면 그 화면이 선다', async () => {
    const { AclAuditPanel } = await import('../src/acl/AclAuditPanel.js');
    render(<AclAuditPanel workspaceId="ws1" audit={{ rows: [] }} />);

    await userEvent.setup().click(screen.getByRole('tab', { name: '상속 끊김' }));

    expect(screen.getByTestId('broken-empty')).toBeDefined();
  });

  it('워크스페이스가 정해지지 않으면 주체를 고를 자리를 열지 않는다', async () => {
    const { AclAuditPanel } = await import('../src/acl/AclAuditPanel.js');
    render(<AclAuditPanel />);

    // 스코프 없이 부품을 세우면 그 자리가 곧 명부로 가는 경로가 된다
    // (`R162`) — 그래서 근거가 없으면 검색칸 자체를 두지 않는다.
    expect(screen.queryByLabelText('사용자·그룹 검색')).toBeNull();
    expect(screen.getByTestId('audit-no-workspace')).toBeDefined();
  });
});

describe('설정 모달의 권한 감사 카테고리가 실제로 그 구역을 연다', () => {
  it('관리 권한 보유자에게 세 탭이 보인다', async () => {
    const { AppShell } = await import('../src/shell/AppShell.js');
    render(
      <AppShell
        viewer={{ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 }}
        aclAudit={{ workspaceId: 'ws1' }}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '권한 감사' }));

    // 카테고리 이름만 적힌 자리표가 아니라 실제 구역이 선다.
    expect(within(modal).getByRole('tab', { name: '유효 권한 시뮬레이션' })).toBeDefined();
  });
});
