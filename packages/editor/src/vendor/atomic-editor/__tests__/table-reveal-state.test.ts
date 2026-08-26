import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, type StateEffect } from '@codemirror/state';
import { EditorView, type DecorationSet } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { readOnlyExtension } from '../read-only';
import { tables } from '../table-widget';

/**
 * 표의 원문 노출을 **상태 단위**로 잰다 (`FR-EDITOR-007` AC-7).
 *
 * 브라우저 판정(`test/table-reveal-check.mjs`)은 사용자 제스처를 재고, 여기서는
 * 그 제스처가 만든 트랜잭션만 걸어 데코레이션 규칙 자체를 잰다. 뷰가 없으므로
 * happy-dom 의 재진입 문제(`test/live-preview.test.tsx` 의 skip 항 참조)를 타지
 * 않는다.
 */

const TABLE = '| A | B |\n| --- | --- |\n| 1 | 2 |';
const DOC = `앞 문단\n\n${TABLE}\n\n뒤 문단\n`;

const OTHER_TABLE = '| C | D |\n| --- | --- |\n| 3 | 4 |';
const TWO_TABLES = `앞 문단\n\n${TABLE}\n\n사이 문단\n\n${OTHER_TABLE}\n\n뒤 문단\n`;

const stateOf = (doc: string, anchor = 0, readOnly = false): EditorState =>
  EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdown({ base: markdownLanguage }),
      tables(),
      // 읽기 전용일 때만 얹는다 — 기존 항들이 재는 상태를 건드리지 않는다.
      readOnly ? readOnlyExtension(true) : [],
    ],
  });

/**
 * `tableField` 가 발행한 데코레이션 집합.
 *
 * 필드를 export 하지 않고 `EditorView.decorations` 파셋으로 읽는다 — 시험을
 * 위해 내부 심볼을 공개하면 그 심볼이 곧 계약이 된다.
 */
function decorationsOf(state: EditorState): DecorationSet {
  const sets = state
    .facet(EditorView.decorations)
    .filter((value): value is DecorationSet => typeof value !== 'function');
  expect(sets, '표 확장이 데코레이션 집합을 하나만 낸다는 전제가 깨졌다').toHaveLength(1);
  return sets[0]!;
}

function widgetCount(state: EditorState): number {
  let n = 0;
  for (const iter = decorationsOf(state).iter(); iter.value; iter.next()) n++;
  return n;
}

/**
 * 편집기 초점 상태를 상태에 싣는다.
 *
 * CM6 가 `focus` / `blur` 관찰자에서 하는 일과 **같은 경로**다 — 등록된
 * `focusChangeEffect` 를 그대로 불러 트랜잭션에 싣는다. 흉내가 아니라 같은 API 다.
 */
function withFocus(state: EditorState, focusing: boolean): EditorState {
  const effects = state
    .facet(EditorView.focusChangeEffect)
    .map((getEffect) => getEffect(state, focusing))
    .filter((effect): effect is StateEffect<unknown> => effect != null);
  return state.update({ effects }).state;
}

const posOf = (doc: string, needle: string) => doc.indexOf(needle);

