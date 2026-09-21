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
for (const workspace of ['@doculight/server', '@doculight/web']) {
  const built = spawnSync(process.execPath, [npmCli, 'run', 'build', '--workspace', workspace], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) throw new Error(`${workspace} build exited ${built.status}`);
}

const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue81-product-'));
const docsRoot = path.join(runRoot, 'vault');
const databaseFile = path.join(runRoot, 'database', 'doculight.db');
const browserRoot = path.join(runRoot, 'browser');
const outputRoot = process.env.DOCULIGHT_ISSUE81_STAGING || path.join(runRoot, 'reports');
let runtime; let server; let primary;
try {
  const [{ bootstrap, startServer }, install, accounts] = await Promise.all([
    import('../../server/dist/main.js'),
    import('../../server/dist/app/install/install-service.js'),
    import('../../server/dist/app/auth/account-service.js'),
  ]);
  const originalLog = console.log;
  try { console.log = () => undefined; runtime = await bootstrap({ docsRoot, databaseFile }); }
  finally { console.log = originalLog; }
  runtime.stores.announce = () => undefined;
  const installToken = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = startServer({ docsRoot, databaseFile, port: 0, trustProxyHops: 0 }, runtime);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('owned port missing');
  const origin = `http://127.0.0.1:${address.port}/`;
  const verification = await fetch(new URL('/api/install/verify-token', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: installToken }) });
  const verified = await verification.json();
  const suffix = randomUUID();
  const credentials = {
    superuser: { name: `issue81-super-${suffix}`, password: `Issue81-Super-${suffix}` },
    ordinary: { name: `issue81-ordinary-${suffix}`, password: `Issue81-Ordinary-${suffix}` },
    manager: { name: `issue81-manager-${suffix}`, password: `Issue81-Manager-${suffix}` },
  };
  const committed = await fetch(new URL('/api/install/commit', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: credentials.superuser.name, password: credentials.superuser.password, workspaceName: 'Issue 81 workspace', defaultGroupLevel: 'none', signupMode: 'approval' }) });
  if (!committed.ok) throw new Error(`install ${committed.status}`);
  const installed = await committed.json();
  const make = async (name, status = 'active', password = `Issue81-Fixture-${randomUUID()}`) => {
    const result = await accounts.registerAccount(runtime.stores, { name, password, status });
    if (!result.ok) throw new Error(`fixture ${name}`);
    return result;
  };
  const ordinary = await make(credentials.ordinary.name, 'active', credentials.ordinary.password);
  const manager = await make(credentials.manager.name, 'active', credentials.manager.password);
  runtime.stores.acl.grant({ nodeId: installed.workspaceId, principalId: manager.id, level: 'admin', grantedBy: null });
  const group = runtime.stores.principals.createGroup(`Issue81 매우 긴 한국어 기획 협업 그룹 이름 ${'문서 접근성 검증 '.repeat(4)}${suffix}`);
  const existing = await make(`Issue81 같은이름 기존 ${suffix}`);
  const candidate = await make(`Issue81 같은이름 후보 ${suffix}`);
  const stateCandidates = [];
  for (let index = 0; index < 22; index += 1) stateCandidates.push(await make(`Issue81 상태보존 ${String(index).padStart(2, '0')} ${suffix}`));
  const focusCandidate = stateCandidates[0];
  const uncertain = await make(`Issue81 불명확 ${suffix}`);
  const stale = await make(`Issue81 지연 ${suffix}`);
  const rejected = await make(`Issue81 거절 ${suffix}`, 'rejected');
  runtime.stores.principals.addMember(group.id, existing.id);
  for (let index = 0; index < 24; index += 1) {
    const member = await make(`Issue81 긴 멤버 ${String(index).padStart(2, '0')} ${'이름 '.repeat(3)}${suffix}`);
    runtime.stores.principals.addMember(group.id, member.id);
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(webRoot, 'test/issue81-group-product-check.mjs')], { cwd: webRoot, stdio: 'inherit', env: {
      ...process.env, WEB_URL: origin, DOCULIGHT_ISSUE81_BROWSER_ROOT: browserRoot, DOCULIGHT_ISSUE81_OUTPUT: outputRoot,
      DOCULIGHT_ISSUE81_SUPER_NAME: credentials.superuser.name, DOCULIGHT_ISSUE81_SUPER_PASS: credentials.superuser.password,
      DOCULIGHT_ISSUE81_ORDINARY_NAME: credentials.ordinary.name, DOCULIGHT_ISSUE81_ORDINARY_PASS: credentials.ordinary.password,
      DOCULIGHT_ISSUE81_MANAGER_NAME: credentials.manager.name, DOCULIGHT_ISSUE81_MANAGER_PASS: credentials.manager.password,
      DOCULIGHT_ISSUE81_GROUP_ID: group.id, DOCULIGHT_ISSUE81_GROUP_NAME: group.name,
      DOCULIGHT_ISSUE81_EXISTING_ID: existing.id, DOCULIGHT_ISSUE81_CANDIDATE_ID: candidate.id,
      DOCULIGHT_ISSUE81_FOCUS_ID: focusCandidate.id,
      DOCULIGHT_ISSUE81_FIRST_RESULT_ID: stateCandidates[0].id,
      DOCULIGHT_ISSUE81_LAST_RESULT_ID: stateCandidates[19].id,
      DOCULIGHT_ISSUE81_UNCERTAIN_ID: uncertain.id, DOCULIGHT_ISSUE81_STALE_ID: stale.id, DOCULIGHT_ISSUE81_REJECTED_ID: rejected.id,
    } });
    child.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`checker ${code}`)));
  });
  if (!runtime.stores.principals.membersOf(group.id).includes(candidate.id)) throw new Error('accepted member was not persisted');
  install.forgetInstallTokenForTest();
} catch (error) { primary = error; }
finally {
  const errors = primary === undefined ? [] : [primary];
  if (server) try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); } catch (error) { errors.push(error); }
  if (runtime) try { await runtime.close(); } catch (error) { errors.push(error); }
  try { fs.rmSync(runRoot, { recursive: true, force: true }); } catch (error) { errors.push(error); }
  if (errors.length === 1) throw errors[0]; if (errors.length > 1) throw new AggregateError(errors);
}
