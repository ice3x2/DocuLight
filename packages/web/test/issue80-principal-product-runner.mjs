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

const runBuild = (workspace) => {
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', workspace], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${workspace} build exited ${result.status}`);
};

runBuild('@doculight/server');
runBuild('@doculight/web');

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue80-product-'));
const docsRoot = path.join(runRoot, 'vault');
const databaseFile = path.join(runRoot, 'database', 'doculight.db');
const browserRoot = path.join(runRoot, 'browser');
const outputRoot = process.env.DOCULIGHT_ISSUE80_STAGING || path.join(runRoot, 'reports');
let runtime;
let server;
let primary;

try {
  const [{ bootstrap, startServer }, install, accounts] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
  ]);

  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot, databaseFile });
  } finally {
    console.log = originalLog;
  }
  runtime.stores.announce = () => undefined;
  const installToken = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot, databaseFile, port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('server did not expose an owned port');
  const origin = `http://127.0.0.1:${address.port}/`;

  const verification = await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: installToken }),
  });
  if (!verification.ok) throw new Error(`install verification ${verification.status}`);
  const verified = await verification.json();
  const suffix = randomUUID();
  const credentials = {
    superuser: { name: `issue80-super-${suffix}`, password: `Issue80-Super-${suffix}` },
    ordinary: { name: `issue80-ordinary-${suffix}`, password: `Issue80-Ordinary-${suffix}` },
    manager: { name: `issue80-manager-${suffix}`, password: `Issue80-Manager-${suffix}` },
  };
  const committed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession: verified.installSession,
      superuserName: credentials.superuser.name,
      password: credentials.superuser.password,
      workspaceName: 'Issue 80 isolated workspace',
      defaultGroupLevel: 'none',
      signupMode: 'approval',
    }),
  });
  if (!committed.ok) throw new Error(`install commit ${committed.status}`);
  const installed = await committed.json();

  const make = async (name, password, status) => {
    const result = await accounts.registerAccount(runtime.stores, { name, password, status });
    if (!result.ok) throw new Error(`fixture account ${name} failed`);
    return result;
  };
  const ordinary = await make(credentials.ordinary.name, credentials.ordinary.password, 'active');
  const manager = await make(credentials.manager.name, credentials.manager.password, 'active');
  runtime.stores.acl.grant({
    nodeId: installed.workspaceId,
    principalId: manager.id,
    level: 'admin',
    grantedBy: null,
  });
  const longName = `긴 이름 대기 사용자 ${'신문 지면 접근성 '.repeat(7)}${suffix}`;
  const pending = await make(longName, `Issue80-Pending-${suffix}`, 'pending');
  const secondPending = await make(`두 번째 대기 ${suffix}`, `Issue80-Second-${suffix}`, 'pending');
  const rejected = await make(`기존 거절 ${suffix}`, `Issue80-Rejected-${suffix}`, 'rejected');

  fs.mkdirSync(outputRoot, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue80-principal-product-check.mjs')], {
      cwd: webRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        WEB_URL: origin,
        DOCULIGHT_ISSUE80_BROWSER_ROOT: browserRoot,
        DOCULIGHT_ISSUE80_OUTPUT: outputRoot,
        DOCULIGHT_ISSUE80_SUPER_NAME: credentials.superuser.name,
        DOCULIGHT_ISSUE80_SUPER_PASS: credentials.superuser.password,
        DOCULIGHT_ISSUE80_ORDINARY_NAME: credentials.ordinary.name,
        DOCULIGHT_ISSUE80_ORDINARY_PASS: credentials.ordinary.password,
        DOCULIGHT_ISSUE80_MANAGER_NAME: credentials.manager.name,
        DOCULIGHT_ISSUE80_MANAGER_PASS: credentials.manager.password,
        DOCULIGHT_ISSUE80_PENDING_ID: pending.id,
        DOCULIGHT_ISSUE80_PENDING_NAME: longName,
        DOCULIGHT_ISSUE80_SECOND_PENDING_ID: secondPending.id,
        DOCULIGHT_ISSUE80_REJECTED_ID: rejected.id,
      },
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`issue80 checker exited ${code}`)));
  });

  const persistedPending = runtime.stores.principals.findById(pending.id);
  const persistedRejected = runtime.stores.principals.findById(rejected.id);
  if (persistedPending?.status !== 'active') throw new Error(`pending account ended ${persistedPending?.status}`);
  if (persistedRejected?.status !== 'pending') throw new Error(`rejected account ended ${persistedRejected?.status}`);
  install.forgetInstallTokenForTest();
} catch (error) {
  primary = error;
} finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) {
    try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
    catch (error) { errors.push(error); }
  }
  if (runtime) {
    try { await runtime.close(); }
    catch (error) { errors.push(error); }
  }
  try { fs.rmSync(runRoot, { recursive: true, force: true }); }
  catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
