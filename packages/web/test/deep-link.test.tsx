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

describe('FR-SHELL-006 — 딥링크가 왕복하는가 (실측)', () => {
  const HARD = [
    'n-abc123',
    'a/b',
    'a b',
    '한글아이디',
    'a?b=c',
    'a#b',
    'a%2Fb',
    'a&b',
    '..',
    'a+b',
    '@user',
    'x'.repeat(200),
  ];

  it('어떤 ID 를 넣어도 그대로 돌아온다', () => {
    // 하나라도 어긋나면 그 문서의 링크가 다른 문서를 열거나 아무것도
    // 열지 않는다 — 그리고 그 사실은 그 링크를 누를 때까지 드러나지 않는다.
    for (const id of HARD) {
      expect(nodeIdOf(urlForNode(id)), id).toBe(id);
    }
  });

  it('만들어진 주소가 언제나 문서 주소로 읽힌다', () => {
    for (const id of HARD) {
      expect(urlForNode(id).startsWith('/d/'), id).toBe(true);
      expect(nodeIdOf(urlForNode(id)), id).not.toBeNull();
    }
  });

  it('망가진 인코딩에도 던지지 않는다 — 주소창은 사용자가 손댈 수 있다', () => {
    // 던지면 잘못 붙여넣은 주소 하나가 앱 전체를 멈춘다.
    expect(() => nodeIdOf('/d/%')).not.toThrow();
    expect(() => nodeIdOf('/d/%E0%A4%A')).not.toThrow();
    // 읽을 수 없는 주소는 문서 주소가 아닌 것과 같이 다룬다 — 반쪽만
    // 읽어 넘기면 그 값으로 없는 문서를 찾게 된다.
    expect(nodeIdOf('/d/%')).toBeNull();
  });
});
