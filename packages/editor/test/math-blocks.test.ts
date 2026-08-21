import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { findMathBlocks, renderMath } from '../src/core/math-blocks';

const stateOf = (doc: string, at?: number) =>
  EditorState.create({ doc, selection: at === undefined ? undefined : { anchor: at } });

const found = (doc: string) => findMathBlocks(stateOf(doc));

describe('FR-EDITOR-007 AC-8 — 수식 블록을 찾는다', () => {
  it('`$$` 로 둘러싼 블록을 찾는다', () => {
    const blocks = found('$$\nE = mc^2\n$$\n');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.tex.trim()).toBe('E = mc^2');
    expect(blocks[0]!.display).toBe(true);
  });

  it('한 줄 `$...$` 도 찾고 인라인으로 표시한다', () => {
    const blocks = found('문장 안의 $a^2$ 수식');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.tex).toBe('a^2');
    expect(blocks[0]!.display).toBe(false);
  });

  it('블록과 인라인을 한 문서에서 함께 찾는다', () => {
    const blocks = found('$$\nx\n$$\n\n그리고 $y$ 다');

    expect(blocks.map((b) => b.display)).toEqual([true, false]);
  });

  it('닫히지 않은 `$$` 는 수식이 아니다 — 문서 끝까지 삼키면 안 된다', () => {
    expect(found('$$\nE = mc^2\n\n본문이 이어진다')).toEqual([]);
  });

  it('빈 `$$` 는 수식이 아니다', () => {
    expect(found('$$$$')).toEqual([]);
    expect(found('$$')).toEqual([]);
  });

  it('금액 표기는 수식이 아니다 — `$5 와 $10` 이 통째로 잡히면 안 된다', () => {
    // 숫자만인 것을 수식으로 잡으면 가격표를 쓴 문서가 전부 깨진다.
    expect(found('$5 와 $10 입니다')).toEqual([]);
  });

  it('코드블록 안의 `$$` 는 수식이 아니다 — 원문을 보여 주는 자리다', () => {
    expect(found('```sh\necho $$\n```\n')).toEqual([]);
  });

  it('찾은 자리가 `$` 를 포함한 전체 범위다 — 그래야 기호가 숨는다', () => {
    const doc = '문장 안의 $a^2$ 수식';
    const [only] = found(doc);

    expect(doc.slice(only!.from, only!.to)).toBe('$a^2$');
  });
});

describe('FR-EDITOR-007 AC-8 — 커서가 그 자리에 있으면 원문이 남는다', () => {
  it('커서가 블록 안이면 그 블록은 감추지 않는다', () => {
    const doc = '$$\nE = mc^2\n$$\n';
    const inside = findMathBlocks(stateOf(doc, doc.indexOf('E')));

    expect(inside[0]!.revealed).toBe(true);
  });

  it('커서가 밖이면 감춘다', () => {
    const doc = '$$\nE = mc^2\n$$\n\n본문';
    const outside = findMathBlocks(stateOf(doc, doc.indexOf('본문')));

    expect(outside[0]!.revealed).toBe(false);
  });
});

describe('수식 렌더', () => {
  it('KaTeX 로 렌더해 HTML 을 돌려준다', () => {
    expect(renderMath('E = mc^2', true)).toContain('katex');
  });

  it('깨진 수식이 예외를 던지지 않는다 — 편집 중에는 늘 깨져 있다', () => {
    // 던지면 타이핑 도중 에디터 전체가 멈춘다.
    expect(() => renderMath('\\frac{', false)).not.toThrow();
    expect(renderMath('\\frac{', false)).toContain('\\frac{');
  });
});

describe('FR-EDITOR-007 AC-8 — 수식으로 잡으면 안 되는 것들', () => {
  it('코드 펜스 안의 `$$` 는 수식이 아니다 — 구문 트리 없이도 걸러야 한다', () => {
    // 셸 스크립트를 문서에 넣으면 `$$`(PID)와 `$VAR` 가 수식이 된다.
    expect(found('```sh\necho $$ 와 $HOME 사이\n```')).toEqual([]);
  });

  it('펜스 밖의 수식은 그대로 잡는다', () => {
    expect(found('```sh\necho $$\n```\n\n$$\nE = mc^2\n$$').map((b) => b.tex.trim())).toEqual(['E = mc^2']);
  });

  it('인라인 코드 안의 `$x$` 는 수식이 아니다', () => {
    expect(found('`$x$` 라고 쓴다')).toEqual([]);
  });

  it('세 개짜리 `$$$` 가 빈 수식을 만들지 않는다', () => {
    // `$$ 와 $ 와 $$$` 처럼 `$` 가 흩어진 문장이 통째로 수식이 되면
    // 그 문장이 화면에서 사라진다.
    expect(found('$$ 와 $ 와 $$$')).toEqual([]);
  });

  it('여러 줄에 걸친 인라인 `$` 는 수식이 아니다', () => {
    expect(found('$a\nb$')).toEqual([]);
  });
});
