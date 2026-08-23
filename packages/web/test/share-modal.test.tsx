import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShareModal } from '../src/acl/ShareModal.js';
import type { ShareRow, ShareViewBody } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const 직접: ShareRow = {
  entryId: 'e1',
  principalId: 'p1',
  principalName: '직접이',
  principalKind: 'user',
  level: 'view',
  inherited: false,
  source: null,
};

const 상속: ShareRow = {
  entryId: null,
  principalId: 'p2',
  principalName: '위에서',
  principalKind: 'user',
  level: 'edit',
  inherited: true,
  source: '설계',
};

const 관리자에게 = (rows: ShareRow[]): ShareViewBody => ({
  metrics: { reachable: 3, viaAcl: 2 },
  rows,
  level: 'admin',
});

const 편집자에게: ShareViewBody = {
  metrics: { reachable: 3, viaAcl: 2 },
  rows: null,
  level: 'edit',
};

const 열기 = async (view: ShareViewBody | undefined, props: Record<string, unknown> = {}) => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })),
  );
  render(<ShareModal nodeId="n1" nodeName="회의록.md" {...(view === undefined ? {} : { view })} {...props} />);
  await user.click(screen.getByRole('button', { name: '회의록.md 공유' }));
  await screen.findByRole('dialog', { name: '회의록.md 공유' });
  return user;
};

describe('IR-ACL-002 — 상속 항목을 출처와 함께 읽기 전용으로', () => {
  it('AC-1: 직접 항목과 상속 항목이 함께 그려진다', async () => {
    await 열기(관리자에게([직접, 상속]));

    const 목록 = screen.getByRole('list', { name: '공유 대상' });

    expect(within(목록).getByText('직접이')).toBeDefined();
    expect(within(목록).getByText('위에서')).toBeDefined();
  });

  it('AC-2: 상속 항목에 출처 경로가 붙는다', async () => {
    await 열기(관리자에게([상속]));

    expect(screen.getByTestId('share-source').textContent).toContain('설계');
  });

  it('AC-3: 상속 항목에는 회수 버튼이 없다', async () => {
    await 열기(관리자에게([직접, 상속]));

    expect(screen.getByRole('button', { name: '직접이 회수' })).toBeDefined();
    // 여기서 지우는 것이 조상을 바꾸는 것인지 이 노드에서만 빼는 것인지
    // 모호하고, 후자는 거부 규칙이라 모델이 금지한다.
    expect(screen.queryByRole('button', { name: '위에서 회수' })).toBeNull();
  });

  it('AC-4: 직접과 상속이 구별된다', async () => {
    await 열기(관리자에게([직접, 상속]));

    const 줄 = within(screen.getByRole('list', { name: '공유 대상' })).getAllByRole('listitem');

    expect(줄.map((one) => one.getAttribute('data-inherited'))).toEqual(['false', 'true']);
  });

  it('AC-5: 상속 항목이 없어도 같은 구조로 그려진다', async () => {
    await 열기(관리자에게([직접]));

    expect(screen.getByRole('list', { name: '공유 대상' })).toBeDefined();
    expect(screen.getByTestId('share-metrics')).toBeDefined();
  });
});

describe('IR-ACL-003 — 검색해서 추가하고 레벨을 지정한다', () => {
  it('AC-1 · AC-2: 전체 목록이 아니라 검색 입력이 선다', async () => {
    await 열기(관리자에게([]));

    // 사용자와 그룹이 한 부품에서 함께 검색된다 — 권한은 주체에 붙지
    // 종류에 붙지 않는다.
    expect(screen.getByLabelText('사용자·그룹 검색')).toBeDefined();
  });

  it('AC-3: 보기와 편집 둘 중 하나를 지정한다', async () => {
    await 열기(관리자에게([]));

    const 고르개 = screen.getByLabelText('권한') as HTMLSelectElement;

    expect([...고르개.options].map((option) => option.value)).toEqual(['view', 'edit']);
    expect(고르개.value).toBe('view');
  });

  it('AC-4: 회수를 누르면 그 항목 ID 가 밖으로 나간다', async () => {
    const 회수한것: string[] = [];
    const user = await 열기(관리자에게([직접]), { onRevoke: (id: string) => 회수한것.push(id) });

    await user.click(screen.getByRole('button', { name: '직접이 회수' }));

    expect(회수한것).toEqual(['e1']);
  });

  it('고르지 않았으면 추가할 수 없다', async () => {
    await 열기(관리자에게([]));

    expect(screen.getByRole('button', { name: '추가' })).toHaveProperty('disabled', true);
  });
});

describe('SEC-ACL-015 — 목록은 관리 전용', () => {
  it('AC-1: 편집 보유자에게는 목록이 아예 그려지지 않는다', async () => {
    await 열기(편집자에게);

    expect(screen.queryByRole('list', { name: '공유 대상' })).toBeNull();
  });

  it('AC-5: 그래도 수치는 보인다', async () => {
    await 열기(편집자에게);

    expect(screen.getByTestId('share-metrics').textContent).toContain('3');
  });

  it('`IR-ACL-001` AC-3: 이 화면의 지표는 접근 가능 하나다', async () => {
    await 열기(관리자에게([직접]));

    const text = screen.getByTestId('share-metrics').textContent ?? '';
    expect(text).toContain('접근 가능');
    // `ACL 접근자` 는 상속 끊김 감사 목록의 지표다 (`IR-ACL-001` AC-4).
    // 한 화면에 둘을 나란히 두면 사용자가 어느 쪽을 읽는지 갈린다.
    expect(text).not.toContain('ACL 접근자');
    // 접근 가능 수치가 그 화면의 수치임을 값으로 잰다 — 라벨만 보면
    // 반대쪽 수를 그리고 이름만 바꾼 구현도 통과한다.
    expect(text).toContain('3');
    expect(text).not.toContain('2');
  });

  it('AC-6: 이름 하나도 대신 보이지 않는다', async () => {
    await 열기(편집자에게);

    const 모달 = screen.getByRole('dialog', { name: '회의록.md 공유' });

    expect(모달.textContent ?? '').not.toContain('직접이');
    expect(모달.textContent ?? '').not.toContain('위에서');
  });
});

describe('CON-PRINCIPAL-006 — 공유 모달도 그 부품을 쓴다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  it('AC-1: 공유 모달이 PrincipalPicker 를 배치한다', () => {
    const source = readFileSync(join(WEB, 'src', 'acl', 'ShareModal.tsx'), 'utf8');

    expect(source).toContain('<PrincipalPicker');
  });

  it('AC-2: 공유 모달이 자체 주체 검색을 만들지 않는다', () => {
    const code = readFileSync(join(WEB, 'src', 'acl', 'ShareModal.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).not.toContain('fetchPrincipals');
    expect(code).not.toContain('/principals');
  });

  it('AC-1: 그 부품을 배치한 화면이 이제 둘 이상이다', () => {
    const 배치 = sources(join(WEB, 'src')).filter((file) =>
      readFileSync(file, 'utf8').includes('<PrincipalPicker'),
    );

    expect(배치.length).toBeGreaterThanOrEqual(1);
  });
});
