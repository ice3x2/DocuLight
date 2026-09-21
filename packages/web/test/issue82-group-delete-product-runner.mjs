import { spawn, spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertEvidenceSecretFree } from './issue80-evidence-secrets.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
for (const workspace of ['@doculight/server', '@doculight/web']) {
  const built = spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', workspace], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error(`${workspace} build exited ${built.status}`);
}

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue82-product-'));
const staging = path.join(runRoot, 'staging');
const finalRoot = process.env.DOCULIGHT_ISSUE82_OUTPUT || path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue82/browser');
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
  ]);
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(runRoot, 'vault'), databaseFile: path.join(runRoot, 'db/doculight.db') }); }
  finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const installToken = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(runRoot, 'vault'), databaseFile: path.join(runRoot, 'db/doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('owned port missing');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: installToken }) })).json();
  const suffix = randomUUID();
  const credentials = {
    superuser: { name: `issue82-super-${suffix}`, password: `Issue82-Super-${suffix}` },
    ordinary: { name: `issue82-ordinary-${suffix}`, password: `Issue82-Ordinary-${suffix}` },
    manager: { name: `issue82-manager-${suffix}`, password: `Issue82-Manager-${suffix}` },
  };
  const committed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: credentials.superuser.name, password: credentials.superuser.password, workspaceName: 'Issue 82 workspace', defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!committed.ok) throw new Error(`install ${committed.status}`);
  const installed = await committed.json();
  const make = async (role) => {
    const result = await accounts.registerAccount(runtime.stores, { name: credentials[role].name, password: credentials[role].password, status: 'active' });
    if (!result.ok) throw new Error(`fixture ${role}`);
    return result;
  };
  const ordinary = await make('ordinary');
  const manager = await make('manager');
  runtime.stores.acl.grant({ nodeId: installed.workspaceId, principalId: manager.id, level: 'admin', grantedBy: null });
  const target = runtime.stores.principals.createGroup(`Delete 삭제 대상 ${'아주 긴 이름 '.repeat(5)}${suffix}`);
  const next = runtime.stores.principals.createGroup(`Delete 다음 ${suffix}`);
  runtime.stores.principals.addMember(target.id, ordinary.id);
  runtime.stores.acl.grant({ nodeId: installed.workspaceId, principalId: target.id, level: 'edit', grantedBy: null });
  fs.mkdirSync(staging, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue82-group-delete-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: {
      ...process.env, WEB_URL: origin, DOCULIGHT_ISSUE82_BROWSER_ROOT: path.join(runRoot, 'browser'), DOCULIGHT_ISSUE82_STAGING: staging,
      DOCULIGHT_ISSUE82_SUPER_NAME: credentials.superuser.name, DOCULIGHT_ISSUE82_SUPER_PASS: credentials.superuser.password,
      DOCULIGHT_ISSUE82_ORDINARY_NAME: credentials.ordinary.name, DOCULIGHT_ISSUE82_ORDINARY_PASS: credentials.ordinary.password,
      DOCULIGHT_ISSUE82_MANAGER_NAME: credentials.manager.name, DOCULIGHT_ISSUE82_MANAGER_PASS: credentials.manager.password,
      DOCULIGHT_ISSUE82_GROUP_ID: target.id, DOCULIGHT_ISSUE82_GROUP_NAME: target.name, DOCULIGHT_ISSUE82_NEXT_ID: next.id,
    } });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker ${code}`)));
  });
  if (runtime.stores.principals.findById(target.id) !== undefined) throw new Error('group deletion was not persisted');
  if (runtime.stores.acl.entriesOfPrincipal(target.id).length !== 0) throw new Error('group ACL rows survived');
  if (runtime.stores.principals.findById(ordinary.id) === undefined) throw new Error('member account was deleted');

  const entries = fs.readdirSync(staging, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => ({ path: entry.name, content: fs.readFileSync(path.join(staging, entry.name)) }));
  assertEvidenceSecretFree(entries);
  const files = Object.fromEntries(entries.map((entry) => [entry.path, createHash('sha256').update(entry.content).digest('hex')]));
  fs.writeFileSync(path.join(staging, 'capture-manifest.json'), JSON.stringify({ requirement: 'IR-PRINCIPAL-004', files, secretScan: 'pass', publishedLast: true }, null, 2));
  if (fs.existsSync(finalRoot)) throw new Error(`refusing to replace evidence: ${finalRoot}`);
  fs.mkdirSync(path.dirname(finalRoot), { recursive: true });
  fs.renameSync(staging, finalRoot);
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
