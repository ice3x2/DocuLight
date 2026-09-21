import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8');

describe('IR-SHELL-013 audit coverage contracts', () => {
  it('publishes product evidence only from a run-owned staging directory', () => {
    const runner = read('./issue88-settings-leave-product-runner.mjs');
    expect(runner).toContain("mkdtempSync(path.join(os.tmpdir(), 'doculight-issue88-output-'))");
    expect(runner).toContain('verifyStagedCapture');
    expect(runner).toContain('publishCapture');
    expect(runner).toContain('source/artifact/report identity mismatch');
  });

  it('measures the fourth close path, persisted reopen, and all reviewed matrix axes', () => {
    const checker = read('./issue88-settings-leave-product-check.mjs');
    for (const marker of [
      'headerCloseDiscardPersisted',
      'persistedValueAfterReopen',
      'lastFormFieldReachable',
      'longKoreanWarningCount',
      'keyboardFocusTrap',
      'keyboardRadixActivation',
      'forcedActionGeometry',
    ]) expect(checker).toContain(marker);
  });

  it('keeps explicit owner replacement, stale cleanup, and session-switch coverage', () => {
    const behavior = read('./issue88-settings-leave-guard.test.tsx');
    for (const marker of [
      'owner unmount invalidates a pending departure',
      'replacement owner survives stale cleanup',
      'competing owner cannot replace the active owner',
      'session switch invalidates the old owner epoch',
    ]) expect(behavior).toContain(marker);
  });
});
