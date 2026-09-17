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
const run = (args) => { const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' }); if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`); };
const child = (file, env) => new Promise((resolve, reject) => { const handle = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env }); handle.once('error', reject); handle.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`))); });
function removeTree(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) { removeTree(target); fs.rmdirSync(target); } else fs.unlinkSync(target); } }

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue65-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }] = await Promise.all([import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js')]);
  const original = console.log; try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); } finally { console.log = original; }
  runtime.stores.announce = () => undefined;
  const installToken = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no product address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: installToken }) })).json();
  const userName = `issue65-${randomUUID()}`; const password = `Issue65-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: userName, password, workspaceName: 'Issue65 isolated product', defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const [{ registerAccount }, { createWorkspace }, { grantPermission }, { actorFor }] = await Promise.all([
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/app/workspace/create-workspace.js'),
    import('../../server/dist/app/acl/grant-service.js'),
    import('../../server/dist/app/acl/permission-service.js'),
  ]);
  const superuser = runtime.stores.principals.list('user').find((one) => one.name === userName);
  if (superuser === undefined) throw new Error('installed superuser missing');
  const managerName = `issue65-manager-${randomUUID()}`; const managerPassword = `Issue65-manager-${randomUUID()}`;
  const emptyName = `issue65-empty-${randomUUID()}`; const emptyPassword = `Issue65-empty-${randomUUID()}`;
  const manager = await registerAccount(runtime.stores, { name: managerName, password: managerPassword, status: 'active' });
  const empty = await registerAccount(runtime.stores, { name: emptyName, password: emptyPassword, status: 'active' });
  if (!manager.ok || !empty.ok) throw new Error('product fixture account creation failed');
  const workspaces = runtime.stores.workspaces.list();
  const managedWorkspace = workspaces[0];
  if (managedWorkspace === undefined) throw new Error('installed workspace missing');
  const editedWorkspace = await createWorkspace({ workspaces: runtime.stores.workspaces, files: runtime.stores.files }, 'Issue65 edit-only workspace');
  const rootActor = actorFor(runtime.stores.principals, superuser.id);
  for (const workspace of [managedWorkspace, editedWorkspace]) {
    for (const entry of runtime.stores.acl.entriesOn(workspace.id)) {
      if (entry.principalId === 'system-default') runtime.stores.acl.revoke(entry.id);
    }
  }
  grantPermission(runtime.stores, rootActor, { nodeId: managedWorkspace.id, principalId: manager.id, level: 'admin' });
  grantPermission(runtime.stores, rootActor, { nodeId: editedWorkspace.id, principalId: manager.id, level: 'edit' });
  await child(path.join(webRoot, 'test/issue65-share-product-check.mjs'), {
    ...process.env,
    WEB_URL: origin,
    DOCULIGHT_E2E_USER: userName,
    DOCULIGHT_E2E_PASS: password,
    DOCULIGHT_E2E_MANAGER_USER: managerName,
    DOCULIGHT_E2E_MANAGER_PASS: managerPassword,
    DOCULIGHT_E2E_EMPTY_USER: emptyName,
    DOCULIGHT_E2E_EMPTY_PASS: emptyPassword,
    DOCULIGHT_E2E_MANAGED_WORKSPACE: managedWorkspace.id,
    DOCULIGHT_E2E_EDITED_WORKSPACE: editedWorkspace.id,
    DOCULIGHT_E2E_MANAGER_ID: manager.id,
  });
  forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { const resolved = fs.realpathSync(temporaryRoot); if (!resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) throw new Error('unsafe cleanup target'); removeTree(resolved); fs.rmdirSync(resolved); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
