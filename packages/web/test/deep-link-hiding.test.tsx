import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { App } from '../src/App.js';
import { urlForNode } from '../src/routing/deep-link.js';

/**
 * 딥링크로 연 노드의 은닉 (`SEC-ACL-006` AC-6).
 *
 * 서버는 못 보는 노드를 트리에서 빼고 원문 요청에 404 를 준다. 그래서 화면
 * 입장에서 **권한 없는 노드와 없는 노드는 같은 입력**이다 — 둘 다 트리에
 * 없고 둘 다 404 로 돌아온다. 구별 불가는 그 사실로 이미 성립한다.
 *
 * 이 파일이 재는 것은 그 다음이다: 화면이 그 상황에 **무엇을 보여주는가**.
 * 화면 설계(`03.screen-design-shell.md` §3.9.4)가 문구까지 정해 두었다 —
 * 「문서를 찾을 수 없습니다」이며, 「권한이 없습니다」라고 쓰지 않고 요청
 * 버튼도 두지 않는다(`R103-a`). 아무것도 보여주지 않으면 사용자는 링크가
 * 깨졌는지 앱이 멈췄는지 모른 채 남는다.
 */

const TREE = [
  {
    workspace: { id: 'ws-1', name: '기획팀' },
    visibility: 'full',
    roots: [
      {
        id: 'n1',
        name: '회의록.md',
        kind: 'file',
        visibility: 'full',
        level: 'edit',
        parentLevel: 'edit',
        children: [],
      },
    ],
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** 서버가 실제로 하는 대로 — 트리에 없는 노드의 원문은 404 다. */
const 서버 = (path: string) => {
  if (path === '/api/session') {
    return json({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 });
  }
  if (path === '/api/tree') return json(TREE);
  if (path === '/api/documents/n1') return json({ body: '# 회의록\n\n본문이다', hash: 'h1' });
  return json(null, 404);
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string | URL | Request) =>
      Promise.resolve(서버(String(url).split('?')[0]!)),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

/** 그 주소로 들어와 앱을 세운다. */
async function 딥링크로연다(nodeId: string): Promise<string> {
  window.history.pushState({}, '', urlForNode(nodeId));
  render(<App />);
  await waitFor(() => expect(screen.getByText('문서를 찾을 수 없습니다')).toBeDefined());
  return document.body.textContent ?? '';
}

it('AC-6: 권한 없는 노드의 딥링크가 「문서를 찾을 수 없습니다」를 보여준다', async () => {
  const 화면 = await 딥링크로연다('n-secret');

  expect(화면).toContain('문서를 찾을 수 없습니다');
});

it('AC-6: 없는 노드의 딥링크가 같은 화면을 보여준다 — 두 경우가 구별되지 않는다', async () => {
  const 권한없음 = await 딥링크로연다('n-secret');
  cleanup();
  const 존재없음 = await 딥링크로연다('n-never-existed');

  // 노드 ID 를 빼고 비교한다 — 주소에 그것이 들어가는 것은 사용자가 친
  // 값이므로 새어 나가는 정보가 아니다.
  const 지운다 = (text: string) => text.replace(/n-secret|n-never-existed/g, '<id>');
  expect(지운다(권한없음), '두 경우의 화면이 갈린다').toBe(지운다(존재없음));
});

it('AC-6: 권한 부족을 뜻하는 문구나 요청 버튼을 두지 않는다 (`R103-a`)', async () => {
  const 화면 = await 딥링크로연다('n-secret');

  for (const 금칙 of ['권한이 없습니다', '권한 없음', '접근 권한', '요청']) {
    expect(화면, `거부 사유가 화면에 실렸다: ${금칙}`).not.toContain(금칙);
  }
  // 버튼의 **존재 자체**가 그 자리에 대상이 있다는 사실을 드러낸다.
  expect(screen.queryByRole('button', { name: /요청|권한/ })).toBeNull();
});

it('볼 수 있는 문서의 딥링크는 그대로 열린다 — 은닉이 과하면 정상 링크가 함께 죽는다', async () => {
  window.history.pushState({}, '', urlForNode('n1'));
  render(<App />);

  // 트리 항목과 탭에 같은 이름이 서므로 하나로 좁히지 않는다 — 좁히면
  // 이 항이 재는 것이 「열렸는가」가 아니라 「어디에 그렸는가」가 된다.
  expect((await screen.findAllByText('회의록.md')).length).toBeGreaterThan(0);
  expect(screen.queryByText('문서를 찾을 수 없습니다')).toBeNull();
});
