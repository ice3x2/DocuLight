import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { AtomicCodeMirrorEditor } from '../src/vendor/atomic-editor/AtomicCodeMirrorEditor';
import { doculightExtensions } from '../src/doculight-extensions';

const hosts: HTMLElement[] = [];
const roots: Root[] = [];

/**
 * 문서를 띄우고 **커서가 없는 상태**의 화면 글자를 돌려준다.
 *
 * 커서 없는 줄에서 기호가 숨는지가 이 요구의 절반이고, 나머지 절반(커서를
 * 올리면 원문이 드러난다)은 아래에서 커서를 옮겨 본다.
 */
function mount(markdown: string): HTMLElement {
  const host = document.createElement('div');
  host.style.width = '720px';
  host.style.height = '640px';
  document.body.appendChild(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  // **제품이 실제로 쓰는 설정**으로 띄운다 — vendor 기본만으로 재면 우리가
  // 얹은 것(수식·태그)이 없는 화면을 요구 대비로 판정하게 된다.
  act(() =>
    root.render(
      <AtomicCodeMirrorEditor markdownSource={markdown} extensions={doculightExtensions()} />,
    ),
  );
  return host;
}

const visibleText = (host: HTMLElement) => host.querySelector('.cm-content')?.textContent ?? '';

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const host of hosts.splice(0)) host.remove();
});

/**
 * 아홉 요소의 **숨는 기호**.
 *
 * 각 항목은 「이 원문을 넣으면 이 글자는 화면에 남고 이 기호는 사라진다」를
 * 말한다. 여기에 없는 요소는 정본 목록에 없는 것이다 — 목록이 요구이므로
 * 이 표가 그 목록과 어긋나면 둘 중 하나가 틀린 것이다.
 */
const NINE = [
  { ac: 'FR-EDITOR-007 AC-1', name: '헤딩', markdown: '# 제목입니다', keeps: '제목입니다', hides: '#' },
  { ac: 'FR-EDITOR-007 AC-2', name: '강조', markdown: '**굵게** 그리고 *기울임*', keeps: '굵게', hides: '**' },
  { ac: 'FR-EDITOR-007 AC-3', name: '목록', markdown: '- 첫째 항목', keeps: '첫째 항목', hides: '- ' },
  { ac: 'FR-EDITOR-007 AC-4', name: '링크', markdown: '[문서](https://example.test/x)', keeps: '문서', hides: 'https://example.test/x' },
  { ac: 'FR-EDITOR-007 AC-5', name: '인용', markdown: '> 인용된 문장', keeps: '인용된 문장', hides: '>' },
] as const;

describe('FR-EDITOR-007 — 커서가 없는 줄에서 마크다운 기호가 숨는다', () => {
  for (const element of NINE) {
    it(`${element.ac}: ${element.name}의 기호가 숨고 내용은 남는다`, () => {
      const host = mount(element.markdown);
      const shown = visibleText(host);

      expect(shown, `${element.name}의 내용이 사라졌다`).toContain(element.keeps);
      expect(shown, `${element.name}의 기호가 그대로 보인다`).not.toContain(element.hides);
    });
  }

  it('AC-6: 코드블록은 원문이 보이되 울타리가 코드로 읽히지 않는다', () => {
    const host = mount('```ts\nconst a = 1;\n```\n');

    // 코드는 **내용을 그대로 보여 주는 것**이 목적이라 숨기는 대상이 다르다 —
    // 안쪽 글자는 남고 울타리만 자기 자리를 잃는다.
    expect(visibleText(host)).toContain('const a = 1;');
    expect(host.querySelector('.cm-content')).not.toBeNull();
  });

  it('AC-7: 표가 구분선 없이 렌더된다', () => {
    const host = mount('| 가 | 나 |\n| --- | --- |\n| 1 | 2 |\n');
    const shown = visibleText(host);

    expect(shown).toContain('가');
    expect(shown).not.toContain('---');
  });

  it('AC-8: 수식의 구분자가 숨는다', () => {
    // 커서는 문서 첫 자리에서 시작하므로 수식을 그 뒤에 둔다 — 첫 줄에
    // 두면 「커서가 있는 자리」를 재게 되고, 그것은 이 항의 반대다.
    const host = mount('본문\n\n$$\nE = mc^2\n$$\n');

    // 구분자가 남으면 읽기 화면에 `$$` 두 줄이 그대로 뜬다.
    expect(visibleText(host)).not.toContain('$$');
    expect(visibleText(host)).toContain('본문');
  });

  it('AC-9: Mermaid 블록의 울타리가 숨는다', () => {
    const host = mount('```mermaid\ngraph TD;\nA-->B;\n```\n');

    expect(visibleText(host)).not.toContain('```mermaid');
  });
});

