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

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue89-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts] = await Promise.all([
    import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
  ]);
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
  const username = `issue89-${randomUUID()}`; const password = `Issue89-${randomUUID()}`;
  const workspaceName = `아주 긴 한글 워크스페이스 이름 ${'신문 지면 '.repeat(12)}`;
  const committed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName, defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!committed.ok) throw new Error(`install ${committed.status}`);
  const installed = await committed.json();
  const candidateName = `관리자 후보 ${'긴 한글 이름 '.repeat(8)}${randomUUID()}`;
  const candidate = await accounts.registerAccount(runtime.stores, { name: candidateName, password: `Candidate89-${randomUUID()}`, status: 'active' });
  if (!candidate.ok) throw new Error('candidate fixture failed');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue89-admin-grant-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: {
      ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password,
      DOCULIGHT_E2E_WORKSPACE: installed.workspaceId, DOCULIGHT_E2E_CANDIDATE: candidateName,
      DOCULIGHT_E2E_CANDIDATE_ID: candidate.id,
    } });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker exited ${code}`)));
  });
  const grantsForCandidate = runtime.stores.acl.entriesOn(installed.workspaceId).filter((entry) => entry.principalId === candidate.id && entry.level === 'admin');
  if (grantsForCandidate.length !== 1) throw new Error(`persisted admin grants ${grantsForCandidate.length}`);
  const audit = runtime.stores.auditLog.inScope([], { includeInstance: true, operation: 'acl.grant' }).filter((row) => row.subjectId === candidate.id && row.nodeId === installed.workspaceId);
  if (audit.length !== 1) throw new Error(`persisted admin audit ${audit.length}`);
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
