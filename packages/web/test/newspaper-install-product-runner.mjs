import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run this checker through its npm script');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}
async function runChild(command, args, options) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
  const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (status !== 0) throw new Error(`owned checker exited ${status}`);
}
function removeTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) { removeTree(target); fs.rmdirSync(target); }
    else if (entry.isFile()) fs.unlinkSync(target);
    else throw new Error(`unexpected temporary entry: ${target}`);
  }
}

run(process.execPath, [npmCli, 'run', 'build', '--workspace', '@doculight/server']);
run(process.execPath, [npmCli, 'run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue60-product-'));
let runtime;
let server;
let primaryError;
try {
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }] = await Promise.all([
    import('../../server/dist/main.js'), import('../../server/dist/app/install/install-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('owned product server has no address');
  const username = `issue60-${randomUUID()}`;
  const password = `Issue60-${randomUUID()}`;
  await runChild(process.execPath, [path.join(webRoot, 'test/newspaper-install-product-check.mjs')], {
    cwd: webRoot,
    env: { ...process.env, WEB_URL: `http://127.0.0.1:${address.port}/`, DOCULIGHT_INSTALL_TOKEN: token, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password },
  });
  forgetInstallTokenForTest();
} catch (error) { primaryError = error; }
finally {
  const errors = primaryError === undefined ? [] : [primaryError];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try {
    const resolved = fs.realpathSync(temporaryRoot);
    const temp = fs.realpathSync(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temp) || !path.basename(resolved).startsWith('doculight-issue60-product-')) throw new Error('refusing cleanup outside owned temp root');
    removeTree(resolved); fs.rmdirSync(resolved);
  } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, 'isolated product run and cleanup failed');
}
