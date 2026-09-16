import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { atomicEditorTheme } from '../src/vendor/atomic-editor/atomic-theme';

const editorCss = readFileSync(resolve(process.cwd(), 'src/styles/editor.css'), 'utf8');
describe('IR-EDITOR-002 newspaper editor contract', () => {
  it('loads one semantic integration sheet after vendor and KaTeX styles', () => {
    expect(editorCss).toContain("@import './newspaper-integration.css';");
    expect(editorCss.lastIndexOf("@import './newspaper-integration.css';")).toBeGreaterThan(editorCss.lastIndexOf("katex.min.css"));
  });

  it('assembles both resolved CodeMirror theme variants', () => {
    expect(atomicEditorTheme(false)).toBeDefined();
    expect(atomicEditorTheme(true)).toBeDefined();
  });
});