describe('FR-EDITOR-007 — 커서를 올리면 원문이 드러난다', () => {
  it('AC-8: 수식 위에 커서가 있으면 `$$` 원문이 드러난다', () => {
    // 커서가 문서 첫 자리에 있고 수식이 거기서 시작한다 — 그것이 「커서를
    // 올린」 상태다. 앞의 항과 **같은 수식**을 자리만 바꿔 재므로, 둘이
    // 같은 결과를 내면 라이브 프리뷰가 아니라 그냥 렌더링이라는 뜻이다.
    const host = mount('$$\nE = mc^2\n$$\n');

    expect(visibleText(host)).toContain('$$');
  });
});

describe('FR-EDITOR-007 AC-10 · AC-11 — 본문 태그', () => {
  it('AC-10: 커서가 없는 줄의 태그가 칩으로 렌더된다', () => {
    const host = mount('본문\n\n오늘 #회의 를 했다');

    const chip = host.querySelector('.dl-tag');
    expect(chip, '태그 칩이 없다').not.toBeNull();
    expect(chip!.textContent).toBe('#회의');
  });

  it('AC-11: 칩을 누르면 그 태그 이름이 전달된다', () => {
    const clicked: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
      root.render(
        <AtomicCodeMirrorEditor
          markdownSource={'본문\n\n오늘 #회의 를 했다'}
          extensions={doculightExtensions({ onTagClick: (name) => clicked.push(name) })}
        />,
      ),
    );

    act(() => {
      (host.querySelector('.dl-tag') as HTMLElement).click();
    });

    // 에디터가 좌측 검색 탭을 직접 만지지 않는다 — 이름만 넘기고, 무엇을
    // 열지는 셸이 정한다.
    expect(clicked).toEqual(['회의']);
  });

  it('AC-12: 프론트매터의 태그는 칩이 되지 않는다', () => {
    const host = mount('---\ntags: [회의]\n---\n\n본문');

    expect(host.querySelector('.dl-tag')).toBeNull();
  });
});

describe('FR-EDITOR-007 AC-8 · AC-10 — 코드블록은 원문 그대로 남는다', () => {
  it('코드블록 안의 `#include` 가 태그 칩이 되지 않는다', () => {
    const host = mount('본문\n\n```c\n#include <stdio.h>\n```\n');

    // 이걸 놓치면 C 코드를 담은 문서가 온통 칩으로 덮인다.
    expect(host.querySelector('.dl-tag')).toBeNull();
    expect(visibleText(host)).toContain('#include');
  });

  it('코드블록 안의 `$$` 가 수식으로 렌더되지 않는다', () => {
    const host = mount('본문\n\n```sh\necho $$\n```\n');

    expect(host.querySelector('.dl-math')).toBeNull();
    expect(visibleText(host)).toContain('$$');
  });

  it('같은 문서의 코드블록 밖 수식은 그대로 렌더된다', () => {
    const host = mount('본문\n\n```sh\necho $$\n```\n\n$$\nE = mc^2\n$$\n');

    // 앞의 코드블록이 뒤의 수식을 삼키면 이 단언이 깨진다.
    expect(host.querySelector('.dl-math')).not.toBeNull();
  });
});
