import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

import { codeBlocks, codeBlockField, findCodeBlocks } from '../src/core/code-blocks';

const TS = ['```ts', 'const a = 1;', '```'].join('\n');
const MERMAID = ['```mermaid', 'graph TD;', '```'].join('\n');
const BARE = ['```', '아무 언어도 없다', '```'].join('\n');

function stateOf(doc: string, cursor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown({ base: markdownLanguage }), codeBlocks()],
  });
}

const widgetCount = (state: EditorState): number => {
  let n = 0;
  for (const iter = state.field(codeBlockField).iter(); iter.value; iter.next()) n++;
  return n;
};

describe('findCodeBlocks — 색을 칠할 펜스 (`CON-ARCH-005` AC-6)', () => {
  it('언어가 붙은 펜스의 코드와 범위를 뽑는다', () => {
    const blocks = findCodeBlocks(stateOf(`앞\n\n${TS}\n\n뒤`));

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.language).toBe('ts');
    expect(blocks[0]!.code).toBe('const a = 1;');
  });

  it('mermaid 는 가져가지 않는다 — 그것은 다이어그램이 소유한 자리다', () => {
    // 두 확장이 같은 블록을 대체하면 CM6 가 겹친 데코레이션을 거부하거나
    // 한쪽이 조용히 이긴다. 어느 쪽이 이기는지는 등록 순서가 정한다.
    expect(findCodeBlocks(stateOf(MERMAID))).toEqual([]);
  });

  it('언어가 없는 펜스도 가져가지 않는다 — 추측해 칠하면 뜻이 잘못 읽힌다', () => {
    expect(findCodeBlocks(stateOf(BARE))).toEqual([]);
  });
});

describe('codeBlocks — 커서가 닿으면 원문이 드러난다 (`FR-EDITOR-007` AC-6)', () => {
  it('커서가 블록 밖이면 위젯이 선다', () => {
    expect(widgetCount(stateOf(`앞\n\n${TS}`, 0))).toBe(1);
  });

  it('커서가 블록 안이면 위젯이 없다', () => {
    const doc = `앞\n\n${TS}`;
    expect(widgetCount(stateOf(doc, doc.indexOf('const a')))).toBe(0);
  });
});
