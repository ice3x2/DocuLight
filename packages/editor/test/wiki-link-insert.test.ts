import { acceptCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { doculightExtensions, type WikiLinkSuggestion } from '../src/doculight-extensions';

/**
 * 후보를 골랐을 때 **본문이 어떻게 되는가** (`CON-EDITOR-002` AC-1).
 *
 * 「자동완성이 산출물에 있다」는 파일 실존으로도 확인되고, 「친 글자가
 * 서버까지 간다」는 웹 쪽 배선 시험이 잰다. 그 둘 사이에 아무도 재지 않던
 * 구간이 하나 있었다 — **고른 뒤에 무엇이 문서에 들어가는가.** 삽입이
 * 어긋나면 링크는 눌러도 열리지 않는데, 후보가 떴다는 사실만으로는 그것이
 * 드러나지 않는다.
 */

const CANDIDATES: WikiLinkSuggestion[] = [
  { target: '설계', label: '설계.md', detail: '기획팀' },
  { target: '회의록', label: '회의록.md', detail: '인사팀' },
];

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

/** 후보가 떠서 고를 수 있는 상태의 편집기. */
async function ready(doc: string, cursor = doc.length): Promise<EditorView> {
  const host = document.createElement('div');
  document.body.append(host);

  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage }),
        doculightExtensions({ suggestWikiLinks: async () => CANDIDATES }),
      ],
    }),
    parent: host,
  });

  view.focus();
  startCompletion(view);
  // 후보 조회가 비동기다. 뜨지 않으면 시험은 「고를 것이 없다」로 실패하고,
  // 그것이 이 대기가 조용히 넘어가지 않는다는 뜻이다.
  for (let i = 0; i < 100 && currentCompletions(view.state).length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // 뜬 직후에는 고를 수 없다 — 자동완성이 `interactionDelay`(기본 75ms)
  // 동안 확정을 거절한다. 목록이 눈앞에서 바뀌는 순간에 누른 키가 엉뚱한
  // 후보를 고르는 것을 막는 장치이고, 사람이 아닌 시험도 그 문을 지난다.
  await new Promise((resolve) => setTimeout(resolve, 120));
  return view;
}

describe('CON-EDITOR-002 AC-1 — 후보를 고르면 위키링크가 본문에 들어간다', () => {
  it('`[[설` 에서 고르면 완결된 `[[설계|설계.md]]` 가 된다', async () => {
    const editor = await ready('앞줄\n[[설');

    expect(currentCompletions(editor.state).map((one) => one.label)).toEqual(['설계.md']);
    expect(acceptCompletion(editor)).toBe(true);

    // 여는 대괄호는 남고, 친 글자가 고른 것으로 갈리고, 닫는 대괄호가 붙는다.
    expect(editor.state.doc.toString()).toBe('앞줄\n[[설계|설계.md]]');
  });

  it('닫는 `]]` 가 이미 있으면 그것을 다시 붙이지 않는다', async () => {
    // 편집기가 `[[` 를 자동으로 닫아 주는 자리에서 이 분기가 쓰인다.
    // 다시 붙이면 `]]]]` 가 되어 링크가 그 자리에서 깨진다.
    const editor = await ready('[[설]]', 3);

    expect(acceptCompletion(editor)).toBe(true);
    expect(editor.state.doc.toString()).toBe('[[설계|설계.md]]');
  });

  it('삽입 뒤 커서가 링크 **밖**에 선다 — 안에 서면 이어 친 글자가 링크로 빨려 든다', async () => {
    const editor = await ready('[[설');
    acceptCompletion(editor);

    expect(editor.state.selection.main.head).toBe(editor.state.doc.length);
  });

  it('링크의 대상은 서버가 준 `target` 이고 화면에 보이는 이름은 `label` 이다', async () => {
    // 둘이 갈리는 것이 이 삽입의 요점이다. 표시 이름을 대상으로 쓰면
    // `.md` 가 붙은 이름으로 문서를 찾게 되고 아무것도 열리지 않는다.
    const editor = await ready('[[회');

    expect(currentCompletions(editor.state).map((one) => one.label)).toEqual(['회의록.md']);
    acceptCompletion(editor);

    expect(editor.state.doc.toString()).toBe('[[회의록|회의록.md]]');
  });
});
