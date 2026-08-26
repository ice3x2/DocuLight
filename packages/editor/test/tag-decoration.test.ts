import { EditorState } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { tagDecorations } from '../src/core/tag-decoration';

/**
 * 태그의 원문 노출을 **상태 단위**로 잰다 (`FR-EDITOR-007` AC-10).
 *
 * 이 파일이 서기 전까지 AC-10 의 노출 축을 재는 것은 브라우저 시험
 * (`test/tag-chip-check.mjs`) 하나뿐이었고, 그것은 `npm test` 가 수집하지
 * 않아 사람이 부를 때만 돈다. 그래서 `tag-decoration.ts` 의 `revealed` 를
 * 무조건 거짓으로 되돌려 태그가 **절대 드러나지 않게** 만들어도 editor
 * vitest 251 항이 전부 통과했다 — 회귀가 조용히 지나간다는 뜻이다.
 *
 * 같은 상황이 AC-7 에도 있었고 `src/vendor/atomic-editor/__tests__/
 * table-reveal-state.test.ts` 가 그 자리를 메웠다. 이 파일은 그 선례를
 * 태그 축에 적용한 것이다.
 */

const DOC = '앞 문단\n\n본문에 #할일 태그가 있다\n\n뒤 문단\n';

const stateOf = (anchor: number): EditorState =>
  EditorState.create({ doc: DOC, selection: { anchor }, extensions: [tagDecorations()] });

/**
 * 태그 확장이 발행한 데코레이션 집합.
 *
 * `tagDecorations` 는 `EditorView.decorations.from(field)` 로 제공하므로
 * 파셋에 들어가는 값이 **함수**다. 그 함수는 `view.state.field(self)` 만
 * 읽으므로 상태만 든 껍데기를 넘겨 부른다 — 뷰를 띄우면 happy-dom 이 위젯
 * 교체를 선택 변경으로 되쏘아 CM6 가 재진입을 거부한다(`live-preview.test.tsx`
 * 의 건너뛴 항 참조).
 */
function widgetCount(state: EditorState): number {
  const values = state.facet(EditorView.decorations);
  expect(values, '태그 확장이 데코레이션을 하나만 제공한다는 전제가 깨졌다').toHaveLength(1);
  const provider = values[0]!;
  const set: DecorationSet =
    typeof provider === 'function' ? provider({ state } as never) : provider;
  let n = 0;
  for (const iter = set.iter(); iter.value; iter.next()) n++;
  return n;
}

const posOf = (needle: string) => DOC.indexOf(needle);

describe('태그 원문 노출 — 상태 단위 규칙 (`FR-EDITOR-007` AC-10)', () => {
  it('커서가 태그 밖이면 칩으로 서고, 태그에 올리면 걷힌다', () => {
    const outside = stateOf(0);
    expect(widgetCount(outside), '커서가 태그 밖인데 칩이 서지 않았다').toBe(1);

    const inside = outside.update({ selection: { anchor: posOf('#할일') + 2 } }).state;
    expect(widgetCount(inside), '커서가 태그에 있는데 원문이 드러나지 않았다').toBe(0);

    const back = inside.update({ selection: { anchor: 0 } }).state;
    expect(widgetCount(back), '커서를 뺐는데 칩이 다시 서지 않았다').toBe(1);
  });

  /**
   * 경계를 포함한다 — `selectionTouches` 계열이 저장소 전체에서 지키는 규칙이다.
   * 칩을 클릭하면 커서가 그 두 끝 중 하나로 가므로, 경계를 빼면 클릭이 만드는
   * 자리를 정확히 놓친다.
   */
  it('커서가 태그의 첫 자리나 끝 자리에 있어도 원문이 드러난다', () => {
    const from = posOf('#할일');
    const to = from + '#할일'.length;

    expect(widgetCount(stateOf(from)), '커서가 태그의 첫 자리인데 드러나지 않았다').toBe(0);
    expect(widgetCount(stateOf(to)), '커서가 태그의 끝 자리인데 드러나지 않았다').toBe(0);
  });
});
