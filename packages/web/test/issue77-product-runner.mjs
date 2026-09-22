import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue77-product-'));
const outputRoot = process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR ? path.resolve(process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR) : path.join(temporaryRoot, 'output');
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
  ]);
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); }
  finally { console.log = originalLog; }
  await runtime.textIndexWorker.stop();
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: runtime.stores.docsRoot, databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('server address unavailable');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const username = `issue77-${randomUUID()}`;
  const password = `Issue77-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue 77 workspace', defaultGroupLevel: 'none', signupMode: 'open' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}: ${await installed.text()}`);
  fs.mkdirSync(outputRoot, { recursive: true });
  const checks = [
    'issue77-product-check.mjs',
    'focus-retention-check.mjs',
    'conflict-rescue-product-check.mjs',
    'search-layout-check.mjs',
    'acl-two-account-check.mjs',
    'input-gestures-check.mjs',
  ];
  const results = [];
  for (const check of checks) {
    const startedAt = new Date().toISOString();
    const rawPath = path.join(outputRoot, `${path.basename(check, path.extname(check))}.raw.txt`);
    const raw = fs.openSync(rawPath, 'w');
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(webRoot, 'test', check)], { cwd: webRoot, stdio: ['ignore', raw, raw], env: { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password, DOCULIGHT_FIXTURE_DATA_DIR: runtime.stores.docsRoot, DOCULIGHT_ISSUE77_OUTPUT_DIR: outputRoot } });
      child.once('error', reject); child.once('exit', (code) => resolve(code ?? 1));
    });
    fs.closeSync(raw);
    results.push({ check, startedAt, endedAt: new Date().toISOString(), exitCode, raw: path.basename(rawPath) });
    if (exitCode !== 0) throw new Error(`${check} exited ${exitCode}; see ${rawPath}`);
  }
  fs.writeFileSync(path.join(outputRoot, 'product-suite-results.json'), `${JSON.stringify(results, null, 2)}\n`);
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  if (!process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR) try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
