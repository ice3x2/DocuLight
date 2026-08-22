import { describe, expect, it } from 'vitest';

import { highlightCode, isHighlightable } from '../src/core/code-highlight';

describe('CON-ARCH-005 AC-6 — shiki 로 코드를 칠한다', () => {
  it('아는 언어를 칠한다', async () => {
    const html = await highlightCode('const a = 1;', 'ts');

    expect(html).toContain('<span');
    expect(html).toContain('a');
  });

  it('모르는 언어도 던지지 않는다 — 문서에는 아무 언어나 적힌다', async () => {
    await expect(highlightCode('무엇인가', 'qqq')).resolves.toContain('무엇인가');
  });

  it('언어가 없으면 칠하지 않는다 — 추측해 칠하면 엉뚱한 색이 붙는다', () => {
    expect(isHighlightable('')).toBe(false);
    expect(isHighlightable('ts')).toBe(true);
  });

  it('빈 코드도 던지지 않는다', async () => {
    await expect(highlightCode('', 'ts')).resolves.toBeTypeOf('string');
  });
});
