import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const checker = readFileSync(resolve(process.cwd(), 'test/issue76-app-states-product-check.mjs'), 'utf8');
const runner = readFileSync(resolve(process.cwd(), 'test/issue76-app-states-product-runner.mjs'), 'utf8');
const isolationPath = resolve(process.cwd(), 'test/issue76-product-evidence-isolation.mjs');
const capturePath = resolve(process.cwd(), 'test/issue76-green-evidence-capture.mjs');
const isolation = existsSync(isolationPath) ? readFileSync(isolationPath, 'utf8') : '';
const capture = existsSync(capturePath) ? readFileSync(capturePath, 'utf8') : '';

describe('IR-SHELL-009 product-browser evidence contract', () => {
  it('measures mounted read preservation and recovery on the actual App', () => {
    expect(checker).toContain("label: 'mounted-read-http500'");
    expect(checker).toContain("label: 'mounted-read-network'");
    expect(checker).toContain('sameEditorIdentity');
    expect(checker).toContain('exactSelectionPreserved');
    expect(checker).toContain('compositionPreserved');
  });

  it('measures live state accessibility through zoom and resize', () => {
    expect(checker).toContain("label: 'live-error-retry-recovery'");
    expect(checker).toContain('retryAriaBusy');
    expect(checker).toContain('retainedHostHiddenFromAT');
    expect(checker).toContain('dialogFocusTrapAndRestore');
    expect(checker).toContain('runtimeResizeReachable');
  });

  it('covers the authentication endpoint/result classification matrix', () => {
    for (const label of [
      'logout-unknown-session-same',
      'logout-unknown-session-different',
      'logout-unknown-session-401',
      'logout-unknown-session-500',
      'logout-unknown-session-network',
      'logout-unknown-me-401',
      'logout-unknown-me-500',
      'logout-unknown-me-network',
      'logout-unknown-me-malformed',
      'password-400-me-malformed',
      'password-unknown-me-malformed',
    ]) expect(checker).toContain(`'${label}'`);
    expect(checker).not.toContain('sessionReads >= 0');
    for (const token of ['sessionReadsExact', 'identityReadsExact', 'mutationPostsExact', 'protectedWritesExact', 'observedOutcome']) {
      expect(checker).toContain(token);
    }
    expect(checker).toContain("'x-issue76-late-session': 'true'");
    expect(checker).toContain('terminalRefetchWindowOpen');
    expect(checker).toContain('assert.equal(lateSessionReadsExact, 1)');
    expect(checker).toContain('assert.equal(identityReadsExact, 1, label)');
    for (const label of [
      'logout-confirmed204-session200', 'logout-confirmed204-session401',
      'logout-confirmed204-session500', 'logout-confirmed204-session-network',
      'password-confirmed204-session200', 'password-confirmed204-session401',
      'password-confirmed204-session500', 'password-confirmed204-session-network',
    ]) expect(checker).toContain(`'${label}'`);
  });

  it('proves real-account recovery and records observed editor/focus state', () => {
    for (const label of [
      'recovery-session401', 'recovery-identity401',
      'recovery-password401', 'recovery-account-replacement',
    ]) expect(checker).toContain(`'${label}'`);
    for (const token of [
      'invokerIdentityRestored', 'failedActiveElement', 'retryActiveElement',
      'selectionDirection', 'activeCaretEndpoint', 'compositionObserved',
      'sameAccountRecoveryBytes', 'differentAccountRecoveryNoticeCount',
      'differentAccountAutosaveWrites', 'recoveryDiscarded',
    ]) expect(checker).toContain(token);
  });

  it('checks recovery ownership on the same App instance before original-owner recovery', () => {
    for (const token of [
      'differentAccountSamePage', 'differentAccountRecoveryNoticeCount',
      'differentAccountRecoveryActionCount', 'differentAccountOldNameCount',
      'differentAccountOldBodyCount', 'differentAccountQueryCacheCount',
      'samePageOriginalLogin', 'sameAccountRecoveryBytes', 'recoveryDiscarded',
    ]) expect(checker).toContain(token);
    expect(checker).not.toContain("`${label}-different`");
  });

  it('records mounted editor invariants in all three malformed-identity outcome cells', () => {
    for (const token of [
      'mountedAuthEditor', 'exactEditorBytes', 'editorReadOnly', 'writeBlocked',
      'retrySessionReads', 'retryIdentityReads', 'mutationPostsExact', 'protectedWritesExact',
    ]) expect(checker).toContain(token);
    for (const label of [
      'logout-unknown-me-malformed', 'password-400-me-malformed', 'password-unknown-me-malformed',
    ]) expect(checker).toContain(`'${label}'`);
  });

  it('records exact selection and active endpoint before, during, and after mounted-read retry', () => {
    for (const token of ['beforeFailure', 'duringFailure', 'afterRetry', 'selectionDirection', 'activeCaretEndpoint']) {
      expect(checker).toContain(token);
    }
  });

  it('keeps ordinary product output run-owned and reserves fixed evidence publication for capture', () => {
    expect(runner).toContain('DOCULIGHT_ISSUE76_OUTPUT_DIR');
    expect(checker).toContain('DOCULIGHT_ISSUE76_OUTPUT_DIR');
    expect(isolation).toContain('preserved fixed evidence identity');
    expect(capture).toContain('manifest last');
  });

  it('reports 24 fresh auth outcomes without compatibility aliases', () => {
    expect(checker).toContain('assert.equal(authOutcomes.length, 24)');
    expect(checker).not.toContain("observedOutcome: 'terminal-alias'");
  });
});
