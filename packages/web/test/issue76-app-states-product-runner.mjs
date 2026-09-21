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
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue76-product-'));
const outputRoot = process.env.DOCULIGHT_ISSUE76_OUTPUT_DIR
  ? path.resolve(process.env.DOCULIGHT_ISSUE76_OUTPUT_DIR)
  : path.join(temporaryRoot, 'browser-output');
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, nodes, permissions] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/node/node-service.js'),
    import('../../server/dist/app/acl/permission-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  await runtime.textIndexWorker.stop();
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: runtime.stores.docsRoot, databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 1 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const username = `issue76-${randomUUID()}`; const password = `Issue76-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: '상태 검증실', defaultGroupLevel: 'none', signupMode: 'open' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const body = await installed.json();
  const actor = permissions.actorFor(runtime.stores.principals, body.superuserId);
  const made = nodes.createNode(runtime.stores, actor, { workspaceId: body.workspaceId, parentId: null, kind: 'file', name: `${'긴 한글 문서 상태 '.repeat(5)}.md` });
  if (!made.ok) throw new Error('document fixture failed');
  const source = path.join(runtime.stores.docsRoot, body.workspaceId, runtime.stores.nodes.pathOf(made.id));
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.writeFileSync(source, `# 상태 검증\n\n${'긴 한글 본문 '.repeat(80)}`, 'utf8');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue76-app-states-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password, DOCULIGHT_ISSUE76_OUTPUT_DIR: outputRoot } });
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
