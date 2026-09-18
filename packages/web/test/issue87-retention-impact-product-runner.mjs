import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForOwnedChildAfterInvariant } from './issue87-owned-child-grace.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('run through npm');
const run = (args) => {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
};
function treeIdentity(at) {
  const result = {};
  const visit = (current, relative = '') => {
    result[relative === '' ? './' : `${relative}/`] = 'directory';
    for (const name of fs.readdirSync(current).sort()) {
      const full = path.join(current, name);
      const child = relative === '' ? name : `${relative}/${name}`;
      const info = fs.lstatSync(full);
      if (info.isSymbolicLink()) result[child] = `symlink:${fs.readlinkSync(full)}`;
      else if (info.isDirectory()) visit(full, child);
      else result[child] = `file:${createHash('sha256').update(fs.readFileSync(full)).digest('hex')}`;
    }
  };
  visit(at);
  return result;
}
function databaseIdentity(openDatabase, at) {
  const database = openDatabase(at);
  try {
    const tables = database.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return Object.fromEntries(tables.map(({ name }) => [name, database.all(`SELECT * FROM "${name}" ORDER BY rowid`)]));
  } finally { database.close(); }
}
run(['run', 'build', '--workspace', '@doculight/server']);
run(['run', 'build', '--workspace', '@doculight/web']);
console.log(`ISSUE87_RED_SENTINEL ${JSON.stringify({ type: 'builds-complete', server: true, web: true })}`);

const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue87-product-'));
const outputRoot = process.env.DOCULIGHT_ISSUE87_OUTPUT_DIR === undefined
  ? path.join(isolatedRoot, 'browser-output')
  : path.resolve(process.env.DOCULIGHT_ISSUE87_OUTPUT_DIR);
