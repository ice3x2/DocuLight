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

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue86-product-'));
let runtime;
let server;
let zeroRuntime;
let zeroServer;
let primary;
try {
  const [{ bootstrap, startServer }, install, accounts, permissions, grants, groups, vocabulary] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/app/acl/permission-service.js'),
    import('../../server/dist/app/acl/grant-service.js'),
    import('../../server/dist/domain/principal/system-groups.js'),
    import('../../server/dist/domain/reconciliation/vocabulary.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally {
    console.log = originalLog;
  }
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('server address unavailable');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const ownerName = `issue86-owner-${randomUUID()}`;
  const ownerPassword = `Issue86-owner-${randomUUID()}`;
  const committed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: ownerName, password: ownerPassword, workspaceName: 'Issue86 managed workspace', defaultGroupLevel: 'none', signupMode: 'approval' }),
  });
  if (!committed.ok) throw new Error(`install ${committed.status}`);
  const installed = await committed.json();
  const makeAccount = async (prefix) => {
    const name = `${prefix}-${randomUUID()}`;
    const password = `Issue86-${prefix}-${randomUUID()}`;
    const account = await accounts.registerAccount(runtime.stores, { name, password, status: 'active' });
    if (!account.ok) throw new Error(`${prefix} fixture failed`);
    return { id: account.id, name, password };
  };
  const manager = await makeAccount('manager');
  const ordinary = await makeAccount('ordinary');
  const owner = permissions.actorFor(runtime.stores.principals, installed.superuserId);
  const granted = grants.grantPermission(runtime.stores, owner, { nodeId: installed.workspaceId, principalId: manager.id, level: 'admin' });
  if (!granted.ok) throw new Error(`manager grant failed: ${granted.rule}`);

  const zeroRoot = path.join(temporaryRoot, 'zero-instance');
  const silentLog = console.log;
  try {
    console.log = () => undefined;
    zeroRuntime = await bootstrap({ docsRoot: path.join(zeroRoot, 'docs'), databaseFile: path.join(zeroRoot, 'db', 'doculight.db') });
  } finally {
    console.log = silentLog;
  }
  zeroRuntime.stores.announce = () => undefined;
  // Bootstrap creates a recovery workspace when an empty repository starts. This fixture
  // deliberately models the supported zero-workspace state, so remove only that test-owned
  // recovery metadata and its disposable files before the HTTP server accepts requests.
  zeroRuntime.stores.metadata.run('DELETE FROM acl_entry');
  zeroRuntime.stores.metadata.run('DELETE FROM node');
  zeroRuntime.stores.metadata.run('DELETE FROM workspace');
  fs.rmSync(path.join(zeroRoot, 'docs'), { recursive: true, force: true });
  fs.mkdirSync(path.join(zeroRoot, 'docs'), { recursive: true });
  const zeroName = `zero-superuser-${randomUUID()}`;
  const zeroPassword = `Issue86-zero-${randomUUID()}`;
  const zeroAccount = await accounts.registerAccount(zeroRuntime.stores, { name: zeroName, password: zeroPassword, status: 'active' });
  if (!zeroAccount.ok) throw new Error('zero superuser fixture failed');
  zeroRuntime.stores.principals.addMember(groups.SUPERUSER_GROUP_ID, zeroAccount.id);
  zeroRuntime.stores.auditLog.append({ operation: 'settings.audit-retention-days', actor: zeroAccount.id });
  const auditRef = zeroRuntime.stores.auditLog.append({ operation: 'reconcile.create', actor: 'system:reconciler' });
  zeroRuntime.stores.auditLog.append({
    operation: '설정.감사.긴행.대비측정',
    actor: zeroAccount.id,
    beforeValue: '변경 전',
    afterValue: '긴 한글 감사 행 대비 측정 대상 — 권한 범위가 바뀌어도 읽을 수 있는 감사 기록의 긴 값이 줄바꿈된 뒤에도 배경과 충분한 대비를 유지하는지 확인합니다.',
  });
  zeroRuntime.stores.queue.open({ type: vocabulary.FINDING_TYPE.unregisteredFile, auditRefs: [auditRef] });
  zeroServer = startServer({ docsRoot: path.join(zeroRoot, 'docs'), databaseFile: path.join(zeroRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, zeroRuntime);
  await new Promise((resolve, reject) => { zeroServer.once('listening', resolve); zeroServer.once('error', reject); });
  const zeroAddress = zeroServer.address();
  if (typeof zeroAddress !== 'object' || zeroAddress === null) throw new Error('zero server address unavailable');
  const zeroOrigin = `http://127.0.0.1:${zeroAddress.port}/`;

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue86-audit-entry-product-check.mjs')], {
      cwd: webRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        WEB_URL: zeroOrigin,
        DOCULIGHT_ISSUE86_MANAGED_URL: origin,
        DOCULIGHT_ISSUE86_OWNER_USER: ownerName,
        DOCULIGHT_ISSUE86_OWNER_PASS: ownerPassword,
        DOCULIGHT_ISSUE86_ZERO_USER: zeroName,
        DOCULIGHT_ISSUE86_ZERO_PASS: zeroPassword,
        DOCULIGHT_ISSUE86_MANAGER_USER: manager.name,
        DOCULIGHT_ISSUE86_MANAGER_PASS: manager.password,
        DOCULIGHT_ISSUE86_ORDINARY_USER: ordinary.name,
        DOCULIGHT_ISSUE86_ORDINARY_PASS: ordinary.password,
      },
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
  });
  install.forgetInstallTokenForTest();
} catch (error) {
  primary = error;
} finally {
  const errors = primary === undefined ? [] : [primary];
  if (zeroServer) try { await new Promise((resolve, reject) => zeroServer.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (zeroRuntime) try { await zeroRuntime.close(); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
