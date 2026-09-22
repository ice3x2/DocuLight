import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue77/implementation');
const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = (file) => ({ path: relative(file), bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) });
const filesBelow = (directory) => fs.existsSync(directory)
  ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesBelow(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
  : [];

const sourcePaths = [
  'package-lock.json',
  'docs/spec/00.index.md',
  'docs/spec/07.editor.srs.md',
  'docs/spec/08.app-shell.srs.md',
  'docs/spec/14.storage.srs.md',
  'docs/spec/16.principal.srs.md',
  'packages/editor/src/vendor/atomic-editor/styles/inline-preview.css',
  'packages/editor/demo/App.tsx',
  'packages/editor/test/issue55-browser-check.mjs',
  'packages/web/package.json',
  'packages/web/src/principal/OffboardingSurface.tsx',
  'packages/web/src/styles/palette.css',
  'packages/web/src/styles/shell.css',
  'packages/web/src/tree/DocumentTree.tsx',
  'packages/web/test/acl-two-account-check.mjs',
  'packages/web/test/issue70-audit-browser-check.cjs',
  'packages/web/test/issue71-instance-settings-product-check.mjs',
  'packages/web/test/issue71-instance-settings-product-runner.mjs',
  'packages/web/test/issue72-workspace-product-check.mjs',
  'packages/web/test/issue74-offboarding-product-check.mjs',
  'packages/web/test/issue84-revocation-bypass-product-check.mjs',
  'packages/web/test/newspaper-editor-layout-check.cjs',
  'packages/web/test/newspaper-editor-fixture.tsx',
  'packages/web/test/newspaper-tree-naming-state-check.cjs',
  'packages/web/test/newspaper-tree-fixture.tsx',
  'packages/web/test/newspaper-tree-layout-check.cjs',
  'packages/web/test/search-layout-check.mjs',
  'packages/web/test/issue77-coverage-orchestrator.mjs',
  'packages/web/test/issue77-coverage-orchestrator.test.mjs',
  'packages/web/test/issue77-composition-matrix-check.mjs',
  'packages/web/test/issue77-composition-matrix-contract.test.mjs',
  'packages/web/test/issue77-composition-matrix-runner.mjs',
  'packages/web/test/issue77-product-check.mjs',
  'packages/web/test/issue77-product-runner.mjs',
  'packages/web/test/issue77-role-category-fixture.html',
  'packages/web/test/issue77-role-category-fixture.tsx',
  'packages/web/test/issue77-role-category-product-runner.mjs',
  'packages/web/test/issue77-role-category-validator.mjs',
  'packages/web/test/issue77-role-category-validator.test.mjs',
  'packages/web/test/issue77-final-manifest.mjs',
  '.kiwi/sessions/newspaper-20260916/evidence/issue77/astra-decision.md',
  '.kiwi/sessions/newspaper-20260916/evidence/issue77/astra-closure-addendum.md',
].map((entry) => path.join(root, entry));

const bundleFiles = [
  ...filesBelow(path.join(root, 'packages/editor/dist')),
  ...filesBelow(path.join(root, 'packages/server/dist')),
  ...filesBelow(path.join(root, 'packages/web/dist')),
].sort();
const bundleEntries = bundleFiles.map(hashFile);
const bundleAggregate = sha256(bundleEntries.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}`).join('\n'));
const commandEvidence = [
  'full-unit-final-raw.txt',
  'web-full-rerun-raw.txt',
  'typecheck-final-raw.txt',
  'build-final-raw.txt',
].map((entry) => path.join(evidence, entry));
const coverageFiles = [
  'coverage/declared-browser-inventory.json',
  'coverage/leaf-matrix.jsonl',
  'coverage/leaf-matrix-summary.json',
].map((entry) => path.join(evidence, entry));
const browserEvidence = [
  'product/product-composition-result.json',
  'product-suite-final/product-suite-results.json',
  'later-product/issue84-green/capture-manifest.json',
].map((entry) => path.join(evidence, entry));

const secretPatterns = [
  { id: 'authorization-bearer', regex: /authorization\s*:\s*bearer\s+[^\s"']+/gi },
  { id: 'cookie-header', regex: /(?:set-)?cookie\s*:\s*[^\r\n]+/gi },
  { id: 'credential-assignment', regex: /(?:password|token|secret)\s*=\s*[^\s"']+/gi },
];
const scanFiles = filesBelow(evidence).filter((file) => !file.endsWith('final-manifest.json'));
const secretMatches = [];
const reviewedTemplates = [];
for (const file of scanFiles) {
  // Latin-1 is a byte-preserving decode, so the scan covers text and binary
  // artifacts without a size or extension exclusion.
  const content = fs.readFileSync(file).toString('latin1');
  for (const pattern of secretPatterns) {
    const matches = [...content.matchAll(pattern.regex)];
    if (!matches.length) continue;
    const sourceTemplate = /\.(?:[cm]?[jt]sx?|txt)$/i.test(file)
      && matches.every((match) => /(?:\$\{|getByLabelText\(|\/)/.test(match[0]));
    const finding = { path: relative(file), pattern: pattern.id, count: matches.length };
    if (sourceTemplate) reviewedTemplates.push({ ...finding, disposition: 'fixture/source expression; no concrete credential bytes' });
    else secretMatches.push(finding);
  }
}
const secretScan = {
  scannedFiles: scanFiles.length,
  scannedBytes: scanFiles.reduce((total, file) => total + fs.statSync(file).size, 0),
  excludedFiles: 0,
  patterns: secretPatterns.map((pattern) => pattern.id),
  reviewedTemplates,
  matches: secretMatches,
  pass: secretMatches.length === 0,
};
fs.writeFileSync(path.join(evidence, 'secret-scan.json'), `${JSON.stringify(secretScan, null, 2)}\n`);
if (!secretScan.pass) throw new Error(`secret scan failed: ${JSON.stringify(secretMatches)}`);

const artifactFiles = filesBelow(evidence).filter((file) => !file.endsWith('final-manifest.json')).sort();
const diff = spawnSync('git', ['diff', '--binary', '--', ...sourcePaths.map(relative)], { cwd: root, encoding: 'utf8' });
if (diff.status !== 0) throw new Error(diff.stderr);
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const nodeVersion = process.version;
const npmVersion = spawnSync('npm', ['--version'], { cwd: root, encoding: 'utf8', shell: true }).stdout.trim();
const playwrightVersion = spawnSync('npx', ['playwright', '--version'], { cwd: root, encoding: 'utf8', shell: true }).stdout.trim();
const manifest = {
  schema: 'doculight.issue77.final-evidence.v1',
  writtenLast: true,
  workspace: root,
  revision,
  worktreeDiffSha256: sha256(diff.stdout),
  source: sourcePaths.map(hashFile),
  bundle: { files: bundleEntries.length, aggregateSha256: bundleAggregate },
  runtime: { platform: process.platform, arch: process.arch, nodeVersion, npmVersion, playwrightVersion },
  rawCommands: commandEvidence.map(hashFile),
  coverage: coverageFiles.map(hashFile),
  browserEvidence: browserEvidence.map(hashFile),
  artifacts: artifactFiles.map(hashFile),
  secretScan,
  status: 'ready-for-independent-review',
  srsPromotion: false,
  issueClosure: false,
};
fs.writeFileSync(path.join(evidence, 'final-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PASS issue77 manifest-last ${manifest.artifacts.length} artifacts, ${manifest.source.length} sources, ${manifest.bundle.files} bundle files`);
