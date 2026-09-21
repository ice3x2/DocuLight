import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testRoot, '..');
const root = path.resolve(webRoot, '../..');
const runnerPath = path.join(testRoot, 'issue80-principal-product-runner.mjs');
const checkerPath = path.join(testRoot, 'issue80-principal-product-check.mjs');
const capturePath = path.join(testRoot, 'issue80-green-evidence-capture.mjs');

const read = (file) => {
  assert.equal(fs.existsSync(file), true, `${path.basename(file)} must exist`);
  return fs.readFileSync(file, 'utf8');
};

test('IR-PRINCIPAL-002 owns a real isolated product runner and browser matrix', () => {
  const runner = read(runnerPath);
  const checker = read(checkerPath);
  const pkg = JSON.parse(fs.readFileSync(path.join(webRoot, 'package.json'), 'utf8'));

  assert.match(runner, /mkdtempSync/);
  assert.match(runner, /databaseFile/);
  assert.match(runner, /docsRoot/);
  assert.match(runner, /port:\s*0/);
  assert.match(runner, /issue80-principal-product-check\.mjs/);
  assert.match(checker, /launchPersistentContext/);
  assert.match(checker, /\[\[1280,\s*720\],\s*\[1440,\s*900\],\s*\[1920,\s*1080\]\]/s);
  assert.match(checker, /\['light',\s*'dark'\]/);
  assert.match(checker, /chrome\.tabs\.setZoom/);
  assert.match(checker, /chrome\.tabs\.getZoom/);
  assert.match(checker, /forcedColors:\s*'active'/);
  assert.match(checker, /unauthorizedRolesAbsent\.length,\s*24/);
  assert.match(checker, /deniedWriteCounts\s*=\s*\{\s*register:\s*24,\s*approve:\s*24,\s*reject:\s*24,\s*reopen:\s*24\s*\}/);
  assert.match(checker, /nativeWindowsImeCandidateUi:\s*'nonblocking-unverified'/);
  assert.equal(pkg.scripts['test:browser:issue80-product'], 'node test/issue80-principal-product-runner.mjs');
});

test('IR-PRINCIPAL-002 product checker exercises authoritative writes, denial, reconciliation, and focus', () => {
  const checker = read(checkerPath);

  for (const token of [
    '/api/roster/users',
    '/approve',
    '/status',
    '/reopen',
    'refreshFailed',
    'uncertain',
    'accessibility',
    'activeElement',
    'compositionstart',
    'same-tick',
  ]) assert.ok(checker.includes(token), `checker must cover ${token}`);
});

test('IR-PRINCIPAL-002 evidence capture stages hashes and publishes its manifest last', () => {
  const capture = read(capturePath);

  assert.match(capture, /mkdtempSync/);
  assert.match(capture, /staging/i);
  assert.match(capture, /sha256/i);
  assert.match(capture, /source/i);
  assert.match(capture, /artifact/i);
  assert.match(capture, /report/i);
  assert.match(capture, /redactEvidenceSecrets/);
  assert.match(capture, /assertEvidenceSecretFree/);
  assert.match(capture, /renameSync|rename\(/);
  assert.match(capture, /manifest/i);
});

