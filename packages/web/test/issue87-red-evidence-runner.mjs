import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEvidenceDocument, sha256, sourceHashes, verifyEvidenceBundle } from './issue87-evidence-bundle.mjs';
import { normalizeVitestResult, parseSentinels, validateRedReport } from './issue87-red-evidence-contract.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue87');
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue87-red-'));
const vitest = path.join(root, 'node_modules/vitest/vitest.mjs');
fs.mkdirSync(evidenceRoot, { recursive: true });

const cases = [
  { name: 'server', args: [vitest, 'run', 'test/http/retention-impact.test.ts', '--root', path.join(root, 'packages/server'), '--reporter=json', '--outputFile', path.join(stageRoot, 'server-vitest.json')], timeoutMs: 120_000 },
  { name: 'web', args: [vitest, 'run', 'test/issue87-retention-impact.test.tsx', '--root', path.join(root, 'packages/web'), '--reporter=json', '--outputFile', path.join(stageRoot, 'web-vitest.json')], timeoutMs: 120_000 },
  { name: 'browser', args: [path.join(root, 'packages/web/test/issue87-retention-impact-product-runner.mjs')], timeoutMs: 180_000 },
];

async function capture(testCase) {
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, testCase.args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; let timedOut = false;
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });
  const timeout = setTimeout(() => { timedOut = true; if (child.exitCode === null) child.kill(); }, testCase.timeoutMs);
  const outcome = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  clearTimeout(timeout);
  const report = {
    command: [process.execPath, ...testCase.args].map((part) => JSON.stringify(part)).join(' '),
    cwd: root, startedAt, completedAt: new Date().toISOString(), timeoutMs: testCase.timeoutMs,
    timedOut, ...outcome, stdout, stderr,
  };
  if (testCase.name === 'server' || testCase.name === 'web') {
    report.structuredResult = normalizeVitestResult(JSON.parse(fs.readFileSync(path.join(stageRoot, `${testCase.name}-vitest.json`), 'utf8')));
  } else {
    report.sentinels = parseSentinels(`${stdout}\n${stderr}`);
  }
  return report;
}

function publish(file) {
  const target = path.join(evidenceRoot, file);
  const temporary = `${target}.next`;
  fs.copyFileSync(path.join(stageRoot, file), temporary);
  fs.rmSync(target, { force: true });
  fs.renameSync(temporary, target);
}

try {
  const reports = {};
  for (const testCase of cases) {
    const report = await capture(testCase);
    const failureContract = validateRedReport(testCase.name, report);
    const file = `${testCase.name}-red.json`;
    fs.writeFileSync(path.join(stageRoot, file), `${JSON.stringify(report, null, 2)}\n`);
    reports[testCase.name] = {
      file: path.relative(root, path.join(evidenceRoot, file)).replaceAll(path.sep, '/'),
      sha256: sha256(fs.readFileSync(path.join(stageRoot, file))),
      exitCode: report.exitCode, signal: report.signal, timedOut: report.timedOut, failureContract,
    };
  }
  const manifest = {
    requirement: 'FR-CONFIRM-024',
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    generatedAt: new Date().toISOString(), sourceHashes: sourceHashes(root), reports,
  };
  fs.writeFileSync(path.join(stageRoot, 'red-evidence.md'), buildEvidenceDocument(manifest));
  fs.writeFileSync(path.join(stageRoot, 'red-evidence-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ['server-red.json', 'web-red.json', 'browser-red.json', 'red-evidence.md']) publish(file);
  publish('red-evidence-manifest.json');
  verifyEvidenceBundle(new URL('../../../.kiwi/sessions/newspaper-20260916/evidence/issue87/', import.meta.url));
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}
