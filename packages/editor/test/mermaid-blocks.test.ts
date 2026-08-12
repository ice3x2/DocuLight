import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
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
