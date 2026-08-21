import { describe, expect, it } from 'vitest';

import { fencedLines, fencedRanges, insideCodeSpan, insideCodeSpanAt, maskVerbatim } from '../src/core/verbatim';

const rows = (text: string) => [...fencedLines(text.split('\n'))].sort((a, b) => a - b);

describe('코드 펜스 구간', () => {
  it('여닫는 줄까지 포함한다 — 울타리 자체도 원문이다', () => {
    expect(rows('가\n```\n나\n```\n다')).toEqual([1, 2, 3]);
  });

  it('닫히지 않으면 아무 줄도 덮지 않는다', () => {
    expect(rows('```\n나\n다')).toEqual([]);
  });

  it('물결과 백틱을 섞으면 서로를 닫지 못한다', () => {
    // 닫는 것으로 쳐 주면 문서의 절반이 코드가 된다.
    expect(rows('```\n가\n~~~\n나')).toEqual([]);
  });

  it('펜스가 둘이면 각각 덮는다', () => {
    expect(rows('```\n가\n```\n밖\n```\n나\n```')).toEqual([0, 1, 2, 4, 5, 6]);
  });

  it('들여쓰기 3칸까지는 펜스다 — 4칸부터는 들여쓴 코드블록이라 규칙이 다르다', () => {
    expect(rows('   ```\n가\n   ```')).toEqual([0, 1, 2]);
    expect(rows('    ```\n가\n    ```')).toEqual([]);
  });
});

describe('오프셋 구간', () => {
  it('줄 오프셋이 실제 자리와 맞는다', () => {
    const text = '가\n```\n나\n```\n다';
    const [range] = fencedRanges(text);

    expect(text.slice(range![0], range![1])).toBe('```\n');
  });

  it('펜스가 없으면 구간도 없다', () => {
    expect(fencedRanges('그냥 본문')).toEqual([]);
  });
});

describe('코드 스팬', () => {
  it('여는 백틱 뒤가 안이다', () => {
    expect(insideCodeSpan('`x` 밖', 1)).toBe(true);
    expect(insideCodeSpan('`x` 밖', 4)).toBe(false);
  });

  it('문서 오프셋으로도 같은 답이다', () => {
    const text = '첫 줄\n`x` 밖';
    expect(insideCodeSpanAt(text, text.indexOf('x'))).toBe(true);
    expect(insideCodeSpanAt(text, text.indexOf('밖'))).toBe(false);
  });

  it('마지막 줄에서도 동작한다 — 줄 끝을 못 찾아 잘리면 안 된다', () => {
    const text = '앞\n`x`';
    expect(insideCodeSpanAt(text, text.indexOf('x'))).toBe(true);
  });
});

describe('가리기', () => {
  it('길이와 줄바꿈을 그대로 둔다 — 오프셋이 밀리면 찾은 자리가 어긋난다', () => {
    const text = '가\n```\n$$\n```\n나';
    const masked = maskVerbatim(text);

    expect(masked).toHaveLength(text.length);
    expect(masked.split('\n')).toHaveLength(text.split('\n').length);
  });

  it('펜스 안의 글자를 지우고 밖은 남긴다', () => {
    const masked = maskVerbatim('밖1\n```\n$$안$$\n```\n밖2');

    expect(masked).toContain('밖1');
    expect(masked).toContain('밖2');
    expect(masked).not.toContain('$$안$$');
  });

  it('코드 스팬 안의 글자를 지운다', () => {
    expect(maskVerbatim('`$x$` 밖')).not.toContain('$x$');
  });

  it('닫히지 않은 백틱은 지우지 않는다 — 한 짝만 있는 백틱이 줄 끝까지 삼키면 안 된다', () => {
    expect(maskVerbatim('`한짝만 #태그')).toContain('#태그');
  });

  it('가릴 것이 없으면 원문 그대로다', () => {
    expect(maskVerbatim('그냥 #태그 와 $x$ 없음')).toBe('그냥 #태그 와 $x$ 없음');
  });
});

describe('태그와 수식이 같은 답을 낸다 — 갈리면 한쪽만 규칙이 바뀐 것이다', () => {
  it('닫히지 않은 백틱에서 둘 다 잡는다', async () => {
    const { findTags } = await import('../src/core/tags');
    const { findMathBlocks } = await import('../src/core/math-blocks');
    const { EditorState } = await import('@codemirror/state');
    const doc = '`한짝만 #태그 와 $x$';

    const tagged = findTags(doc).length > 0;
    const mathed = findMathBlocks(EditorState.create({ doc })).length > 0;

    // 한쪽만 빼면 같은 줄에서 태그는 사라지고 수식은 렌더된다.
    expect(tagged).toBe(mathed);
  });

  it('닫힌 코드 스팬에서 둘 다 뺀다', async () => {
    const { findTags } = await import('../src/core/tags');
    const { findMathBlocks } = await import('../src/core/math-blocks');
    const { EditorState } = await import('@codemirror/state');
    const doc = '`#태그 와 $x$` 밖';

    expect(findTags(doc)).toEqual([]);
    expect(findMathBlocks(EditorState.create({ doc }))).toEqual([]);
  });
});
