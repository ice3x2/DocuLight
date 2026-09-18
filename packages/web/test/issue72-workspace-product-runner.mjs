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
const run = (args) => { const done = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' }); if (done.status !== 0) throw new Error(`${args.join(' ')} exited ${done.status}`); };
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue72-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, workspace, permission, accounts, grants] = await Promise.all([
    import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/workspace/create-workspace.js'), import('../../server/dist/app/acl/permission-service.js'),
    import('../../server/dist/app/auth/account-service.js'), import('../../server/dist/app/acl/grant-service.js'),
  ]);
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); }
  finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const username = `issue72-${randomUUID()}`; const password = `Issue72-${randomUUID()}`;
  const managerName = `manager-${randomUUID()}`; const managerPassword = `Manager72-${randomUUID()}`;
  const viewerName = `viewer-${randomUUID()}`; const viewerPassword = `Viewer72-${randomUUID()}`;
  const response = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: '같은 이름 '.repeat(18), defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!response.ok) throw new Error(`install ${response.status}`);
  const installed = await response.json();
  const actor = permission.actorFor(runtime.stores.principals, installed.superuserId);
  const manager = await accounts.registerAccount(runtime.stores, { name: managerName, password: managerPassword, status: 'active' });
  const viewer = await accounts.registerAccount(runtime.stores, { name: viewerName, password: viewerPassword, status: 'active' });
  if (!manager.ok || !viewer.ok) throw new Error('role fixture creation failed');
  const second = await workspace.createWorkspaceAs(runtime.stores, actor, { name: '같은 이름 '.repeat(18), administratorId: manager.id, defaultGroupLevel: 'none' });
  const adminless = await workspace.createWorkspace(runtime.stores, '관리자 없는 실제 워크스페이스');
  if (!second.ok) throw new Error('workspace fixture creation failed');
  const firstManagerGrant = grants.grantPermission(runtime.stores, actor, { nodeId: installed.workspaceId, principalId: manager.id, level: 'admin' });
  const secondManagerEntry = runtime.stores.acl.entriesOn(second.workspace.id).find((entry) => entry.principalId === manager.id && entry.level === 'admin');
  grants.grantPermission(runtime.stores, actor, { nodeId: installed.workspaceId, principalId: viewer.id, level: 'view' });
  if (!firstManagerGrant.ok || !secondManagerEntry) throw new Error('role grants failed');
  const writeSidecar = runtime.stores.files.writeSidecar.bind(runtime.stores.files);
  runtime.stores.files.writeSidecar = async (record) => {
    if (record.name.includes('사이드카 대기')) throw new Error('intentional issue72 sidecar failure');
    await writeSidecar(record);
  };
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue72-workspace-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: {
      ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password,
      DOCULIGHT_E2E_MANAGER: managerName, DOCULIGHT_E2E_MANAGER_PASS: managerPassword,
      DOCULIGHT_E2E_VIEWER: viewerName, DOCULIGHT_E2E_VIEWER_PASS: viewerPassword,
      DOCULIGHT_E2E_MANAGER_FIRST_ENTRY: firstManagerGrant.entryId,
      DOCULIGHT_E2E_MANAGER_SECOND_ENTRY: secondManagerEntry.id,
      DOCULIGHT_E2E_FIRST_WORKSPACE: installed.workspaceId,
      DOCULIGHT_E2E_SECOND_WORKSPACE: second.workspace.id,
      DOCULIGHT_E2E_ADMINLESS_WORKSPACE: adminless.id,
    } });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
  });
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
