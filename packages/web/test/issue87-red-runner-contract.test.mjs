import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeVitestResult, validateRedReport } from './issue87-red-evidence-contract.mjs';
import { verifyEvidenceBundle } from './issue87-evidence-bundle.mjs';
import { waitForOwnedChildAfterInvariant } from './issue87-owned-child-grace.mjs';

const base = { exitCode: 1, signal: null, timedOut: false, stdout: '', stderr: '' };
const allowlist = JSON.parse(fs.readFileSync(new URL('./issue87-red-allowlist.json', import.meta.url), 'utf8'));
const vitestReport = (name, overrides = {}) => ({
  ...base,
  structuredResult: allowlist[name],
  ...overrides,
});
const browserReport = (overrides = {}) => ({
  ...base,
  sentinels: [
    { type: 'builds-complete', server: true, web: true },
    { type: 'fixture-complete', server: true, database: true, vault: true },
    { type: 'preview-post-timeout', method: 'POST', path: '/api/settings/retention-impact', timeoutMs: 30000 },
    { type: 'browser-red-complete', checkerExitCode: 87 },
  ],
  ...overrides,
});

const diagnosticTypes = ['Error', 'TypeError', 'AggregateError'];
for (const name of ['server', 'web', 'browser']) {
  for (const diagnosticType of diagnosticTypes) {
    test(`FR-CONFIRM-024: rejects ${diagnosticType} contamination appended to the ${name} RED report`, () => {
      const report = name === 'browser' ? browserReport() : vitestReport(name);
      report.stderr = `\n${diagnosticType}: unrelated cleanup failure`;
      assert.throws(() => validateRedReport(name, report), /unexpected RED outcome/, `${name} ${diagnosticType}`);
    });
  }
}

test('FR-CONFIRM-024: rejects a structured suite-level secondary message', () => {
  assert.throws(() => normalizeVitestResult({
    success: false,
    unhandledErrors: [],
    numTotalTests: 0,
    testResults: [{ message: 'Error: unrelated suite failure', assertionResults: [] }],
  }), /unexpected secondary error/);
});

test('FR-CONFIRM-024: rejects multiple failure messages on one structured assertion', () => {
  assert.throws(() => normalizeVitestResult({
    success: false,
    unhandledErrors: [],
    numTotalTests: 1,
    testResults: [{
      message: '',
      assertionResults: [{
        status: 'failed',
        fullName: 'FR-CONFIRM-024 deliberate RED',
        failureMessages: ['Error: expected product RED', 'TypeError: unrelated secondary failure'],
      }],
    }],
  }), /unexpected status or secondary error/);
});

test('FR-CONFIRM-024: accepts only the exact server and web RED summaries', () => {
  assert.deepEqual(validateRedReport('server', vitestReport('server')), { kind: 'vitest', failed: 61, passed: 5, total: 66 });
  assert.deepEqual(validateRedReport('web', vitestReport('web')), { kind: 'vitest', failed: 13, passed: 0, total: 13 });
  assert.throws(() => validateRedReport('server', { ...base, stderr: 'SyntaxError: unexpected token' }), /unexpected RED outcome/);
  assert.throws(() => validateRedReport('web', { ...base, stdout: 'Tests  12 failed | 1 passed (13)' }), /unexpected RED outcome/);
});

test('FR-CONFIRM-024: browser RED is only the post-build retention-impact response timeout', () => {
  assert.deepEqual(validateRedReport('browser', browserReport()), {
    kind: 'playwright-response-timeout',
    method: 'POST',
    path: '/api/settings/retention-impact',
    timeoutMs: 30000,
  });
  assert.throws(() => validateRedReport('browser', browserReport({ sentinels: [] })), /unexpected RED outcome/);
});

test('FR-CONFIRM-024: generated evidence document and manifest agree with raw and source identities', () => {
  assert.doesNotThrow(() => verifyEvidenceBundle(new URL('../../../.kiwi/sessions/newspaper-20260916/evidence/issue87/', import.meta.url)));
});

class FakeChild extends EventEmitter {
  constructor() { super(); this.exitCode = null; this.signalCode = null; this.pid = 8701; this.kills = 0; }
  kill() { this.kills += 1; this.signalCode = 'SIGTERM'; queueMicrotask(() => { this.exitCode = 1; this.emit('exit', 1, 'SIGTERM'); }); return true; }
}

test('FR-CONFIRM-024: IPC invariant failure keeps the original error and gives natural cleanup a grace period', async () => {
  const original = new Error('preview mutated authoritative database tables');
  const natural = new FakeChild();
  const naturalWait = waitForOwnedChildAfterInvariant(natural, original, 50);
  queueMicrotask(() => { natural.exitCode = 1; natural.emit('exit', 1, null); });
  await assert.rejects(naturalWait, (error) => error === original);
  assert.equal(natural.kills, 0);

  const hanging = new FakeChild();
  await assert.rejects(waitForOwnedChildAfterInvariant(hanging, original, 5), (error) => error === original);
  assert.equal(hanging.kills, 1);
  assert.notEqual(hanging.exitCode, null);
});
