import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';

const TREE = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      { id: 'n1', name: '회의록.md', kind: 'file', visibility: 'full', level: 'edit', parentLevel: 'edit', children: [] },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let saves: Array<{ body: string; baseHash: string; session?: string }>;
let saveResponse: () => Response;
/** 서버가 지금 들고 있는 본문. 새 버전 올리기가 이 값을 바꾼다. */
let body: { body: string; hash: string };
let uploaded: string[];

beforeEach(() => {
  saves = [];
  uploaded = [];
  body = { body: '# 처음\n', hash: 'h1' };
  saveResponse = () => json({ hash: 'h2' });

  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const path = String(url).split('?')[0]!;
      if (path === '/api/session') return Promise.resolve(json({ superuser: true, workspaceCount: 1, adminWorkspaceCount: 1 }));
      if (path === '/api/tree') return Promise.resolve(json(TREE));
      if (path === '/api/documents/n1/session') return Promise.resolve(json({ session: 's1' }));
      if (path === '/api/documents/n1' && init?.method === 'PUT') {
        saves.push(JSON.parse(String(init.body)));
        return Promise.resolve(saveResponse());
      }
      if (path === '/api/documents/n1') return Promise.resolve(json(body));
      if (path === '/api/nodes/n1/new-version') {
        uploaded.push('n1');
        return Promise.resolve(json(null, 204));
      }
      if (path === '/api/favorites') return Promise.resolve(json([]));
      if (path === '/api/trash') return Promise.resolve(json([]));
      if (path === '/api/documents/n1/links')
        return Promise.resolve(json({ outgoing: [], backlinks: [] }));
      return Promise.resolve(json(null, 404));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openDocument() {
  const user = userEvent.setup();
  render(<App />);
  // 트리에서 연다 — 같은 이름의 버튼이 탭 스트립에도 생기므로, 사용자가
  // 하듯 사이드바 안에서 고른다.
  const sidebar = await screen.findByRole('complementary', { name: '좌측 사이드바' });
  await user.click(await within(sidebar).findByRole('button', { name: /회의록\.md/ }));
  await waitFor(() => expect(document.querySelector('.cm-content')).not.toBeNull());
  return user;
}

describe('FR-EDITOR-009 — 저장이 편집기를 갈아 끼우지 않는다', () => {
  /**
   * **본문 문자열이 편집기의 정체성이면 저장이 곧 재마운트다.**
   *
   * 저장이 성공하면 서버가 새 해시를 주고 상위가 새 본문을 내려보낸다.
   * 그때 편집기의 정체성이 그 본문이면 EditorView 가 destroy 되고 다시
   * 서며, 포커스가 빠지고 이어 친 글자가 사라진다 — 2026-08-24 실제 볼트
   * 검증 §3.2 가 관측한 그대로다.
   *
   * 노드로만 고정해도 안 된다. 그러면 새 버전 올리기가 갈아 끼운 본문을
   * 편집기가 받지 못한다(`FR-SHELL-008` AC-2). 갈리는 자리는 **아는
   * 판본인가**이고, 그 두 방향을 여기와 `body-adoption.test.tsx` 가
   * 각각 맡는다.
   *
   * 포커스와 이어 친 글자 자체는 happy-dom 이 재지 못한다 — 브라우저
   * 검사가 그 축을 맡는다.
   */
  /**
   * **친 글자가 있어야 이 축이 재어진다.** 아무것도 치지 않고 저장하면
   * 저장된 본문이 열었을 때와 같아 캐시가 같은 문자열로 갱신되고, 그러면
   * 편집기가 받는 문서도 그대로라 재마운트가 애초에 일어나지 않는다 —
   * 그 상태의 시험은 구현을 되돌려도 초록이다(탐침으로 확인했다).
   */
  async function 치고저장한다(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard('추가');
    await user.keyboard('{Control>}s{/Control}');
  }

  it('AC-1 · AC-2: 친 글자를 저장해도 같은 편집기가 남는다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));
    const 처음 = document.querySelector('.cm-editor');
    expect(처음, '편집기가 서지 않았다').not.toBeNull();

    await 치고저장한다(user);
    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
    expect(saves.at(-1)!.body, '전제가 서지 않았다 — 친 글자가 저장에 실리지 않았다').toContain('추가');

    await waitFor(() => {
      expect(document.querySelector('.cm-editor'), '저장이 편집기를 갈아 끼웠다').toBe(처음);
    });
  });

  /**
   * **AC-2 의 「이어 친 글자가 들어간다」는 여기서 재지 않는다.**
   *
   * 실측으로 확인했다 — 이 환경에서는 저장 직후 `document.activeElement`
   * 가 편집기에서 빠지는데, 그때 `.cm-editor` 는 한 개 그대로이고
   * `.cm-content` 도 **같은 요소**다. DOM 이 바뀌지 않았는데 포커스만
   * 빠지므로 원인을 이 계층에서 특정할 수 없고, 그것이 happy-dom 의
   * 한계인지 제품의 결함인지도 여기서는 갈리지 않는다.
   *
   * 그래서 그 축은 브라우저 검사가 맡는다 — 이 요구의 Verification
   * Method 가 Playwright E2E 인 이유가 그것이다. 여기가 맡는 것은 저장이
   * 편집기 **인스턴스**를 갈아 끼우지 않는다는 위의 한 축뿐이다.
   */
});

describe('FR-STORAGE-001 — 자동 저장이 실제로 돈다', () => {
  it('AC-3: Ctrl+S 로 즉시 저장된다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.baseHash).toBe('h1');
  });

  it('AC-4: Ctrl+S 는 편집 세션을 실어 스냅샷을 남긴다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.session).toBe('s1');
  });

  it('AC-5: 충돌하면 배너가 뜨고 서버의 현재 본문을 함께 보여 준다', async () => {
    saveResponse = () => json({ current: '# 남이 고침\n' }, 409);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    const merge = await screen.findByRole('region', { name: '병합' });
    expect(merge.textContent).toContain('남이 고침');
  });

  it('AC-5: 충돌 뒤에는 더 저장하지 않는다 — 매번 거절되는 동안 사용자는 저장되고 있다고 믿는다', async () => {
    saveResponse = () => json({ current: '# 남이 고침\n' }, 409);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');
    await screen.findByRole('region', { name: '병합' });
    await user.keyboard('{Control>}s{/Control}');

    expect(saves).toHaveLength(1);
  });

  it('FR-EDITOR-005 AC-3: 저장이 거부되면 그 사실이 표시된다', async () => {
    saveResponse = () => json(null, 403);
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    expect((await screen.findByRole('alert')).textContent).toContain('저장');
  });

  it('AC-2: 저장 버튼은 어디에도 없다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    expect(screen.queryByRole('button', { name: /^저장$|저장하기/ })).toBeNull();
  });
});

