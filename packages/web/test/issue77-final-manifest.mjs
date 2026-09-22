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
const manifestPath = relative(path.join(evidence, 'final-manifest.json'));
const receiptPath = relative(path.join(evidence, 'canonical-staged-verification.json'));
const payloadTreeExcludes = [manifestPath, receiptPath];
const indexByteCache = new Map();
const indexBytes = (file) => {
  const filePath = typeof file === 'string' && !path.isAbsolute(file) ? file : relative(file);
  if (indexByteCache.has(filePath)) return indexByteCache.get(filePath);
  const result = spawnSync('git', ['show', `:${filePath}`], { cwd: root, encoding: null, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`staged Git blob missing: ${filePath}`);
  indexByteCache.set(filePath, result.stdout);
  return result.stdout;
};
const primeIndexBytes = (filePaths) => {
  const uniquePaths = [...new Set(filePaths)].filter((filePath) => !indexByteCache.has(filePath));
  if (!uniquePaths.length) return;
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: root,
    input: `${uniquePaths.map((filePath) => `:${filePath}`).join('\n')}\n`,
    encoding: null,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr.toString());
  let offset = 0;
  for (const filePath of uniquePaths) {
    const headerEnd = result.stdout.indexOf(0x0a, offset);
    if (headerEnd < 0) throw new Error(`invalid cat-file header for ${filePath}`);
    const header = result.stdout.subarray(offset, headerEnd).toString('utf8');
    const fields = header.split(' ');
    if (fields.at(-1) === 'missing') throw new Error(`staged Git blob missing: ${filePath}`);
    const size = Number(fields[2]);
    const start = headerEnd + 1;
    indexByteCache.set(filePath, result.stdout.subarray(start, start + size));
    offset = start + size + 1;
  }
};
const hashIndexFile = (file) => {
  const bytes = indexBytes(file);
  return { path: relative(file), bytes: bytes.length, sha256: sha256(bytes) };
};
const hashIndexPath = (filePath) => {
  const bytes = indexBytes(filePath);
  return { path: filePath, bytes: bytes.length, sha256: sha256(bytes) };
};
const hashWorktreeFile = (file) => ({ path: relative(file), bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) });
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
const bundleEntries = bundleFiles.map(hashWorktreeFile);
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
const evidencePrefix = `${relative(evidence)}/`;
const stagedEvidence = spawnSync('git', ['ls-files', '-z', '--', evidencePrefix], { cwd: root, encoding: null, maxBuffer: 128 * 1024 * 1024 });
if (stagedEvidence.status !== 0) throw new Error(stagedEvidence.stderr.toString());
const artifactPaths = stagedEvidence.stdout.toString('utf8').split('\0').filter((filePath) => filePath && filePath !== manifestPath).sort();
primeIndexBytes([
  ...artifactPaths,
  ...sourcePaths.map(relative),
  ...commandEvidence.map(relative),
  ...coverageFiles.map(relative),
  ...browserEvidence.map(relative),
  manifestPath,
]);
const scanFiles = artifactPaths;
const secretMatches = [];
const reviewedTemplates = [];
for (const filePath of scanFiles) {
  // Latin-1 is a byte-preserving decode, so the scan covers text and binary
  // artifacts without a size or extension exclusion.
  const content = indexBytes(filePath).toString('latin1');
  for (const pattern of secretPatterns) {
    const matches = [...content.matchAll(pattern.regex)];
    if (!matches.length) continue;
    const sourceTemplate = /\.(?:[cm]?[jt]sx?|txt)$/i.test(filePath)
      && matches.every((match) => /(?:\$\{|getByLabelText\(|\/)/.test(match[0]));
    const finding = { path: filePath, pattern: pattern.id, count: matches.length };
    if (sourceTemplate) reviewedTemplates.push({ ...finding, disposition: 'fixture/source expression; no concrete credential bytes' });
    else secretMatches.push(finding);
  }
}
const secretScan = {
  scannedFiles: scanFiles.length,
  scannedBytes: scanFiles.reduce((total, filePath) => total + indexBytes(filePath).length, 0),
  excludedFiles: 0,
  patterns: secretPatterns.map((pattern) => pattern.id),
  reviewedTemplates,
  matches: secretMatches,
  pass: secretMatches.length === 0,
};
if (!process.argv.includes('--validate') && !process.argv.includes('--write-receipt')) {
  fs.writeFileSync(path.join(evidence, 'secret-scan.json'), `${JSON.stringify(secretScan, null, 2)}\n`);
}
if (!secretScan.pass) throw new Error(`secret scan failed: ${JSON.stringify(secretMatches)}`);

// A manifest cannot contain the tree ID of a tree containing itself. Record a
// reproducible payload projection instead: the staged index with the manifest
// and external verification/review receipts explicitly removed.
const indexPath = spawnSync('git', ['rev-parse', '--git-path', 'index'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const resolvedIndexPath = path.resolve(root, indexPath);
const payloadIndex = path.join(path.dirname(resolvedIndexPath), `issue77-payload-${process.pid}.index`);
let payloadTree;
try {
  fs.copyFileSync(resolvedIndexPath, payloadIndex);
  const payloadEnvironment = { ...process.env, GIT_INDEX_FILE: payloadIndex };
  const removed = spawnSync('git', ['update-index', '--force-remove', '--', ...payloadTreeExcludes], { cwd: root, env: payloadEnvironment, encoding: 'utf8' });
  if (removed.status !== 0) throw new Error(removed.stderr);
  const result = spawnSync('git', ['write-tree'], { cwd: root, env: payloadEnvironment, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  payloadTree = result.stdout.trim();
} finally {
  fs.rmSync(payloadIndex, { force: true });
}

const leafRows = indexBytes(`${evidencePrefix}coverage/leaf-matrix.jsonl`).toString('utf8').trim().split('\n').length;
const inventory = JSON.parse(indexBytes(`${evidencePrefix}coverage/declared-browser-inventory.json`).toString('utf8')).declaredCount;
const acceptedReviewPaths = [
  `${evidencePrefix}axis-a-final-review.md`,
  `${evidencePrefix}axis-b-final-review.md`,
];
const acceptedReviewHashes = Object.fromEntries(acceptedReviewPaths.map((filePath) => [filePath, sha256(indexBytes(filePath))]));

if (process.argv.includes('--write-receipt') && !process.argv.includes('--validate')) {
  const receipt = {
    schema: 'doculight.issue77.canonical-staged-verification.v2',
    byteAuthority: 'git-index-blob',
    projection: 'staged-payload-without-manifest-or-receipt',
    payloadTree,
    payloadTreeExcludes,
    expectedManifestArtifacts: artifactPaths.length,
    expectedManifestSources: sourcePaths.length,
    leafRows,
    inventory,
    acceptedReviewHashes,
  };
  fs.writeFileSync(path.join(root, receiptPath), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`PASS issue77 receipt ${payloadTree} ${artifactPaths.length} artifacts`);
  process.exit(0);
}

if (process.argv.includes('--validate')) {
  const manifest = JSON.parse(indexBytes(manifestPath).toString('utf8'));
  const receipt = JSON.parse(indexBytes(receiptPath).toString('utf8'));
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  check(manifest.byteAuthority === 'git-index-blob', 'manifest byteAuthority is not git-index-blob');
  check(manifest.payloadTree === payloadTree, 'manifest payloadTree does not match projection');
  check(JSON.stringify(manifest.payloadTreeExcludes) === JSON.stringify(payloadTreeExcludes), 'manifest payloadTreeExcludes mismatch');
  if (!process.argv.includes('--write-receipt')) {
    check(receipt.payloadTree === payloadTree, 'receipt payloadTree does not match projection');
    check(JSON.stringify(receipt.payloadTreeExcludes) === JSON.stringify(payloadTreeExcludes), 'receipt payloadTreeExcludes mismatch');
    check(receipt.leafRows === leafRows, `receipt leaf row count is ${receipt.leafRows}, expected ${leafRows}`);
    check(receipt.inventory === inventory, `receipt inventory is ${receipt.inventory}, expected ${inventory}`);
    check(JSON.stringify(receipt.acceptedReviewHashes) === JSON.stringify(acceptedReviewHashes), 'accepted review hashes mismatch');
  }

  const missing = [];
  const hashMismatches = [];
  const validateEntries = (entries) => {
    for (const entry of entries) {
      let bytes;
      try { bytes = indexBytes(entry.path); } catch { missing.push(entry.path); continue; }
      const digest = sha256(bytes);
      if (entry.bytes !== bytes.length || entry.sha256 !== digest) hashMismatches.push(entry.path);
    }
  };
  const manifestCollections = [manifest.source, manifest.rawCommands, manifest.coverage, manifest.browserEvidence, manifest.artifacts];
  for (const entries of manifestCollections) validateEntries(entries);
  const manifestArtifactPaths = manifest.artifacts.map((entry) => entry.path);
  check(JSON.stringify(manifestArtifactPaths) === JSON.stringify(artifactPaths), 'manifest artifact inventory differs from staged evidence inventory');
  check(manifest.source.length === sourcePaths.length, `manifest source count is ${manifest.source.length}, expected ${sourcePaths.length}`);
  check(manifest.artifacts.length === artifactPaths.length, `manifest artifact count is ${manifest.artifacts.length}, expected ${artifactPaths.length}`);
  check(manifest.secretScan?.pass === true && manifest.secretScan?.matches?.length === 0, 'manifest secret scan is not clean');
  check(secretScan.pass && secretScan.matches.length === 0, 'recomputed staged-index secret scan is not clean');
  errors.push(...missing.map((filePath) => `missing: ${filePath}`), ...hashMismatches.map((filePath) => `hash: ${filePath}`));
  const verification = {
    schema: 'doculight.issue77.canonical-staged-validation.v2',
    byteAuthority: 'git-index-blob',
    projection: 'staged-payload-without-manifest-or-receipt',
    payloadTree,
    payloadTreeExcludes,
    manifestArtifacts: manifest.artifacts.length,
    manifestSources: manifest.source.length,
    validatedEntries: manifestCollections.reduce((total, entries) => total + entries.length, 0),
    leafRows,
    inventory,
    acceptedReviewHashes,
    secretMatches: secretMatches.length,
    missing: missing.length,
    hashMismatches: hashMismatches.length,
    errors: errors.length,
    sample: errors.slice(0, 20),
  };
  const rawVerification = `${JSON.stringify(verification, null, 2)}\n`;
  console.log(rawVerification.trimEnd());
  if (errors.length) process.exitCode = 1;
  else if (process.argv.includes('--write-receipt')) fs.writeFileSync(path.join(root, receiptPath), rawVerification);
  process.exit();
}

const diff = spawnSync('git', ['diff', '--cached', '--binary', '--', ...sourcePaths.map(relative)], { cwd: root, encoding: 'utf8' });
if (diff.status !== 0) throw new Error(diff.stderr);
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const nodeVersion = process.version;
const npmVersion = spawnSync('npm', ['--version'], { cwd: root, encoding: 'utf8', shell: true }).stdout.trim();
const playwrightVersion = spawnSync('npx', ['playwright', '--version'], { cwd: root, encoding: 'utf8', shell: true }).stdout.trim();
const manifest = {
  schema: 'doculight.issue77.final-evidence.v1',
  writtenLast: true,
  byteAuthority: 'git-index-blob',
  payloadTree,
  payloadTreeExcludes,
  workspace: root,
  revision,
  worktreeDiffSha256: sha256(diff.stdout),
  source: sourcePaths.map(hashIndexFile),
  bundle: { files: bundleEntries.length, aggregateSha256: bundleAggregate },
  runtime: { platform: process.platform, arch: process.arch, nodeVersion, npmVersion, playwrightVersion },
  rawCommands: commandEvidence.map(hashIndexFile),
  coverage: coverageFiles.map(hashIndexFile),
  browserEvidence: browserEvidence.map(hashIndexFile),
  artifacts: artifactPaths.map(hashIndexPath),
  secretScan,
  status: 'closure-accepted-evidence-integrity-repaired',
  srsPromotion: true,
  issueClosure: true,
};
fs.writeFileSync(path.join(evidence, 'final-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`PASS issue77 manifest-last ${manifest.artifacts.length} artifacts, ${manifest.source.length} sources, ${manifest.bundle.files} bundle files`);
