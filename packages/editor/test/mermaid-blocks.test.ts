import { describe, expect, it } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import {
  findMermaidBlocks,
  mermaidBlockField,
  mermaidBlocks,
} from '../src/core/mermaid-blocks';

const FLOW = ['```mermaid', 'graph TD;', '  A-->B;', '```'].join('\n');

function stateOf(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), mermaidBlocks()],
  });
}

function widgetCount(state: EditorState): number {
  const set = state.field(mermaidBlockField);
  let n = 0;
  for (const iter = set.iter(); iter.value; iter.next()) n++;
  return n;
}

describe('findMermaidBlocks', () => {
  it('mermaid 펜스의 코드와 블록 전체 범위를 추출한다', () => {
    const doc = `앞 문단\n\n${FLOW}\n\n뒤 문단`;
    const blocks = findMermaidBlocks(stateOf(doc));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].code).toBe('graph TD;\n  A-->B;');
    // 범위는 펜스를 포함한다
    expect(doc.slice(blocks[0].from, blocks[0].to)).toBe(FLOW);
  });
});

describe('SDS-AC-1 · 커서가 블록 밖이면 위젯으로 대체한다', () => {
  it('위젯 데코레이션을 1건 발행한다', () => {
    const doc = `${FLOW}\n\n뒤 문단`;
    // 커서를 마지막 문단에 둔다
    expect(widgetCount(stateOf(doc, doc.length))).toBe(1);
  });
});

describe('SDS-AC-2 · 커서가 블록 안이면 원문을 노출한다', () => {
  it('위젯 데코레이션을 발행하지 않는다', () => {
    const doc = `${FLOW}\n\n뒤 문단`;
    const inside = doc.indexOf('graph TD;') + 2;
    expect(widgetCount(stateOf(doc, inside))).toBe(0);
  });

  it('펜스 라인 위에 커서가 있어도 원문을 노출한다', () => {
    const doc = `${FLOW}\n\n뒤 문단`;
    expect(widgetCount(stateOf(doc, 3))).toBe(0);
  });
});

describe('SDS-AC-3 · mermaid 가 아닌 펜스는 대상이 아니다', () => {
  it('다른 언어 태그를 무시한다', () => {
    const doc = '```js\nconst a = 1;\n```\n\n뒤 문단';
    const state = stateOf(doc, doc.length);
    expect(findMermaidBlocks(state)).toHaveLength(0);
    expect(widgetCount(state)).toBe(0);
  });

  it('언어 태그가 없는 펜스를 무시한다', () => {
    const doc = '```\nplain\n```\n\n뒤 문단';
    const state = stateOf(doc, doc.length);
    expect(findMermaidBlocks(state)).toHaveLength(0);
    expect(widgetCount(state)).toBe(0);
  });

  it('언어 태그 접두사만 같은 경우를 무시한다', () => {
    const doc = '```mermaidx\ngraph TD;\n```\n\n뒤 문단';
    expect(findMermaidBlocks(stateOf(doc, doc.length))).toHaveLength(0);
  });
});

describe('SDS-AC-7 · 여러 블록을 독립적으로 판정한다', () => {
  const doc = [FLOW, '', '가운데 문단', '', FLOW, '', '끝'].join('\n');

  it('둘 다 커서 밖이면 위젯 2건', () => {
    expect(widgetCount(stateOf(doc, doc.length))).toBe(2);
  });

  it('첫 블록에 커서가 들면 두 번째만 위젯으로 남는다', () => {
    const inside = doc.indexOf('graph TD;') + 2;
    expect(widgetCount(stateOf(doc, inside))).toBe(1);
  });

  it('두 번째 블록에 커서가 들면 첫 번째만 위젯으로 남는다', () => {
    const inside = doc.lastIndexOf('graph TD;') + 2;
    expect(widgetCount(stateOf(doc, inside))).toBe(1);
  });
});

describe('SDS-AC-9 · 읽기 전용에서는 커서 위치와 무관하게 위젯을 유지한다', () => {
  const doc = `${FLOW}\n\n뒤 문단`;

  function readOnlyStateAt(cursor: number): EditorState {
    return EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage }),
        // 읽기 전용의 SSOT 는 CM6 자신의 facet 이다. vendor 의
        // `readOnlyExtension` 도 이것을 세운다.
        EditorState.readOnly.of(true),
        mermaidBlocks(),
      ],
    });
  }

  it('커서가 블록 안이어도 다이어그램이 유지된다', () => {
    expect(widgetCount(readOnlyStateAt(doc.indexOf('graph TD;') + 2))).toBe(1);
  });

  it('커서가 펜스 라인 위여도 다이어그램이 유지된다', () => {
    expect(widgetCount(readOnlyStateAt(3))).toBe(1);
  });

  it('블록 전체를 선택해도 다이어그램이 유지된다', () => {
    const state = EditorState.create({
      doc,
      selection: { anchor: 0, head: doc.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        EditorState.readOnly.of(true),
        mermaidBlocks(),
      ],
    });
    expect(widgetCount(state)).toBe(1);
  });

  it('읽기 전용이 아니면 종전대로 원문이 드러난다', () => {
    expect(widgetCount(stateOf(doc, doc.indexOf('graph TD;') + 2))).toBe(0);
  });
});

describe('SDS-AC-11 · 읽기 전용을 해제할 때 선택을 블록 밖으로 옮긴다', () => {
  const doc = `앞 문단\n\n${FLOW}\n\n뒤 문단`;
  const blockFrom = doc.indexOf('```mermaid');
  const blockTo = blockFrom + FLOW.length;

  function leaveReadOnly(cursor: number) {
    const readOnly = new Compartment();
    const state = EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown({ base: markdownLanguage }),
        readOnly.of(EditorState.readOnly.of(true)),
        mermaidBlocks(),
      ],
    });
    return state.update({ effects: readOnly.reconfigure(EditorState.readOnly.of(false)) });
  }

  it('블록 안에 있던 선택이 블록 밖으로 나간다', () => {
    const tr = leaveReadOnly(doc.indexOf('graph TD;') + 2);
    const head = tr.state.selection.main.head;

    expect(head < blockFrom || head > blockTo).toBe(true);
  });

  it('선택을 옮긴 결과 다이어그램이 렌더 상태로 남는다', () => {
    expect(widgetCount(leaveReadOnly(doc.indexOf('graph TD;') + 2).state)).toBe(1);
  });

  it('블록 밖에 있던 선택은 건드리지 않는다', () => {
    const outside = 2;
    expect(leaveReadOnly(outside).state.selection.main.head).toBe(outside);
  });

  it('편집 모드끼리의 전이에서는 선택을 옮기지 않는다', () => {
    const inside = doc.indexOf('graph TD;') + 2;
    const state = EditorState.create({
      doc,
      selection: { anchor: inside },
      extensions: [markdown({ base: markdownLanguage }), mermaidBlocks()],
    });
    const tr = state.update({ selection: { anchor: inside } });

    expect(tr.state.selection.main.head).toBe(inside);
  });
});

describe('선택 영역이 블록에 걸치면 원문을 노출한다', () => {
  it('블록을 가로지르는 선택에서 위젯을 발행하지 않는다', () => {
    const doc = `앞\n\n${FLOW}\n\n뒤`;
    const state = EditorState.create({
      doc,
      selection: { anchor: 0, head: doc.length },
      extensions: [markdown({ base: markdownLanguage }), mermaidBlocks()],
    });
    expect(widgetCount(state)).toBe(0);
  });
});
