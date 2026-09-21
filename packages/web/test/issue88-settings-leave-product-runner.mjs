import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareUtf8Bytewise, publishCapture, UTF8_BYTEWISE_ORDER } from './issue88-evidence-publication.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
const runChild = (file, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
});

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue88-product-'));
const publicationRoot = process.env.DOCULIGHT_ISSUE88_OUTPUT_DIR === undefined
  ? path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue88/browser-matrix')
  : path.resolve(process.env.DOCULIGHT_ISSUE88_OUTPUT_DIR);
const stagedOutputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue88-output-'));
const outputRoot = path.join(stagedOutputRoot, 'capture');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const verifyStagedCapture = () => {
  const artifact = path.join(outputRoot, 'browser-matrix.json');
  if (!fs.existsSync(artifact)) throw new Error('source/artifact/report identity mismatch: browser matrix missing');
  const parsed = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  if (parsed.runner !== 'isolated Playwright-owned persistent Chromium with extension chrome.tabs.setZoom/getZoom') {
    throw new Error('source/artifact/report identity mismatch: runner identity');
  }
  const sources = ['test/issue88-evidence-publication.mjs', 'test/issue88-settings-leave-product-check.mjs', 'test/issue88-settings-leave-product-runner.mjs']
    .sort(compareUtf8Bytewise)
    .map((relative) => ({ path: relative, sha256: sha256(path.join(webRoot, relative)) }));
  const artifacts = fs.readdirSync(outputRoot).sort(compareUtf8Bytewise).map((name) => ({ name, sha256: sha256(path.join(outputRoot, name)) }));
  const report = { schema: 'issue88-product-capture-v1', ordering: UTF8_BYTEWISE_ORDER, sources, artifacts, environmentCount: parsed.environments.length, forcedCount: parsed.forcedColors.length };
  fs.writeFileSync(path.join(outputRoot, 'capture-report.json'), JSON.stringify(report, null, 2));
  report.artifacts = fs.readdirSync(outputRoot).filter((name) => name !== 'capture-manifest.json').sort(compareUtf8Bytewise).map((name) => ({ name, sha256: sha256(path.join(outputRoot, name)) }));
  fs.writeFileSync(path.join(outputRoot, 'capture-manifest.json'), JSON.stringify(report, null, 2));
  return report;
};
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(isolatedRoot, 'vault'), databaseFile: path.join(isolatedRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(isolatedRoot, 'vault'), databaseFile: path.join(isolatedRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no server address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = `issue88-${randomUUID()}`;
  const password = `Issue88-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue88 isolated', defaultGroupLevel: 'none', signupMode: 'approval' }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  await runChild(path.join(webRoot, 'test/issue88-settings-leave-product-check.mjs'), {
    ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password,
    DOCULIGHT_ISSUE88_PROFILE_ROOT: path.join(isolatedRoot, 'profiles'), DOCULIGHT_ISSUE88_OUTPUT_DIR: outputRoot,
  });
  verifyStagedCapture();
  publishCapture(outputRoot, publicationRoot);
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  try { fs.rmSync(stagedOutputRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
