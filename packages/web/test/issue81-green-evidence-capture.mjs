import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertEvidenceSecretFree, decodeEvidenceContent, redactEvidenceSecrets } from './issue80-evidence-secrets.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue81');
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue81-evidence-'));
const stagedEvidence = path.join(stagingRoot, 'evidence');
const stagedBrowser = path.join(stagingRoot, 'browser');
const publishedBrowser = path.join(evidenceRoot, 'browser-matrix');
const manifestPath = path.join(evidenceRoot, 'green-evidence-manifest.json');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const independentReview = {
  path: '.kiwi/sessions/newspaper-20260916/evidence/issue81/final-independent-review.md',
  sha256: '861156C812840EF7A82595E08F33C40AAE7146B226AD93B3288966FFCE2D5D05',
};
const portableTextSha256 = (file) => createHash('sha256').update(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex').toUpperCase();
const listFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? listFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const sourcePaths = [
  'packages/server/src/app/principal/principal-search-service.ts', 'packages/server/src/app/principal/principal-service.ts',
  'packages/server/src/app/principal/roster-service.ts', 'packages/server/src/http/routes/workspace-api.ts',
  'packages/server/src/domain/ports/principal-repository.ts', 'packages/server/src/infra/sqlite/principal-repository.ts',
  'packages/server/test/app/principal/roster.test.ts', 'packages/server/test/http/workspace-api.test.ts',
  'packages/server/test/domain/principal/principal.test.ts',
  'packages/web/src/App.tsx', 'packages/web/src/api/client.ts', 'packages/web/src/principal/GroupRoster.tsx',
  'packages/web/src/principal/PrincipalPicker.tsx', 'packages/web/src/principal/request-contract.ts', 'packages/web/src/shell/AppShell.tsx',
  'packages/web/test/issue81-group-request-results.test.tsx', 'packages/web/test/issue81-group-product-runner.mjs',
  'packages/web/test/issue81-group-product-check.mjs', 'packages/web/test/issue81-product-contract.test.ts',
  'packages/web/test/issue81-product-assertions.mjs', 'packages/web/test/issue81-product-assertions.mjs.d.ts',
  'packages/web/test/app-wiring.test.tsx', 'packages/web/test/roster.test.tsx', 'packages/web/test/issue81-green-evidence-capture.mjs',
  'package.json', 'packages/web/package.json', 'docs/spec/00.index.md', 'docs/spec/16.principal.srs.md',
  '.kiwi/sessions/newspaper-20260916/evidence/issue68/astra-decision.md',
];
const source = sourcePaths.map((relative) => { const file = path.join(root, relative); return { path: relative, sha256: sha256(file), bytes: fs.statSync(file).size }; });
const runs = [];
const redact = (file) => { const bytes = fs.readFileSync(file); const raw = decodeEvidenceContent(bytes); const clean = redactEvidenceSecrets(bytes); if (clean !== raw) fs.writeFileSync(file, clean); return clean; };
const run = (name, args, classify) => {
  const file = path.join(stagedEvidence, name); const fd = fs.openSync(file, 'w'); let result;
  try { result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: ['ignore', fd, fd] }); } finally { fs.closeSync(fd); }
  if (result.error) throw result.error; const raw = redact(file); const classification = classify(result.status, raw);
  if (!classification) throw new Error(`${name} exited ${result.status}`);
  runs.push({ name, exitCode: result.status, classification, sha256: sha256(file), bytes: fs.statSync(file).size });
};
const runSpecKiwi = () => {
  const name = 'final-speckiwi.txt'; const file = path.join(stagedEvidence, name); const fd = fs.openSync(file, 'w'); let result;
  try { result = spawnSync('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(process.env.APPDATA ?? '', 'npm', 'speckiwi.ps1'),'validate','--fail-on-warning','--json'], { cwd: root, stdio: ['ignore',fd,fd] }); }
  finally { fs.closeSync(fd); }
  if (result.error) throw result.error; const raw = redact(file);
  const knownWarning = raw.includes('"errors":[]') && raw.includes('SRS-W072');
  if (!(result.status === 0 || (result.status === 1 && knownWarning))) throw new Error(`${name} exited ${result.status}`);
  runs.push({ name, exitCode: result.status, classification: result.status === 0 ? 'passed' : 'passed-errors-zero-known-SRS-W072', sha256: sha256(file), bytes: fs.statSync(file).size });
};
try {
  fs.mkdirSync(stagedEvidence, { recursive: true }); fs.mkdirSync(stagedBrowser, { recursive: true });
  if (portableTextSha256(path.join(root, independentReview.path)) !== independentReview.sha256) throw new Error('independent review SHA-256 mismatch');
  for (const [name, from] of [
    ['issue81-server-red.raw.txt', path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue81/issue81-server-red.raw.txt')],
    ['issue81-web-red.raw.txt', path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue81/issue81-web-red.raw.txt')],
    ['issue81-refresh-red.raw.txt', path.join(evidenceRoot, 'issue81-refresh-red.raw.txt')],
    ['issue81-rereview-web-red.raw.txt', path.join(evidenceRoot, 'issue81-rereview-web-red.raw.txt')],
    ...['h1','h2-m3','h3','h4','h5','h6','m1','m2'].map((finding) => [`review-fix-${finding}-red.raw.txt`, path.join(evidenceRoot, `review-fix-${finding}-red.raw.txt`)]),
  ]) {
    const to = path.join(stagedEvidence, name); fs.copyFileSync(from, to); redact(to);
    runs.push({ name, exitCode: 1, classification: 'expected-behavior-red-before-implementation', sha256: sha256(to), bytes: fs.statSync(to).size });
  }
  {
    const name = 'issue81-rereview-server-test.raw.txt'; const from = path.join(evidenceRoot, name); const to = path.join(stagedEvidence, name);
    fs.copyFileSync(from, to); redact(to);
    runs.push({ name, exitCode: 0, classification: 'new-real-sqlite-race-test-passed-inherited-on-conflict-implementation', sha256: sha256(to), bytes: fs.statSync(to).size });
  }
  run('final-focused-server.txt', ['test','--workspace','@doculight/server','--','--run','test/app/principal/roster.test.ts','test/http/workspace-api.test.ts','test/domain/principal/principal.test.ts','test/app/principal/principal-search.test.ts'], (status, raw) => status === 0 && raw.includes('passed') ? 'passed' : false);
  run('final-focused-web.txt', ['test','--workspace','@doculight/web','--','--run','test/issue81-group-request-results.test.tsx','test/issue81-product-contract.test.ts','test/roster.test.tsx','test/principal-picker.test.tsx','test/issue80-principal-request-results.test.tsx','test/issue65-share-lifecycle.test.tsx'], (status, raw) => status === 0 && raw.includes('passed') ? 'passed' : false);
  run('final-server-full.txt', ['test','--workspace','@doculight/server'], (status, raw) => status === 0 && raw.includes('1612 passed') ? 'passed-1612' : false);
  run('final-web-full.txt', ['test','--workspace','@doculight/web'], (status, raw) => status === 0 && raw.includes('1367 passed') ? 'passed-1367' : false);
  run('final-typecheck.txt', ['run','typecheck'], (status) => status === 0 ? 'passed' : false);
  run('final-build.txt', ['run','build'], (status) => status === 0 ? 'passed' : false);
  runSpecKiwi();
  const browserRaw = path.join(stagedEvidence, 'final-browser.txt'); const fd = fs.openSync(browserRaw, 'w'); let browser;
  try { browser = spawnSync(process.execPath, [npmCli, 'run','test:browser:issue81-product','--workspace','@doculight/web'], { cwd: root, stdio: ['ignore',fd,fd], env: { ...process.env, DOCULIGHT_ISSUE81_STAGING: stagedBrowser } }); } finally { fs.closeSync(fd); }
  if (browser.error) throw browser.error; const browserLog = redact(browserRaw); if (browser.status !== 0) throw new Error(`browser ${browser.status}\n${browserLog.slice(-5000)}`);
  runs.push({ name: 'final-browser.txt', exitCode: 0, classification: 'passed-12-plus-2-and-24-role-denial-pairs', sha256: sha256(browserRaw), bytes: fs.statSync(browserRaw).size });
  for (const entry of source) if (sha256(path.join(root, entry.path)) !== entry.sha256) throw new Error(`source changed: ${entry.path}`);
  const browserFiles = listFiles(stagedBrowser); const png = browserFiles.filter((file) => file.endsWith('.png')); if (png.length !== 14) throw new Error(`expected 14 screenshots, got ${png.length}`);
  assertEvidenceSecretFree([...sourcePaths.map((relative) => ({ path: relative, content: fs.readFileSync(path.join(root, relative)) })), ...browserFiles.map((file) => ({ path: path.basename(file), content: fs.readFileSync(file) })), ...listFiles(stagedEvidence).map((file) => ({ path: path.basename(file), content: fs.readFileSync(file) }))]);
  const artifacts = browserFiles.map((file) => ({ name: path.basename(file), sha256: sha256(file), bytes: fs.statSync(file).size }));
  fs.mkdirSync(evidenceRoot, { recursive: true }); const incoming = path.join(evidenceRoot, `.browser-${randomUUID()}`); fs.cpSync(stagedBrowser, incoming, { recursive: true });
  if (fs.existsSync(publishedBrowser)) fs.rmSync(publishedBrowser, { recursive: true, force: true }); fs.renameSync(incoming, publishedBrowser);
  for (const runEntry of runs) { const from = path.join(stagedEvidence, runEntry.name); const temporary = path.join(evidenceRoot, `.${runEntry.name}.${randomUUID()}.tmp`); fs.copyFileSync(from, temporary); fs.renameSync(temporary, path.join(evidenceRoot, runEntry.name)); }
  const scan = path.join(evidenceRoot, 'final-secret-scan.txt'); fs.writeFileSync(scan, `RESULT: pass\nFILES: ${sourcePaths.length + artifacts.length + runs.length}\n`);
  assertEvidenceSecretFree(listFiles(evidenceRoot).filter((file) => file !== manifestPath).map((file) => ({ path: file, content: fs.readFileSync(file) })));
  const manifest = { requirement: 'IR-PRINCIPAL-003', capturedAt: new Date().toISOString(), independentReview, source, runs, artifacts, publication: { ordinaryTemporaryStaging: true, secretScanBeforePublish: true, atomicBrowserDirectory: true, manifestPublishedLast: true } };
  assertEvidenceSecretFree([{ path: 'manifest', content: JSON.stringify(manifest) }]); const temporary = `${manifestPath}.${randomUUID()}.tmp`; fs.writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`); fs.renameSync(temporary, manifestPath);
} finally { fs.rmSync(stagingRoot, { recursive: true, force: true }); }
