import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

import { CATEGORY_IDS, REQUIRED_ENVIRONMENTS, ROLE_EXPECTATIONS, validateRoleCategoryEvidence } from './issue77-role-category-validator.mjs';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const tempBase = fs.realpathSync(os.tmpdir());
const requestedOutput = process.env.DOCULIGHT_ISSUE77_ROLE_OUTPUT;
const outputRoot = requestedOutput ? path.resolve(requestedOutput) : fs.mkdtempSync(path.join(tempBase, 'doculight-issue77-role-'));
fs.mkdirSync(outputRoot, { recursive: true });
const resolvedOutput = fs.realpathSync(outputRoot);
assert.equal(resolvedOutput.startsWith(`${tempBase}${path.sep}`), true, 'evidence must remain in a run-owned OS-temp directory');
fs.mkdirSync(path.join(outputRoot, 'screenshots'), { recursive: true });

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const workspace of ['@doculight/server', '@doculight/web']) {
  const built = spawnSync(npm, ['run', 'build', '--workspace', workspace], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (built.status !== 0) throw new Error(`${workspace} build exited ${built.status}`);
}

const [{ bootstrap, startServer }, install, accounts, permissions, grants, groups] = await Promise.all([
  import('../../server/dist/main.js'),
  import('../../server/dist/app/install/install-service.js'),
  import('../../server/dist/app/auth/account-service.js'),
  import('../../server/dist/app/acl/permission-service.js'),
  import('../../server/dist/app/acl/grant-service.js'),
  import('../../server/dist/domain/principal/system-groups.js'),
]);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const runRoot = fs.mkdtempSync(path.join(tempBase, 'doculight-issue77-role-runtime-'));
let mainRuntime;
let mainServer;
let zeroRuntime;
let zeroServer;
let vite;
let context;

const listen = (server) => new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
const closeServer = (server) => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
const makeAccount = async (runtime, prefix) => {
  const name = `issue77-${prefix}-${randomUUID()}`;
  const password = `Issue77-${prefix}-${randomUUID()}`;
  const result = await accounts.registerAccount(runtime.stores, { name, password, status: 'active' });
  if (!result.ok) throw new Error(`${prefix} account fixture failed: ${result.rule}`);
  return { id: result.id, name, password };
};

let primary;
try {
  const originalLog = console.log;
  try {
    console.log = () => undefined;
    mainRuntime = await bootstrap({ docsRoot: path.join(runRoot, 'main-docs'), databaseFile: path.join(runRoot, 'main-db', 'doculight.db') });
  } finally { console.log = originalLog; }
  mainRuntime.stores.announce = () => undefined;
  await mainRuntime.textIndexWorker.stop();
  const token = install.mintInstallToken({ ...mainRuntime.stores, announce: () => undefined });
  mainServer = startServer({ docsRoot: mainRuntime.stores.docsRoot, databaseFile: path.join(runRoot, 'main-db', 'doculight.db'), port: 0, trustProxyHops: 0 }, mainRuntime);
  await listen(mainServer);
  const mainAddress = mainServer.address();
  assert.ok(mainAddress && typeof mainAddress === 'object');
  const mainOrigin = `http://127.0.0.1:${mainAddress.port}/`;
  const verified = await (await fetch(new URL('/api/install/verify-token', mainOrigin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) })).json();
  const ownerName = `issue77-owner-${randomUUID()}`;
  const ownerPassword = `Issue77-owner-${randomUUID()}`;
  const installedResponse = await fetch(new URL('/api/install/commit', mainOrigin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installSession: verified.installSession, superuserName: ownerName, password: ownerPassword, workspaceName: 'Issue 77 role matrix', defaultGroupLevel: 'none', signupMode: 'approval' }) });
  assert.equal(installedResponse.ok, true, `install failed ${installedResponse.status}`);
  const installed = await installedResponse.json();
  const owner = permissions.actorFor(mainRuntime.stores.principals, installed.superuserId);
  const ordinary = await makeAccount(mainRuntime, 'ordinary-zero');
  const viewer = await makeAccount(mainRuntime, 'viewer');
  const editor = await makeAccount(mainRuntime, 'editor');
  const manager = await makeAccount(mainRuntime, 'manager');
  for (const [account, level] of [[viewer, 'view'], [editor, 'edit'], [manager, 'admin']]) {
    const result = grants.grantPermission(mainRuntime.stores, owner, { nodeId: installed.workspaceId, principalId: account.id, level });
    assert.equal(result.ok, true, `${level} grant failed`);
  }

  const zeroRoot = path.join(runRoot, 'zero');
  try {
    console.log = () => undefined;
    zeroRuntime = await bootstrap({ docsRoot: path.join(zeroRoot, 'docs'), databaseFile: path.join(zeroRoot, 'db', 'doculight.db') });
  } finally { console.log = originalLog; }
  zeroRuntime.stores.announce = () => undefined;
  await zeroRuntime.textIndexWorker.stop();
  zeroRuntime.stores.metadata.run('DELETE FROM acl_entry');
  zeroRuntime.stores.metadata.run('DELETE FROM node');
  zeroRuntime.stores.metadata.run('DELETE FROM workspace');
  const zeroSuper = await makeAccount(zeroRuntime, 'superuser-zero');
  zeroRuntime.stores.principals.addMember(groups.SUPERUSER_GROUP_ID, zeroSuper.id);
  zeroServer = startServer({ docsRoot: zeroRuntime.stores.docsRoot, databaseFile: path.join(zeroRoot, 'db', 'doculight.db'), port: 0, trustProxyHops: 0 }, zeroRuntime);
  await listen(zeroServer);
  const zeroAddress = zeroServer.address();
  assert.ok(zeroAddress && typeof zeroAddress === 'object');
  const zeroOrigin = `http://127.0.0.1:${zeroAddress.port}/`;

  vite = await createViteServer({ configFile: false, root: webRoot, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, appType: 'mpa' });
  await vite.listen();
  const viteAddress = vite.httpServer.address();
  assert.ok(viteAddress && typeof viteAddress === 'object');
  const componentUrl = `http://127.0.0.1:${viteAddress.port}/test/issue77-role-category-fixture.html`;

  const extension = path.join(runRoot, 'zoom-extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 77 role matrix zoom', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  context = await chromium.launchPersistentContext(path.join(runRoot, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const browserVersion = await page.evaluate(() => navigator.userAgent);

  const setZoom = async (value) => {
    await worker.evaluate(async ({ target, value }) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
      if (!tab?.id) throw new Error(`owned tab missing for ${target}`);
      await chrome.tabs.setZoom(tab.id, value);
    }, { target: page.url(), value });
    return { operation: 'setZoom', value, result: 'resolved' };
  };
  const getZoom = async () => worker.evaluate(async (target) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error(`owned tab missing for ${target}`);
    return chrome.tabs.getZoom(tab.id);
  }, page.url());
  const zoomTo = async (value) => {
    const set = await setZoom(value);
    const observed = await getZoom();
    assert.equal(observed, value);
    return [set, { operation: 'getZoom', value: null, result: observed }];
  };
  const clearSession = async () => {
    await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)).catch(() => undefined);
    await context.clearCookies();
  };
  const login = async (origin, credentials) => {
    const loginUrl = new URL(origin);
    loginUrl.searchParams.set('issue77RoleNonce', randomUUID());
    await page.goto(loginUrl.href, { waitUntil: 'domcontentloaded' });
    const nameInput = page.locator('input[name="name"]');
    try {
      await nameInput.waitFor({ timeout: 15_000 });
    } catch (error) {
      fs.writeFileSync(path.join(outputRoot, `login-diagnostic-${credentials.name}.html`), await page.content());
      await page.screenshot({ path: path.join(outputRoot, `login-diagnostic-${credentials.name}.png`) });
      throw error;
    }
    await nameInput.fill(credentials.name);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.locator('form').filter({ has: page.locator('input[name="password"]') }).locator('button[type="submit"]').click();
    await page.locator('[data-shell="settings-corner"] button').waitFor({ timeout: 15_000 });
  };
  const roleDefinitions = [
    { role: 'anonymous', origin: mainOrigin, authenticated: false, evidenceClass: 'product' },
    { role: 'ordinary-zero', origin: mainOrigin, authenticated: true, credentials: ordinary, evidenceClass: 'product' },
    { role: 'viewer', origin: mainOrigin, authenticated: true, credentials: viewer, evidenceClass: 'product' },
    { role: 'editor', origin: mainOrigin, authenticated: true, credentials: editor, evidenceClass: 'product' },
    { role: 'manager', origin: mainOrigin, authenticated: true, credentials: manager, evidenceClass: 'product' },
    { role: 'superuser-zero', origin: zeroOrigin, authenticated: true, credentials: zeroSuper, evidenceClass: 'product' },
    { role: 'superuser-viewer', origin: componentUrl, authenticated: false, component: true, evidenceClass: 'production-component' },
    { role: 'superuser-manager', origin: mainOrigin, authenticated: true, credentials: { name: ownerName, password: ownerPassword }, evidenceClass: 'product' },
  ];

  const rows = [];
  const transitions = [];
  const endpointDenials = [];
  const resetChecks = [];
  const systemThemeChecks = [];
  let categoryLabels;
  for (const definition of roleDefinitions) {
    await clearSession();
    if (definition.component) {
      await page.goto(definition.origin, { waitUntil: 'networkidle' });
      await page.locator('[data-shell="settings-corner"] button').waitFor();
    } else if (definition.authenticated) {
      await login(definition.origin, definition.credentials);
    } else {
      await page.goto(definition.origin, { waitUntil: 'domcontentloaded' });
      await page.locator('input[name="password"]').waitFor();
    }

    if (['anonymous', 'ordinary-zero', 'viewer', 'editor'].includes(definition.role)) {
      for (const endpoint of ['/api/audit-log', '/api/reconciliation-queue']) {
        const status = await page.evaluate(async (target) => (await fetch(target)).status, endpoint);
        endpointDenials.push({ role: definition.role, path: endpoint, status });
      }
    }

    await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'none' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const resolvedTheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme.includes('dark') || document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    systemThemeChecks.push(definition.component
      ? { role: definition.role, media: 'prefers-color-scheme: dark', method: 'Playwright emulateMedia; no native OS preference UI', resolvedTheme, verdict: 'N-A', reason: 'controlled production AppShell component fixture does not own theme resolution' }
      : { role: definition.role, media: 'prefers-color-scheme: dark', method: 'Playwright emulateMedia; no native OS preference UI', resolvedTheme, verdict: 'PASS' });

    let transitionFocus = { openedOn: null, closedOn: null };
    for (const environment of REQUIRED_ENVIRONMENTS) {
      await page.setViewportSize({ width: environment.width, height: environment.height });
      await page.emulateMedia({ colorScheme: environment.theme, forcedColors: environment.forcedColors });
      await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, environment.theme);
      const zoomTrace = await zoomTo(environment.zoom / 100);
      const expected = ROLE_EXPECTATIONS[definition.role];
      let categoryIds = [];
      let labels = [];
      let openFocusInside = false;
      let activeCategory = null;
      let navigationReachable = null;
      let closeRestoredToGear = false;
      let horizontalClipping = false;
      if (definition.role !== 'anonymous') {
        const gear = page.locator('[data-shell="settings-corner"] button');
        await gear.evaluate((node) => node.click());
        const dialog = page.locator('[data-settings-dialog]');
        await dialog.waitFor();
        await page.waitForFunction(() => {
          const current = document.querySelector('[data-settings-dialog]');
          return current instanceof HTMLElement && current.contains(document.activeElement);
        });
        const tabs = dialog.locator('[data-settings-category]');
        categoryIds = await tabs.evaluateAll((items) => items.map((item) => item.getAttribute('data-settings-category')));
        labels = await tabs.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label')));
        assert.deepEqual(categoryIds, expected, `${definition.role} exact category IDs`);
        openFocusInside = await dialog.evaluate((node) => node.contains(document.activeElement));
        activeCategory = await dialog.locator('[data-settings-category][data-state="active"]').getAttribute('data-settings-category');
        await tabs.first().focus();
        await page.keyboard.press('End');
        navigationReachable = await tabs.last().evaluate((node) => document.activeElement === node);
        await page.keyboard.press('Home');
        await tabs.first().waitFor();
        const bounds = await dialog.evaluate((node) => {
          const box = node.getBoundingClientRect();
          return { horizontalClipping: box.left < -1 || box.right > innerWidth + 1 };
        });
        horizontalClipping = bounds.horizontalClipping;
        const ariaSnapshot = await dialog.ariaSnapshot();
        const screenshot = `screenshots/${definition.role}-${environment.width}x${environment.height}-${environment.theme}-${environment.zoom}-${environment.forcedColors}.png`;
        const screenshotPath = path.join(outputRoot, screenshot);
        await page.screenshot({ path: screenshotPath });
        await dialog.locator('[aria-label="설정 닫기"]').click();
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '설정');
        closeRestoredToGear = await gear.evaluate((node) => document.activeElement === node);
        transitionFocus = { openedOn: activeCategory, closedOn: closeRestoredToGear ? 'settings-gear' : null };
        rows.push({ role: definition.role, environment, categoryIds, categoryLabels: labels, categoryCount: categoryIds.length, evidenceClass: definition.evidenceClass, sessionProvenance: definition.component ? 'controlled-production-AppShell-viewer-props' : 'owned-server-authenticated-session', settingsShellVisible: true, focus: { activeCategory, openFocusInside, closeRestoredToGear }, geometry: { horizontalClipping, navigationReachable }, ariaSnapshot, browserVersion, viewportCss: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), zoomTrace, screenshot, screenshotSha256: createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex') });
        if (definition.role === 'superuser-manager' && categoryLabels === undefined) categoryLabels = categoryIds.map((id, index) => ({ id, label: labels[index] }));
      } else {
        assert.equal(await page.locator('[data-shell="settings-corner"]').count(), 0);
        const screenshot = `screenshots/${definition.role}-${environment.width}x${environment.height}-${environment.theme}-${environment.zoom}-${environment.forcedColors}.png`;
        const screenshotPath = path.join(outputRoot, screenshot);
        const ariaSnapshot = await page.locator('body').ariaSnapshot();
        await page.screenshot({ path: screenshotPath });
        rows.push({ role: definition.role, environment, categoryIds, categoryLabels: labels, categoryCount: 0, evidenceClass: 'product', sessionProvenance: 'built-product-pre-auth', settingsShellVisible: false, focus: { activeCategory, openFocusInside, closeRestoredToGear }, geometry: { horizontalClipping, navigationReachable }, ariaSnapshot, browserVersion, viewportCss: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })), zoomTrace, screenshot, screenshotSha256: createHash('sha256').update(fs.readFileSync(screenshotPath)).digest('hex') });
      }
    }
    const resetTrace = await zoomTo(1);
    resetChecks.push({ role: definition.role, trace: resetTrace });
    transitions.push({ role: definition.role, previousSessionCleared: true, authenticated: definition.authenticated, evidenceClass: definition.evidenceClass, focus: transitionFocus });
  }

  assert.ok(categoryLabels);
  const evidence = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    revision,
    authority: ['IR-SHELL-002', 'IR-SHELL-012', '.kiwi/sessions/newspaper-20260916/evidence/issue77/astra-closure-addendum.md'],
    categoryAuthority: CATEGORY_IDS,
    categoryLabels,
    rows,
    transitions,
    endpointDenials,
    resetChecks,
    systemThemeChecks,
    nativeForcedColors: 'not exercised; Playwright forced-colors emulation only',
  };
  const evidenceFile = path.join(outputRoot, 'role-category-matrix.json');
  fs.writeFileSync(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
  validateRoleCategoryEvidence(evidence);
  fs.writeFileSync(path.join(outputRoot, 'completed.json'), `${JSON.stringify({ status: 'PASS', evidence: 'role-category-matrix.json', sha256: createHash('sha256').update(fs.readFileSync(evidenceFile)).digest('hex') }, null, 2)}\n`);
  console.log(`PASS Issue 77 eight-role category matrix: ${evidenceFile}`);
} catch (error) {
  primary = error;
  fs.writeFileSync(path.join(outputRoot, 'failure.txt'), `${error?.stack ?? error}\n`);
} finally {
  const failures = primary ? [primary] : [];
  if (context) try { await context.close(); } catch (error) { failures.push(error); }
  if (vite) try { await vite.close(); } catch (error) { failures.push(error); }
  if (zeroServer) try { await closeServer(zeroServer); } catch (error) { failures.push(error); }
  if (mainServer) try { await closeServer(mainServer); } catch (error) { failures.push(error); }
  if (zeroRuntime) try { await zeroRuntime.close(); } catch (error) { failures.push(error); }
  if (mainRuntime) try { await mainRuntime.close(); } catch (error) { failures.push(error); }
  try { fs.rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch (error) { failures.push(error); }
  install.forgetInstallTokenForTest();
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures);
}