fs.mkdirSync(outputRoot, { recursive: true });
let runtime; let server; let checkerChild; let primary; let expectedRedObserved = false;
try {
  const [{ bootstrap, startServer }, install, accounts, groups, database] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
    import('../../server/dist/domain/principal/system-groups.js'),
    import('../../server/dist/infra/sqlite/database.js'),
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
  const username = `issue87-primary-${randomUUID()}`;
  const password = `Issue87-${randomUUID()}`;
  const secondName = `issue87-second-${randomUUID()}`;
  const secondPassword = `Issue87-second-${randomUUID()}`;
  const installed = await fetch(new URL('/api/install/commit', origin), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ installSession: verified.installSession, superuserName: username, password, workspaceName: 'Issue87 isolated', defaultGroupLevel: 'none', signupMode: 'approval' }),
  });
  if (!installed.ok) throw new Error(`install ${installed.status}`);
  const second = await accounts.registerAccount(runtime.stores, { name: secondName, password: secondPassword, status: 'active' });
  if (!second.ok) throw new Error('second actor fixture failed');
  runtime.stores.principals.addMember(groups.SUPERUSER_GROUP_ID, second.id);
  for (let index = 0; index < 1200; index += 1) {
    runtime.stores.audit.append({
      operation: 'issue87.long-impact-fixture', actor: second.id,
      beforeValue: `secret-before-${index}`, afterValue: `secret-after-${index}`,
    });
  }
  const workspace = runtime.stores.workspaces.list()[0];
  if (!workspace) throw new Error('fixture workspace missing');
  const trashRoot = runtime.stores.nodes.create({ workspaceId: workspace.id, parentId: null, kind: 'directory', name: 'issue87-trash-target' });
  const nestedDirectory = runtime.stores.nodes.create({ workspaceId: workspace.id, parentId: trashRoot, kind: 'directory', name: 'directory' });
  const targetFile = runtime.stores.nodes.create({ workspaceId: workspace.id, parentId: nestedDirectory, kind: 'file', name: 'target-file.md' });
  const expired = '2020-01-01T00:00:00.000Z';
  const rootEntry = { nodeId: trashRoot, workspaceId: workspace.id, originalPath: 'issue87-trash-target', deletedAt: expired, deletedBy: second.id };
  runtime.stores.trash.add(rootEntry);
  const trashedTopologyRoot = path.join(isolatedRoot, 'vault', workspace.id, '.trash', trashRoot, 'issue87-trash-target');
  const topologyDirectory = path.join(trashedTopologyRoot, 'directory');
  fs.mkdirSync(topologyDirectory, { recursive: true });
  fs.writeFileSync(path.join(isolatedRoot, 'vault', workspace.id, '.trash', trashRoot, '.trash.json'), JSON.stringify(rootEntry, null, 2));
  fs.writeFileSync(path.join(topologyDirectory, 'target-file.md'), '# retention target\nsecret topology body');
  fs.symlinkSync(path.join(trashedTopologyRoot, 'directory'), path.join(trashedTopologyRoot, 'directory-link'), 'junction');
  const overlapEntry = { nodeId: targetFile, workspaceId: workspace.id, originalPath: 'issue87-trash-target/directory/target-file.md', deletedAt: expired, deletedBy: second.id };
  runtime.stores.trash.add(overlapEntry);
  const overlapSidecar = path.join(isolatedRoot, 'vault', workspace.id, '.trash', targetFile);
  fs.mkdirSync(overlapSidecar, { recursive: true });
  fs.writeFileSync(path.join(overlapSidecar, '.trash.json'), JSON.stringify(overlapEntry, null, 2));
  const vaultIdentityAfterFixture = treeIdentity(path.join(isolatedRoot, 'vault'));
  console.log(`ISSUE87_RED_SENTINEL ${JSON.stringify({ type: 'fixture-complete', server: true, database: true, vault: true })}`);
  let previewDatabaseBefore;
  let previewVaultBefore;

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue87-retention-impact-product-check.mjs')], {
      cwd: webRoot,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env, WEB_URL: origin,
        DOCULIGHT_E2E_USER: username, DOCULIGHT_E2E_PASS: password,
        DOCULIGHT_E2E_SECOND: secondName, DOCULIGHT_E2E_SECOND_PASS: secondPassword,
        DOCULIGHT_ISSUE87_PROFILE_ROOT: path.join(isolatedRoot, 'profiles'),
        DOCULIGHT_ISSUE87_OUTPUT_DIR: outputRoot,
      },
    });
    checkerChild = child;
    let settled = false;
    let invariantFailure;
    const timeout = setTimeout(() => {
      finish(new Error('issue87 checker timed out after 120000ms'));
      if (child.exitCode === null) child.kill();
    }, 120_000);
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error === undefined) resolve();
      else reject(error);
    };
    const respond = (message) => new Promise((resolveSend, rejectSend) => {
      if (!child.connected) { rejectSend(new Error('checker IPC disconnected')); return; }
      child.send(message, (error) => error === null ? resolveSend() : rejectSend(error));
    });
    child.on('message', (message) => {
      void (async () => { try {
        if (message?.type === 'preview-start') {
          previewDatabaseBefore = databaseIdentity(database.openDatabase, path.join(isolatedRoot, 'db', 'doculight.db'));
          previewVaultBefore = treeIdentity(path.join(isolatedRoot, 'vault'));
          await respond({ type: 'preview-start-ok', ok: true });
        }
        if (message?.type === 'preview-complete') {
          const afterDatabase = databaseIdentity(database.openDatabase, path.join(isolatedRoot, 'db', 'doculight.db'));
          const afterVault = treeIdentity(path.join(isolatedRoot, 'vault'));
          if (JSON.stringify(afterDatabase) !== JSON.stringify(previewDatabaseBefore)) throw new Error('preview mutated authoritative database tables');
          if (JSON.stringify(afterVault) !== JSON.stringify(previewVaultBefore)) throw new Error('preview mutated vault topology');
          await respond({ type: 'preview-complete-ok', ok: true });
        }
      } catch (error) {
        invariantFailure = error;
        try { await respond({ type: `${message?.type ?? 'unknown'}-ok`, ok: false, error: String(error) }); }
        catch { /* the original IPC/verification failure remains authoritative */ }
        try { await waitForOwnedChildAfterInvariant(child, error); }
        catch (preserved) { finish(preserved); }
      } })();
    });
    child.once('error', finish);
    child.once('exit', (code, signal) => {
      if (invariantFailure !== undefined) return;
      if (code === 87 && signal === null) {
        expectedRedObserved = true;
        console.log(`ISSUE87_RED_SENTINEL ${JSON.stringify({ type: 'browser-red-complete', checkerExitCode: 87 })}`);
        finish();
      } else if (code === 0) finish();
      else finish(new Error(`issue87 checker exited ${code ?? 'null'} signal ${signal ?? 'none'}`));
    });
  });
  if (JSON.stringify(treeIdentity(path.join(isolatedRoot, 'vault'))) !== JSON.stringify(vaultIdentityAfterFixture)) {
    throw new Error('retention preview/save mutated the fixture vault filesystem tree');
  }
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (checkerChild?.exitCode === null && checkerChild?.signalCode === null) {
    try {
      const exited = new Promise((resolve) => checkerChild.once('exit', resolve));
      checkerChild.kill();
      await Promise.race([
        exited,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`owned checker PID ${checkerChild.pid} did not exit`)), 5_000)),
      ]);
    } catch (error) { errors.push(error); }
  }
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(isolatedRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors);
}
if (expectedRedObserved) process.exitCode = 1;
