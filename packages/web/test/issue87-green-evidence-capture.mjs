import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue87');
const manifestPath = path.join(evidenceRoot, 'green-evidence-manifest.json');
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue87-green-'));
const stageArtifacts = path.join(stageRoot, 'browser-matrix');
const stageReports = path.join(stageRoot, 'reports');
fs.mkdirSync(stageArtifacts, { recursive: true });
fs.mkdirSync(stageReports, { recursive: true });

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const aggregate = (sourceHashes, browserArtifacts) => {
  const hash = createHash('sha256');
  for (const [file, digest] of [...Object.entries(sourceHashes), ...Object.entries(browserArtifacts)]) {
    hash.update(file).update('\0').update(digest).update('\n');
  }
  return hash.digest('hex');
};
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

try {
  const previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('run through npm');
  const command = 'npm run test:browser:issue87-product';
  const product = spawnSync(process.execPath, [npmCli, 'run', 'test:browser:issue87-product'], {
    cwd: root,
    env: { ...process.env, DOCULIGHT_ISSUE87_OUTPUT_DIR: stageArtifacts },
    encoding: 'utf8',
  });
  const browserReport = `COMMAND=${command}\nEXIT_CODE=${product.status}\n--- STDOUT ---\n${product.stdout}\n--- STDERR ---\n${product.stderr}`;
  const stagedBrowserReport = path.join(stageReports, 'browser-green.txt');
  fs.writeFileSync(stagedBrowserReport, browserReport, 'utf8');
  if (product.status !== 0) throw new Error(`product capture exited ${product.status}`);

  const expectedArtifacts = Object.keys(previous.browserArtifacts).map((file) => path.basename(file)).sort();
  const actualArtifacts = fs.readdirSync(stageArtifacts).sort();
  if (JSON.stringify(actualArtifacts) !== JSON.stringify(expectedArtifacts)) {
    throw new Error(`browser artifact set mismatch: ${JSON.stringify(actualArtifacts)}`);
  }

  const sourceFiles = [...new Set([
    ...Object.keys(previous.sourceHashes),
    'packages/web/test/issue87-product-evidence-isolation.mjs',
    'packages/web/test/issue87-green-evidence-capture.mjs',
  ])];
  const sourceHashes = Object.fromEntries(sourceFiles.map((file) => [file, sha256(path.join(root, file))]));
  const browserArtifacts = Object.fromEntries(Object.keys(previous.browserArtifacts).map((file) => [
    file,
    sha256(path.join(stageArtifacts, path.basename(file))),
  ]));

  const reports = structuredClone(previous.reports);
  for (const [name, report] of Object.entries(reports)) {
    const staged = path.join(stageReports, path.basename(report.file));
    if (name !== 'browser') fs.copyFileSync(path.join(root, report.file), staged);
    report.sha256 = sha256(staged);
  }
  reports.browser.exitCode = 0;

  const manifest = {
    ...previous,
    generatedAt: new Date().toISOString(),
    sourceHashes,
    sourceAndArtifactAggregateSha256: aggregate(sourceHashes, browserArtifacts),
    reports,
    browserArtifacts,
  };
  const stagedManifest = path.join(stageRoot, 'green-evidence-manifest.json');
  fs.writeFileSync(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  let evidence = fs.readFileSync(path.join(evidenceRoot, 'green-evidence.md'), 'utf8');
  evidence = evidence
    .replace(/Source and browser-artifact aggregate SHA-256: `[0-9a-f]+`/, `Source and browser-artifact aggregate SHA-256: \`${manifest.sourceAndArtifactAggregateSha256}\``)
    .replace(/Product-browser raw report SHA-256 `[0-9a-f]+`: exit 0\./, `Product-browser raw report SHA-256 \`${reports.browser.sha256}\`: exit 0.`);
  const stagedEvidence = path.join(stageRoot, 'green-evidence.md');
  fs.writeFileSync(stagedEvidence, evidence, 'utf8');

  if (aggregate(sourceHashes, browserArtifacts) !== manifest.sourceAndArtifactAggregateSha256) throw new Error('aggregate mismatch');
  for (const [file, digest] of Object.entries(sourceHashes)) if (sha256(path.join(root, file)) !== digest) throw new Error(`source changed during capture: ${file}`);
  for (const [file, digest] of Object.entries(browserArtifacts)) if (sha256(path.join(stageArtifacts, path.basename(file))) !== digest) throw new Error(`artifact hash mismatch: ${file}`);
  for (const report of Object.values(reports)) if (sha256(path.join(stageReports, path.basename(report.file))) !== report.sha256) throw new Error(`report hash mismatch: ${report.file}`);

  promote(stageArtifacts, path.join(evidenceRoot, 'browser-matrix'));
  for (const report of Object.values(reports)) promote(path.join(stageReports, path.basename(report.file)), path.join(root, report.file));
  promote(stagedEvidence, path.join(evidenceRoot, 'green-evidence.md'));
  promote(stagedManifest, manifestPath);
  console.log(`issue87 evidence published ${manifest.sourceAndArtifactAggregateSha256}`);
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}
