import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue89/browser-matrix');
fs.mkdirSync(output, { recursive: true });
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const workspaceId = required('DOCULIGHT_E2E_WORKSPACE');
const candidateName = required('DOCULIGHT_E2E_CANDIDATE');
const candidateId = required('DOCULIGHT_E2E_CANDIDATE_ID');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue89-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 89 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');

let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const calls = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname.includes('admin-grant')) calls.push({ method: request.method(), path: `${url.pathname}${url.search}` }); });
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const brokenFixture = await page.evaluate(async (workspaceId) => {
    const create = async (input) => { const response = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }); return { status: response.status, body: await response.json() }; };
    const folder = await create({ workspaceId, parentId: null, kind: 'directory', name: '실제 상속 단절 폴더' });
    const document = await create({ workspaceId, parentId: folder.body.id, kind: 'file', name: '실제 문서.md' });
    const broken = await fetch(`/api/nodes/${encodeURIComponent(folder.body.id)}/break-inheritance`, { method: 'POST' });
    return { folder, document, broken: broken.status };
  }, workspaceId);
  assert.deepEqual([brokenFixture.folder.status, brokenFixture.document.status, brokenFixture.broken], [200, 200, 204]);
  const directPreview = await page.evaluate(async ({ workspaceId, candidateId }) => {
    const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/admin-grant-preview?principalId=${encodeURIComponent(candidateId)}`);
    return { status: response.status, body: await response.json() };
  }, { workspaceId, candidateId });
  assert.equal(directPreview.status, 200, JSON.stringify(directPreview));
  assert.equal(directPreview.body.visibleDescendantCount, 2, JSON.stringify({ brokenFixture, directPreview }));
  const settingsButtons = page.getByRole('button', { name: '설정', exact: true });
  const entryCount = await settingsButtons.count();
  assert(entryCount >= 1);
  await settingsButtons.first().click();
  let settings = page.getByRole('dialog', { name: '설정' });
  await settings.getByRole('tab', { name: '워크스페이스', exact: true }).click();
  const panel = settings.locator('[data-workspace-management="managed"]');
  await panel.waitFor();
  const targetRow = panel.locator(`[data-workspace-id="${workspaceId}"]`);
  const targetButton = targetRow.getByRole('button');
  if (await targetButton.count()) await targetButton.click();
  await panel.locator(`[data-workspace-id="${workspaceId}"][data-selected]`).waitFor();
  const picker = panel.getByRole('combobox', { name: '사용자·그룹 검색' });
  const callsBeforeComposition = calls.length;
  const composingQuery = candidateName.slice(0, 18);
  await picker.fill(composingQuery);
  await picker.evaluate((input) => input.setSelectionRange(2, Math.min(5, input.value.length)));
  const compositionSelection = await picker.evaluate((input) => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd }));
  await panel.locator('[cmdk-item]').filter({ hasText: candidateName }).first().waitFor();
  const compositionButtonCount = await panel.locator('button').count();
  await picker.dispatchEvent('compositionstart');
  await picker.dispatchEvent('compositionupdate', { data: candidateName.slice(0, 1) });
  await picker.press('Enter');
  assert.equal(calls.length, callsBeforeComposition);
  assert.deepEqual(await picker.evaluate((input) => ({ value: input.value, start: input.selectionStart, end: input.selectionEnd })), compositionSelection);
  assert.equal(await panel.getByRole('alertdialog').count(), 0);
  assert.equal(await panel.locator('button').count(), compositionButtonCount);
  await picker.dispatchEvent('compositionend');
  await picker.fill(candidateName);
  const candidate = panel.locator('[cmdk-item]').filter({ hasText: candidateName }).first();
  await candidate.waitFor();
  await candidate.click();
  const add = panel.getByRole('button', { name: '관리자로 지정' });

  let previewAttempts = 0;
  await page.route((url) => url.pathname.endsWith('/admin-grant-preview'), async (route) => {
    previewAttempts += 1;
    if (previewAttempts === 1) { await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); return; }
    await route.continue();
  });
  await add.click();
  let gate = page.getByRole('alertdialog', { name: '워크스페이스 관리자로 지정' });
  await gate.getByText('영향 범위를 확인하지 못했습니다.').waitFor();
  const errorMetrics = await gate.evaluate((node) => {
    const parse = (value) => value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    const lum = (value) => { const [r, g, b] = parse(value); const c = (v) => (v /= 255) <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; return .2126 * c(r) + .7152 * c(g) + .0722 * c(b); };
    const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const alert = node.querySelector('[role="alert"]'); const action = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('관리자 지정'));
    const alertStyle = alert ? getComputedStyle(alert) : null; const actionStyle = action ? getComputedStyle(action) : null; const background = getComputedStyle(node).backgroundColor;
    return { errorContrast: alertStyle ? contrast(alertStyle.color, background) : 0, disabledContrast: actionStyle ? contrast(actionStyle.color, actionStyle.backgroundColor) : 0, disabledOpacity: Number(actionStyle?.opacity ?? 0), disabled: action?.disabled };
  });
  assert(errorMetrics.errorContrast >= 4.5, JSON.stringify(errorMetrics));
  assert(errorMetrics.disabledContrast >= 3, JSON.stringify(errorMetrics));
  assert(errorMetrics.disabledOpacity >= .5, JSON.stringify(errorMetrics));
  assert.equal(errorMetrics.disabled, true);
  assert.equal(await gate.getByRole('button', { name: '취소' }).evaluate((node) => document.activeElement === node), true);
  await gate.getByRole('button', { name: '다시 확인' }).click();
  await page.waitForTimeout(1000);
  assert.match(await gate.innerText(), /현재 표시 가능한 적용 하위 노드 2개/, JSON.stringify(calls));
  assert.match(await gate.innerText(), /상속이 끊긴 하위 항목에도 적용/);
  assert.match(await gate.innerText(), new RegExp(workspaceId));
  assert.match(await gate.innerText(), new RegExp(candidateId));

  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, { target: page.url(), value });
  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    assert.equal(await setZoom(1), 1);
    await page.setViewportSize({ width, height });
    const preGeometry = await page.evaluate(() => ({ cssViewport: { width: innerWidth, height: innerHeight }, outer: { width: outerWidth, height: outerHeight }, dpr: devicePixelRatio }));
    assert(Math.abs(preGeometry.cssViewport.width - width) <= 1, JSON.stringify({ width, height, preGeometry }));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const zoom of [100, 200]) {
        const observedZoom = await setZoom(zoom / 100);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(80);
        const geometry = await gate.evaluate((node) => {
          const rgba = (value) => { const parts = value.match(/[\d.]+/g)?.map(Number) ?? []; return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1]; };
          const luminance = ([r, g, b]) => { const channel = (v) => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b); };
          const ratio = (foreground, background) => { const a = luminance(rgba(foreground)); const b = luminance(rgba(background)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
          const action = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('관리자 지정'));
          const cancel = [...node.querySelectorAll('button')].find((button) => button.textContent?.includes('취소'));
          const style = action ? getComputedStyle(action) : null;
          const cancelStyle = cancel ? getComputedStyle(cancel) : null;
          const before = { scrollTop: node.scrollTop, actionRect: action?.getBoundingClientRect().toJSON(), dialogRect: node.getBoundingClientRect().toJSON() };
          node.scrollTop = node.scrollHeight;
          const maxScrollTop = node.scrollHeight - node.clientHeight;
          return { cssViewport: { width: innerWidth, height: innerHeight }, outer: { width: outerWidth, height: outerHeight }, dpr: devicePixelRatio, before,
            overflowX: node.scrollWidth > node.clientWidth + 1, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollTop: node.scrollTop, maxScrollTop,
            actionReachable: action instanceof HTMLElement && action.getBoundingClientRect().bottom <= innerHeight + 1,
            actionContrast: style ? ratio(style.color, style.backgroundColor) : 0, cancelContrast: cancelStyle ? ratio(cancelStyle.color, cancelStyle.backgroundColor) : 0,
            disabledOpacity: style?.opacity, wrap: getComputedStyle(node).whiteSpace };
        });
        const expectedWidth = width / (zoom / 100);
        assert(Math.abs(geometry.cssViewport.width - expectedWidth) <= 2, JSON.stringify({ width, height, theme, zoom, geometry, preGeometry }));
        assert(Math.abs(geometry.dpr - preGeometry.dpr * (zoom / 100)) <= .01, JSON.stringify({ theme, zoom, geometry, preGeometry }));
        assert(geometry.actionContrast >= 4.5, JSON.stringify({ theme, zoom, geometry }));
        assert(geometry.cancelContrast >= 4.5, JSON.stringify({ theme, zoom, geometry }));
        assert.equal(geometry.overflowX, false, JSON.stringify({ width, height, theme, zoom, geometry }));
        if (zoom === 200) {
          assert(geometry.scrollHeight > geometry.clientHeight, JSON.stringify({ width, height, theme, zoom, geometry }));
          assert(Math.abs(geometry.scrollTop - geometry.maxScrollTop) <= 1, JSON.stringify({ width, height, theme, zoom, geometry }));
        }
        assert.equal(geometry.actionReachable, true, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert.match(await gate.innerText(), /현재 표시 가능한 적용 하위 노드 2개/);
        const screenshot = `admin-grant-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        environments.push({ width, height, theme, zoom, observedZoom, preGeometry, geometry, screenshot });
      }
    }
  }
  assert.equal(environments.length, 12);
  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    const observedZoom = await setZoom(zoom / 100); assert.equal(observedZoom, zoom / 100);
    await gate.getByRole('button', { name: '취소' }).focus();
    const computed = await gate.getByRole('button', { name: '취소' }).evaluate((node) => { const s = getComputedStyle(node); return { outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth, outlineColor: s.outlineColor, forced: matchMedia('(forced-colors: active)').matches }; });
    assert.equal(computed.forced, true); assert.notEqual(computed.outlineStyle, 'none');
    const screenshot = `admin-grant-forced-${zoom}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    forcedColors.push({ zoom, observedZoom, computed, screenshot });
  }
  await page.emulateMedia({ forcedColors: 'none' });
  const finalResetZoom = await setZoom(1);
  assert.equal(finalResetZoom, 1);
  await gate.getByRole('button', { name: '취소' }).click();
  await gate.waitFor({ state: 'hidden' });
  await page.waitForFunction((node) => document.activeElement === node, await add.elementHandle());
  assert.equal(await add.evaluate((node) => document.activeElement === node), true);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0);

  await add.click(); gate = page.getByRole('alertdialog', { name: '워크스페이스 관리자로 지정' });
  await gate.getByText(/현재 표시 가능한 적용 하위 노드/).waitFor();
  const created = await page.evaluate(async (workspaceId) => {
    const response = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name: '미리보기 뒤 추가.md' }) });
    return response.status;
  }, workspaceId);
  assert.equal(created, 200);
  await gate.getByRole('button', { name: '관리자 지정' }).click();
  await gate.getByText('정보가 바뀌었습니다. 갱신된 내용을 확인하세요.').waitFor();
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  await gate.getByRole('button', { name: '갱신된 내용 확인' }).click();

  let releaseGrant; const grantGate = new Promise((resolve) => { releaseGrant = resolve; });
  await page.route((url) => url.pathname.endsWith('/admin-grants'), async (route) => { await grantGate; await route.continue(); });
  const pendingGrant = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/admin-grants'));
  await gate.getByRole('button', { name: '관리자 지정' }).click();
  await pendingGrant;
  assert.equal(await gate.getByRole('button', { name: '취소' }).isDisabled(), true);
  const pendingVisibility = await gate.getByRole('button', { name: '지정 중…' }).evaluate((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); return { opacity: Number(style.opacity), visibility: style.visibility, width: rect.width, height: rect.height }; });
  assert(pendingVisibility.opacity >= .5 && pendingVisibility.visibility === 'visible' && pendingVisibility.width > 0 && pendingVisibility.height > 0, JSON.stringify(pendingVisibility));
  await page.keyboard.press('Escape');
  assert.equal(await gate.count(), 1);
  let failCommittedRefresh = true;
  await page.route((url) => url.pathname === `/api/nodes/${encodeURIComponent(workspaceId)}/share`, async (route) => {
    if (failCommittedRefresh) { failCommittedRefresh = false; await route.fulfill({ status: 500, contentType: 'application/json', body: '{"rule":"unavailable"}' }); return; }
    await route.continue();
  });
  releaseGrant();
  await gate.waitFor({ state: 'hidden' });
  await panel.getByText('관리자로 지정했습니다. 목록을 새로 불러오지 못했습니다.').waitFor();
  assert.equal(await panel.getByRole('heading', { name: '워크스페이스 관리', exact: true, level: 2 }).evaluate((node) => document.activeElement === node), true);
  await panel.getByRole('button', { name: '목록 다시 불러오기' }).click();
  await panel.getByText('목록을 새로 불러왔습니다.').waitFor();
  await panel.locator('[data-workspace-administrators] li').filter({ hasText: candidateName }).waitFor();
  assert.equal(calls.filter((call) => call.method === 'POST').length, 2);

  await settings.getByRole('tab', { name: '전체 워크스페이스', exact: true }).click();
  const allPanel = settings.locator('[data-workspace-management="all"]');
  await allPanel.waitFor();
  const allTarget = allPanel.locator(`[data-workspace-id="${workspaceId}"]`);
  if (await allTarget.getByRole('button').count()) await allTarget.getByRole('button').click();
  const allPicker = allPanel.getByRole('combobox', { name: '사용자·그룹 검색' });
  await allPicker.fill(candidateName);
  await allPanel.locator('[cmdk-item]').filter({ hasText: candidateName }).first().click();
  await allPanel.getByRole('button', { name: '관리자로 지정' }).click();
  const assignedGate = page.getByRole('alertdialog', { name: '워크스페이스 관리자로 지정' });
  await assignedGate.getByText('이미 관리자로 지정되어 있습니다.').waitFor();
  assert.equal(await assignedGate.getByRole('button', { name: '관리자 지정' }).isDisabled(), true);
  await assignedGate.getByRole('button', { name: '취소' }).click();

  if (entryCount > 1) {
    await settings.getByRole('button', { name: '설정 닫기' }).click();
    await settingsButtons.nth(1).click();
    settings = page.getByRole('dialog', { name: '설정' });
    await settings.waitFor();
  }
  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({ runner: 'isolated Playwright persistent Chromium; extension setZoom/getZoom/reset', environments, forcedColors, errorMetrics, pendingVisibility, finalResetZoom, calls, settingsEntryCount: entryCount, workspaceEntryPaths: ['managed', 'all'], syntheticIme: 'compositionstart/update/end; Enter suppressed; query and selection preserved; no L2 or POST', nativeCandidateWindow: 'unverified and nonblocking; no native PASS claim' }, null, 2));
} finally {
  if (context) await context.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
