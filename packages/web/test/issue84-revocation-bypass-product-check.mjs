import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForZoomConvergence } from './issue84-zoom-convergence.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue84/browser-matrix');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue84-browser-'));
const captures = path.join(temp, 'captures');
const extension = path.join(temp, 'zoom-extension');
fs.mkdirSync(captures); fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
// Manifest is written after its worker so Chromium never observes a partial extension.
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue84 zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
const env = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
const account = (name) => JSON.parse(env(name));
const owner = account('DOCULIGHT_ISSUE84_OWNER'); const manager = account('DOCULIGHT_ISSUE84_MANAGER');
const editor = account('DOCULIGHT_ISSUE84_EDITOR'); const ordinary = account('DOCULIGHT_ISSUE84_ORDINARY');
const target = account('DOCULIGHT_ISSUE84_TARGET'); const workspaceId = env('DOCULIGHT_ISSUE84_WORKSPACE'); const url = env('WEB_URL');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashLfText = (file) => createHash('sha256').update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
let context;
const observations = []; const roles = [];
const revocationPosts = [];
const login = async (page, row) => { await page.goto(url); await page.fill('input[name="name"]', row.name); await page.fill('input[name="password"]', row.password); await page.getByRole('button', { name: '로그인', exact: true }).click(); await page.getByRole('button', { name: '설정', exact: true }).first().waitFor(); };
const logout = async (page) => { await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' })); await context.clearCookies(); };
try {
  context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
  page.on('response', async (response) => {
    const request = response.request();
    if (request.method() !== 'POST' || new URL(response.url()).pathname !== `/api/principals/${target.id}/revocation`) return;
    revocationPosts.push({ status: response.status(), body: await response.json() });
  });
  const probe = async (role, row, expected) => { await login(page, row); const result = await page.evaluate(async ({ workspaceId, q }) => { const response = await fetch(`/api/principals?q=${encodeURIComponent(q)}&for=${encodeURIComponent(`workspace:${workspaceId}`)}&purpose=revocation`); return { status: response.status, body: response.ok ? await response.json() : null }; }, { workspaceId, q: target.name.slice(0, 3) }); assert.equal(result.status, expected); if (expected === 200) assert.equal(result.body.find((item) => item.id === target.id).aclRevokePreservesSuperuserBypass, true); roles.push({ role, status: result.status }); await logout(page); };
  await probe('workspace-manager', manager, 200); await probe('node-editor', editor, 404); await probe('ordinary', ordinary, 404);
  const unauthenticated = await page.evaluate(async ({ workspaceId }) => (await fetch(`/api/principals?q=long&for=${encodeURIComponent(`workspace:${workspaceId}`)}&purpose=revocation`)).status, { workspaceId });
  assert.equal(unauthenticated, 401); roles.push({ role: 'unauthenticated', status: 401 });
  await login(page, owner);
  const principalSnapshot = async () => page.evaluate(async (targetId) => {
    const [usersResponse, groupsResponse] = await Promise.all([fetch('/api/roster/users'), fetch('/api/roster/groups')]);
    if (!usersResponse.ok || !groupsResponse.ok) throw new Error(`roster snapshot failed ${usersResponse.status}/${groupsResponse.status}`);
    const users = await usersResponse.json(); const groups = await groupsResponse.json();
    const account = users.find((row) => row.id === targetId);
    if (!account) throw new Error('target account missing');
    return {
      account,
      memberships: groups.filter((group) => group.members.some((member) => member.id === targetId)).map((group) => group.id).sort(),
    };
  }, target.id);
  const beforePrincipal = await principalSnapshot();
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '설정' }); await dialog.getByRole('tab', { name: '권한 감사' }).click(); await dialog.getByRole('tab', { name: '권한 회수' }).click();
  const picker = dialog.getByLabel('사용자·그룹 검색'); await picker.fill(target.name.slice(0, 3));
  const candidate = dialog.getByRole('option', { name: new RegExp(target.name.slice(0, 12)) }); await candidate.waitFor();
  const postsBeforeComposition = revocationPosts.length;
  await picker.evaluate((input) => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '긴' }));
    input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '긴 슈' }));
    const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', isComposing: true });
    Object.defineProperty(enter, 'keyCode', { value: 229 });
    input.dispatchEvent(enter);
  });
  await page.waitForTimeout(50);
  assert.equal(await dialog.getByTestId('revocation-subjects').count(), 0);
  assert.equal(revocationPosts.length, postsBeforeComposition);
  await picker.dispatchEvent('compositionend', { data: target.name.slice(0, 3) });
  await picker.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await dialog.getByTestId('revocation-subjects').waitFor();
  await dialog.getByTestId('superuser-bypass-notice').waitFor(); assert.match(await dialog.getByTestId('superuser-bypass-notice').textContent(), /ACL 회수로 슈퍼유저 우회 접근은 제거되지 않음/);
  const action = dialog.getByRole('button', { name: '권한 전부 회수' });
  await action.focus(); await page.keyboard.press('Enter'); let gate = page.getByRole('alertdialog'); await gate.waitFor();
  const cancel = gate.getByRole('button', { name: '취소' });
  assert.equal(await cancel.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Enter'); await gate.waitFor({ state: 'hidden' });
  assert.equal(await action.evaluate((node) => document.activeElement === node), true);
  assert.equal(revocationPosts.length, 0);
  await page.keyboard.press('Enter'); gate = page.getByRole('alertdialog'); await gate.waitFor(); assert.equal(await gate.getAttribute('data-grade'), 'L3'); assert.match(await gate.textContent(), /ACL 회수로 슈퍼유저 우회 접근은 제거되지 않음/);
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); return chrome.tabs.getZoom(tab.id); }, { target: page.url(), value });
  const readZoomRenderState = async () => {
    const browserZoom = await worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
    const rendered = await page.evaluate(async (expectedDpr) => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); return { innerWidth, innerHeight, devicePixelRatio, visualViewportWidth: visualViewport?.width ?? innerWidth, visualViewportHeight: visualViewport?.height ?? innerHeight, visualViewportScale: visualViewport?.scale ?? 1, resolutionMatches: matchMedia(`(resolution: ${expectedDpr}dppx)`).matches }; }, browserZoom);
    return { browserZoom, ...rendered, resolutionMatches: rendered.resolutionMatches === true };
  };
  const capture = async (repeat, width, height, theme, zoom, forcedColors = 'none') => { await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme, forcedColors }); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme); await setZoom(zoom / 100); const convergence = await waitForZoomConvergence({ read: readZoomRenderState, width, height, zoom: zoom / 100 }); await cancel.focus(); const metrics = await gate.evaluate((node) => {
    const rgb = (value) => (value.match(/[\d.]+/g)?.map(Number) ?? []).slice(0, 3);
    const luminance = (value) => rgb(value).reduce((sum, channel, index) => { const normalized = channel / 255; const linear = normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; return sum + linear * [.2126, .7152, .0722][index]; }, 0);
    const ratio = (first, second) => { const values = [luminance(first), luminance(second)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); };
    const backgroundOf = (element) => { for (let current = element; current instanceof HTMLElement; current = current.parentElement) { const value = getComputedStyle(current).backgroundColor; if (value !== 'rgba(0, 0, 0, 0)' && !value.endsWith(', 0)')) return value; } return getComputedStyle(document.documentElement).backgroundColor; };
    const text = (element, target, minimum) => { if (!(element instanceof HTMLElement)) return { target, present: false, ratio: 0, minimum }; const style = getComputedStyle(element); const background = backgroundOf(element); return { target, present: true, foreground: style.color, background, ratio: ratio(style.color, background), minimum }; };
    const boundary = (element, target, property) => { if (!(element instanceof HTMLElement)) return { target, present: false, ratio: 0, minimum: 3 }; const style = getComputedStyle(element); const background = backgroundOf(element); return { target, present: true, color: style[property], background, ratio: ratio(style[property], background), minimum: 3 }; };
    const warning = node.querySelector('[data-testid="superuser-bypass-confirm-notice"]'); const title = node.querySelector('[data-slot="alert-dialog-title"]'); const description = node.querySelector('[data-slot="alert-dialog-description"]'); const cancelButton = node.querySelector('[data-alert-dialog-cancel]'); const tokenInput = node.querySelector('input'); const focused = document.activeElement;
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, visualViewport: { width: visualViewport?.width ?? innerWidth, height: visualViewport?.height ?? innerHeight, scale: visualViewport?.scale ?? 1 }, forced: matchMedia('(forced-colors: active)').matches, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, warningWrapped: warning?.getBoundingClientRect().height > 0, focusedInsideGate: node.contains(focused), contrast: { bodyText: text(description, 'L3 description', 4.5), warningText: text(warning, 'authoritative bypass warning', 4.5), buttonText: text(cancelButton, 'cancel button text', 4.5), largeTitle: text(title, 'L3 title', 3), controlBoundary: boundary(tokenInput, 'token input border', 'borderTopColor'), focusBoundary: boundary(focused, 'focused cancel outline', 'outlineColor') } };
  }); const expectedCssViewport = { width: width / (zoom / 100), height: height / (zoom / 100), dpr: zoom / 100 }; assert.equal(metrics.viewport.width, expectedCssViewport.width); assert.equal(metrics.viewport.height, expectedCssViewport.height); assert.ok(Math.abs(metrics.viewport.dpr - expectedCssViewport.dpr) < 1e-6); assert.equal(metrics.visualViewport.width, expectedCssViewport.width); assert.equal(metrics.visualViewport.height, expectedCssViewport.height); assert.ok(Math.abs(metrics.visualViewport.scale - 1) < 1e-6); assert.equal(metrics.forced, forcedColors === 'active'); assert.equal(metrics.overflowX, false); assert.equal(metrics.warningWrapped, true); assert.equal(metrics.focusedInsideGate, true); for (const item of Object.values(metrics.contrast)) { assert.equal(item.present, true, JSON.stringify(item)); assert.ok(item.ratio >= item.minimum, JSON.stringify(item)); } const name = `run${repeat}-issue84-${theme}-${width}x${height}-${zoom}-${forcedColors}.png`; const file = path.join(captures, name); await page.screenshot({ path: file, fullPage: true }); observations.push({ repeat, width, height, theme, zoom, forcedColors, expectedCssViewport, convergence, metrics, name, sha256: hash(file) }); };
  for (let repeat = 1; repeat <= 3; repeat += 1) {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) for (const theme of ['light', 'dark']) for (const zoom of [100, 200]) await capture(repeat, width, height, theme, zoom);
    for (const zoom of [100, 200]) await capture(repeat, 1280, 720, 'light', zoom, 'active');
  }
  await setZoom(1); const resetConvergence = await waitForZoomConvergence({ read: readZoomRenderState, width: 1280, height: 720, zoom: 1 });
  const tokenInput = gate.getByRole('textbox'); await tokenInput.focus(); await page.keyboard.type('1'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const executeButton = gate.getByRole('button', { name: '실행' }); assert.equal(await executeButton.evaluate((node) => document.activeElement === node), true); await page.keyboard.press('Enter');
  await gate.waitFor({ state: 'hidden' }); await page.waitForTimeout(100); assert.equal(revocationPosts.length, 1); assert.equal(revocationPosts[0].status, 200);
  const outcome = dialog.locator(`[data-subject-id="${target.id}"]`); await outcome.waitFor(); assert.equal(await outcome.getAttribute('data-outcome-state'), 'completed'); assert.match(await outcome.textContent(), /실제 1건/);
  const afterPrincipal = await principalSnapshot(); assert.deepEqual(afterPrincipal, beforePrincipal);
  const audit = await page.evaluate(async () => { const response = await fetch('/api/audit-log?operation=acl.revoke'); if (!response.ok) throw new Error(`audit ${response.status}`); return response.json(); });
  const auditRows = audit.groups.flatMap((group) => group.rows).filter((row) => row.subject === target.name); assert.equal(auditRows.length, 1);
  await dialog.getByRole('button', { name: '설정 닫기' }).click(); await logout(page); await login(page, target);
  const preservedAccess = await page.evaluate(async (workspaceId) => { const [sessionResponse, treeResponse, managedResponse] = await Promise.all([fetch('/api/session'), fetch('/api/tree'), fetch('/api/managed-workspaces')]); const session = await sessionResponse.json(); const tree = await treeResponse.json(); const managed = await managedResponse.json(); return { session, workspaceVisible: tree.some((entry) => entry.workspace.id === workspaceId), managed }; }, workspaceId);
  assert.equal(preservedAccess.session.superuser, true); assert.equal(preservedAccess.workspaceVisible, true); assert.equal(preservedAccess.managed.scope, 'instance'); assert.ok(preservedAccess.managed.workspaces.some((workspace) => workspace.id === workspaceId));
  await logout(page);
  fs.rmSync(output, { recursive: true, force: true }); fs.mkdirSync(output, { recursive: true });
  for (const item of observations) fs.copyFileSync(path.join(captures, item.name), path.join(output, item.name));
  const expectedArtifacts = observations.map((item) => item.name).sort(); const observedArtifacts = fs.readdirSync(output).sort(); assert.deepEqual(observedArtifacts, expectedArtifacts);
  const manifest = { requirement: 'IR-PRINCIPAL-005', runner: 'temporary seeded product server and persistent Chromium', roles, matrix: { repeats: 3, normalPerRun: 12, forcedColorsPerRun: 2, normalTotal: 36, forcedColorsTotal: 6, zoomMechanism: 'chrome.tabs.setZoom/getZoom', convergence: 'two consecutive matching browser zoom, CSS viewport, effective DPR, resolution media and visual viewport samples before assertions and screenshot' }, warnings: { selected: true, l3: true, authoritativeIdentityMatched: true }, execution: { keyboardConfirmed: true, postCount: revocationPosts.length, response: revocationPosts[0], outcome: { subjectId: target.id, state: 'completed', actualRows: 1 }, audit: { operation: 'acl.revoke', subject: target.name, rows: auditRows.length }, preservedUpperGateAccess: preservedAccess, principalBefore: beforePrincipal, principalAfter: afterPrincipal }, keyboardFocus: { l3Contained: true, cancelReturnedToExactInvoker: true }, ime: { syntheticCompositionEvents: ['compositionstart', 'compositionupdate', 'composing Enter keyCode 229', 'compositionend'], selectionOrExecutionDuringComposition: false, nativeKoreanCandidateUi: 'not claimed; automated synthetic composition only' }, contrastContract: { bodyAndWarningText: 4.5, largeText: 3, buttonText: 4.5, controlAndFocusBoundaries: 3, measuredEveryCapture: true }, resetConvergence, sourceHashes: { srs: hashLfText(path.join(root, 'docs/spec/16.principal.srs.md')), independentReviewLf: hashLfText(path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue84/final-independent-review.md')), integration: hashLfText(path.join(root, 'packages/web/test/issue84-revocation-bypass.test.tsx')), checker: hashLfText(path.join(root, 'packages/web/test/issue84-revocation-bypass-product-check.mjs')), runner: hashLfText(path.join(root, 'packages/web/test/issue84-revocation-bypass-product-runner.mjs')), product: hashLfText(path.join(root, 'packages/web/src/acl/BulkRevokePanel.tsx')), convergenceHelper: hashLfText(path.join(root, 'packages/web/test/issue84-zoom-convergence.mjs')), convergenceTest: hashLfText(path.join(root, 'packages/web/test/issue84-zoom-convergence.test.ts')) }, secretScan: { checkedRuntimeSecrets: 5, matches: 0 }, observations, artifactSet: { expectedImages: 42, expectedArtifacts, observedArtifacts, exact: true, manifestWrittenLast: true } };
  const serialized = JSON.stringify(manifest, null, 2); for (const secret of [owner.password, manager.password, editor.password, ordinary.password, target.password]) assert.equal(serialized.includes(secret), false);
  const temporaryManifest = path.join(output, 'capture-manifest.json.tmp'); fs.writeFileSync(temporaryManifest, serialized); fs.renameSync(temporaryManifest, path.join(output, 'capture-manifest.json'));
  process.stdout.write('PASS issue84 product: roles/denials + 3 repeated 12 normal and 2 forced-color matrices with converged true zoom\n');
} finally { if (context) await context.close(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
