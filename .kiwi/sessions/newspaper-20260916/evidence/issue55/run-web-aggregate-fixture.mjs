import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('../../../../..');
const serverDir = join(root, 'packages/server');
const webDir = join(root, 'packages/web');
const dataDir = await mkdtemp(join(tmpdir(), 'doculight-issue55-'));
const logPath = join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue55/final-web-browser-remaining-fixture.txt');
let server;
let web;

const waitFor = async (url) => {
  for (let index = 0; index < 120; index += 1) {
    try { await fetch(url); return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`fixture did not start: ${url}`);
};

const stop = (child) => new Promise((resolveStop) => {
  if (!child || child.exitCode !== null) return resolveStop();
  child.once('exit', resolveStop);
  child.kill();
});

const startInstalledServer = async () => {
  const child = spawn(process.execPath, ['--env-file=.env.development', 'dist/main.js'], {
    cwd: serverDir,
    env: { ...process.env, DOCULIGHT_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.resume();
  child.stderr.resume();
  await waitFor('http://localhost:3400/api/auth/me');
  return child;
};

try {
  let serverOutput = '';
  server = spawn(process.execPath, ['--env-file=.env.development', 'dist/main.js'], {
    cwd: serverDir,
    env: { ...process.env, DOCULIGHT_DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.stdout.setEncoding('utf8');
  server.stderr.setEncoding('utf8');
  server.stdout.on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.on('data', (chunk) => { serverOutput += chunk; });
  try {
    await waitFor('http://localhost:3400/api/install/status');
  } catch (error) {
    const safeOutput = serverOutput.replace(/설치 토큰:\s*\S+/g, '설치 토큰: [redacted]');
    throw new Error(`${error.message}\n${safeOutput.slice(-1500)}`);
  }
  for (let index = 0; index < 40 && !/설치 토큰:\s*(\S+)/.test(serverOutput); index += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  const token = /설치 토큰:\s*(\S+)/.exec(serverOutput)?.[1];
  if (!token) throw new Error('fixture install token was not emitted');

  const verified = await fetch('http://localhost:3400/api/install/verify-token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  });
  const { installSession } = await verified.json();
  const suffix = `${Date.now()}`;
  const user = `issue55-${suffix}`;
  const password = `Issue55-${suffix}-pass`;
  const installed = await fetch('http://localhost:3400/api/install/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installSession,
      superuserName: user,
      password,
      workspaceName: 'Issue 55 fixture',
      defaultGroupLevel: 'view',
      signupMode: 'approval',
    }),
  });
  if (!installed.ok) throw new Error(`fixture install failed: ${installed.status}`);

  web = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3399', '--strictPort'], {
    cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  web.stdout.resume();
  web.stderr.resume();
  await waitFor('http://127.0.0.1:3399/');

  let output = '';
  let exitCode = 0;
  let anyFailure = false;
  const scripts = ['search', 'merge', 'styles', 'theme', 'acl', 'trash', 'gestures'];
  for (const script of scripts) {
    await stop(server);
    server = await startInstalledServer();
    const check = spawn('npm', ['run', `test:browser:${script}`], {
      cwd: webDir,
      env: { ...process.env, DOCULIGHT_E2E_USER: user, DOCULIGHT_E2E_PASS: password },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    check.stdout.setEncoding('utf8');
    check.stderr.setEncoding('utf8');
    check.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
    check.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk); });
    exitCode = await new Promise((resolveExit) => check.once('exit', resolveExit)) ?? 1;
    if (exitCode !== 0) anyFailure = true;
  }
  await writeFile(logPath, output, 'utf8');
  if (anyFailure) process.exitCode = 1;
} finally {
  await Promise.all([stop(web), stop(server)]);
  await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
