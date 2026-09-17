import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BetterSqlite3 from 'better-sqlite3';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(evidenceDir, '../../../../..');
const databaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue62-auth-'));
const databaseFile = path.join(databaseRoot, 'db', 'doculight.db');
const docsRoot = path.join(databaseRoot, 'docs');
const outputFile = path.join(evidenceDir, 'green-product-two-user-auth.json');
const checks = [];

const record = (name, actual, expected) => {
  assert.deepEqual(actual, expected, name);
  checks.push({ name, pass: true, actual });
};

const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const cookieOf = (response) => (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

let origin;
const send = (method, requestPath, { body, cookie, bearer } = {}) =>
  fetch(new URL(requestPath, origin), {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie === undefined ? {} : { cookie }),
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const login = async (name, password) => {
  const response = await send('POST', '/api/auth/login', { body: { name, password } });
  return { response, cookie: cookieOf(response) };
};

const issuePat = async (cookie, name) => {
  const response = await send('POST', '/api/auth/tokens', {
    cookie,
    body: { name, scope: 'read-only', expiresInDays: 30 },
  });
  assert.equal(response.status, 201, `PAT issuance failed for ${name}`);
  return response.json();
};

const mcpStatus = async (token) =>
  (await send('POST', '/api/mcp', {
    bearer: token,
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })).status;

const sessionStatus = async (cookie) => (await send('GET', '/api/auth/me', { cookie })).status;

const databaseSnapshot = (firstId, secondId) => {
  const db = new BetterSqlite3(databaseFile, { readonly: true, fileMustExist: true });
  try {
    const sessions = db.prepare('SELECT COUNT(*) AS count FROM session WHERE user_id = ?');
    const pats = db.prepare(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS live,
             SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked
        FROM personal_access_token
       WHERE user_id = ?
    `);
    const revocations = db.prepare(
      "SELECT COUNT(*) AS count FROM audit_log WHERE operation = 'pat.revoke' AND actor = ?",
    );
    const password = db.prepare('SELECT password_hash AS hash FROM principal WHERE id = ?');
    return {
      first: {
        sessions: sessions.get(firstId).count,
        pats: pats.get(firstId),
        patRevokeAuditRows: revocations.get(firstId).count,
      },
      second: {
        sessions: sessions.get(secondId).count,
        pats: pats.get(secondId),
        patRevokeAuditRows: revocations.get(secondId).count,
      },
      passwordHashes: {
        first: password.get(firstId).hash,
        second: password.get(secondId).hash,
      },
    };
  } finally {
    db.close();
  }
};

let runtime;
let server;
let forgetInstallTokenForTest;
let primaryError;
const result = {
  generatedAt: new Date().toISOString(),
  execution: {
    productAssembly: 'packages/server/dist/main.js serving packages/web/dist and /api on one origin',
    processOwnership: 'in-process owned HTTP server, ephemeral port, orderly server.close()',
    database: 'temporary SQLite database created for this run and deleted after verification',
    secrets: 'generated credentials, cookies, PAT plaintext, and password hashes are omitted',
  },
  artifacts: {
    serverMainSha256: sha256(path.join(root, 'packages/server/dist/main.js')),
    webIndexSha256: sha256(path.join(root, 'packages/web/dist/index.html')),
    harnessSha256: sha256(fileURLToPath(import.meta.url)),
  },
  checks,
};

try {
  const main = await import('../../../../../packages/server/dist/main.js');
  const install = await import('../../../../../packages/server/dist/app/install/install-service.js');
  forgetInstallTokenForTest = install.forgetInstallTokenForTest;

  const originalLog = console.log;
  try {
    console.log = () => undefined;
    runtime = await main.bootstrap({ docsRoot, databaseFile });
  } finally {
    console.log = originalLog;
  }
  runtime.stores.announce = () => undefined;
  const installToken = install.mintInstallToken({ ...runtime.stores, announce: () => undefined });
  server = main.startServer(
    { docsRoot, databaseFile, port: 0, trustProxyHops: 0 },
    runtime,
  );
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(typeof address === 'object' && address !== null, 'owned server has no TCP address');
  origin = `http://127.0.0.1:${address.port}/`;

  const verified = await send('POST', '/api/install/verify-token', { body: { token: installToken } });
  record('install token is accepted by the built product', verified.status, 200);
  const installSession = (await verified.json()).installSession;

  const suffix = randomUUID();
  const admin = { name: `issue62-admin-${suffix}`, password: `Admin-${randomUUID()}` };
  const first = {
    name: `issue62-first-${suffix}`,
    oldPassword: `First-old-${randomUUID()}`,
    newPassword: `First-new-${randomUUID()}`,
  };
  const second = { name: `issue62-second-${suffix}`, password: `Second-${randomUUID()}` };

  const installed = await send('POST', '/api/install/commit', {
    body: {
      installSession,
      superuserName: admin.name,
      password: admin.password,
      workspaceName: 'Issue 62 isolated auth evidence',
      defaultGroupLevel: 'view',
      signupMode: 'approval',
    },
  });
  record('isolated product install succeeds', installed.status, 200);

  const shell = await send('GET', '/');
  const shellText = await shell.text();
  record('built SPA shell is served by the installed product process', shell.status, 200);
  record('built SPA shell contains the React mount', shellText.includes('id="root"'), true);

  const adminLogin = await login(admin.name, admin.password);
  record('setup superuser login succeeds', adminLogin.response.status, 200);

  const firstCreated = await send('POST', '/api/roster/users', {
    cookie: adminLogin.cookie,
    body: { name: first.name, password: first.oldPassword },
  });
  const secondCreated = await send('POST', '/api/roster/users', {
    cookie: adminLogin.cookie,
    body: { name: second.name, password: second.password },
  });
  record('first real user is created through the product API', firstCreated.status, 201);
  record('second real user is created through the product API', secondCreated.status, 201);
  const firstId = (await firstCreated.json()).id;
  const secondId = (await secondCreated.json()).id;

  const firstSession1 = await login(first.name, first.oldPassword);
  const firstSession2 = await login(first.name, first.oldPassword);
  const secondSession = await login(second.name, second.password);
  record('first user session one login succeeds', firstSession1.response.status, 200);
  record('first user session two login succeeds', firstSession2.response.status, 200);
  record('second user session login succeeds', secondSession.response.status, 200);

  const firstPat1 = await issuePat(firstSession1.cookie, 'first-one');
  const firstPat2 = await issuePat(firstSession2.cookie, 'first-two');
  const secondPat = await issuePat(secondSession.cookie, 'second-one');
  record('first user PAT one authenticates before change', await mcpStatus(firstPat1.token), 200);
  record('first user PAT two authenticates before change', await mcpStatus(firstPat2.token), 200);
  record('second user PAT authenticates before change', await mcpStatus(secondPat.token), 200);

  const rejectedWrong = await send('POST', '/api/auth/password', {
    cookie: firstSession1.cookie,
    body: { current: 'incorrect-current-password', next: first.newPassword },
  });
  record('wrong current password is rejected', rejectedWrong.status, 400);
  record('wrong current password returns its rule', (await rejectedWrong.json()).rule, 'wrong-password');

  const rejectedEmpty = await send('POST', '/api/auth/password', {
    cookie: firstSession1.cookie,
    body: { current: first.oldPassword, next: '' },
  });
  record('empty new password is rejected', rejectedEmpty.status, 400);
  record('empty new password returns its rule', (await rejectedEmpty.json()).rule, 'empty-password');

  const firstSession3 = await login(first.name, first.oldPassword);
  const prematureNewLogin = await login(first.name, first.newPassword);
  record('old password still works after both rejected changes', firstSession3.response.status, 200);
  record('new password does not work after rejected changes', prematureNewLogin.response.status, 401);
  record('all first-user sessions survive rejected changes', await Promise.all([
    sessionStatus(firstSession1.cookie),
    sessionStatus(firstSession2.cookie),
    sessionStatus(firstSession3.cookie),
  ]), [200, 200, 200]);
  record('first-user PATs survive rejected changes', await Promise.all([
    mcpStatus(firstPat1.token),
    mcpStatus(firstPat2.token),
  ]), [200, 200]);
  record('second-user session and PAT survive rejected changes', [
    await sessionStatus(secondSession.cookie),
    await mcpStatus(secondPat.token),
  ], [200, 200]);

  const before = databaseSnapshot(firstId, secondId);
  record('DB stores three first-user sessions before valid change', before.first.sessions, 3);
  record('DB stores one independent second-user session before valid change', before.second.sessions, 1);
  record('DB has two live first-user PATs before valid change', before.first.pats, { total: 2, live: 2, revoked: 0 });
  record('DB has one live second-user PAT before valid change', before.second.pats, { total: 1, live: 1, revoked: 0 });

  const changed = await send('POST', '/api/auth/password', {
    cookie: firstSession1.cookie,
    body: { current: first.oldPassword, next: first.newPassword },
  });
  record('valid password change succeeds through the product API', changed.status, 204);
  record('successful response expires the current cookie', /expires=|max-age=0/i.test(changed.headers.get('set-cookie') ?? ''), true);

  record('all existing first-user sessions are invalidated', await Promise.all([
    sessionStatus(firstSession1.cookie),
    sessionStatus(firstSession2.cookie),
    sessionStatus(firstSession3.cookie),
  ]), [401, 401, 401]);
  record('all existing first-user PATs are invalidated', await Promise.all([
    mcpStatus(firstPat1.token),
    mcpStatus(firstPat2.token),
  ]), [401, 401]);
  record('second-user session remains valid', await sessionStatus(secondSession.cookie), 200);
  record('second-user PAT remains valid', await mcpStatus(secondPat.token), 200);

  const afterChange = databaseSnapshot(firstId, secondId);
  record('DB has zero first-user sessions immediately after change', afterChange.first.sessions, 0);
  record('DB retains the second-user session after change', afterChange.second.sessions, 1);
  record('DB marks both first-user PAT rows revoked', afterChange.first.pats, { total: 2, live: 0, revoked: 2 });
  record('DB leaves the second-user PAT row live', afterChange.second.pats, { total: 1, live: 1, revoked: 0 });
  record('DB records one revoke audit row per live first-user PAT', afterChange.first.patRevokeAuditRows, 2);
  record('DB records no revoke audit row for the second user', afterChange.second.patRevokeAuditRows, 0);
  record('DB changed only the first user password hash', [
    afterChange.passwordHashes.first !== before.passwordHashes.first,
    afterChange.passwordHashes.second === before.passwordHashes.second,
  ], [true, true]);

  const oldLogin = await login(first.name, first.oldPassword);
  const newLogin = await login(first.name, first.newPassword);
  record('old password no longer authenticates', oldLogin.response.status, 401);
  record('new password authenticates', newLogin.response.status, 200);

  const afterRelogin = databaseSnapshot(firstId, secondId);
  record('DB contains only the new first-user session after re-login', afterRelogin.first.sessions, 1);
  record('DB still contains the independent second-user session', afterRelogin.second.sessions, 1);

  result.summary = {
    passed: checks.length,
    failed: 0,
    firstUser: 'password rotated; three old sessions and two PATs invalidated; new login succeeds',
    secondUser: 'password hash, session, and PAT remain unchanged and valid',
  };
} catch (error) {
  primaryError = error;
  result.summary = { passed: checks.length, failed: 1, error: String(error) };
} finally {
  const cleanupErrors = [];
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
  if (forgetInstallTokenForTest) forgetInstallTokenForTest();

  try {
    const resolvedRoot = fs.realpathSync(databaseRoot);
    const resolvedTemp = fs.realpathSync(os.tmpdir());
    if (!resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`) || !path.basename(resolvedRoot).startsWith('doculight-issue62-auth-')) {
      throw new Error('refusing to remove an unverified directory');
    }
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
    result.execution.cleanupVerified = !fs.existsSync(resolvedRoot);
  } catch (error) {
    cleanupErrors.push(error);
  }

  fs.writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`${primaryError === undefined && cleanupErrors.length === 0 ? 'PASS' : 'FAIL'} ${checks.length} built-product/API/DB checks`);
  console.log(`Evidence: ${outputFile}`);

  if (primaryError !== undefined || cleanupErrors.length > 0) {
    const errors = [primaryError, ...cleanupErrors].filter(Boolean);
    throw errors.length === 1 ? errors[0] : new AggregateError(errors, 'evidence run or cleanup failed');
  }
}
