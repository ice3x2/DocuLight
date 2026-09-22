import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm so the repository npm CLI is known');

const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const diff = spawnSync('git', ['diff', '--binary', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).stdout;
const sourceIdentity = `${revision}+diff-${createHash('sha256').update(diff).digest('hex')}`;
const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue77-composition-matrix-run-'));
const outputRoot = process.env.DOCULIGHT_ISSUE77_COMPOSITION_OUTPUT_DIR
  ? path.resolve(process.env.DOCULIGHT_ISSUE77_COMPOSITION_OUTPUT_DIR)
  : path.join(os.tmpdir(), `doculight-issue77-composition-matrix-output-${Date.now()}`);
let runtime;
let server;
let primary;
try {
  const [{ bootstrap, startServer }, install] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  await runtime.textIndexWorker.stop();
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: runtime.stores.docsRoot, databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('owned server address unavailable');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const username = `issue77-matrix-${randomUUID()}`;
  const password = `Issue77-Matrix-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue 77 composition matrix', defaultGroupLevel: 'none', signupMode: 'open' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}: ${await installed.text()}`);
  const { registerAccount } = await import('../../server/dist/app/auth/account-service.js');
  const targetName = `issue77-suspended-${randomUUID()}`;
  const target = await registerAccount(runtime.stores, { name: targetName, password: `Issue77-Target-${randomUUID()}`, status: 'suspended' });
  if (!target.ok) throw new Error('suspended target account fixture creation failed');
  fs.mkdirSync(outputRoot, { recursive: true });
  const rawPath = path.join(outputRoot, 'issue77-composition-matrix.raw.txt');
  const raw = fs.openSync(rawPath, 'w');
  const startedAt = new Date().toISOString();
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test', 'issue77-composition-matrix-check.mjs')], {
      cwd: webRoot,
      stdio: ['ignore', raw, raw],
      env: {
        ...process.env,
        WEB_URL: origin,
        DOCULIGHT_E2E_USER: username,
        DOCULIGHT_E2E_PASS: password,
        DOCULIGHT_ISSUE77_TARGET_PRINCIPAL: targetName,
        DOCULIGHT_ISSUE77_COMPOSITION_OUTPUT_DIR: outputRoot,
        DOCULIGHT_ISSUE77_REVISION: sourceIdentity,
      },
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  fs.closeSync(raw);
  const runRecord = {
    schemaVersion: 1,
    command: 'node packages/web/test/issue77-composition-matrix-runner.mjs (through repository npm CLI)',
    workspace: root,
    server: 'same-process owned disposable server/database/storage',
    fixture: path.relative(root, temporaryRoot),
    sourceIdentity,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode,
    artifacts: ['issue77-composition-matrix.raw.txt', 'issue77-composition-matrix-result.json'],
    outputRoot,
  };
  fs.writeFileSync(path.join(outputRoot, 'issue77-composition-matrix-run.json'), `${JSON.stringify(runRecord, null, 2)}\n`);
  if (exitCode !== 0) throw new Error(`composition checker exited ${exitCode}; see ${rawPath}`);
  install.forgetInstallTokenForTest();
  console.log(`PASS issue77 composition matrix output: ${outputRoot}`);
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
