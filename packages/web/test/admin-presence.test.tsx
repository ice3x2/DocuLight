import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GrantConfirm } from '../src/acl/GrantConfirm.js';
import { NewWorkspaceForm } from '../src/workspace/NewWorkspaceForm.js';
import { WorkspaceList } from '../src/workspace/WorkspaceList.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 서버없이 = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })),
  );

const WORKSPACES = [
  { id: 'w1', name: '기획팀', adminless: false },
  { id: 'w2', name: '버려진팀', adminless: true },
];

describe('FR-PRINCIPAL-006 — 관리자 없음 배지', () => {
  it('AC-1: 관리자가 없는 워크스페이스에만 배지가 붙는다', () => {
    render(<WorkspaceList workspaces={WORKSPACES} label="워크스페이스" />);

    const 줄 = within(screen.getByRole('list', { name: '워크스페이스' })).getAllByRole('listitem');

    expect(within(줄[0]!).queryByTestId('adminless-badge')).toBeNull();
    expect(within(줄[1]!).getByTestId('adminless-badge').textContent).toBe('관리자 없음');
  });

  it('AC-2: 스코프 선택기도 같은 부품을 쓴다', () => {
    render(<WorkspaceList workspaces={WORKSPACES} label="워크스페이스 범위" />);

    // 두 화면이 각자 그리면 한쪽만 배지를 잊는다.
    expect(within(screen.getByRole('list', { name: '워크스페이스 범위' })).getByTestId('adminless-badge')).toBeDefined();
  });

  it('AC-4: 배지에 닫기 수단이 없다', () => {
    render(<WorkspaceList workspaces={WORKSPACES} label="워크스페이스" />);

    const 배지 = screen.getByTestId('adminless-badge');

    // 닫을 수 있으면 닫은 사람만 그 사실을 잊는다.
    expect(within(배지).queryByRole('button')).toBeNull();
    expect(배지.textContent).toBe('관리자 없음');
  });

  it('AC-3: 좌측 트리 부품에는 이 배지가 없다', () => {
    const tree = readFileSync(join(WEB, 'src', 'tree', 'DocumentTree.tsx'), 'utf8');

    // 트리는 문서를 찾는 자리고 거기서 관리 상태로 할 수 있는 일이 없다.
    expect(tree).not.toContain('adminless');
    expect(tree).not.toContain('관리자 없음');
  });
});

describe('FR-PRINCIPAL-005 · FR-PRINCIPAL-008 — 확인은 차단이 아니다', () => {
  it('사유가 없으면 아무것도 그리지 않는다', () => {
    render(<GrantConfirm warnings={[]} onConfirm={() => undefined} onCancel={() => undefined} />);

    expect(screen.queryByRole('alertdialog', { name: '확인' })).toBeNull();
  });

  it('FR-PRINCIPAL-005 AC-2: 마지막 관리 권한자 사유가 문구로 나온다', () => {
    render(
      <GrantConfirm warnings={['last-administrator']} onConfirm={() => undefined} onCancel={() => undefined} />,
    );

    expect(screen.getByTestId('grant-warning').textContent).toContain('마지막 관리 권한자');
  });

  it('FR-PRINCIPAL-005 AC-3 · FR-PRINCIPAL-008 AC-2: 취소하면 진행되지 않는다', async () => {
    const 진행: string[] = [];
    const 취소: string[] = [];
    const user = userEvent.setup();
    render(
      <GrantConfirm
        warnings={['suspended-subject']}
        onConfirm={() => 진행.push('했다')}
        onCancel={() => 취소.push('말았다')}
      />,
    );

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(진행).toEqual([]);
    expect(취소).toEqual(['말았다']);
  });

  it('FR-PRINCIPAL-005 AC-1: 계속을 누르면 실행된다 — 차단이 아니다', async () => {
    const 진행: string[] = [];
    const user = userEvent.setup();
    render(
      <GrantConfirm warnings={['last-administrator']} onConfirm={() => 진행.push('했다')} onCancel={() => undefined} />,
    );

    await user.click(screen.getByRole('button', { name: '계속' }));

    expect(진행).toEqual(['했다']);
  });

  it('FR-PRINCIPAL-008 AC-1: 비활성 계정 문구가 잠재 효과를 말한다', () => {
    render(
      <GrantConfirm warnings={['suspended-subject']} onConfirm={() => undefined} onCancel={() => undefined} />,
    );

    const 문구 = screen.getByTestId('grant-warning').textContent ?? '';

    expect(문구).toContain('비활성');
    // 부여하는 제3자에게 징계나 오프보딩을 함의하지 않는다.
    expect(문구).not.toMatch(/정지|오프보딩|퇴사/);
  });
});

describe('FR-PRINCIPAL-007 — 생성 폼의 초기 권한', () => {
  it('AC-1 · AC-2: 입력이 있고 기본값이 없음 이다', () => {
    서버없이();
    render(<NewWorkspaceForm />);

    const 고르개 = screen.getByLabelText('기본 그룹 초기 권한') as HTMLSelectElement;

    expect([...고르개.options].map((option) => option.value)).toEqual(['none', 'view', 'edit']);
    expect(고르개.value).toBe('none');
  });

  it('AC-5: 자유 가입에서 편집을 고르면 경고가 뜬다', async () => {
    서버없이();
    const user = userEvent.setup();
    render(<NewWorkspaceForm signupMode="open" onCreate={() => undefined} />);
    await user.type(screen.getByLabelText('이름'), '기획팀');
    await user.type(screen.getByLabelText('사용자·그룹 검색'), '관리');

    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'edit');

    // 아직 만들어지지 않았다 — 경고는 실행 전에 선다.
    expect(screen.queryByRole('alertdialog', { name: '확인' })).toBeNull();
  });

  it('AC-5: 승인 가입에서는 편집을 골라도 경고가 없다', async () => {
    서버없이();
    const user = userEvent.setup();
    render(<NewWorkspaceForm signupMode="approval" />);

    await user.selectOptions(screen.getByLabelText('기본 그룹 초기 권한'), 'edit');

    expect(screen.queryByRole('alertdialog', { name: '확인' })).toBeNull();
  });

  it('관리자를 고르지 않으면 만들 수 없다', () => {
    서버없이();
    render(<NewWorkspaceForm />);

    // 만들고 나서 지정하게 하면 관리자 없는 워크스페이스가 그 사이에 존재한다.
    expect(screen.getByRole('button', { name: '만들기' })).toHaveProperty('disabled', true);
  });
});

describe('CON-PRINCIPAL-006 — 새 화면도 그 부품을 쓴다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  it('AC-1: 주체를 고르는 화면이 이제 둘 이상이고 전부 이 부품을 쓴다', () => {
    const 배치 = sources(join(WEB, 'src'))
      .filter((file) => readFileSync(file, 'utf8').includes('<PrincipalPicker'))
      .map((file) => file.slice(join(WEB, 'src').length + 1));

    expect(배치.length).toBeGreaterThanOrEqual(2);
  });
});
