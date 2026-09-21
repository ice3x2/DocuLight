import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const evidenceRoot = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue85');
const finalOutput = path.join(evidenceRoot, 'browser-matrix');
const staging = path.join(evidenceRoot, `browser-matrix.tmp-${process.pid}`);
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue85-browser-'));
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
const workspaceId = required('DOCULIGHT_E2E_WORKSPACE');
const nodeId = required('DOCULIGHT_E2E_NODE');
const stalePrincipalId = required('DOCULIGHT_E2E_STALE_PRINCIPAL');
const ordinary = { name: required('DOCULIGHT_E2E_ORDINARY_USER'), password: required('DOCULIGHT_E2E_ORDINARY_PASS') };
const secrets = [required('DOCULIGHT_E2E_USER'), required('DOCULIGHT_E2E_PASS'), ordinary.name, ordinary.password];
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.mkdirSync(staging, { recursive: true });
const extension = path.join(temporaryRoot, 'zoom-extension'); fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 85 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light', args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
  const requests = []; page.on('request', (request) => { const pathname = new URL(request.url()).pathname; if (pathname.includes('restore-inheritance')) requests.push({ method: request.method(), pathname }); });
  await page.goto(WEB_URL, { waitUntil: 'networkidle' }); await login(page); await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const direct = await page.evaluate(async (nodeId) => { const response = await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/restore-inheritance-preview`); return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() }; }, nodeId);
  assert.equal(direct.status, 200); assert.match(direct.cache, /no-store/); assert.equal(direct.body.kind, 'directory'); assert.equal(direct.body.applicableDescendants, 1); assert.match(direct.body.revision, /^v1\.[A-Za-z0-9_-]{43}$/);
  const missing = await page.evaluate(async (nodeId) => (await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/restore-inheritance`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, nodeId);
  assert.equal(missing, 428);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const settings = page.getByRole('dialog', { name: '설정' }); await settings.getByRole('tab', { name: '권한 감사' }).click(); await settings.getByRole('tab', { name: '상속 끊김' }).click();
  const trigger = settings.getByRole('button', { name: /상속으로 되돌리기/ }); await trigger.waitFor(); await trigger.click();
  let gate = page.getByRole('alertdialog', { name: '상속으로 되돌리기' }); await gate.waitFor();
  assert.equal(await gate.getAttribute('data-grade'), 'L2'); assert.equal(await gate.getByRole('textbox').count(), 0); assert.match(await gate.innerText(), /직접 부여한 권한은 유지됩니다/); assert.match(await gate.innerText(), /적용 하위 노드 1개/); assert.match(await gate.innerText(), /상속이 끊긴 하위 노드에는 전달되지 않습니다/); assert.equal(await gate.getByRole('button', { name: '취소' }).evaluate((node) => document.activeElement === node), true);
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); return chrome.tabs.getZoom(tab.id); }, { target: page.url(), value });
  const observations = [];
  const capture = async (width, height, theme, zoom, forcedColors = 'none') => {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme, forcedColors }); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const observedZoom = await setZoom(zoom / 100); assert.equal(observedZoom, zoom / 100); await page.waitForTimeout(100);
    await gate.getByRole('button', { name: '취소' }).focus();
    const metrics = await gate.evaluate((node) => {
      const channels = (value) => (value.match(/[\d.]+/g)?.map(Number) ?? []).slice(0, 3);
      const luminance = (value) => channels(value).reduce((sum, channel, index) => { const normalized = channel / 255; const linear = normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4; return sum + linear * [.2126, .7152, .0722][index]; }, 0);
      const contrast = (left, right) => { const pair = [luminance(left), luminance(right)].sort((a, b) => b - a); return (pair[0] + .05) / (pair[1] + .05); };
      const backgroundOf = (element) => { for (let current = element; current instanceof HTMLElement; current = current.parentElement) { const value = getComputedStyle(current).backgroundColor; if (value !== 'rgba(0, 0, 0, 0)' && !value.endsWith(', 0)')) return value; } return getComputedStyle(document.documentElement).backgroundColor; };
      const title = node.querySelector('[data-slot="alert-dialog-title"]'); const body = node.querySelector('.inheritance-restore-preview p'); const cancel = node.querySelector('[data-alert-dialog-cancel]'); const action = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('상속 복원'));
      const measured = (element) => { const style = getComputedStyle(element); const background = backgroundOf(element); return { color: style.color, background, ratio: contrast(style.color, background), fontSize: style.fontSize, fontWeight: style.fontWeight }; };
      const cancelStyle = getComputedStyle(cancel); const actionStyle = getComputedStyle(action); const dialogBackground = backgroundOf(node);
      return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, dialogOverflowX: node.scrollWidth > node.clientWidth + 1, focusedInside: node.contains(document.activeElement), forced: matchMedia('(forced-colors: active)').matches, scroll: { height: node.scrollHeight, client: node.clientHeight }, computed: { title: measured(title), body: measured(body), cancel: measured(cancel), actionBoundary: { color: actionStyle.backgroundColor, background: dialogBackground, ratio: contrast(actionStyle.backgroundColor, dialogBackground) }, focusBoundary: { color: cancelStyle.outlineColor, background: cancelStyle.backgroundColor, ratio: contrast(cancelStyle.outlineColor, cancelStyle.backgroundColor), style: cancelStyle.outlineStyle, width: cancelStyle.outlineWidth } } };
    });
    assert(Math.abs(metrics.viewport.width - width / (zoom / 100)) <= 2, JSON.stringify(metrics)); assert.equal(metrics.overflowX, false); assert.equal(metrics.dialogOverflowX, false); assert.equal(metrics.focusedInside, true); assert.equal(metrics.forced, forcedColors === 'active');
    if (forcedColors === 'none') { assert(metrics.computed.body.ratio >= 4.5, JSON.stringify(metrics.computed)); assert(metrics.computed.cancel.ratio >= 4.5, JSON.stringify(metrics.computed)); assert(metrics.computed.title.ratio >= 3, JSON.stringify(metrics.computed)); assert(metrics.computed.actionBoundary.ratio >= 3, JSON.stringify(metrics.computed)); assert(metrics.computed.focusBoundary.ratio >= 3, JSON.stringify(metrics.computed)); }
    else { assert.notEqual(metrics.computed.focusBoundary.style, 'none'); assert(parseFloat(metrics.computed.focusBoundary.width) > 0); }
    const name = `restore-${theme}-${width}x${height}-${zoom}-${forcedColors}.png`; const file = path.join(staging, name); await page.screenshot({ path: file, fullPage: true }); observations.push({ width, height, theme, zoom, forcedColors, observedZoom, metrics, name, sha256: hash(file) });
  };
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) for (const theme of ['light', 'dark']) for (const zoom of [100, 200]) await capture(width, height, theme, zoom);
  for (const zoom of [100, 200]) await capture(1280, 720, 'light', zoom, 'active');
  assert.equal(observations.length, 14); await page.emulateMedia({ forcedColors: 'none' }); assert.equal(await setZoom(1), 1);
  await gate.getByRole('button', { name: '취소' }).click(); await gate.waitFor({ state: 'hidden' }); assert.equal(await trigger.evaluate((node) => document.activeElement === node), true); assert.equal(requests.filter((one) => one.method === 'POST').length, 1);
  await trigger.click(); gate = page.getByRole('alertdialog', { name: '상속으로 되돌리기' }); await gate.waitFor();
  const changed = await page.evaluate(async ({ workspaceId, stalePrincipalId }) => (await fetch(`/api/nodes/${encodeURIComponent(workspaceId)}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId: stalePrincipalId, level: 'view' }) })).status, { workspaceId, stalePrincipalId }); assert.equal(changed, 204);
  await gate.getByRole('button', { name: '상속 복원' }).click(); await settings.getByRole('alert').filter({ hasText: '영향이 변경되었습니다' }).waitFor(); assert.equal(requests.filter((one) => one.method === 'POST').length, 1);
  await trigger.click(); gate = page.getByRole('alertdialog', { name: '상속으로 되돌리기' }); await gate.waitFor(); await gate.getByRole('button', { name: '상속 복원' }).click(); await gate.waitFor({ state: 'hidden' }); await settings.getByRole('status').filter({ hasText: '상속을 복원했습니다' }).waitFor(); const fallbackHeading = settings.getByText('상속 끊김 목록'); assert.equal(await fallbackHeading.evaluate((node) => document.activeElement === node), true); assert.equal(requests.filter((one) => one.method === 'POST').length, 2);
  await context.clearCookies(); const unauthenticated = await page.evaluate(async (nodeId) => (await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/restore-inheritance-preview`)).status, nodeId); assert.equal(unauthenticated, 401);
  await loginAs(page, ordinary.name, ordinary.password); await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const denied = await page.evaluate(async (nodeId) => (await fetch(`/api/nodes/${encodeURIComponent(nodeId)}/restore-inheritance-preview`)).status, nodeId); assert.equal(denied, 404);
  await page.getByRole('button', { name: '설정', exact: true }).first().click(); const ordinarySettings = page.getByRole('dialog', { name: '설정' }); assert.equal(await ordinarySettings.getByRole('tab', { name: '권한 감사' }).count(), 0);
  const expectedImages = observations.map((one) => one.name).sort(); assert.deepEqual(fs.readdirSync(staging).sort(), expectedImages);
  const manifest = { requirement: 'IR-ACL-005', runner: 'temporary seeded backend/database/docs root and isolated persistent Chromium', roles: { superuser: { preview: 200, ui: true }, ordinary: { preview: 404, privilegedDom: false }, unauthenticated: 401 }, matrix: { normal: 12, forcedColors: 2, zoom: 'chrome.tabs.setZoom/getZoom/reset', computedStyleAndGeometryPerCapture: true, contrast: { body: 4.5, large: 3, controlsAndFocus: 3 } }, flow: { missingRevision: 428, staleImpactBlocked: true, successfulPosts: 1, retainedDirectAcl: true, auditCheckedByRunner: true, cancelFocus: true, removedRowFocusFallback: 'section-heading' }, observations, artifactSet: { expectedImages, manifestWrittenLast: true, atomicPublish: true }, secretScan: { values: secrets.length, matches: 0 } };
  const serialized = JSON.stringify(manifest, null, 2); for (const secret of secrets) assert.equal(serialized.includes(secret), false);
  for (const file of fs.readdirSync(staging)) { const bytes = fs.readFileSync(path.join(staging, file)); for (const secret of secrets) assert.equal(bytes.includes(Buffer.from(secret)), false); }
  const temporaryManifest = path.join(staging, 'capture-manifest.json.tmp'); fs.writeFileSync(temporaryManifest, serialized); fs.renameSync(temporaryManifest, path.join(staging, 'capture-manifest.json'));
  if (fs.existsSync(finalOutput)) fs.rmSync(finalOutput, { recursive: true, force: true }); fs.renameSync(staging, finalOutput);
  process.stdout.write('PASS issue85 product: actual App roles, stale/fresh restore, 12+2 true zoom/forced colors, atomic secret-safe manifest-last evidence\n');
} finally { if (context) await context.close(); if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true }); fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
