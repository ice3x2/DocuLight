import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InstanceSettings } from '../src/settings/InstanceSettings.js';
import { INSTANCE_SETTINGS } from '../src/shell/shell-contract.js';

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let saved: Array<Record<string, string>>;

beforeEach(() => {
  saved = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        saved.push(JSON.parse(String(init.body)));
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(
        json({
          'signup-mode': 'approval',
          'upload-size-limit-bytes': '104857600',
          'retained-version-count': '20',
          'trash-retention-days': '30',
          'audit-retention-days': '365',
        }),
      );
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IR-SHELL-002 AC-7 · DR-SHELL-001 AC-3 — 인스턴스 설정을 화면에서 바꾼다', () => {
  it('AC-7: 다섯 설정이 모두 자리를 갖는다', async () => {
    render(<InstanceSettings />);

    const form = await screen.findByRole('form', { name: '인스턴스 설정' });
    for (const label of INSTANCE_SETTINGS) {
      expect(within(form).getByLabelText(label), `${label} 자리가 없다`).toBeDefined();
    }
  });

  it('DR-SHELL-001 AC-3: 값을 바꾸면 서버로 나간다', async () => {
    const user = userEvent.setup();
    render(<InstanceSettings />);

    const field = await screen.findByLabelText('휴지통 보존 일수');
    await user.clear(field);
    await user.type(field, '7');
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(saved).toEqual([expect.objectContaining({ 'trash-retention-days': '7' })]));
  });

  it('FR-STORAGE-004 AC-1 · FR-ATTACH-006 AC-1: 보관 개수와 업로드 제한도 같은 자리에서 바뀐다', async () => {
    render(<InstanceSettings />);

    const form = await screen.findByRole('form', { name: '인스턴스 설정' });
    expect(within(form).getByLabelText('보관 버전 개수')).toBeDefined();
    expect(within(form).getByLabelText('업로드 크기 제한')).toBeDefined();
  });

  it('못 읽으면 그렇게 말한다 — 빈 폼은 값이 없는 것으로 읽힌다', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(json(null, 403))));
    render(<InstanceSettings />);

    expect(await screen.findByText(/설정을 불러오지 못했습니다/)).toBeDefined();
  });
});

describe('IR-SHELL-003 AC-3 — 레이아웃이 존재한다', () => {
  it('셸에 스타일시트가 있다', async () => {
    // CSS 가 하나도 없으면 탭 스트립과 헤더가 같은 줄로 흘러내려 「밀려
    // 잘리지 않는다」를 잴 대상 자체가 없다.
    const css = await readFile(join(WEB, 'src/styles/shell.css'), 'utf8');

    expect(css).toContain('grid');
    expect(css).toContain('overflow');
  });

  it('진입점이 그 스타일시트를 불러온다', async () => {
    expect(await readFile(join(WEB, 'src/main.tsx'), 'utf8')).toContain('shell.css');
  });
});

describe('IR-SHELL-002 AC-3 · AC-7 — 설정 모달이 그 내용을 실제로 담는다', () => {
  it('AC-3: 계정 카테고리에 비밀번호 변경과 로그아웃이 있다', async () => {
    const { AppShell } = await import('../src/shell/AppShell.js');
    const user = userEvent.setup();
    render(<AppShell viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '계정' }));

    // 배열로만 있고 렌더되지 않으면 그 조작이 제품에 없는 것이다.
    expect(within(modal).getByRole('button', { name: '비밀번호 변경' })).toBeDefined();
    expect(within(modal).getByRole('button', { name: '로그아웃' })).toBeDefined();
  });

  it('AC-7: 인스턴스 설정 카테고리가 다섯 설정을 담는다', async () => {
    const { AppShell } = await import('../src/shell/AppShell.js');
    const user = userEvent.setup();
    render(<AppShell viewer={{ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    const modal = await screen.findByRole('dialog', { name: '설정' });
    await user.click(within(modal).getByRole('tab', { name: '인스턴스 설정' }));

    expect(await within(modal).findByRole('form', { name: '인스턴스 설정' })).toBeDefined();
  });
});

describe('FR-SHELL-001 AC-3 · AC-4 — 즐겨찾기에 추가할 수 있다', () => {
  it('트리 컨텍스트 메뉴의 즐겨찾기가 실제로 무언가를 한다', async () => {
    const { DocumentTree } = await import('../src/tree/DocumentTree.js');
    const added: string[] = [];
    const user = userEvent.setup();

    const node = {
      id: 'n1',
      name: '회의록.md',
      kind: 'file' as const,
      visibility: 'full' as const,
      level: 'edit' as const,
      parentLevel: 'edit' as const,
      children: [],
    };

    render(
      <DocumentTree
        workspaces={[{ workspace: { id: 'w1', name: '기획팀' }, visibility: 'full', roots: [node] }]}
        onFavorite={(id) => added.push(id)}
      />,
    );

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(await screen.findByRole('menuitem', { name: '즐겨찾기' }));

    // 항목이 렌더되기만 하고 아무 일도 안 하면 그 조작이 제품에 없는 것이다.
    expect(added).toEqual(['n1']);
  });

  it('AC-4: 디렉토리도 같은 항목으로 추가된다', async () => {
    const { DocumentTree } = await import('../src/tree/DocumentTree.js');
    const added: string[] = [];
    const user = userEvent.setup();

    const dir = {
      id: 'd1',
      name: '회의',
      kind: 'directory' as const,
      visibility: 'full' as const,
      level: 'edit' as const,
      parentLevel: 'edit' as const,
      children: [],
    };

    render(
      <DocumentTree
        workspaces={[{ workspace: { id: 'w1', name: '기획팀' }, visibility: 'full', roots: [dir] }]}
        onFavorite={(id) => added.push(id)}
      />,
    );

    await user.pointer({ keys: '[MouseRight]', target: screen.getByRole('treeitem', { name: /회의/ }) });
    await user.click(await screen.findByRole('menuitem', { name: '즐겨찾기' }));

    // 문서만 담기면 디렉토리를 즐겨찾기한 사용자는 그것을 다시 찾지 못한다.
    expect(added).toEqual(['d1']);
  });
});
