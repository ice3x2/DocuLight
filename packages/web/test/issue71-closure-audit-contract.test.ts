import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');
const checkerText = read('./issue71-instance-settings-product-check.mjs');
const runnerText = read('./issue71-instance-settings-product-runner.mjs');
const shellCss = read('../src/styles/shell.css');
function initializer(source: string, name: string, open: '{' | '[', close: '}' | ']'): string {
  const start = source.indexOf(`const ${name} = ${open}`);
  if (start < 0) return '';
  const bodyStart = source.indexOf(open, start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    if (source[index] === close && --depth === 0) return source.slice(bodyStart, index + 1);
  }
  return '';
}

describe('IR-SHELL-002 · DR-SHELL-001 closure evidence contract', () => {
  it('drives real composition input, post-composition validation, correction, and keyboard save', () => {
    expect(checkerText.match(/new InputEvent\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(checkerText).toMatch(/CompositionEvent\('compositionupdate'/);
    expect(checkerText).toMatch(/inputType:\s*'insertCompositionText'/);
    expect(checkerText).toMatch(/getAttribute\('aria-invalid'\)/);
    expect(checkerText).toMatch(/press\('Enter'\)/);
  });

  it('records combined #71/#87/#88 outcomes instead of literal pass flags', () => {
    const combined = initializer(checkerText, 'combinedSmoke', '{', '}');
    expect(combined).not.toBe('');
    expect(combined).not.toMatch(/:\s*(true|false)\b/);
  });

  it('uses valid settings data for denied PUTs and records authoritative before/after state', () => {
    expect(checkerText).not.toMatch(/method:\s*'PUT'[\s\S]{0,240}body:\s*'\{\}'/);
    expect(checkerText).toMatch(/signup-mode/);
    expect(checkerText).toMatch(/authoritativeBefore/);
    expect(checkerText).toMatch(/authoritativeAfter/);
  });

  it('publishes all changed sources and raw command evidence with the manifest last', () => {
    const sourcePaths = initializer(runnerText, 'sourcePaths', '[', ']');
    expect(sourcePaths).not.toBe('');
    expect(sourcePaths).toEqual(expect.stringContaining(
      'packages/web/src/styles/shell.css',
    ));
    expect(sourcePaths).toContain('packages/web/test/issue71-closure-audit-contract.test.ts');
    expect(sourcePaths).toContain('packages/web/test/issue88-settings-leave-guard.test.tsx');
    expect(runnerText).toMatch(/rawCommands/);
    expect(runnerText).toMatch(/manifestLast:\s*true/);
  });

  it('keeps the authored focus ring above the measured two-pixel physical minimum', () => {
    const rule = shellCss.match(/\[data-instance-settings-state\] button:focus-visible\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*2px solid var\(--focus-ring\)/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });

  it('measures an exact zero PUT/preview delta through the complete composition lifecycle', () => {
    expect(checkerText).toContain('trafficBeforeComposition');
    expect(checkerText).toContain('trafficAfterValidation');
    expect(checkerText).toMatch(/putOrPreviewDelta:\s*trafficAfterValidation\s*-\s*trafficBeforeComposition/);
    expect(checkerText).not.toContain('guardedRequests.length>=before');
  });

  it('measures linked text, error, control, border, focus, and button contrast against each adjacent background', () => {
    for (const marker of ['compositedBackground', 'errorObservations', 'labelBackground', 'helpBackground', 'errorBackground', 'buttonBackground']) {
      expect(checkerText).toContain(marker);
    }
  });
});
