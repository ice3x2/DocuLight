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
  const done = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (done.status !== 0) throw new Error(`${args.join(' ')} exited ${done.status}`);
};
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue73-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = `issue73-${randomUUID()}`;
  const password = `Issue73-${randomUUID()}`;
  const managerName = `관리자-${randomUUID()}`;
  const managerPassword = `Manager73-${randomUUID()}`;
  const viewerName = `일반-${randomUUID()}`;
  const viewerPassword = `Viewer73-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue73 seed', defaultGroupLevel: 'none', signupMode: 'open' }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const manager = await accounts.registerAccount(runtime.stores, { name: managerName, password: managerPassword, status: 'active' });
  const viewer = await accounts.registerAccount(runtime.stores, { name: viewerName, password: viewerPassword, status: 'active' });
  if (!manager.ok || !viewer.ok) throw new Error('account fixture failed');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue73-workspace-create-product-check.mjs')], {
      cwd: webRoot,
      stdio: 'inherit',
      env: { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password,
        DOCULIGHT_E2E_MANAGER: managerName, DOCULIGHT_E2E_MANAGER_PASS: managerPassword,
        DOCULIGHT_E2E_VIEWER: viewerName, DOCULIGHT_E2E_VIEWER_PASS: viewerPassword },
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
  });
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
