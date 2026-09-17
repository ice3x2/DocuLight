import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve('../../../../..');
const serverDir = join(root, 'packages/server');
const webDir = join(root, 'packages/web');
const dataDir = await mkdtemp(join(tmpdir(), 'doculight-issue57-'));
let server;
let web;
const waitFor = async (url) => { for (let index = 0; index < 120; index += 1) { try { await fetch(url); return; } catch {} await new Promise((resolveWait) => setTimeout(resolveWait, 250)); } throw new Error(`fixture did not start: ${url}`); };
const stop = (child) => new Promise((resolveStop) => { if (!child || child.exitCode !== null) return resolveStop(); child.once('exit', resolveStop); child.kill(); });
const startServer = async () => { const child = spawn(process.execPath, ['--env-file=.env.development', 'dist/main.js'], { cwd: serverDir, env: { ...process.env, DOCULIGHT_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); child.stdout.resume(); child.stderr.resume(); await waitFor('http://127.0.0.1:3400/api/auth/me'); return child; };

try {
  let output = '';
  server = spawn(process.execPath, ['--env-file=.env.development', 'dist/main.js'], { cwd: serverDir, env: { ...process.env, DOCULIGHT_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.setEncoding('utf8'); server.stderr.setEncoding('utf8'); server.stdout.on('data', (chunk) => { output += chunk; }); server.stderr.on('data', (chunk) => { output += chunk; });
  await waitFor('http://127.0.0.1:3400/api/install/status');
  for (let index = 0; index < 60 && !/설치 토큰:\s*(\S+)/.test(output); index += 1) await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  const token = /설치 토큰:\s*(\S+)/.exec(output)?.[1]; if (!token) throw new Error('fixture install token was not emitted');
  const verified = await fetch('http://127.0.0.1:3400/api/install/verify-token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  const { installSession } = await verified.json(); const suffix = Date.now(); const user = `issue57-${suffix}`; const password = `Issue57-${suffix}-pass`;
  const installed = await fetch('http://127.0.0.1:3400/api/install/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession, superuserName: user, password, workspaceName: 'Issue 57 fixture', defaultGroupLevel: 'view', signupMode: 'approval' }) });
  if (!installed.ok) throw new Error(`fixture install failed: ${installed.status}`);
  await stop(server); server = await startServer();
  web = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3399', '--strictPort'], { cwd: webDir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); web.stdout.resume(); web.stderr.resume(); await waitFor('http://127.0.0.1:3399/');
  const scripts = ['test/merge-view-check.mjs', 'test/conflict-rescue-product-check.mjs', 'test/ime-composition-check.mjs'];
  for (const script of scripts) {
    const check = spawn(process.execPath, [script], { cwd: webDir, env: { ...process.env, DOCULIGHT_E2E_USER: user, DOCULIGHT_E2E_PASS: password }, stdio: 'inherit', windowsHide: true });
    const exitCode = await new Promise((resolveExit) => check.once('exit', resolveExit));
    if (exitCode !== 0) { process.exitCode = exitCode ?? 1; break; }
  }
} finally { await Promise.all([stop(web), stop(server)]); await rm(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }); }
