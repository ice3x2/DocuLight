import { cleanup, render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TrashPanel } from '../src/trash/TrashPanel.js';

afterEach(cleanup);

const WEB = existsSync(resolve(process.cwd(), 'src/main.tsx'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/web');

const sources = (at: string): string[] =>
  readdirSync(at).flatMap((name) => {
    const full = join(at, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });

/** 확인 단계를 그리는 표면들. 새 확인이 생기면 여기 더한다. */
const 확인표면 = [
  join('confirm', 'ConfirmGate.tsx'),
  join('confirm', 'RevokeConfirm.tsx'),
  join('confirm', 'notices.ts'),
  join('shell', 'RelocationDialog.tsx'),
  join('acl', 'ShareModal.tsx'),
  join('acl', 'BulkRevokePanel.tsx'),
  join('workspace', 'NewWorkspaceForm.tsx'),
  join('principal', 'OffboardingCard.tsx'),
];

describe('SEC-CONFIRM-001 — 확인 흐름을 보이지 않는 대상의 존재 판정에 쓰지 않는다', () => {
  it('AC-1 · AC-2: 어느 확인 표면도 숨은 대상을 실을 칸을 갖지 않는다', () => {
    // 칸이 있으면 언젠가 그것으로 확인 단계나 문구를 가르게 되고, 그
    // 갈림이 곧 존재 신호다. 그래서 **부재 자체**를 계약으로 고정한다.
    const 금지어 = ['hidden', 'invisible', 'excluded', 'unreachable', 'notApplied', 'skipped'];

    for (const rel of 확인표면) {
      const code = readFileSync(join(WEB, 'src', rel), 'utf8');
      for (const 낱말 of 금지어) {
        expect({ rel, 낱말, 있는가: code.includes(낱말) }).toEqual({ rel, 낱말, 있는가: false });
      }
    }
  });

  it('열거한 표면이 실제로 전부 존재한다 — 목록이 낡으면 이 시험이 아무것도 안 잰다', () => {
    const 실재 = new Set(sources(join(WEB, 'src')).map((f) => f.slice(join(WEB, 'src').length + 1)));

    for (const rel of 확인표면) expect(실재.has(rel)).toBe(true);
  });

  it('확인 문구가 조건을 받지 않는 상수다', async () => {
    const notices = await import('../src/confirm/notices.js');

    // 함수로 두면 인자로 가를 수 있다. 목적어만 갈아 끼우는 상속 고지
    // 하나만 함수이고, 나머지 셋은 조건 없는 상수여야 한다.
    expect(typeof notices.BROKEN_INHERITANCE_NOTICE).toBe('string');
    expect(typeof notices.ATTACHMENT_REVOKE_NOTICE).toBe('string');
    expect(typeof notices.WIDENING_UNDO_NOTICE).toBe('string');
    // 상속 고지는 목적어 하나만 받는다 — 두 개를 받으면 둘째로 가를 수 있다.
    expect(notices.inheritanceNotice.length).toBe(1);
  });
});

describe('CON-CONFIRM-001 — 휴지통 일괄 영구 삭제는 Phase 1 에 없다', () => {
  const rows = [
    {
      id: 'n1',
      name: '회의록.md',
      workspaceId: 'ws1',
      workspaceName: '기획팀',
      deletedAt: '2026-08-20T00:00:00.000Z',
      deletedBy: '한범',
      canPurge: true,
    },
    {
      id: 'n2',
      name: '설계.md',
      workspaceId: 'ws1',
      workspaceName: '기획팀',
      deletedAt: '2026-08-20T00:00:00.000Z',
      deletedBy: '한범',
      canPurge: true,
    },
  ];

  it('AC-1: 여러 항목을 한꺼번에 영구 삭제하는 조작이 없다', () => {
    render(<TrashPanel rows={rows} workspaces={[{ id: 'ws1', name: '기획팀' }]} />);

    // 선택 상자가 서면 그 다음은 일괄 조작이다. 행마다 권한이 갈리는
    // 집합을 만들면 어느 행이 조용히 빠졌는지가 존재 신호가 된다.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /선택.*영구 삭제|모두 영구 삭제|비우기/ })).toBeNull();
  });

  it('단건 영구 삭제는 그대로 있다 — 부재 시험만 두면 아무것도 없는 구현이 통과한다', () => {
    render(<TrashPanel rows={rows} workspaces={[{ id: 'ws1', name: '기획팀' }]} />);

    expect(screen.getAllByRole('button', { name: /영구 삭제/ }).length).toBeGreaterThan(0);
  });
});
