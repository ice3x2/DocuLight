import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
const output = required('DOCULIGHT_ISSUE82_STAGING');
const browserRoot = required('DOCULIGHT_ISSUE82_BROWSER_ROOT');
const groupId = required('DOCULIGHT_ISSUE82_GROUP_ID');
const groupName = required('DOCULIGHT_ISSUE82_GROUP_NAME');
const nextId = required('DOCULIGHT_ISSUE82_NEXT_ID');
const credentials = Object.fromEntries(['SUPER','ORDINARY','MANAGER'].map((role) => [role.toLowerCase(), [required(`DOCULIGHT_ISSUE82_${role}_NAME`), required(`DOCULIGHT_ISSUE82_${role}_PASS`)]]));
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(browserRoot, { recursive: true });
const extension = path.join(browserRoot, 'zoom-extension'); fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 82 zoom', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const requests = []; const matrix = []; const denials = []; let context;
try {
  context = await chromium.launchPersistentContext(path.join(browserRoot, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname.includes(`/api/roster/groups/${groupId}`)) requests.push({ method: request.method(), path: url.pathname }); });
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((entry) => entry.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
  const getZoom = async () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((entry) => entry.url === target); if (!tab?.id) throw new Error('tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
  const cookies = {};
  for (const role of ['ordinary','manager','super']) { await context.clearCookies(); await loginAs(page, ...credentials[role]); cookies[role] = await context.cookies(); }
  const useRole = async (role) => { await context.clearCookies(); await context.addCookies(cookies[role]); await page.goto(WEB_URL, { waitUntil: 'networkidle' }); };
  const settings = async () => { await page.getByRole('button', { name: '설정', exact: true }).click(); const dialog = page.locator('[data-settings-dialog]'); await dialog.waitFor(); return dialog; };
  const deny = async (role) => {
    const result = await page.evaluate(async (id) => ({ preview: (await fetch(`/api/roster/groups/${id}/delete-preview`)).status, deletion: (await fetch(`/api/roster/groups/${id}`, { method: 'DELETE' })).status }), groupId);
    assert.deepEqual(result, { preview: 404, deletion: 404 }); denials.push({ role, ...result });
  };

  for (const [width, height] of [[1280,720],[1440,900],[1920,1080]]) for (const theme of ['light','dark']) for (const zoom of [100,200]) {
    await page.setViewportSize({ width, height });
    for (const role of ['ordinary','manager']) { await useRole(role); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme); await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100); const dialog = await settings(); assert.equal(await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).count(), 0); await deny(role); }
    await useRole('super'); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme); await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100);
    const dialog = await settings(); await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click(); const trigger = dialog.getByRole('button', { name: `${groupName} 삭제` }); await trigger.click(); const confirm = page.locator('[data-group-delete-dialog]'); await confirm.waitFor();
    await confirm.getByText('멤버의 계정은 삭제되지 않습니다.').waitFor(); await confirm.getByText('이 그룹에 부여된 권한 항목 1건이 함께 제거됩니다. 되돌릴 수 없습니다.').waitFor();
    const geometry = await confirm.evaluate((node) => { const rect = node.getBoundingClientRect(); const input = node.querySelector('input'); const title = node.querySelector('[data-slot="alert-dialog-title"]'); const consequence = node.querySelector('[data-group-delete-impact] p'); const channels = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); const luminance = (value) => channels(value).map((part) => { const channel = part / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0); const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); }; const background = getComputedStyle(node).backgroundColor; const style = input instanceof HTMLElement ? getComputedStyle(input) : null; return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, rect: rect.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1, inputHeight: input instanceof HTMLElement ? input.getBoundingClientRect().height : 0, borderStyle: style?.borderStyle, outline: style?.outlineStyle, normalTextContrast: consequence instanceof HTMLElement ? contrast(getComputedStyle(consequence).color, background) : 0, largeTextContrast: title instanceof HTMLElement ? contrast(getComputedStyle(title).color, background) : 0, controlBoundaryContrast: style ? contrast(style.borderColor, getComputedStyle(input).backgroundColor) : 0 }; });
    assert.equal(geometry.overflow, false); assert(geometry.rect.left >= 23); assert(geometry.rect.right <= geometry.viewport.width - 23); assert(geometry.inputHeight >= 36); assert.notEqual(geometry.outline, 'none'); assert(geometry.controlBoundaryContrast >= 3); assert(geometry.normalTextContrast >= 4.5); assert(geometry.largeTextContrast >= 3); const screenshot = `group-delete-${theme}-${width}x${height}-${zoom}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }); matrix.push({ width, height, theme, zoom, observedZoom: await getZoom(), screenshot, geometry }); await confirm.getByRole('button', { name: '취소' }).click();
  }
  assert.equal(matrix.length, 12); assert.equal(denials.length, 24);

  await useRole('super'); await setZoom(1); let dialog = await settings(); await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click(); await dialog.getByRole('button', { name: `${groupName} 삭제` }).click(); let confirm = page.locator('[data-group-delete-dialog]'); await confirm.waitFor(); const token = confirm.getByRole('textbox'); await token.fill(groupName); const deleteBefore = requests.filter((entry) => entry.method === 'DELETE').length;
  for (const [width,height] of [[1440,900],[1920,1080],[1280,720]]) { await page.setViewportSize({ width, height }); assert.equal(await token.inputValue(), groupName); }
  for (const zoom of [2,1]) { await setZoom(zoom); assert.equal(await getZoom(), zoom); assert.equal(await token.inputValue(), groupName); }
  assert.equal(requests.filter((entry) => entry.method === 'DELETE').length, deleteBefore);
  await confirm.getByRole('button', { name: '취소' }).click();

  const forced = [];
  await page.emulateMedia({ forcedColors: 'active' }); dialog = await settings().catch(async () => page.locator('[data-settings-dialog]')); if (await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).count()) await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click();
  for (const zoom of [100,200]) { await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100); await dialog.getByRole('button', { name: `${groupName} 삭제` }).click(); confirm = page.locator('[data-group-delete-dialog]'); await confirm.waitFor(); const forcedInput = confirm.getByRole('textbox'); for (let step = 0; step < 4 && !(await forcedInput.evaluate((node) => document.activeElement === node)); step += 1) await page.keyboard.press('Tab'); assert.equal(await forcedInput.evaluate((node) => document.activeElement === node), true); const style = await confirm.evaluate((node) => { const input = node.querySelector('input'); return { forced: matchMedia('(forced-colors: active)').matches, focusedInput: document.activeElement === input, dialogBorder: getComputedStyle(node).borderStyle, inputBorder: input instanceof HTMLElement ? getComputedStyle(input).borderStyle : null, inputOutline: input instanceof HTMLElement ? getComputedStyle(input).outlineStyle : null }; }); assert.equal(style.forced, true); assert.equal(style.focusedInput, true); assert.notEqual(style.dialogBorder, 'none'); const screenshot = `group-delete-forced-${zoom}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }); forced.push({ zoom, observedZoom: await getZoom(), screenshot, style }); await confirm.getByRole('button', { name: '취소' }).click(); }
  await page.emulateMedia({ forcedColors: 'none' }); await setZoom(1); assert.equal(await getZoom(), 1);

  const segment = requests.length;
  await dialog.getByRole('button', { name: `${groupName} 삭제` }).focus(); await dialog.getByRole('button', { name: `${groupName} 삭제` }).click(); confirm = page.locator('[data-group-delete-dialog]'); await confirm.waitFor(); await confirm.getByRole('textbox').fill(groupName); await confirm.getByRole('button', { name: '그룹 삭제' }).click(); await dialog.getByText('그룹을 삭제했습니다.').waitFor();
  const finalRequests = requests.slice(segment); assert.equal(finalRequests.filter((entry) => entry.method === 'GET' && entry.path.endsWith('/delete-preview')).length, 2); assert.equal(finalRequests.filter((entry) => entry.method === 'DELETE').length, 1); await page.waitForFunction((id) => document.activeElement?.closest('[data-group-id]')?.getAttribute('data-group-id') === id, nextId);
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ requirement: 'IR-PRINCIPAL-004', matrix, forced, denials, finalRequests, trueZoomReads: matrix.map((entry) => entry.observedZoom), focusAfterDelete: nextId, nativeWindowsImeCandidateUi: 'nonblocking-unverified', syntheticCompositionDom: 'covered-by-component-test' }, null, 2));
} finally { await context?.close(); }
