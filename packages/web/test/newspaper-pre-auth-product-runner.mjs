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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

async function runChild(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  if (status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${status}`);
}

function removeFilesFirst(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removeFilesFirst(target);
      fs.rmdirSync(target);
    } else if (entry.isFile()) {
      fs.unlinkSync(target);
    } else {
      throw new Error(`unexpected temporary entry: ${target}`);
    }
  }
}

run(process.execPath, [npmCli, 'run', 'build', '--workspace', '@doculight/server']);
run(process.execPath, [npmCli, 'run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue59-product-'));
let runtime;
let server;
let primaryError;
try {
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
  ]);
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({
      docsRoot: path.join(temporaryRoot, 'docs'),
      databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'),
    });
  } finally {
    console.log = originalLog;
  }
  runtime.stores.announce = () => undefined;
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('owned product server has no TCP address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = `issue59-${randomUUID()}`;
  const password = `Issue59-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession: verified.installSession,
      superuserName: username,
      password,
      workspaceName: 'Issue59 isolated product check',
      defaultGroupLevel: 'view',
      signupMode: 'approval',
    }),
  });
  if (!installed.ok) throw new Error(`isolated install failed: ${installed.status}`);
  await runChild(process.execPath, [path.join(webRoot, 'test/newspaper-pre-auth-product-check.mjs')], {
    cwd: webRoot,
    env: { ...process.env, WEB_URL: origin, DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password },
  });
  forgetInstallTokenForTest();
} catch (error) {
  primaryError = error;
} finally {
  const cleanupErrors = primaryError === undefined ? [] : [primaryError];
  if (server) {
    try {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (runtime) {
    try {
      await runtime.close();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const resolvedTemporaryRoot = fs.realpathSync(temporaryRoot);
    if (!resolvedTemporaryRoot.startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) {
      throw new Error('refusing cleanup outside system temp');
    }
    removeFilesFirst(resolvedTemporaryRoot);
    fs.rmdirSync(resolvedTemporaryRoot);
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length > 0) {
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    throw new AggregateError(cleanupErrors, 'isolated product run and cleanup failed');
  }
}