describe('FR-STORAGE-001 AC-4 — Ctrl+S 가 강제 스냅샷을 요청한다', () => {
  it('강제 표식을 실어 보낸다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    // 세션 ID 만 실으면 서버가 「이 세션은 이미 찍었다」로 건너뛴다 —
    // 두 번째 Ctrl+S 가 아무 지점도 남기지 않는다.
    expect((saves[0] as { forceSnapshot?: boolean }).forceSnapshot).toBe(true);
  });

  it('자동 저장은 강제하지 않는다 — 세션당 1회 규칙이 그대로 산다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard('고침');

    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 3000 });
    expect((saves[0] as { forceSnapshot?: boolean }).forceSnapshot).toBeUndefined();
  });
});

describe('편집 없이 저장해도 본문을 지우지 않는다', () => {
  it('아무것도 치지 않고 Ctrl+S 를 누르면 받아 온 본문 그대로 저장된다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    // 빈 문자열로 나가면 기준 해시는 맞으므로 서버가 받아들이고, 사용자
    // 화면의 글이 통째로 사라진다.
    expect(saves[0]!.body).toBe('# 처음\n');
  });

  it('고친 뒤에는 고친 것이 나간다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));

    const content = document.querySelector('.cm-content') as HTMLElement;
    await user.click(content);
    await user.keyboard('고침');
    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves.length).toBeGreaterThan(0));
    expect(saves[saves.length - 1]!.body).toContain('고침');
  });
});

describe('FR-SHELL-008 AC-2 — 열려 있는 문서에 새 버전을 올려도 다음 저장이 되돌리지 않는다', () => {
  it('올린 뒤 아무것도 치지 않고 저장하면 방금 올린 본문이 나간다', async () => {
    const user = await openDocument();

    // 올리고 나면 서버가 새 본문을 준다. 화면이 그것을 받아들이지 못하면
    // **옛 본문 + 새 해시**가 되어 서버의 충돌 판정을 그대로 통과하고,
    // 방금 올린 버전이 조용히 되돌려진다.
    body = { body: '# 새 버전\n', hash: 'h9' };

    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });
    await user.pointer({
      keys: '[MouseRight]',
      target: within(sidebar).getByRole('treeitem', { name: /회의록/ }),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: '새 버전 올리기' }),
    );
    await user.upload(
      screen.getByLabelText('회의록.md 새 버전 파일'),
      new File(['# 새 버전\n'], '회의록.md', { type: 'text/markdown' }),
    );

    await waitFor(() => expect(uploaded).toHaveLength(1));
    await waitFor(() =>
      expect(document.querySelector('.cm-content')?.textContent).toContain('새 버전'),
    );

    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.body).toBe('# 새 버전\n');
  });
});

describe('이미 열린 문서를 다시 눌러도 편집이 사라지지 않는다', () => {
  it('트리에서 같은 문서를 다시 골라도 치던 글자가 남는다', async () => {
    const user = await openDocument();
    await user.click(screen.getByRole('button', { name: '편집' }));
    await user.click(document.querySelector('.cm-content') as HTMLElement);
    await user.keyboard('아직 저장 전');

    // 같은 문서를 다시 고른다. 여기서 서버 본문을 다시 받아 들이면
    // 자동 저장이 아직 나가지 않은 글자가 통째로 밀린다.
    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });
    await user.click(within(sidebar).getByRole('button', { name: /회의록\.md/ }));

    expect(document.querySelector('.cm-content')?.textContent).toContain('아직 저장 전');
  });
});

describe('이미 열린 문서는 다시 받지 않는다', () => {
  it('같은 문서를 다시 골라도 본문 요청이 늘지 않는다', async () => {
    const user = await openDocument();
    const gets = () =>
      (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls.filter(
        (call) => String(call[0]) === '/api/documents/n1' && (call[1]?.method ?? 'GET') === 'GET',
      ).length;
    const before = gets();

    const sidebar = screen.getByRole('complementary', { name: '좌측 사이드바' });
    await user.click(within(sidebar).getByRole('button', { name: /회의록\.md/ }));

    // 편집기가 이미 그 문서의 정본을 들고 있다. 다시 받아 봐야 바꿀 것이
    // 없고, 서버 본문이 그 사이 달라졌다면 그것은 충돌 화면이 다룰 일이다.
    expect(gets()).toBe(before);
  });
});