describe('표 원문 노출 — 상태 단위 규칙 (`FR-EDITOR-007` AC-7)', () => {
  /**
   * 커서가 닿은 표만 드러난다 — 초점이 켜진 **동안의** 규칙으로.
   *
   * 커서를 표 밖에 둔 채 초점만 켜면 노출 대상이 그대로라 데코레이션이
   * 그대로 물려내려온다. 그 상태를 재면 초점이 켜진 동안의 규칙이 아니라
   * 상태가 만들어질 때(초점 없음)의 결과를 재게 되어, 노출 조건에서
   * `selectionTouches` 를 통째로 빼도 이 항이 살아남는다 — 실제로 그렇게
   * 되돌려 확인했다(`wave-1.mutation-probes.md` M1). 그래서 커서를 표 안에
   * 두고 초점을 켜 규칙이 실제로 다시 돌게 한 뒤, 커서가 닿지 않은 **다른**
   * 표가 위젯으로 서 있는지를 잰다.
   */
  it('초점이 있으면 커서가 닿은 표만 드러나고 나머지 표는 위젯으로 선다', () => {
    const state = withFocus(
      stateOf(TWO_TABLES, posOf(TWO_TABLES, '| 1 |') + 3),
      true,
    );
    expect(widgetCount(state), '커서가 닿지 않은 표까지 원문이 드러났다').toBe(1);
  });

  /**
   * 커서가 표의 **경계 자리**에 있어도 닿은 것으로 친다.
   *
   * `selectionTouches` 가 `range.from <= to && range.to >= from` 이라 경계를
   * 포함한다. 블록 위젯을 클릭하면 커서가 그 두 끝 중 하나로 가므로, 경계를
   * 빼면 클릭이 만드는 자리를 정확히 놓친다 — AC-7 의 본 판정이 무는 자리다.
   *
   * 이 항이 없으면 벤더 사본(`table-widget.ts`)과 공용 사본
   * (`src/core/selection-touches.ts`)이 어긋나도 아무 시험이 울지 않는다. 두
   * 파일의 주석이 서로를 가리키며 「반드시 같아야 한다」고 적지만 주석은 그것을
   * 지키게 하지 못한다. 나머지 항들이 커서를 언제나 표 안쪽에 두는 탓에,
   * 벤더 사본만 경계를 배타로 바꾸는 되돌림에 이 파일 전까지는 아무 항도
   * 죽지 않았다.
   */
  it('커서가 표의 첫 자리나 끝 자리에 있어도 원문이 드러난다', () => {
    const focused = withFocus(stateOf(DOC, 0), true);
    const from = posOf(DOC, TABLE);
    const to = from + TABLE.length;

    const atStart = focused.update({ selection: { anchor: from } }).state;
    expect(widgetCount(atStart), '커서가 표의 첫 자리인데 원문이 드러나지 않았다').toBe(0);

    const atEnd = focused.update({ selection: { anchor: to } }).state;
    expect(widgetCount(atEnd), '커서가 표의 끝 자리인데 원문이 드러나지 않았다').toBe(0);
  });

  it('커서를 표에 올리면 위젯이 걷히고, 빼면 다시 선다', () => {
    const focused = withFocus(stateOf(DOC, 0), true);

    const inside = focused.update({ selection: { anchor: posOf(DOC, '| 1 |') + 3 } }).state;
    expect(widgetCount(inside), '커서가 표에 있는데 원문이 드러나지 않았다').toBe(0);

    const outside = inside.update({ selection: { anchor: posOf(DOC, '뒤 문단') } }).state;
    expect(widgetCount(outside), '커서를 뺐는데 위젯이 다시 서지 않았다').toBe(1);
  });

  it('초점을 잃으면 커서가 표에 있어도 위젯이 다시 선다', () => {
    const inside = withFocus(stateOf(DOC, posOf(DOC, '| 1 |') + 3), true);
    expect(widgetCount(inside)).toBe(0);

    expect(widgetCount(withFocus(inside, false))).toBe(1);
  });

  /**
   * 읽기 전용은 원문 노출의 **안전 조건**이다.
   *
   * `canRevealSource` 는 초점과 `!readOnly` 를 함께 요구한다. 초점 축은 위
   * 항이 재지만 `!readOnly` 축은 그것만으로 재지지 않는다 — 읽기 전용에서도
   * 편집기는 초점을 받을 수 있고(`readOnlyExtension` 은 `editable` 을 내리지만
   * 상태 단위에서는 초점 효과가 그대로 실린다), 그 상태에서 커서가 표에
   * 놓이면 고칠 수도 없는 원문이 드러난 채 남는다.
   *
   * 같은 자리·같은 초점에서 편집 가능한 상태가 원문을 드러낸다는 것을 함께
   * 재어, 이 항이 「위치를 잘못 짚어서」 통과하는 길을 막는다.
   */
  it('읽기 전용이면 초점이 있고 커서가 표에 있어도 원문이 드러나지 않는다', () => {
    const anchor = posOf(DOC, '| 1 |') + 3;

    const editable = withFocus(stateOf(DOC, anchor), true);
    expect(widgetCount(editable), '대조 실패 — 편집 가능한 상태가 원문을 드러내지 않았다').toBe(0);

    const readOnly = withFocus(stateOf(DOC, anchor, true), true);
    expect(widgetCount(readOnly), '읽기 전용인데 원문이 드러났다').toBe(1);
  });

  /**
   * 표 밖에서 커서만 움직이는 트랜잭션은 데코레이션을 **다시 만들지 않는다**.
   *
   * 이것은 성능 판정이다. 다시 만드는 순간 `ensureSyntaxTree(state, doc.length,
   * 200)` 와 문서 전체 `tree.iterate` 가 화살표 키 한 번마다 돈다. 같은 집합
   * 객체가 그대로 돌아오는지로 재면 시계에 기대지 않고 그 사실을 잰다.
   */
  it('표에 닿지 않는 커서 이동은 데코레이션 집합을 다시 만들지 않는다', () => {
    const focused = withFocus(stateOf(DOC, 0), true);
    const before = decorationsOf(focused);

    let moved = focused;
    for (const needle of ['앞 문단', '뒤 문단', '앞 문단']) {
      moved = moved.update({ selection: { anchor: posOf(DOC, needle) + 1 } }).state;
    }

    expect(
      decorationsOf(moved),
      '표 경계를 넘지 않은 커서 이동이 문서 전체를 다시 훑었다',
    ).toBe(before);
  });

  it('초점이 없으면 커서를 표에 올려도 다시 만들지 않는다', () => {
    const unfocused = stateOf(DOC, 0);
    const before = decorationsOf(unfocused);

    const moved = unfocused.update({ selection: { anchor: posOf(DOC, '| 1 |') + 3 } }).state;

    expect(decorationsOf(moved), '드러날 수 없는 상태에서 문서 전체를 다시 훑었다').toBe(before);
  });

  /**
   * 문서 변경과 커서 이동이 **한 트랜잭션**에 함께 실릴 때.
   *
   * `changeAffectsTables` 는 표에 닿지 않는 변경을 빠른 경로로 흘려보내는데,
   * 표가 드러나 있는 동안에는 그 표에 데코레이션이 없어 겹침 신호가 서지
   * 않는다. 선택을 함께 보지 않으면 커서가 이미 표를 떠났는데도 원문이 드러난
   * 채 남고, 다음 선택 전용 트랜잭션이 올 때까지 스스로 낫지 않는다.
   */
  it('표를 떠나는 변경+선택 트랜잭션이 원문을 드러난 채 남기지 않는다', () => {
    const inside = withFocus(stateOf(DOC, posOf(DOC, '| 1 |') + 3), true);
    expect(widgetCount(inside)).toBe(0);

    // 표에서 멀리 떨어진, 파이프 없는 줄을 고치면서 커서도 그리로 옮긴다.
    const head = posOf(DOC, '앞 문단');
    const combined = inside.update({
      changes: { from: head, insert: '새 ' },
      selection: { anchor: head + 1 },
    }).state;

    expect(widgetCount(combined), '커서가 표를 떠났는데 원문이 드러난 채 남았다').toBe(1);
  });
});
