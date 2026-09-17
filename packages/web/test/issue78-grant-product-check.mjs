import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
for (const name of ['WEB_URL', 'DOCULIGHT_E2E_EDITOR_USER', 'DOCULIGHT_E2E_EDITOR_PASS', 'DOCULIGHT_E2E_ADMIN_USER', 'DOCULIGHT_E2E_ADMIN_PASS', 'DOCULIGHT_E2E_NODE', 'DOCULIGHT_E2E_OWN_TARGET', 'DOCULIGHT_E2E_FOREIGN_TARGET', 'DOCULIGHT_E2E_ADMIN_TARGET']) if (!process.env[name]) throw new Error(`${name} missing`);
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue78');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue78-browser-'));
const extension = path.join(temporaryRoot, 'extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue78 zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
let context; let adminBrowser;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), { headless: false, viewport: { width: 1440, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(process.env.WEB_URL, { waitUntil: 'networkidle' });
  const zoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); await chrome.tabs.setZoom(tab.id, value); return chrome.tabs.getZoom(tab.id); }, { target: process.env.WEB_URL, value });
  assert.equal(await zoom(1), 1);
  const inputs = page.locator('input');
  await inputs.nth(0).fill(process.env.DOCULIGHT_E2E_EDITOR_USER);
  await inputs.nth(1).fill(process.env.DOCULIGHT_E2E_EDITOR_PASS);
  await page.locator('button[type=submit]').click();
  await page.locator('[data-shell="root"]').waitFor();

  const requests = []; const receipts = [];
  page.on('request', (request) => { const pathname = new URL(request.url()).pathname; if (request.method() === 'POST' && pathname.endsWith('/share')) requests.push({ pathname, prefer: request.headers().prefer, method: request.method() }); if (request.method() === 'DELETE' && pathname.startsWith('/api/acl-entries/')) requests.push({ pathname, method: request.method() }); });
  page.on('response', async (response) => { const pathname = new URL(response.url()).pathname; if (response.request().method() === 'POST' && pathname.endsWith('/share')) receipts.push({ status: response.status(), body: await response.json() }); });
  const row = page.locator(`[data-node-id="${process.env.DOCULIGHT_E2E_NODE}"]`); await row.waitFor(); await row.click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem').filter({ hasText: '공유' }).click();
  const share = page.locator('[data-share-dialog]'); await share.waitFor();
  const privacyBefore = await page.evaluate(async (id) => (await (await fetch(`/api/nodes/${id}/share`)).json()).rows, process.env.DOCULIGHT_E2E_NODE);
  assert.equal(privacyBefore, null);
  const zoomAt200 = await zoom(2);
  assert.equal(zoomAt200, 2);
  assert.equal(await zoom(2), 2);

  async function grant(name) {
    const search = share.locator('[cmdk-input]'); await search.fill(name);
    const option = share.locator('[cmdk-item]').filter({ hasText: name }); await option.waitFor(); await option.click();
    const response = page.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/share'));
    await share.locator('[data-share-grant] button').click();
    assert.equal((await response).status(), 200);
    return share.getByRole('status').filter({ hasText: name });
  }

  const ownToast = await grant(process.env.DOCULIGHT_E2E_OWN_TARGET); const undo = ownToast.getByRole('button', { name: '회수' }); await undo.waitFor();
  const deleted = page.waitForResponse((candidate) => candidate.request().method() === 'DELETE' && new URL(candidate.url()).pathname.startsWith('/api/acl-entries/'));
  await undo.dblclick(); assert.equal((await deleted).status(), 204);
  const foreignToast = await grant(process.env.DOCULIGHT_E2E_FOREIGN_TARGET); await foreignToast.waitFor();
  assert((await foreignToast.textContent()).includes('현재 권한으로는 이 항목을 회수할 수 없습니다.'));
  assert.equal(await foreignToast.getByRole('button', { name: '회수' }).count(), 0);
  assert.equal(await page.evaluate(async (id) => (await (await fetch(`/api/nodes/${id}/share`)).json()).rows, process.env.DOCULIGHT_E2E_NODE), null);
  await page.screenshot({ path: path.join(output, 'product-editor-200.png'), fullPage: true });
  assert.equal(await zoom(1), 1);
  assert.equal(requests.filter((one) => one.method === 'POST').length, 2);
  assert(requests.filter((one) => one.method === 'POST').every((one) => one.prefer?.toLowerCase() === 'return=representation'));
  assert.equal(requests.filter((one) => one.method === 'DELETE').length, 1);
  assert.deepEqual(receipts.map((one) => [one.status, one.body.canRevoke]), [[200, true], [200, false]]);

  adminBrowser = await chromium.launch({ headless: true });
  const adminContext = await adminBrowser.newContext({ viewport: { width: 1440, height: 900 } }); const adminPage = await adminContext.newPage();
  await adminPage.goto(process.env.WEB_URL, { waitUntil: 'networkidle' }); const adminInputs = adminPage.locator('input'); await adminInputs.nth(0).fill(process.env.DOCULIGHT_E2E_ADMIN_USER); await adminInputs.nth(1).fill(process.env.DOCULIGHT_E2E_ADMIN_PASS); await adminPage.locator('button[type=submit]').click(); await adminPage.locator('[data-shell="root"]').waitFor();
  const adminRequests = []; adminPage.on('request', (request) => { const pathname = new URL(request.url()).pathname; if ((request.method() === 'POST' && pathname.endsWith('/share')) || (request.method() === 'DELETE' && pathname.startsWith('/api/acl-entries/'))) adminRequests.push({ method: request.method(), pathname, prefer: request.headers().prefer }); });
  const adminRow = adminPage.locator(`[data-node-id="${process.env.DOCULIGHT_E2E_NODE}"]`); await adminRow.waitFor(); await adminRow.click({ button: 'right' }); await adminPage.getByRole('menu').getByRole('menuitem').filter({ hasText: '공유' }).click(); const adminShare = adminPage.locator('[data-share-dialog]'); await adminShare.waitFor(); assert((await adminShare.locator('[data-share-roster]').count()) === 1);
  const adminSearch = adminShare.locator('[cmdk-input]'); await adminSearch.fill(process.env.DOCULIGHT_E2E_ADMIN_TARGET); const adminOption = adminShare.locator('[cmdk-item]').filter({ hasText: process.env.DOCULIGHT_E2E_ADMIN_TARGET }); await adminOption.waitFor(); await adminOption.click(); const adminGrant = adminPage.waitForResponse((candidate) => candidate.request().method() === 'POST' && new URL(candidate.url()).pathname.endsWith('/share')); await adminShare.locator('[data-share-grant] button').click(); const adminGrantResponse = await adminGrant; assert.equal(adminGrantResponse.status(), 200); const adminReceipt = await adminGrantResponse.json(); assert.deepEqual(Object.keys(adminReceipt).sort(), ['canRevoke', 'entryId']); assert.equal(adminReceipt.canRevoke, true);
  const adminToast = adminShare.getByRole('status').filter({ hasText: process.env.DOCULIGHT_E2E_ADMIN_TARGET }); const adminUndo = adminToast.getByRole('button', { name: '회수' }); await adminUndo.waitFor(); const adminDelete = adminPage.waitForResponse((candidate) => candidate.request().method() === 'DELETE' && new URL(candidate.url()).pathname.startsWith('/api/acl-entries/')); await adminUndo.click(); assert.equal((await adminDelete).status(), 204); assert.equal(adminRequests.filter((one) => one.method === 'POST').length, 1); assert.equal(adminRequests.filter((one) => one.method === 'DELETE').length, 1);
  fs.writeFileSync(path.join(output, 'product-browser-observation.json'), JSON.stringify({ ownedBrowserCount: 2, isolatedContextCount: 2, isolatedPersistentContextCount: 1, zoomTransitions: [1, 2, 1], getZoomAt200: zoomAt200, finalGetZoom: 1, mountedDialogAt200: true, editorRowsBefore: null, editorRowsAfter: null, requests, receipts: receipts.map((one) => ({ status: one.status, keys: Object.keys(one.body).sort(), canRevoke: one.body.canRevoke })), admin: { rosterVisible: true, receiptKeys: Object.keys(adminReceipt).sort(), canRevoke: adminReceipt.canRevoke, requests: adminRequests } }, null, 2));
} finally {
  await adminBrowser?.close();
  await context?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
