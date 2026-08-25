import { EditorView } from '@codemirror/view';
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
    // 커서는 문서 첫 자리에서 시작하므로 코드블록을 그 뒤에 둔다 — 첫 줄에
    // 두면 커서가 울타리에 닿아 원문이 드러나고, 그것은 이 항의 반대다.
    // (아래 `AC-6: 코드블록에 커서를 올리면 울타리가 드러난다` 가 그 반대편을
    // 잰다. 둘이 **같은 원문을 자리만 바꿔** 재므로, 둘이 같은 결과를 내면
    // 라이브 프리뷰가 아니라 그냥 렌더링이라는 뜻이다.)
    const host = mount('앞 문단\n\n```ts\nconst a = 1;\n```\n');
    const shown = visibleText(host);

    // 코드는 **내용을 그대로 보여 주는 것**이 목적이라 숨기는 대상이 다르다 —
    // 안쪽 글자는 남고 울타리만 자기 자리를 잃는다.
    expect(shown, '코드블록의 내용이 사라졌다').toContain('const a = 1;');
    expect(shown, '코드블록의 울타리가 그대로 보인다').not.toContain('```');
    // 울타리를 숨기는 기구가 둘이다 — 코드블록 위젯(`code-blocks.ts`)이 블록을
    // 통째로 대체하는 길과, 벤더의 `HIDEABLE_SYNTAX` 가 `CodeMark`·`CodeInfo`
    // 를 걷는 길이다. 위의 글자 단언만으로는 한쪽이 죽어도 다른 쪽이 가려 준다.
    // 위젯이 실제로 섰는지를 함께 재야 위젯 쪽이 무너질 때 이 항이 죽는다.
    //
    // **이 항은 벤더 쪽 길은 재지 못한다.** 언어가 붙은 이 펜스는 위젯이 통째로
    // 가져가므로 울타리 글자가 애초에 DOM 에 없고, `HIDEABLE_SYNTAX` 에서
    // `CodeMark`·`CodeInfo` 를 빼도 이 항은 그대로 통과한다(2026-08-26 실측).
    // 그 길은 아래 항이 잰다.
    expect(host.querySelector('pre.dl-code'), '코드블록 위젯이 서지 않았다').not.toBeNull();
  });

  it('AC-6: 언어 없는 울타리도 숨는다 — 위젯이 가져가지 않는 자리', () => {
    // 위 항이 재지 못하는 **나머지 한 길**을 잰다. `code-blocks.ts` 는
    // `CodeInfo` 가 없는 펜스를 가져가지 않으므로(`if (info === null) return`),
    // 여기서 울타리를 숨기는 것은 벤더의 `HIDEABLE_SYNTAX` 하나뿐이다.
    // 그래서 이 항은 그 집합에서 `CodeMark`·`CodeInfo` 가 빠지면 죽는다.
    const host = mount('앞 문단\n\n```\nconst a = 1;\n```\n');
    const shown = visibleText(host);

    // 위젯이 서지 않았음을 먼저 못박는다 — 이것이 이 항이 벤더 쪽 길을 재고
    // 있다는 전제다. 위젯이 언어 없는 펜스까지 가져가게 바뀌면 이 전제가
    // 무너지고, 그때는 표본을 다시 골라야지 단언을 지워서는 안 된다.
    expect(host.querySelector('pre.dl-code'), '언어 없는 펜스에 위젯이 섰다').toBeNull();

    expect(shown, '코드블록의 내용이 사라졌다').toContain('const a = 1;');
    expect(shown, '언어 없는 펜스의 울타리가 그대로 보인다').not.toContain('```');
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
    // 앞에 문단을 둔다. 블록을 0 번 자리에 두면 커서(기본값 0)가 그 블록에
    // 닿아 `selectionTouches` 가 참이 되고, 그러면 mermaid 위젯이 **애초에
    // 서지 않는다** — 즉 이 항이 드러난 상태에서 돌면서도 통과한다. 그때
    // 울타리를 숨기는 것은 벤더의 `HIDEABLE_SYNTAX` 이고 mermaid 경로는 한
    // 번도 돌지 않는다.
    const host = mount('앞 문단\n\n```mermaid\ngraph TD;\nA-->B;\n```\n');

    // 위젯이 섰음을 먼저 못박는다 — 이것이 이 항이 mermaid 경로를 재고
    // 있다는 전제다. 전제가 무너지면 표본을 다시 골라야지 단언을 지워서는
    // 안 된다.
    expect(host.querySelector('.dl-mermaid'), 'mermaid 위젯이 서지 않았다').not.toBeNull();

    expect(visibleText(host), '울타리가 그대로 보인다').not.toContain('```mermaid');
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
    // 프론트매터 쪽에는 `#` 을 실제로 넣고 본문 쪽에도 하나 둔다 — `#` 이
    // 없는 예시로는 프론트매터 제외를 지워도 통과해서 아무것도 재지 못하고,
    // 본문 태그가 함께 없으면 칩이 0개인 이유가 「제외했다」인지 「태그
    // 데코레이션이 죽었다」인지 갈리지 않는다.
    const host = mount('---\ntags: #회의\n---\n\n본문의 #실제태그');

    const chips = [...host.querySelectorAll('.dl-tag')].map((one) => one.textContent);
    expect(chips).toEqual(['#실제태그']);
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

/**
 * 커서를 올리면 원문이 드러난다 — 요구의 **나머지 절반**.
 *
 * 앞의 표는 숨는 것만 잰다. 숨기만 하고 드러나지 않으면 그것은 라이브
 * 프리뷰가 아니라 그냥 렌더링이고, 사용자는 기호를 고칠 방법을 잃는다.
 *
 * 커서를 올리는 일에는 **포커스가 필요하다.** 선택 위치만 옮기면 vendor 의
 * 판정이 「활성 줄이 없다」로 남아 원문이 드러나지 않는다 — 그 상태로 재면
 * 통과할 수 없는 시험이 되고, 통과시키려다 구현을 잘못 고치게 된다.
 */
function reveal(markdown: string, at: string): string {
  const host = mount(markdown);
  const view = EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement);
  if (view === null) throw new Error('편집기를 찾지 못했다');

  const offset = markdown.indexOf(at);
  if (offset < 0) throw new Error(`문서에 ${at} 가 없다`);

  // 포커스가 먼저다 — vendor 의 판정이 `view.hasFocus` 를 보므로, 선택만
  // 옮기면 활성 줄이 서지 않는다. 그리고 그 뒤의 선택 이동이 데코레이션을
  // 다시 세우는 갱신을 만든다.
  // 포커스가 먼저다 — vendor 의 판정이 `view.hasFocus` 를 보므로, 선택만
  // 옮기면 활성 줄이 서지 않는다. 그리고 `focus()` 만으로는 데코레이션이
  // 다시 서지 않으므로(그 갱신을 만드는 것은 뒤의 선택 이동이다) 둘 다
  // 필요하다.
  act(() => {
    view.focus();
  });
  // 선택 이동은 `act` **밖**에서 건다. CodeMirror 는 React 가 아니라
  // dispatch 시점에 자기 DOM 을 곧바로 고치므로 `act` 가 필요 없고,
  // 안에서 걸면 관측자가 같은 흐름에서 되쏘아 갱신이 겹친다.
  view.dispatch({ selection: { anchor: offset + at.length } });

  return visibleText(host);
}

describe('FR-EDITOR-007 — 아홉 요소 모두 커서를 올리면 원문이 드러난다', () => {
  for (const element of NINE) {
    // 목록만 따로 잰다 — 마커 뒤의 공백은 자리를 맞추려고 숨긴 채로 두므로
    // (순서 목록도 같다) 「`- ` 가 통째로 돌아온다」로 재면 재는 대상이
    // 요구가 아니라 여백 처리가 된다.
    if (element.name === '목록') continue;

    it(`${element.ac}: ${element.name}에 커서를 올리면 기호가 돌아온다`, () => {
      expect(
        reveal(`앞 문단\n\n${element.markdown}\n`, element.keeps),
        `${element.name}의 기호가 커서 아래에서도 숨어 있다`,
      ).toContain(element.hides);
    });
  }

  it('FR-EDITOR-007 AC-3: 목록에 커서를 올리면 마커 글자가 돌아온다', () => {
    // 글리프(`•`)가 아니라 원문 `-` 가 보여야 한다 — 그것이 없으면 사용자가
    // `-` 를 `1.` 로 바꿀 방법이 사라진다. 마커 뒤 공백은 자리를 맞추려고
    // 숨긴 채로 둔다(순서 목록도 같다).
    const shown = reveal('앞 문단\n\n- 첫째 항목\n', '첫째 항목');

    expect(shown).toContain('-첫째 항목');
    expect(shown).not.toContain('•');
  });

  it('AC-6: 코드블록에 커서를 올리면 울타리가 드러난다', () => {
    expect(reveal('앞 문단\n\n```ts\nconst a = 1;\n```\n', 'const a = 1;')).toContain('```');
  });

  /**
   * AC-7 의 드러남만 **자동으로 재지 못한다.**
   *
   * 커서가 표에 닿는 순간 위젯이 통째로 걷히는데, happy-dom 이 그 DOM 변화를
   * 선택 변경으로 되쏘고 CM6 가 그 재진입을 「갱신 중 갱신」이라며 거부한다.
   * 다른 여덟 요소는 걷히는 DOM 이 작아 이 경로를 타지 않는다.
   *
   * 이 항의 **숨는 절반**은 위 `AC-7: 표가 구분선 없이 렌더된다` 가 잰다.
   * 드러나는 절반은 실제 브라우저에서 확인해야 하며, 그것을 자동으로 잴
   * 자리는 Playwright E2E 다 — 거기서는 이 재진입이 일어나지 않는다.
   *
   * **막는 사유가 둘이다.** 위의 재진입에 더해, 표는 편집기가 초점을 쥐고
   * 있을 때만 원문을 드러내는데(`table-widget.ts` 의 `canRevealSource`) CM6 는
   * 초점 변화를 `setTimeout(..., 10)` 뒤에 트랜잭션으로 발행한다
   * (`@codemirror/view` 의 `updateForFocusChange`). 그래서 위 `reveal()` 의
   * `view.focus()` 는 동기 시험 본문이 끝날 때까지 상태에 반영되지 않고,
   * 재진입을 푼다 해도 이 항은 그대로 통과하지 못한다. 다른 여덟 요소는 초점을
   * 보지 않으므로 이 사유를 타지 않는다.
   *
   * **그 자리는 이제 있다.** `packages/editor/test/table-reveal-check.mjs`
   * 가 실제 브라우저에서 이 항을 잰다 (`npm run test:browser:table`).
   * 그리고 초점을 타지 않는 절반 — 노출을 정하는 데코레이션 규칙 자체 — 는
   * `src/vendor/atomic-editor/__tests__/table-reveal-state.test.ts` 가 상태
   * 단위로 잰다(초점 효과를 `EditorView.focusChangeEffect` 로 직접 실어
   * 뷰 없이 재므로 위 두 사유를 모두 비껴간다). 여기가 skip 이라고 해서 이
   * 항이 미검증인 것이 아니다.
   *
   * **통과로 세지 않으려고 남겨 둔다.** 지우면 이 구멍이 목록에서 사라지고,
   * 통과시키려 손대면 재는 대상이 바뀐다.
   */
  it.skip('AC-7: 표에 커서를 올리면 구분선이 드러난다 (브라우저에서 확인)', () => {
    const table = '| 머리 | 둘 |\n| --- | --- |\n| 값 | 둘 |';
    expect(reveal(`앞 문단\n\n${table}\n`, '값')).toContain('---');
  });

  it('AC-9: Mermaid 블록에 커서를 올리면 울타리가 드러난다', () => {
    expect(reveal('앞 문단\n\n```mermaid\ngraph TD;\n  A-->B;\n```\n', 'graph TD;')).toContain(
      '```mermaid',
    );
  });

  it('AC-10: 태그에 커서를 올리면 `#` 를 포함한 원문이 드러난다', () => {
    const shown = reveal('앞 문단\n\n오늘 #회의 를 했다\n', '#회의');

    expect(shown).toContain('#회의');
  });
});

/**
 * 조항이 말하는 축은 **줄**이다 — 「커서가 없는 **줄**에서 기호가 숨고, 그
 * **줄**에 커서를 올리면 원문이 드러난다」.
 *
 * 위의 두 무리는 그 축을 재지 못한다. 숨는 항은 초점이 **없는** 상태로 재고
 * 드러나는 항은 `view.focus()` 를 켜고 재므로, 두 항의 차이를 **초점 하나**로
 * 설명할 수 있다. 실제로 활성 줄 계산을 「초점이 있으면 문서의 모든 줄이
 * 활성」으로 퇴화시켜도 위의 항들은 전부 통과한다.
 *
 * 그래서 여기서는 **초점을 켠 채** 같은 문서에 같은 요소를 둘 두고, 커서를
 * 하나에만 올린다. 커서가 놓인 줄은 원문이 드러나고 **다른 줄은 여전히 숨어
 * 있어야** 한다. 그 둘을 한 항에서 함께 단언한다 — 한쪽만 재면 초점 축과
 * 구별되지 않는다.
 */
describe('FR-EDITOR-007 — 드러남은 문서가 아니라 커서가 놓인 줄에서만 일어난다', () => {
  it('AC-1: 커서를 올린 헤딩만 `#` 가 돌아오고 다른 헤딩은 숨은 채다', () => {
    const shown = reveal('# 커서 있는 제목\n\n# 커서 없는 제목\n', '커서 있는 제목');

    expect(shown, '커서가 놓인 헤딩의 기호가 돌아오지 않았다').toContain('# 커서 있는 제목');
    expect(shown, '커서가 없는 헤딩의 기호까지 드러났다').not.toContain('# 커서 없는 제목');
    expect(shown, '커서가 없는 헤딩의 내용이 사라졌다').toContain('커서 없는 제목');
  });

  it('AC-2: 커서를 올린 줄의 강조만 `**` 가 돌아오고 다른 줄은 숨은 채다', () => {
    const shown = reveal('**커서 있는 강조** 문장\n\n**커서 없는 강조** 문장\n', '커서 있는 강조');

    expect(shown, '커서가 놓인 줄의 강조 기호가 돌아오지 않았다').toContain('**커서 있는 강조**');
    expect(shown, '커서가 없는 줄의 강조 기호까지 드러났다').not.toContain('**커서 없는 강조**');
    expect(shown, '커서가 없는 줄의 강조 내용이 사라졌다').toContain('커서 없는 강조');
  });

  it('AC-3: 커서를 올린 항목만 `-` 가 돌아오고 다른 항목은 불릿인 채다', () => {
    // 두 항목을 **같은 목록** 안에 둔다. 서로 다른 블록에 두면 커서가 블록을
    // 가르는지 줄을 가르는지 구별되지 않는데, 조항의 문면은 「줄」이다.
    const shown = reveal('앞 문단\n\n- 커서 있는 항목\n- 커서 없는 항목\n', '커서 있는 항목');

    expect(shown, '커서가 놓인 항목의 마커가 돌아오지 않았다').toContain('-커서 있는 항목');
    expect(shown, '커서가 없는 항목의 마커까지 드러났다').not.toContain('-커서 없는 항목');
    expect(shown, '커서가 없는 항목이 불릿으로 남지 않았다').toContain('•커서 없는 항목');
  });

  it('AC-4: 커서를 올린 링크만 주소가 돌아오고 다른 링크는 숨은 채다', () => {
    // AC-4 는 다른 여덟과 달리 **링크 단위** 규칙(`activeLinkStarts`)을 탄다.
    // 그래도 조항의 문면은 「줄」이므로 둘을 서로 다른 줄에 두고, 커서가 닿지
    // 않은 링크의 주소가 숨은 채로 남는지를 같은 방식으로 잰다.
    const shown = reveal(
      '[커서 있는 링크](https://example.test/cursor-here)\n\n[커서 없는 링크](https://example.test/no-cursor)\n',
      '커서 있는 링크',
    );

    expect(shown, '커서가 놓인 링크의 주소가 돌아오지 않았다').toContain(
      'https://example.test/cursor-here',
    );
    expect(shown, '커서가 없는 링크의 주소까지 드러났다').not.toContain(
      'https://example.test/no-cursor',
    );
    expect(shown, '커서가 없는 링크의 글자가 사라졌다').toContain('커서 없는 링크');
  });

  it('AC-5: 커서를 올린 인용만 `>` 가 돌아오고 다른 인용은 숨은 채다', () => {
    const shown = reveal('> 커서 있는 인용\n\n> 커서 없는 인용\n', '커서 있는 인용');

    expect(shown, '커서가 놓인 인용의 기호가 돌아오지 않았다').toContain('> 커서 있는 인용');
    expect(shown, '커서가 없는 인용의 기호까지 드러났다').not.toContain('> 커서 없는 인용');
    expect(shown, '커서가 없는 인용의 내용이 사라졌다').toContain('커서 없는 인용');
  });
});
