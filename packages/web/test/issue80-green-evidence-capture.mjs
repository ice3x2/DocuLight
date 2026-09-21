import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertEvidenceSecretFree, decodeEvidenceContent, redactEvidenceSecrets } from './issue80-evidence-secrets.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue80');
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue80-staging-'));
const stagedOutput = path.join(stagingRoot, 'product-output');
const stagedEvidence = path.join(stagingRoot, 'evidence');
const publishedOutput = path.join(evidenceRoot, 'browser-matrix');
const manifestPath = path.join(evidenceRoot, 'green-evidence-manifest.json');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourcePaths = [
  'docs/spec/00.index.md',
  'docs/spec/16.principal.srs.md',
  '.kiwi/sessions/newspaper-20260916/evidence/issue80/final-independent-review.md',
  'packages/web/src/App.tsx',
  'packages/web/src/api/client.ts',
  'packages/web/src/api/queries.ts',
  'packages/web/src/principal/request-contract.ts',
  'packages/web/src/principal/SignupApproval.tsx',
  'packages/web/src/principal/UserRoster.tsx',
  'packages/web/src/shell/AppShell.tsx',
  'packages/web/test/api-client.test.ts',
  'packages/web/test/issue80-principal-request-results.test.tsx',
  'packages/web/test/issue80-app-read-generation.test.tsx',
  'packages/web/test/issue80-product-runner-contract.test.mjs',
  'packages/web/test/issue80-principal-product-runner.mjs',
  'packages/web/test/issue80-principal-product-check.mjs',
  'packages/web/test/issue80-green-evidence-capture.mjs',
  'packages/web/test/issue80-evidence-secrets.mjs',
  'packages/web/test/issue80-evidence-secrets.test.mjs',
  'packages/web/test/issue67-principal-fixture.tsx',
  'packages/web/test/signup-approval.test.tsx',
  'packages/web/test/user-roster-register.test.tsx',
  'package.json',
  'packages/web/package.json',
];
const source = sourcePaths.map((relativePath) => {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`source missing: ${relativePath}`);
  return { path: relativePath.replaceAll('\\', '/'), sha256: sha256(absolute), bytes: fs.statSync(absolute).size };
});

const redactRawFile = (file) => {
  const bytes = fs.readFileSync(file);
  const raw = decodeEvidenceContent(bytes);
  const redacted = redactEvidenceSecrets(bytes);
  if (redacted !== raw) {
    const encoded = bytes[0] === 0xff && bytes[1] === 0xfe
      ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(redacted, 'utf16le')])
      : Buffer.from(redacted, 'utf8');
    fs.writeFileSync(file, encoded);
  }
  return redacted;
};

const scanFiles = (files) => assertEvidenceSecretFree(files.map((file) => ({
  path: path.relative(root, file).replaceAll('\\', '/'),
  content: fs.readFileSync(file),
})));
const listFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const at = path.join(directory, entry.name);
  return entry.isDirectory() ? listFiles(at) : [at];
});

const runs = [];
const runNpm = (name, args, accepts) => {
  const rawPath = path.join(stagedEvidence, name);
  const output = fs.openSync(rawPath, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: ['ignore', output, output] });
  } finally {
    fs.closeSync(output);
  }
  if (result.error) throw result.error;
  const raw = redactRawFile(rawPath);
  const classification = accepts(result.status, raw);
  if (classification === false) throw new Error(`${name} exited ${result.status}`);
  runs.push({ name, exitCode: result.status, classification, sha256: sha256(rawPath), bytes: fs.statSync(rawPath).size });
};

const runSpecKiwi = () => {
  const name = 'final-speckiwi-raw.txt';
  const rawPath = path.join(stagedEvidence, name);
  const output = fs.openSync(rawPath, 'w');
  const executable = path.join(process.env.APPDATA ?? '', 'npm', 'speckiwi.ps1');
  let result;
  try {
    result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', executable, 'validate', '--json'], {
      cwd: root,
      stdio: ['ignore', output, output],
    });
  } finally {
    fs.closeSync(output);
  }
  if (result.error) throw result.error;
  const raw = redactRawFile(rawPath);
  if (result.status !== 0 || !raw.includes('"errors":[]')) throw new Error(`SpecKiwi validation exited ${result.status}`);
  runs.push({ name, exitCode: result.status, classification: 'passed-with-known-SRS-W072-warning', sha256: sha256(rawPath), bytes: fs.statSync(rawPath).size });
};

