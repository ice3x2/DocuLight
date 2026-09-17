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
const child = (file, env) => new Promise((resolve, reject) => { const processHandle = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env }); processHandle.once('error', reject); processHandle.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`))); });
function removeTree(directory) { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const target = path.join(directory, entry.name); if (entry.isDirectory()) { removeTree(target); fs.rmdirSync(target); } else fs.unlinkSync(target); } }

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue63-product-'));
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }, { registerAccount }] = await Promise.all([import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'), import('../../server/dist/app/auth/account-service.js')]);
  const original = console.log; try { console.log = () => undefined; runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') }); } finally { console.log = original; }
  runtime.stores.announce = () => undefined;
  const installToken = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address(); if (typeof address !== 'object' || address === null) throw new Error('no product address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: installToken }) })).json();
  const userName = `issue63-${randomUUID()}`; const password = `Issue63-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: userName, password, workspaceName: 'Issue63 isolated product', defaultGroupLevel: 'view', signupMode: 'approval' }) });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const secondUserName = `issue63-other-${randomUUID()}`; const secondPassword = `Issue63-other-${randomUUID()}`;
  const second = await registerAccount(runtime.stores, { name: secondUserName, password: secondPassword, status: 'active' });
  if (!second.ok) throw new Error(`second account ${second.rule}`);
  await child(path.join(webRoot, 'test/issue63-token-product-check.mjs'), { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: userName, DOCULIGHT_E2E_PASS: password, DOCULIGHT_E2E_SECOND_USER: secondUserName, DOCULIGHT_E2E_SECOND_PASS: secondPassword });
  forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { const resolved = fs.realpathSync(temporaryRoot); if (!resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) throw new Error('unsafe cleanup target'); removeTree(resolved); fs.rmdirSync(resolved); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
