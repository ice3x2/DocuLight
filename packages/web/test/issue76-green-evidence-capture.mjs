import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue76');
const manifestPath = path.join(evidenceRoot, 'final-review-manifest.json');
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue76-capture-'));
const stageArtifacts = path.join(stageRoot, 'browser-matrix');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const commandShell = process.env.ComSpec ?? 'cmd.exe';

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const promote = (staged, target) => {
  const backup = `${target}.backup-${randomUUID()}`;
  if (fs.existsSync(target)) fs.renameSync(target, backup);
  try {
    fs.renameSync(staged, target);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    if (fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
};
const run = (name, command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  const report = path.join(stageRoot, name);
  fs.writeFileSync(report, `COMMAND=${[command, ...args].join(' ')}\nEXIT_CODE=${result.status}\n--- STDOUT ---\n${result.stdout ?? ''}\n--- STDERR ---\n${result.stderr ?? ''}`, 'utf8');
  if (result.status !== 0) {
    console.error(fs.readFileSync(report, 'utf8'));
    throw new Error(`${name} exited ${result.status}`);
  }
  return report;
};

const sourcePaths = [
  'package.json', 'packages/web/package.json', 'packages/web/src/App.tsx',
  'packages/web/src/auth/auth-boundary.ts',
  'packages/web/src/document/DocumentArea.tsx',
  'packages/web/src/document/DocumentSurface.tsx',
  'packages/web/src/shell/AppShell.tsx',
  'packages/web/test/issue76-app-states.test.tsx',
  'packages/web/test/issue76-app-states-product-check.mjs',
  'packages/web/test/issue76-app-states-product-runner.mjs',
  'packages/web/test/issue76-green-evidence-capture.mjs',
  'packages/web/test/issue76-product-evidence-isolation.mjs',
  'packages/web/test/issue76-product-coverage.test.ts',
];
const sourceBefore = Object.fromEntries(sourcePaths.map((file) => [file, sha256(path.join(root, file))]));
const focusedTests = [
  'test/issue76-app-states.test.tsx', 'test/issue76-auth-boundary.test.ts',
  'test/issue76-auth-check.test.ts', 'test/issue76-auth-results.test.ts',
  'test/issue76-control-flow.test.ts', 'test/issue76-frozen-surface.test.tsx',
  'test/issue76-local-recovery.test.tsx', 'test/issue76-owner-continuations.test.tsx',
  'test/issue76-product-coverage.test.ts', 'test/issue76-version-owner.test.tsx',
];

try {
  fs.mkdirSync(stageArtifacts, { recursive: true });
  const reports = [
    run('focused-review7.txt', process.execPath, [npmCli, 'test', '--workspace', '@doculight/web', '--', '--run', ...focusedTests]),
    run('full-review7.txt', process.execPath, [npmCli, 'run', 'test']),
    run('typecheck-review7.txt', process.execPath, [npmCli, 'run', 'typecheck']),
    run('build-review7.txt', process.execPath, [npmCli, 'run', 'build']),
    run('product-isolation-review7.txt', process.execPath, [npmCli, 'run', 'test:issue76:product-isolation']),
  ];
  reports.push(run('playwright-review7.txt', process.execPath, [npmCli, 'run', 'test:browser:issue76-product', '--workspace', '@doculight/web'], {
    env: { ...process.env, DOCULIGHT_ISSUE76_OUTPUT_DIR: stageArtifacts },
  }));

  const measurements = JSON.parse(fs.readFileSync(path.join(stageArtifacts, 'measurements.json'), 'utf8'));
  if (measurements.normal.length !== 12 || measurements.forced.length !== 6 || measurements.authOutcomes.length !== 24 || measurements.recoveryMeasurements.length !== 4) throw new Error('captured product matrix has unexpected dimensions');
  if (![...measurements.normal, ...measurements.forced, ...measurements.authOutcomes].every((row) => row.freshContext === true)) throw new Error('captured product matrix contains a non-fresh row');
  for (const row of measurements.recoveryMeasurements) {
    if (row.differentAccountSamePage !== true || row.samePageOriginalLogin !== true || row.differentAccountQueryCacheCount !== 0 || row.differentAccountOldNameCount !== 0 || row.differentAccountOldBodyCount !== 0 || row.recoveryDiscarded !== true || typeof row.sameAccountRecoveryBytes !== 'string') throw new Error(`recovery ownership evidence failed: ${row.label}`);
  }
  for (const [file, hash] of Object.entries(sourceBefore)) if (sha256(path.join(root, file)) !== hash) throw new Error(`source changed during capture: ${file}`);

  reports.push(
    run('speckiwi-validate-review7.json', commandShell, ['/d', '/s', '/c', 'speckiwi validate --json']),
    run('speckiwi-summary-review7.json', commandShell, ['/d', '/s', '/c', 'speckiwi summary --target phase-1 --json']),
    run('speckiwi-links-review7.json', commandShell, ['/d', '/s', '/c', 'speckiwi links check --json']),
    run('diff-check-review7.txt', 'git', ['diff', '--check']),
  );
  promote(stageArtifacts, path.join(evidenceRoot, 'browser-matrix'));
  for (const report of reports) promote(report, path.join(evidenceRoot, path.basename(report)));

  const paths = [
    ...sourcePaths,
    'docs/spec/00.index.md', 'docs/spec/07.editor.srs.md', 'docs/spec/08.app-shell.srs.md',
    '.kiwi/sessions/newspaper-20260916/evidence/issue76/astra-decision.md',
    '.kiwi/sessions/newspaper-20260916/evidence/issue76/final-independent-review.md',
    '.kiwi/sessions/newspaper-20260916/evidence/issue76/implementation-evidence.md',
    '.kiwi/sessions/newspaper-20260916/evidence/issue76/red-review8-owner-replacement.txt',
    '.kiwi/sessions/newspaper-20260916/evidence/issue76/review8-failure-ledger.md',
    ...reports.map((report) => `.kiwi/sessions/newspaper-20260916/evidence/issue76/${path.basename(report)}`),
    ...fs.readdirSync(path.join(evidenceRoot, 'browser-matrix')).sort().map((file) => `.kiwi/sessions/newspaper-20260916/evidence/issue76/browser-matrix/${file}`),
  ].sort();
  const files = paths.map((file) => ({ path: file, sha256: sha256(path.join(root, file)), bytes: fs.statSync(path.join(root, file)).size }));
  const aggregate = createHash('sha256');
  for (const file of files) aggregate.update(file.path).update('\0').update(file.sha256).update('\n');
  const manifest = {
    schema: 'issue76-final-review-manifest-v7',
    head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
    generatedAt: new Date().toISOString(),
    aggregateAlgorithm: 'sha256(path + NUL + fileSha256 + LF), sorted by path',
    aggregateSha256: aggregate.digest('hex'),
    fileCount: files.length,
    productRows: { authentication: 24, recovery: 4, normal: 12, forced: 6 },
    files,
  };
  const stagedManifest = path.join(stageRoot, 'final-review-manifest.json');
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  for (const file of files) if (sha256(path.join(root, file.path)) !== file.sha256) throw new Error(`hash changed during capture: ${file.path}`);
  // Publish the manifest last so every hash names an already-promoted, immutable review input.
  promote(stagedManifest, manifestPath);
  console.log(`issue76 evidence published ${manifest.aggregateSha256} (${manifest.fileCount} files)`);
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}
