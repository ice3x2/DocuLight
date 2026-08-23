import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '../src/shell/AppShell.js';
import { visibleCategories } from '../src/shell/shell-contract.js';
import type { RosterGroup, RosterUser } from '../src/api/client.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const superuser = { superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 };
const 보통 = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };

const USERS: RosterUser[] = [
  { id: 'u1', name: '활성이', status: 'active' },
  { id: 'u2', name: '대기자', status: 'pending' },
  { id: 'u3', name: '정지자', status: 'suspended' },
  { id: 'u4', name: '거절자', status: 'rejected' },
];

const GROUPS: RosterGroup[] = [
  { id: 'g-default', name: 'default', system: true, members: [] },
  { id: 'g1', name: '기획팀원', system: false, members: [USERS[0]!] },
];

const openCategory = async (name: string, props: Record<string, unknown> = {}) => {
  const user = userEvent.setup();
  render(<AppShell viewer={superuser} {...props} />);
  await user.click(screen.getByRole('button', { name: '설정' }));
  await user.click(
    within(await screen.findByRole('dialog', { name: '설정' })).getByRole('tab', { name }),
  );
  return user;
};

describe('FR-PRINCIPAL-009 — 사용자 관리 화면은 네 상태를 그대로 표시한다', () => {
  it('AC-1 · AC-2 · AC-3: 네 문구가 그대로 나온다', async () => {
    await openCategory('사용자 관리', { userRoster: USERS });

    expect(screen.getAllByTestId('roster-status').map((cell) => cell.textContent)).toEqual([
      '활성',
      '대기',
      '정지',
      '거절',
    ]);
  });

  it('AC-2: rejected 계정이 목록에서 빠지지 않는다', async () => {
    await openCategory('사용자 관리', { userRoster: USERS });

    // 주체 검색은 이것을 뺀다. 그 규칙을 여기 옮겨 붙이면 슈퍼유저가
    // 거절 이력을 운영할 수 없다.
    expect(screen.getByText('거절자')).toBeDefined();
  });

  it('AC-4: 네 상태를 비활성 하나로 묶지 않는다', async () => {
    await openCategory('사용자 관리', { userRoster: USERS });

    const 문구 = screen.getAllByTestId('roster-status').map((cell) => cell.textContent);

    expect(new Set(문구).size).toBe(4);
    expect(문구).not.toContain('비활성');
  });
});

describe('FR-PRINCIPAL-001 — 그룹 관리와 표시 권한', () => {
  it('AC-2: 그룹과 그 멤버가 나온다', async () => {
    await openCategory('그룹 관리', { groupRoster: GROUPS });

    expect(screen.getByText('기획팀원')).toBeDefined();
    expect(screen.getByText('활성이')).toBeDefined();
  });

  it('AC-2: 시스템 그룹은 보이되 삭제 버튼이 없다', async () => {
    await openCategory('그룹 관리', { groupRoster: GROUPS });

    expect(screen.getByTestId('system-group')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'default 삭제' })).toBeNull();
    expect(screen.getByRole('button', { name: '기획팀원 삭제' })).toBeDefined();
  });

  it('AC-2: 삭제를 누르면 그 그룹 ID 가 밖으로 나간다', async () => {
    const 지운것: string[] = [];
    const user = await openCategory('그룹 관리', {
      groupRoster: GROUPS,
      onGroupRemove: (id: string) => 지운것.push(id),
    });

    await user.click(screen.getByRole('button', { name: '기획팀원 삭제' }));

    expect(지운것).toEqual(['g1']);
  });

  it('AC-3: 슈퍼유저가 아니면 두 카테고리가 보이지 않는다', () => {
    const 보이는것 = visibleCategories(보통).map((category) => category.id);

    expect(보이는것).not.toContain('users');
    expect(보이는것).not.toContain('groups');
  });
});