try {
  fs.mkdirSync(stagedOutput, { recursive: true });
  fs.mkdirSync(stagedEvidence, { recursive: true });
  const redName = 'red-review-findings-raw.txt';
  const redSource = path.join(evidenceRoot, redName);
  if (!fs.existsSync(redSource)) throw new Error('review RED evidence missing');
  fs.copyFileSync(redSource, path.join(stagedEvidence, redName));
  runs.push({ name: redName, exitCode: 1, classification: 'expected-red-four-review-findings', sha256: sha256(redSource), bytes: fs.statSync(redSource).size });
  const review2RedName = 'red-review2-raw.txt';
  const review2RedSource = path.join(evidenceRoot, review2RedName);
  if (!fs.existsSync(review2RedSource)) throw new Error('review 2 RED evidence missing');
  fs.copyFileSync(review2RedSource, path.join(stagedEvidence, review2RedName));
  runs.push({ name: review2RedName, exitCode: 1, classification: 'expected-red-review2-h1-m1-four-failures', sha256: sha256(review2RedSource), bytes: fs.statSync(review2RedSource).size });
  const scannerRedName = 'red-evidence-secret-scanner-raw.txt';
  const scannerRedSource = path.join(evidenceRoot, scannerRedName);
  if (!fs.existsSync(scannerRedSource)) throw new Error('secret scanner RED evidence missing');
  fs.copyFileSync(scannerRedSource, path.join(stagedEvidence, scannerRedName));
  runs.push({ name: scannerRedName, exitCode: 1, classification: 'expected-red-missing-secret-scanner', sha256: sha256(scannerRedSource), bytes: fs.statSync(scannerRedSource).size });
  for (const baseline of [
    ['baseline-b2b126c-identity-raw.txt', 'baseline-b2b126c-exact-ref-clean-porcelain'],
    ['baseline-b2b126c-web-full-raw.txt', 'baseline-b2b126c-web-token-panel-one-failure'],
    ['baseline-b2b126c-build-raw.txt', 'baseline-b2b126c-web-build-passed'],
    ['baseline-b2b126c-server-full-raw.txt', 'baseline-b2b126c-server-theme-bootstrap-one-failure'],
  ]) {
    const [name, classification] = baseline;
    const sourcePath = path.join(evidenceRoot, name);
    if (!fs.existsSync(sourcePath)) throw new Error(`baseline evidence missing: ${name}`);
    const stagedPath = path.join(stagedEvidence, name);
    fs.copyFileSync(sourcePath, stagedPath);
    redactRawFile(stagedPath);
    const exitCode = name.includes('identity') || name.includes('build') ? 0 : 1;
    runs.push({ name, exitCode, classification, sha256: sha256(stagedPath), bytes: fs.statSync(stagedPath).size });
  }
  runNpm('final-secret-scanner-test-raw.txt', ['exec', '--', 'node', '--test', 'packages/web/test/issue80-evidence-secrets.test.mjs'],
    (status, raw) => status === 0 && raw.includes('pass 4') && raw.includes('fail 0') ? 'passed-4' : false);
  runNpm('final-focused-raw.txt', ['exec', '--workspace', '@doculight/web', '--', 'vitest', 'run',
    'test/issue80-app-read-generation.test.tsx', 'test/issue80-principal-request-results.test.tsx', 'test/api-client.test.ts', 'test/signup-approval.test.tsx',
    'test/user-roster-register.test.tsx', 'test/roster.test.tsx', 'test/app-wiring.test.tsx', 'test/auth-wiring.test.tsx',
    'test/settings-categories.test.tsx', 'test/settings-panel.test.tsx', 'test/newspaper-settings-modal.test.tsx'],
  (status, raw) => status === 0 && raw.includes('Tests  173 passed') ? 'passed-173-after-integration' : false);
  runNpm('final-web-full-raw.txt', ['test', '--workspace', '@doculight/web'], (status, raw) => {
    if (status === 0) return 'passed';
    return status === 1 && raw.includes('token-panel.test.tsx') && raw.includes("expected '' not to be ''") && raw.includes('1 failed | 1204 passed')
      ? 'known-integration-baseline-failure-token-panel' : false;
  });
  runNpm('final-typecheck-raw.txt', ['run', 'typecheck'], (status) => status === 0 ? 'passed' : false);
  runNpm('final-build-raw.txt', ['run', 'build'], (status) => status === 0 ? 'passed' : false);
  runNpm('final-server-full-raw.txt', ['test', '--workspace', '@doculight/server'], (status, raw) => {
    if (status === 0) return 'passed';
    return status === 1 && raw.includes('install-assembly.test.ts') && raw.includes("'/theme-bootstrap.js', 503") && raw.includes('1 failed | 1601 passed')
      ? 'known-integration-baseline-failure-install-assembly' : false;
  });
  runSpecKiwi();
  const productRaw = path.join(stagedEvidence, 'final-product-raw.txt');
  const productOutput = fs.openSync(productRaw, 'w');
  let product;
  try {
    product = spawnSync(process.execPath, [npmCli, 'run', 'test:browser:issue80-product', '--workspace', '@doculight/web'], {
      cwd: root,
      stdio: ['ignore', productOutput, productOutput],
      env: { ...process.env, DOCULIGHT_ISSUE80_STAGING: stagedOutput },
    });
  } finally {
    fs.closeSync(productOutput);
  }
  if (product.error) throw product.error;
  if (product.status !== 0) throw new Error(`product capture exited ${product.status}`);
  redactRawFile(productRaw);
  runs.push({ name: 'final-product-raw.txt', exitCode: product.status, classification: 'passed-12-plus-2-with-24-role-denials', sha256: sha256(productRaw), bytes: fs.statSync(productRaw).size });

  for (const entry of source) {
    const current = sha256(path.join(root, entry.path));
    if (current !== entry.sha256) throw new Error(`source changed during capture: ${entry.path}`);
  }

  const stagedFiles = fs.readdirSync(stagedOutput).sort();
  const reportNames = stagedFiles.filter((name) => name.endsWith('.json'));
  const artifactNames = stagedFiles.filter((name) => name.endsWith('.png'));
  if (!reportNames.includes('browser-report.json')) throw new Error('staged browser report missing');
  if (artifactNames.length !== 14) throw new Error(`expected 14 staged artifacts, received ${artifactNames.length}`);
  const artifact = artifactNames.map((name) => ({ name, sha256: sha256(path.join(stagedOutput, name)), bytes: fs.statSync(path.join(stagedOutput, name)).size }));
  const report = reportNames.map((name) => ({ name, sha256: sha256(path.join(stagedOutput, name)), bytes: fs.statSync(path.join(stagedOutput, name)).size }));

  const scanInputs = [
    ...sourcePaths.map((relativePath) => path.join(root, relativePath)),
    ...listFiles(stagedOutput),
    ...listFiles(stagedEvidence),
  ];
  scanFiles(scanInputs);
  const secretScanName = 'final-secret-scan-raw.txt';
  const secretScanPath = path.join(stagedEvidence, secretScanName);
  fs.writeFileSync(secretScanPath, [
    'COMMAND: fail-closed evidence secret scan',
    `SOURCE_FILES: ${sourcePaths.length}`,
    `ARTIFACT_FILES: ${artifact.length}`,
    `REPORT_FILES: ${report.length}`,
    `RAW_FILES: ${runs.length}`,
    'RESULT: no known credential, bearer, cookie, CSRF, or credential-query value found',
    '',
  ].join('\n'));
  scanFiles([secretScanPath]);
  runs.push({ name: secretScanName, exitCode: 0, classification: 'passed-fail-closed-secret-scan', sha256: sha256(secretScanPath), bytes: fs.statSync(secretScanPath).size });

  const chronologyName = 'tdd-chronology.md';
  const chronologyPath = path.join(stagedEvidence, chronologyName);
  const chronology = [
    '# IR-PRINCIPAL-002 TDD chronology',
    '',
    '- RED: four focused review tests failed before implementation: reconciliation lock, stale registration completion, per-ID pending UI, stale row completion.',
    '- GREEN: generation-bound completions, authoritative reconciliation revision, typed action results, and stateful per-ID pending controls implemented.',
    '- Review 2 RED: App accepted-read races and sibling pending semantics failed in four exact assertions before the fix.',
    '- Re-review evidence RED: raw server logs exposed two install-token bearer values. The capture now deterministically redacts known credential forms before hashing and fail-closed scans source, artifact, report, and raw evidence.',
    '- Integration baseline comparison: isolated clean detached `b2b126c3ee04602e1ace3e256d2816b32aefc930` independently reproduces the exact token-panel computed-style failure and, after a recorded clean web build, the install-assembly `/theme-bootstrap.js` 503 failure.',
    '- Final runs were captured after all source hashes below were frozen. Browser artifacts were staged, verified, and published before the manifest.',
    '',
    '| Run | Exit | Classification | SHA-256 |',
    '| --- | ---: | --- | --- |',
    ...runs.map((run) => `| ${run.name} | ${run.exitCode} | ${run.classification} | ${run.sha256} |`),
    '',
  ].join('\n');
  fs.writeFileSync(chronologyPath, chronology);
  scanFiles([
    ...sourcePaths.map((relativePath) => path.join(root, relativePath)),
    ...listFiles(stagedOutput),
    ...listFiles(stagedEvidence),
  ]);
  const raw = [...runs, { name: chronologyName, exitCode: 0, classification: 'chronology', sha256: sha256(chronologyPath), bytes: fs.statSync(chronologyPath).size }];

  fs.mkdirSync(evidenceRoot, { recursive: true });
  const incoming = path.join(evidenceRoot, `.browser-matrix-${randomUUID()}`);
  fs.cpSync(stagedOutput, incoming, { recursive: true });
  if (fs.existsSync(publishedOutput)) fs.rmSync(publishedOutput, { recursive: true, force: true });
  fs.renameSync(incoming, publishedOutput);
  for (const entry of raw) {
    const sourcePath = path.join(stagedEvidence, entry.name);
    const temporary = path.join(evidenceRoot, `.${entry.name}.${randomUUID()}.tmp`);
    fs.copyFileSync(sourcePath, temporary);
    fs.renameSync(temporary, path.join(evidenceRoot, entry.name));
  }
  scanFiles([
    ...sourcePaths.map((relativePath) => path.join(root, relativePath)),
    ...listFiles(evidenceRoot).filter((file) => file !== manifestPath),
  ]);

  const manifest = {
    requirement: 'IR-PRINCIPAL-002',
    capturedAt: new Date().toISOString(),
    source,
    artifact,
    report,
    raw,
    publication: {
      stagingVerified: true,
      secretScan: 'source-plus-entire-evidence-root-plus-manifest',
      manifestPublishedLast: true,
      output: path.relative(root, publishedOutput).replaceAll('\\', '/'),
    },
  };
  assertEvidenceSecretFree([{ path: 'green-evidence-manifest.json', content: JSON.stringify(manifest) }]);
  for (const entry of [...artifact, ...report]) {
    const published = path.join(publishedOutput, entry.name);
    if (sha256(published) !== entry.sha256) throw new Error(`published hash mismatch: ${entry.name}`);
  }
  for (const entry of raw) {
    if (sha256(path.join(evidenceRoot, entry.name)) !== entry.sha256) throw new Error(`published raw hash mismatch: ${entry.name}`);
  }
  const manifestTemporary = `${manifestPath}.${randomUUID()}.tmp`;
  fs.writeFileSync(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(manifestTemporary, manifestPath); // manifest is published atomically and last
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
}
