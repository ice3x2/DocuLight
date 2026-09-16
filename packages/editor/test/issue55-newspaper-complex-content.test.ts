import katex from 'katex';
import { describe, expect, it, vi } from 'vitest';

import { highlightCode } from '../src/core/code-highlight';
import { renderMath } from '../src/core/math-blocks';
import { getCachedSize, mermaidConfigSignature, setCachedSize } from '../src/core/mermaid-render';

describe('FR-EDITOR-007 / FR-EDITOR-010 newspaper complex content', () => {
  it('uses one CSS-variable Shiki theme without baked light colors or italic tokens', async () => {
    const html = await highlightCode('const answer = 42;', 'ts');

    expect(html).toContain('--shiki-');
    expect(html).not.toContain('github-light');
    expect(html).not.toMatch(/font-style:\s*(italic|oblique)/i);
  });

  it('includes the resolved palette, font, security settings, and width in Mermaid identity', () => {
    document.documentElement.style.cssText = '--surface-document:#fff;--surface-selected:#def;--surface-control:#eee;--surface-app:#ddd;--text-primary:#111;--border-control:#333;--surface-warning:#ffc;--status-warning:#960;--font-sans:Arial';
    const first = mermaidConfigSignature(640);
    document.documentElement.style.setProperty('--surface-document', '#000');
    expect(mermaidConfigSignature(640)).not.toBe(first);
    expect(mermaidConfigSignature(320)).not.toBe(mermaidConfigSignature(640));
  });

  it('keys Mermaid measured size by theme/config identity and width', () => {
    const code = 'graph LR; A-->B;';
    setCachedSize(code, { w: 120, h: 80 }, 'dark:640');

    expect(getCachedSize(code, 'dark:640')).toEqual({ w: 120, h: 80 });
    expect(getCachedSize(code, 'light:640')).toBeUndefined();
    expect(getCachedSize(code, 'dark:320')).toBeUndefined();
  });

  it('exposes invalid TeX with a visible error label and selectable exact source', () => {
    const html = renderMath('\\notacommand{<unsafe>}', false);

    expect(html).toContain('수식 오류');
    expect(html).toContain('\\notacommand{&lt;unsafe&gt;}');
    expect(html).not.toContain('<unsafe>');
    expect(html).not.toContain('katex-error');
  });

  it('does not confuse an author-selected KaTeX color with the error channel', () => {
    const html = renderMath('\\color{#d11e1e}{valid}', false);

    expect(html).toContain('valid');
    expect(html).not.toContain('수식 오류');
  });

  it('contains an unexpected KaTeX exception and keeps the exact source available', () => {
    const render = vi.spyOn(katex, 'renderToString').mockImplementationOnce(() => {
      throw new Error('unexpected renderer failure');
    });

    const html = renderMath('x + y', true);
    expect(html).toContain('<code>x + y</code>');
    expect(html).toContain('수식 오류');
    render.mockRestore();
  });
});
