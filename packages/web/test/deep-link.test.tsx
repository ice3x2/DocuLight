import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentArea } from '../src/document/DocumentArea.js';
import { DOCUMENT_MENU_ITEMS } from '../src/document/document-menu.js';
import { nodeIdOf, urlForNode } from '../src/routing/deep-link.js';
import type { OpenTab, TabState } from '../src/document/tab-state.js';

afterEach(cleanup);

const doc = (id: string, name: string): OpenTab => ({
  nodeId: id,
  name,
  breadcrumb: ['기획팀', name],
  save: 'saved',
});

const stateOf = (...tabs: OpenTab[]): TabState => ({ tabs, activeId: tabs[0]?.nodeId ?? null });

describe('FR-SHELL-006 — 노드 ID 기반 문서 딥링크', () => {
  it('AC-1: URL 이 그 문서의 노드 ID 를 담는다', () => {
    expect(urlForNode('n-abc123')).toBe('/d/n-abc123');
  });

  it('AC-2: 같은 URL 에서 같은 노드 ID 가 나온다 — 다른 사용자가 같은 문서를 연다', () => {
    expect(nodeIdOf('/d/n-abc123')).toBe('n-abc123');
    expect(nodeIdOf(urlForNode('n-xyz'))).toBe('n-xyz');
  });

  it('AC-3: 이름과 경로가 URL 에 들어가지 않는다 — 개명·이동이 링크를 끊지 못한다', () => {
    // 경로를 담으면 이름을 바꾸는 순간 기존 링크가 없는 문서를 가리킨다.
    expect(urlForNode('n-abc123')).not.toContain('회의록');
    expect(urlForNode('n-abc123').split('/').filter(Boolean)).toEqual(['d', 'n-abc123']);
  });

  it('문서 URL 이 아니면 노드 ID 가 없다 — 아무 경로나 문서로 읽으면 404 규칙이 흐려진다', () => {
    expect(nodeIdOf('/')).toBeNull();
    expect(nodeIdOf('/settings')).toBeNull();
    expect(nodeIdOf('/d/')).toBeNull();
  });

  it('노드 ID 에 슬래시가 들어와도 경로가 갈라지지 않는다', () => {
    // ID 는 서버가 발급하지만, 그것을 신뢰해 그대로 이어붙이면 언젠가
    // 한 문서 링크가 다른 경로로 읽힌다.
    expect(nodeIdOf(urlForNode('a/b'))).toBe('a/b');
  });
});

describe('FR-SHELL-002 — 문서 단위 기능은 문서 헤더 메뉴에 둔다', () => {
  it('AC-2 · AC-3: 공유와 버전 기록이 헤더 메뉴에 있다', () => {
    const labels = DOCUMENT_MENU_ITEMS.map((i) => i.label);

    expect(labels).toContain('공유');
    expect(labels).toContain('버전 기록');
  });

  it('AC-1: 헤더 메뉴를 열면 그 항목들이 나온다', async () => {
    const user = userEvent.setup();
    render(<DocumentArea initial={stateOf(doc('n1', '가.md'))} />);

    const header = screen.getByRole('banner', { name: '문서 헤더' });
    await user.click(within(header).getByRole('button', { name: '가.md 문서 메뉴' }));

    const menu = await screen.findByRole('menu');
    for (const item of DOCUMENT_MENU_ITEMS) {
      expect(within(menu).getByRole('menuitem', { name: item.label })).toBeDefined();
    }
  });
});
