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

function run(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
}

function runChild(file, env) {
  return new Promise((resolve, reject) => {
    const handle = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env });
    handle.once('error', reject);
    handle.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
  });
}

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue71-product-'));
let runtime;
let server;
let primary;
try {
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
  ]);
  const original = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally {
    console.log = original;
  }
  runtime.stores.announce = () => undefined;
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = `issue71-${randomUUID()}`;
  const password = `Issue71-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue71 product', defaultGroupLevel: 'none', signupMode: 'approval' }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  await runChild(path.join(webRoot, 'test/issue71-instance-settings-product-check.mjs'), {
    ...process.env,
    WEB_URL: origin,
    DOCULIGHT_E2E_USER: username,
    DOCULIGHT_E2E_PASS: password,
  });
  forgetInstallTokenForTest();
} catch (error) {
  primary = error;
} finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
