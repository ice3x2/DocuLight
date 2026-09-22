import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');

function run(args) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
}

function runChild(file, env) {
  return new Promise((resolve, reject) => {
    const handle = spawn(process.execPath, [file], { cwd: webRoot, stdio: 'inherit', env });
    handle.once('error', reject);
    handle.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
  });
}

run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue71-product-'));
const stagedOutput = path.join(temporaryRoot, 'closure-remediation');
const publishedOutput = process.env.DOCULIGHT_ISSUE71_OUTPUT_DIR
  ? path.resolve(process.env.DOCULIGHT_ISSUE71_OUTPUT_DIR)
  : path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue71/closure-remediation');
let runtime;
let server;
let primary;
try {
  fs.mkdirSync(stagedOutput, { recursive: true });
  const captureRaw = (name, command, args) => {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
    fs.writeFileSync(path.join(stagedOutput, name), `COMMAND=${[command,...args].join(' ')}\nEXIT_CODE=${result.status}\n--- STDOUT ---\n${result.stdout??''}\n--- STDERR ---\n${result.stderr??''}`);
    if (result.status !== 0) throw new Error(`${name} exited ${result.status}`);
  };
  if (fs.existsSync(publishedOutput)) for (const name of fs.readdirSync(publishedOutput).filter((entry) => /^red-.*\.txt$/.test(entry))) {
    fs.copyFileSync(path.join(publishedOutput, name), path.join(stagedOutput, name));
  }
  captureRaw('green-closure-contract.txt', process.execPath, [npmCli,'test','--workspace','@doculight/web','--','--run','test/issue71-closure-audit-contract.test.ts']);
  captureRaw('focused-71-87-88.txt', process.execPath, [npmCli,'test','--workspace','@doculight/web','--','--run','test/issue71-closure-audit-contract.test.ts','test/issue71-instance-settings.test.tsx','test/issue87-retention-impact.test.tsx','test/issue88-settings-leave-guard.test.tsx','test/issue88-settings-leave-coordinator.test.tsx']);
  captureRaw('full-web.txt', process.execPath, [npmCli,'test','--workspace','@doculight/web','--','--run']);
  captureRaw('typecheck-web.txt', process.execPath, [npmCli,'run','typecheck','--workspace','@doculight/web']);
  const shell = process.env.ComSpec ?? 'cmd.exe';
  captureRaw('speckiwi-validate.json', shell, ['/d','/s','/c','speckiwi validate --json']);
  captureRaw('speckiwi-summary.json', shell, ['/d','/s','/c','speckiwi summary --target phase-1 --json']);
  captureRaw('speckiwi-links.json', shell, ['/d','/s','/c','speckiwi links check --json']);
  const [{ bootstrap, startServer }, { mintInstallToken, forgetInstallTokenForTest }, accounts, workspace, permission] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/app/workspace/create-workspace.js'),
    import('../../server/dist/app/acl/permission-service.js'),
  ]);
  const original = console.log;
  try {
    console.log = () => undefined;
    runtime = await bootstrap({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db') });
  } finally {
    console.log = original;
  }
  runtime.stores.announce = () => undefined;
  const token = mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot: path.join(temporaryRoot, 'docs'), databaseFile: path.join(temporaryRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no address');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })).json();
  const username = `issue71-${randomUUID()}`;
  const password = `Issue71-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue71 product', defaultGroupLevel: 'none', signupMode: 'approval' }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const installation = await installed.json();
  const ordinaryName = `issue71-ordinary-${randomUUID()}`;
  const ordinaryPassword = `Issue71-ordinary-${randomUUID()}`;
  const managerName = `issue71-manager-${randomUUID()}`;
  const managerPassword = `Issue71-manager-${randomUUID()}`;
  const authoritativeBefore = runtime.stores.settings.get('signup-mode');
  const ordinary = await accounts.registerAccount(runtime.stores, { name: ordinaryName, password: ordinaryPassword, status: 'active' });
  const manager = await accounts.registerAccount(runtime.stores, { name: managerName, password: managerPassword, status: 'active' });
  if (!ordinary.ok || !manager.ok) throw new Error('role fixture creation failed');
  const actor = permission.actorFor(runtime.stores.principals, installation.superuserId);
  const managed = await workspace.createWorkspaceAs(runtime.stores, actor, { name: 'Issue71 managed', administratorId: manager.id, defaultGroupLevel: 'none' });
  if (!managed.ok) throw new Error('workspace administrator fixture failed');
  for (let index = 0; index < 1_200; index += 1) {
    runtime.stores.audit.append({ operation: 'issue71.composition-impact', actor: installation.superuserId, beforeValue: `${index}`, afterValue: `${index + 1}` });
  }
  runtime.stores.metadata.run(
    'UPDATE audit_log SET occurred_at = ? WHERE operation = ?',
    ['2000-01-01 00:00:00', 'issue71.composition-impact'],
  );
  await runChild(path.join(webRoot, 'test/issue71-instance-settings-product-check.mjs'), {
    ...process.env,
    WEB_URL: origin,
    DOCULIGHT_E2E_USER: username,
    DOCULIGHT_E2E_PASS: password,
    DOCULIGHT_E2E_ORDINARY: ordinaryName,
    DOCULIGHT_E2E_ORDINARY_PASS: ordinaryPassword,
    DOCULIGHT_E2E_MANAGER: managerName,
    DOCULIGHT_E2E_MANAGER_PASS: managerPassword,
    DOCULIGHT_ISSUE71_OUTPUT_DIR: stagedOutput,
    DOCULIGHT_ISSUE71_BROWSER_ROOT: path.join(temporaryRoot, 'browser'),
  });
  const authoritativeAfter = runtime.stores.settings.get('signup-mode');
  if (authoritativeAfter !== authoritativeBefore) throw new Error(`unauthorized valid-key PUT changed authoritative DB: ${authoritativeBefore} -> ${authoritativeAfter}`);
  fs.rmSync(publishedOutput, { recursive: true, force: true });
  fs.mkdirSync(publishedOutput, { recursive: true });
  for (const name of fs.readdirSync(stagedOutput).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    fs.cpSync(path.join(stagedOutput, name), path.join(publishedOutput, name), { recursive: true });
  }
  const files = fs.readdirSync(publishedOutput).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))).map((name) => ({
    path: name,
    sha256: createHash('sha256').update(fs.readFileSync(path.join(publishedOutput, name))).digest('hex'),
  }));
  const sourcePaths = ['packages/web/src/settings/InstanceSettings.tsx','packages/web/src/confirm/ConfirmGate.tsx','packages/web/src/shell/AppShell.tsx','packages/web/src/styles/shell.css','packages/web/test/issue71-closure-audit-contract.test.ts','packages/web/test/issue71-instance-settings-product-check.mjs','packages/web/test/issue71-instance-settings-product-runner.mjs','packages/web/test/issue88-settings-leave-guard.test.tsx'];
  const sources = sourcePaths.map((relative) => ({ path: relative, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex') }));
  const bundles = fs.readdirSync(path.join(webRoot, 'dist/assets')).filter((name) => /^index-.*\.(js|css)$/.test(name)).sort().map((name) => ({ path: `packages/web/dist/assets/${name}`, sha256: createHash('sha256').update(fs.readFileSync(path.join(webRoot, 'dist/assets', name))).digest('hex') }));
  const temporaryManifest = path.join(publishedOutput, `.capture-manifest.json.tmp-${randomUUID()}`);
  const rawCommands = files.filter((file) => /(?:red|green|focused|full|typecheck|speckiwi)/.test(file.path));
  fs.writeFileSync(temporaryManifest, JSON.stringify({ head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sources, bundles, files, rawCommands, authoritativeDenial: { key: 'signup-mode', before: authoritativeBefore, after: authoritativeAfter, unchanged: authoritativeBefore === authoritativeAfter }, commands: [{ command: 'npm run test:browser:issue71-product --workspace @doculight/web', exitCode: 0 }], manifestLast: true }, null, 2), { flag: 'wx' });
  fs.renameSync(temporaryManifest, path.join(publishedOutput, 'capture-manifest.json'));
  forgetInstallTokenForTest();
} catch (error) {
  primary = error;
} finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  try { fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
