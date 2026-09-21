import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
const child = (file, env) => new Promise((resolve, reject) => {
  const handle = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env });
  handle.once('error', reject);
  handle.once('exit', (code, signal) => code === 0 && signal === null
    ? resolve()
    : reject(new Error(`${file} exited ${code ?? 'null'} signal ${signal ?? 'none'}`)));
});

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue79-product-'));
const outputRoot = process.env.DOCULIGHT_ISSUE79_OUTPUT_DIR === undefined
  ? path.join(isolatedRoot, 'browser-output')
  : path.resolve(process.env.DOCULIGHT_ISSUE79_OUTPUT_DIR);
fs.mkdirSync(outputRoot, { recursive: true });
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts, permissions, nodes, grants, workspaces] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/app/acl/permission-service.js'),
    import('../../server/dist/app/node/node-service.js'),
    import('../../server/dist/app/acl/grant-service.js'),
    import('../../server/dist/app/workspace/create-workspace.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({
      docsRoot: path.join(isolatedRoot, 'vault'),
      databaseFile: path.join(isolatedRoot, 'db', 'doculight.db'),
    });
  } finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({
    docsRoot: path.join(isolatedRoot, 'vault'), databaseFile: path.join(isolatedRoot, 'db', 'doculight.db'),
    port: 0, trustProxyHops: 0,
  }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no server address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = 'issue79-root';
  const password = 'Issue79-root-password';
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession: verified.installSession, superuserName: username, password,
      workspaceName: '아주 긴 한국어 워크스페이스 이름으로 확대 배치를 확인합니다',
      defaultGroupLevel: 'none', signupMode: 'approval',
    }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const rootUser = runtime.stores.principals.list('user').find((entry) => entry.name === username);
  const sourceWorkspace = runtime.stores.workspaces.list()[0];
  if (!rootUser || !sourceWorkspace) throw new Error('fixture owner missing');
  const actor = permissions.actorFor(runtime.stores.principals, rootUser.id);
  const ordinaryName = 'issue79-ordinary';
  const ordinaryPassword = 'Issue79-ordinary-password';
  const ordinary = await accounts.registerAccount(runtime.stores, { name: ordinaryName, password: ordinaryPassword, status: 'active' });
  if (!ordinary.ok) throw new Error('ordinary fixture account failed');
  const destinationWorkspace = await workspaces.createWorkspace({ workspaces: runtime.stores.workspaces, files: runtime.stores.files }, '검증 대상 워크스페이스');
  const sourceGrant = grants.grantPermission(runtime.stores, actor, { nodeId: sourceWorkspace.id, principalId: ordinary.id, level: 'view' });
  const destinationGrant = grants.grantPermission(runtime.stores, actor, { nodeId: destinationWorkspace.id, principalId: ordinary.id, level: 'edit' });
  if (!sourceGrant.ok || !destinationGrant.ok) throw new Error('ordinary fixture grants failed');
  const source = nodes.createNode(runtime.stores, actor, {
    workspaceId: sourceWorkspace.id, parentId: null, kind: 'directory', name: '프로젝트 자료',
  });
  if (!source.ok) throw new Error('source fixture failed');
  const visible = nodes.createNode(runtime.stores, actor, { workspaceId: sourceWorkspace.id, parentId: source.id, kind: 'file', name: '보이는 문서.md' });
  const hidden = nodes.createNode(runtime.stores, actor, { workspaceId: sourceWorkspace.id, parentId: source.id, kind: 'file', name: '숨은 문서.md' });
  const collision = nodes.createNode(runtime.stores, actor, { workspaceId: destinationWorkspace.id, parentId: null, kind: 'directory', name: '프로젝트 자료' });
  if (!visible.ok || !hidden.ok || !collision.ok) throw new Error('subtree fixture failed');
  runtime.stores.nodes.setInheritance(hidden.id, false);
  const sourceId = source.id;
  const beforeIds = new Set(runtime.stores.nodes.allIn(destinationWorkspace.id).map((entry) => entry.id));

  await child(path.join(webRoot, 'test/issue79-relocation-product-check.mjs'), {
    ...process.env,
    WEB_URL: origin,
    DOCULIGHT_E2E_USER: ordinaryName,
    DOCULIGHT_E2E_PASS: ordinaryPassword,
    DOCULIGHT_E2E_SOURCE: sourceId,
    DOCULIGHT_E2E_WORKSPACE: destinationWorkspace.id,
    DOCULIGHT_ISSUE79_PROFILE_ROOT: path.join(isolatedRoot, 'profiles'),
    DOCULIGHT_ISSUE79_OUTPUT_DIR: outputRoot,
  });

  const added = runtime.stores.nodes.allIn(destinationWorkspace.id).filter((entry) => !beforeIds.has(entry.id));
  if (added.length !== 2) throw new Error(`expected two visible persisted nodes, got ${added.length}`);
  const addedNames = added.map((entry) => entry.name).sort();
  if (!addedNames.includes('프로젝트 자료 (2)') || !addedNames.includes('보이는 문서.md') || addedNames.includes('숨은 문서.md')) {
    throw new Error(`unexpected persisted visible subtree ${addedNames.join(', ')}`);
  }
  fs.writeFileSync(path.join(outputRoot, 'persistence.json'), JSON.stringify({
    actorName: ordinaryName, actorSuperuser: false, sourceId, copiedNames: addedNames, hiddenNameAbsent: !addedNames.includes('숨은 문서.md'), persistedCopyCount: added.length,
  }, null, 2));
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