describe('R163 — 두 화면이 서로의 규칙을 쓰지 않는다', () => {
  const sources = (at: string): string[] =>
    readdirSync(at).flatMap((name) => {
      const full = join(at, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.tsx?$/.test(name) ? [full] : [];
    });

  /**
   * 주석은 걷어낸다 — 「이 부품을 쓰지 마라」를 적으려면 그 이름을 인용할
   * 수밖에 없다. 코드에 있는지가 이 시험이 재는 것이다.
   */
  const codeOf = (source: string): string =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

  /**
   * 재는 것은 **명부 목록 데이터흐름**이지 파일이 아니다.
   *
   * 초판은 두 파일 전체에서 `PrincipalPicker` 문자열의 부재를 쟀는데, 그
   * 판정식은 `CON-PRINCIPAL-006` AC-1 이 이름 댄 「그룹 멤버 추가」와
   * 정면으로 부딪힌다 — 그 조작은 명부 열람이 아니라 `R112-b`(2자·20건)가
   * 걸리는 주체 검색이다. `R163` 자신이 판정 기준을 「고르는 화면인가」가
   * 아니라 「`R112-b` 가 걸리는가」로 둔 것이 그 근거다.
   *
   * 그래서 두 화면을 갈라 잰다. 명부를 그리는 쪽이 검색 규칙을 **직접**
   * 다시 구현하지 않는 것이 이 조항의 실질이므로, 두 파일 모두에서
   * `fetchPrincipals`·`/principals` 의 부재는 그대로 잰다.
   */
  it('명부 화면이 검색 규칙을 직접 다시 구현하지 않는다', () => {
    for (const file of ['UserRoster.tsx', 'GroupRoster.tsx']) {
      const code = codeOf(readFileSync(join(WEB, 'src', 'principal', file), 'utf8'));

      expect(code).not.toContain('fetchPrincipals');
      expect(code).not.toContain('/principals');
    }
  });

  it('사용자 관리 화면에는 주체를 고르는 자리 자체가 없다', () => {
    // 이쪽에는 멤버 추가 같은 하위 상호작용이 없다 — 그래서 부품의 부재를
    // 그대로 잰다. 이 화면에 그 부품이 서면 `R112-d` 의 네 상태가 세 상태로
    // 줄고 `rejected` 가 화면에서 사라진다.
    const code = codeOf(readFileSync(join(WEB, 'src', 'principal', 'UserRoster.tsx'), 'utf8'));

    expect(code).not.toContain('PrincipalPicker');
  });

  it('중립어 비활성 이 명부 쪽 문구 매핑에 없다', () => {
    // 두 매핑을 하나로 합치려는 리팩터링은 두 조항 중 하나를 반드시
    // 깨뜨린다 — 합치면 그쪽이 `거절` 을 얻거나 이쪽이 `비활성` 을 얻는다.
    const roster = readFileSync(join(WEB, 'src', 'principal', 'UserRoster.tsx'), 'utf8');
    const picker = readFileSync(join(WEB, 'src', 'principal', 'PrincipalPicker.tsx'), 'utf8');

    expect(roster).not.toContain("'비활성'");
    expect(picker).not.toContain("'거절'");
  });

  it('명부 API 를 부르는 자리가 선언 파일 하나뿐이다', () => {
    const src = join(WEB, 'src');
    const ALLOWED = new Set([join('api', 'client.ts'), join('api', 'queries.ts'), 'App.tsx']);

    const callers = sources(src)
      .map((file) => ({ path: file.slice(src.length + 1), file }))
      .filter(({ path }) => !ALLOWED.has(path))
      .filter(({ file }) => readFileSync(file, 'utf8').includes('/roster/'))
      .map(({ path }) => path);

    expect(callers).toEqual([]);
  });
});

describe('CON-PRINCIPAL-006 — 그룹 멤버 추가도 공용 부품으로 고른다', () => {
  it('AC-1: 그룹마다 `PrincipalPicker` 로 멤버를 더한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Response(JSON.stringify([{ id: 'u9', name: '새사람', kind: 'user', status: 'active' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const 더했다 = vi.fn();
    const { GroupRoster } = await import('../src/principal/GroupRoster.js');
    render(<GroupRoster groups={GROUPS} onAddMember={더했다} />);

    const user = userEvent.setup();
    // 그룹이 여럿이므로 검색칸도 그룹마다 선다 — 하나만 두면 어느 그룹에
    // 넣는지 화면이 표현할 수 없다.
    const 검색칸 = screen.getAllByLabelText('사용자·그룹 검색');
    expect(검색칸).toHaveLength(GROUPS.length);
    await user.type(검색칸[0]!, '새사람');
    await screen.findByText('새사람');
    await user.click(screen.getByText('새사람'));

    expect(더했다).toHaveBeenCalledWith(GROUPS[0]!.id, 'u9');
  });
});
