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
for (const workspace of ['@doculight/server', '@doculight/web']) {
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', workspace], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${workspace} build failed`);
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue84-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts, permissions, grants, groups] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/app/acl/permission-service.js'),
    import('../../server/dist/app/acl/grant-service.js'),
    import('../../server/dist/domain/principal/system-groups.js'),
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
  if (typeof address !== 'object' || address === null) throw new Error('server address unavailable');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const owner = { name: `issue84-owner-${randomUUID()}`, password: `Issue84-owner-${randomUUID()}` };
  const installed = await (await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: owner.name, password: owner.password, workspaceName: 'Issue84 권한 검증 워크스페이스', defaultGroupLevel: 'none', signupMode: 'approval' }) })).json();
  const create = async (prefix) => {
    const row = { name: `${prefix}-${randomUUID()}`, password: `Issue84-${prefix}-${randomUUID()}` };
    const made = await accounts.registerAccount(runtime.stores, { ...row, status: 'active' });
    if (!made.ok) throw new Error(`${prefix} account failed`);
    return { ...row, id: made.id };
  };
  const target = await create(`긴 슈퍼유저 ${'가'.repeat(48)}`);
  const manager = await create('manager');
  const editor = await create('editor');
  const ordinary = await create('ordinary');
  runtime.stores.principals.addMember(groups.SUPERUSER_GROUP_ID, target.id);
  const actor = permissions.actorFor(runtime.stores.principals, installed.superuserId);
  for (const [principalId, level] of [[target.id, 'view'], [manager.id, 'admin'], [editor.id, 'edit']]) {
    const granted = grants.grantPermission(runtime.stores, actor, { nodeId: installed.workspaceId, principalId, level });
    if (!granted.ok) throw new Error(`grant failed ${principalId}`);
  }
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue84-revocation-bypass-product-check.mjs')], {
      cwd: webRoot, stdio: 'inherit', env: { ...process.env, WEB_URL: origin,
        DOCULIGHT_ISSUE84_OWNER: JSON.stringify(owner), DOCULIGHT_ISSUE84_MANAGER: JSON.stringify(manager),
        DOCULIGHT_ISSUE84_EDITOR: JSON.stringify(editor), DOCULIGHT_ISSUE84_ORDINARY: JSON.stringify(ordinary),
        DOCULIGHT_ISSUE84_TARGET: JSON.stringify(target), DOCULIGHT_ISSUE84_WORKSPACE: installed.workspaceId },
    });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
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
