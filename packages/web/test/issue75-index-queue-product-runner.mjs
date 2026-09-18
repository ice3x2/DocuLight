import { fork, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue75-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts, nodes, permissions, workerModule] = await Promise.all([
    import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'), import('../../server/dist/app/node/node-service.js'), import('../../server/dist/app/acl/permission-service.js'), import('../../server/dist/app/search/text-index-worker.js'),
  ]);
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); }
  finally { console.log = originalLog; }
  await runtime.textIndexWorker.stop();
  runtime.stores.announce = () => undefined;
  const token = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const username = `issue75-${randomUUID()}`; const password = `Issue75-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: '색인 운영실', defaultGroupLevel: 'none', signupMode: 'open' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const installedBody = await installed.json();
  const viewerName = `viewer-${randomUUID()}`; const viewerPassword = `Viewer75-${randomUUID()}`;
  const viewer = await accounts.registerAccount(runtime.stores, { name: viewerName, password: viewerPassword, status: 'active' });
  if (!viewer.ok) throw new Error('viewer fixture failed');
  const rootActor = permissions.actorFor(runtime.stores.principals, installedBody.superuserId);
  for (let index = 0; index < 101; index += 1) {
    const name = index === 2 ? `${'실제 처리 중인 긴 한글 문서 '.repeat(3)}.pdf` : index === 99 ? `${'화면에 보이는 아주 긴 한글 문서 이름 '.repeat(4)}.md` : `색인 작업 ${String(index).padStart(3, '0')}.md`;
    const made = nodes.createNode(runtime.stores, rootActor, { workspaceId: installedBody.workspaceId, parentId: null, kind: 'file', name });
    if (!made.ok) throw new Error(`node fixture failed ${JSON.stringify(made)}`);
    let fingerprint = `fixture-${index}`;
    if (index === 2) {
      const bytes = Buffer.from('real worker pdf fixture');
      const source = path.join(runtime.stores.docsRoot, installedBody.workspaceId, runtime.stores.nodes.pathOf(made.id));
      fs.mkdirSync(path.dirname(source), { recursive: true }); fs.writeFileSync(source, bytes);
      fingerprint = createHash('sha256').update(bytes).digest('hex');
    }
    const prepared = runtime.stores.textIndex.prepare(made.id, fingerprint, `2026-09-18T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`);
    runtime.stores.textIndex.ready(made.id, prepared.generation, fingerprint);
  }
  const first = runtime.stores.textIndex.claimNext('failed-claim'); runtime.stores.textIndex.fail(first.nodeId, first.generation, 'failed-claim', 'parse_failed');
  const stuck = runtime.stores.textIndex.claimNext('running-claim');
  await new Promise((resolve, reject) => {
    const child = fork(path.join(webRoot, 'test/issue75-index-queue-product-check.mjs'), [], { cwd: webRoot, stdio: ['inherit','inherit','inherit','ipc'], env: { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password, DOCULIGHT_E2E_VIEWER: viewerName, DOCULIGHT_E2E_VIEWER_PASS: viewerPassword } });
    let releaseExtraction; let workerRun;
    child.on('message', (message) => { void (async () => {
      try {
        if (message.action === 'start-worker') {
          const gate = new Promise((resolve) => { releaseExtraction = resolve; });
          workerRun = new workerModule.TextIndexWorker({ ...runtime.stores, pdf: { extractStrict: async () => { await gate; return { ok: true, pages: [{ page: 1, text: '실제 완료' }] }; } } }).processOne();
          while (!runtime.stores.textIndex.snapshot().items.some((item) => item.status === 'running' && item.nodeId !== stuck.nodeId)) await new Promise((resolve) => setTimeout(resolve, 5));
        } else if (message.action === 'finish-worker') {
          releaseExtraction(); await workerRun;
        }
        child.send({ id: message.id, ok: true });
      } catch (error) { child.send({ id: message.id, ok: false, error: String(error) }); }
    })(); });
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
