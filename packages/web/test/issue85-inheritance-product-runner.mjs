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

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue85-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts, acl, nodes] = await Promise.all([
    import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'), import('../../server/dist/app/acl/grant-service.js'),
    import('../../server/dist/app/node/node-service.js'),
  ]);
  const actorModule = await import('../../server/dist/app/acl/permission-service.js');
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); }
  finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const installToken = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: installToken }) })).json();
  const owner = { name: `issue85-owner-${randomUUID()}`, password: `Owner85-${randomUUID()}` };
  const workspaceName = `상속 복원 검증 ${'긴 워크스페이스 '.repeat(8)}`;
  const committed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: owner.name, password: owner.password, workspaceName, defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!committed.ok) throw new Error(`install ${committed.status}`);
  const installed = await committed.json();
  const ordinary = { name: `issue85-ordinary-${randomUUID()}`, password: `Ordinary85-${randomUUID()}` };
  const ordinaryAccount = await accounts.registerAccount(runtime.stores, { name: ordinary.name, password: ordinary.password, status: 'active' });
  const staleAccount = await accounts.registerAccount(runtime.stores, { name: `영향 변경 사용자 ${randomUUID()}`, password: `Stale85-${randomUUID()}`, status: 'active' });
  if (!ordinaryAccount.ok || !staleAccount.ok) throw new Error('account fixture failed');
  const ownerActor = actorModule.actorFor(runtime.stores.principals, installed.superuserId);
  acl.grantPermission(runtime.stores, ownerActor, { nodeId: installed.workspaceId, principalId: ordinaryAccount.id, level: 'view' });
  const folder = nodes.createNode(runtime.stores, ownerActor, { workspaceId: installed.workspaceId, parentId: null, kind: 'directory', name: '상속복원검증폴더' });
  if (!folder.ok) throw new Error(`folder fixture failed: ${JSON.stringify(folder)}`);
  const child = nodes.createNode(runtime.stores, ownerActor, { workspaceId: installed.workspaceId, parentId: folder.id, kind: 'file', name: '실제 하위 문서.md' });
  if (!child.ok || !acl.breakInheritance(runtime.stores, ownerActor, folder.id).ok) throw new Error('inheritance fixture failed');
  await new Promise((resolve, reject) => {
    const childProcess = spawn(process.execPath, [path.join(webRoot, 'test/issue85-inheritance-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: {
      ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: owner.name, DOCULIGHT_E2E_PASS: owner.password,
      DOCULIGHT_E2E_ORDINARY_USER: ordinary.name, DOCULIGHT_E2E_ORDINARY_PASS: ordinary.password,
      DOCULIGHT_E2E_WORKSPACE: installed.workspaceId, DOCULIGHT_E2E_NODE: folder.id,
      DOCULIGHT_E2E_STALE_PRINCIPAL: staleAccount.id,
    } });
    childProcess.once('error', reject); childProcess.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
  });
  if (runtime.stores.nodes.findById(folder.id)?.inheritsAcl !== true) throw new Error('inheritance was not restored');
  if (runtime.stores.acl.entriesOn(folder.id).length === 0) throw new Error('direct ACL was not retained');
  const audit = runtime.stores.auditLog.inScope([installed.workspaceId], { includeInstance: true, operation: 'acl.restore-inheritance' }).filter((row) => row.nodeId === folder.id);
  if (audit.length !== 1) throw new Error(`restore audit count ${audit.length}`);
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
