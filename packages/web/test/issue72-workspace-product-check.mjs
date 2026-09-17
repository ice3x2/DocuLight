import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue72/browser-matrix');
fs.mkdirSync(output, { recursive: true });
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const managerName = required('DOCULIGHT_E2E_MANAGER');
const managerPassword = required('DOCULIGHT_E2E_MANAGER_PASS');
const viewerName = required('DOCULIGHT_E2E_VIEWER');
const viewerPassword = required('DOCULIGHT_E2E_VIEWER_PASS');
const firstEntry = required('DOCULIGHT_E2E_MANAGER_FIRST_ENTRY');
const secondEntry = required('DOCULIGHT_E2E_MANAGER_SECOND_ENTRY');
const firstWorkspace = required('DOCULIGHT_E2E_FIRST_WORKSPACE');
const secondWorkspace = required('DOCULIGHT_E2E_SECOND_WORKSPACE');
const adminlessWorkspace = required('DOCULIGHT_E2E_ADMINLESS_WORKSPACE');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue72-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3,
  name: 'Issue 72 zoom controller',
  version: '1.0.0',
  permissions: ['tabs'],
  background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');

let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
    args: [
      '--window-position=-32000,-32000',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const calls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/workspaces' || url.pathname.startsWith('/api/workspaces/')) {
      calls.push({ method: request.method(), path: `${url.pathname}${url.search}`, body: request.postDataJSON() });
    }
  });
  const logout = async () => {
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  };
  const openSettings = async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    return page.getByRole('dialog', { name: '설정' });
  };
  const selectCategory = async (dialog, name) => {
    await dialog.getByRole('tab', { name, exact: true }).click();
  };

  // Anonymous users never receive management entry points.
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  assert.equal(await page.getByRole('button', { name: '설정', exact: true }).count(), 0);

  // Manager: exercise real error, retry/loading, duplicate identity, rename races,
  // sidecar pending, read failure, and live authority loss.
  await loginAs(page, managerName, managerPassword);
  let managedMode = 'fail';
  let releaseManaged;
  const managedGate = new Promise((resolve) => { releaseManaged = resolve; });
  await page.route((url) => url.pathname === '/api/workspaces' && url.searchParams.get('scope') === 'managed', async (route) => {
    if (managedMode === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'injected list failure' }) });
      return;
    }
    if (managedMode === 'hold') {
      await managedGate;
      managedMode = 'pass';
    }
    await route.continue();
  });
  let shareAttempt = 0;
  await page.route('**/api/nodes/*/share', async (route) => {
    shareAttempt += 1;
    if (shareAttempt === 1) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'injected admin read failure' }) });
      return;
    }
    await route.continue();
  });
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  let dialog = await openSettings();
  await selectCategory(dialog, '워크스페이스');
  await dialog.getByText('워크스페이스를 불러오지 못했습니다.').waitFor();
  managedMode = 'hold';
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  await dialog.getByText('관리 워크스페이스를 불러오는 중입니다.').waitFor();
  releaseManaged();
  const managed = dialog.locator('[data-workspace-management="managed"]');
  await managed.waitFor();
  const list = managed.getByRole('list', { name: '관리 워크스페이스' });
  await list.waitFor();
  assert.equal(await dialog.getByRole('tab', { name: '전체 워크스페이스', exact: true }).count(), 0);
  assert.equal(await list.getByRole('button').count(), 2);
  const duplicateLabels = await list.locator('small').allInnerTexts();
  assert.equal(duplicateLabels.length, 2);
  assert.notEqual(duplicateLabels[0], duplicateLabels[1]);
  assert(duplicateLabels.every((label) => label.length >= 8));
  await managed.getByText('워크스페이스 관리자를 불러오지 못했습니다.').waitFor();
  await managed.locator('[data-workspace-administrators]').getByRole('button', { name: '다시 불러오기' }).click();
  await managed.locator('[data-workspace-administrators]').getByText(managerName).waitFor();

  const nameInput = managed.getByRole('textbox', { name: '표시 이름' });
  await nameInput.fill(' ');
  await nameInput.blur();
  const describedBy = (await nameInput.getAttribute('aria-describedby'))?.split(' ') ?? [];
  assert(describedBy.length >= 2);
  assert.equal(await managed.locator(`#${describedBy.at(-1)}`).getAttribute('role'), 'alert');

  let releaseRename;
  const renameGate = new Promise((resolve) => { releaseRename = resolve; });
  let heldRename = false;
  await page.route('**/api/workspaces/*', async (route) => {
    if (route.request().method() === 'PATCH' && !heldRename) {
      heldRename = true;
      await renameGate;
    }
    await route.continue();
  });
  await nameInput.fill('첫 요청 지연');
  await managed.getByRole('button', { name: '변경' }).click();
  await page.waitForTimeout(50);
  assert.equal(heldRename, true);
  assert.equal(await nameInput.isDisabled(), true);
  const rows = list.getByRole('button');
  await rows.nth(1).click();
  const secondInput = managed.getByRole('textbox', { name: '표시 이름' });
  const secondElement = await secondInput.elementHandle();
  assert(secondElement !== null);
  await page.waitForFunction((element) => element.value !== '첫 요청 지연', secondElement);
  const secondDraft = await secondInput.inputValue();
  const renameResponse = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/api/workspaces/'));
  releaseRename();
  await renameResponse;
  assert.equal(await secondInput.inputValue(), secondDraft);
  assert.equal(await managed.getByText('표시 이름을 변경했습니다.').count(), 0);

  const patchesBeforeComposition = calls.filter((call) => call.method === 'PATCH').length;
  await secondInput.fill('조합 중');
  await secondInput.dispatchEvent('compositionstart');
  await secondInput.press('Enter');
  await secondInput.dispatchEvent('compositionend');
  assert.equal(calls.filter((call) => call.method === 'PATCH').length, patchesBeforeComposition);
  await secondInput.fill('사이드카 대기 이름');
  const sidecarResponsePromise = page.waitForResponse((response) => response.request().method() === 'PATCH' && response.url().includes('/api/workspaces/'));
  await managed.getByRole('button', { name: '변경' }).click();
  const sidecarResponse = await sidecarResponsePromise;
  const sidecarBody = await sidecarResponse.json();
  assert.equal(sidecarBody.sidecarSync, 'pending', JSON.stringify(sidecarBody));
  await managed.getByText('표시 이름은 변경됐지만 재구성 사본 갱신이 대기 중입니다.').waitFor();

  const revoke = async (entryId) => page.evaluate(async (id) => {
    const response = await fetch(`/api/acl-entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return response.status;
  }, entryId);
  assert.equal(await revoke(secondEntry), 204);
  await page.evaluate(() => {
    window.__issue72RealDateNow = Date.now;
    const original = Date.now;
    Date.now = () => original() + 31_000;
  });
  await context.setOffline(true);
  await context.setOffline(false);
  const unavailable = managed.locator('[data-workspace-unavailable]');
  await unavailable.waitFor();
  assert.equal(await unavailable.evaluate((node) => document.activeElement === node), true);
  assert.equal(await managed.getByRole('textbox', { name: '표시 이름' }).count(), 0);
  assert.equal(await list.getByRole('button').count(), 1);
  assert.equal(await list.locator('[data-workspace-static]').count(), 0);
  await list.getByRole('button').click();
  await managed.getByRole('textbox', { name: '표시 이름' }).waitFor();
  assert.equal(await list.locator('[data-workspace-static][aria-current="true"]').count(), 1);
  assert.equal(await revoke(firstEntry), 204);
  await page.route((url) => url.pathname === '/api/session', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, adminWorkspaceCount: 1 } });
  });
  await page.reload({ waitUntil: 'networkidle' });
  dialog = await openSettings();
  await selectCategory(dialog, '워크스페이스');
  await dialog.locator('[data-workspace-management="managed"]').getByText('관리 권한이 있는 워크스페이스가 없습니다.').waitFor();
  await page.unrouteAll({ behavior: 'wait' });

  // Viewer sees settings but no workspace-management category.
  await logout();
  await loginAs(page, viewerName, viewerPassword);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  dialog = await openSettings();
  assert.equal(await dialog.getByRole('tab', { name: '워크스페이스', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('tab', { name: '전체 워크스페이스', exact: true }).count(), 0);
  await dialog.getByRole('button', { name: '설정 닫기' }).click();

  // Superuser sees every workspace, the server-derived orphan badge, and truthful
  // audit context. Phase-2 archive/restore controls remain absent.
  await logout();
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  dialog = await openSettings();
  await selectCategory(dialog, '전체 워크스페이스');
  const all = dialog.locator('[data-workspace-management="all"]');
  await all.waitFor();
  const allApiRows = await page.evaluate(async () => (await fetch('/api/workspaces?scope=all')).json());
  assert(allApiRows.length >= 3);
  assert.deepEqual(
    [firstWorkspace, secondWorkspace, adminlessWorkspace].every((id) => allApiRows.some((row) => row.id === id)),
    true,
  );
  assert.equal(await all.locator('[data-workspace-list] > li').count(), allApiRows.length);
  const orphanRow = all.locator('li').filter({ hasText: '관리자 없는 실제 워크스페이스' });
  assert.equal(await orphanRow.getByTestId('adminless-badge').innerText(), '관리자 없음');
  assert.equal(await orphanRow.getByTestId('adminless-badge').getAttribute('role'), null);
  assert.equal(await all.getByRole('button', { name: /아카이브|복원/ }).count(), 0);
  await selectCategory(dialog, '감사 로그');
  const auditContext = dialog.locator('[data-audit-workspace-context]');
  await auditContext.waitFor();
  assert.match(await auditContext.innerText(), /관리 가능한 모든 워크스페이스/);
  assert.match(await auditContext.innerText(), new RegExp(allApiRows[0].id));
  await selectCategory(dialog, '전체 워크스페이스');

  const allRows = all.getByRole('list', { name: '전체 워크스페이스' }).getByRole('button');
  await allRows.first().focus();
  await page.keyboard.press('Tab');
  assert.equal(await allRows.nth(1).evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Enter');
  assert.equal(await allRows.nth(1).getAttribute('aria-current'), 'true');
  const focusStyle = await allRows.nth(1).evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });

  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, { target: page.url(), value });
  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const zoom of [100, 200]) {
        const observedZoom = await setZoom(zoom / 100);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(80);
        const geometry = await all.evaluate((node) => {
          const close = document.querySelector('[aria-label="설정 닫기"]');
          const final = node.querySelector('[data-workspace-administrators] p:last-child');
          return {
            cssViewport: { width: innerWidth, height: innerHeight },
            window: { outerWidth, outerHeight },
            devicePixelRatio,
            visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null,
            overflow: node.scrollWidth > node.clientWidth + 1,
            controls: [...node.querySelectorAll('button,input')].map((item) => item.getBoundingClientRect().height),
            selected: node.querySelectorAll('[aria-current="true"]').length,
            closeReachable: close instanceof HTMLElement && close.getBoundingClientRect().width > 0,
            finalReachable: final instanceof HTMLElement && final.getBoundingClientRect().width > 0,
          };
        });
        assert.equal(geometry.overflow, false, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert(geometry.controls.every((value) => value >= 36), JSON.stringify({ width, height, theme, zoom, geometry }));
        assert.equal(geometry.selected, 1);
        assert.equal(geometry.closeReachable, true);
        assert.equal(geometry.finalReachable, true);
        const file = `workspace-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        environments.push({ theme, requestedViewport: { width, height }, zoom, observedZoom, geometry, screenshot: file });
      }
    }
  }
  assert.equal(environments.length, 12);

  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    const observedZoom = await setZoom(zoom / 100);
    const computed = await allRows.nth(1).evaluate((node) => {
      const style = getComputedStyle(node);
      return { color: style.color, backgroundColor: style.backgroundColor, outlineColor: style.outlineColor, outlineStyle: style.outlineStyle };
    });
    const file = `workspace-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    forcedColors.push({ zoom, observedZoom, computed, screenshot: file, active: await page.evaluate(() => matchMedia('(forced-colors: active)').matches) });
  }
  assert(forcedColors.every((entry) => entry.active));
  await page.emulateMedia({ forcedColors: 'none' });
  assert.equal(await setZoom(1), 1);
  await dialog.getByRole('button', { name: '설정 닫기' }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });

  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright-owned persistent Chromium with extension setZoom/getZoom/reset',
    fixture: { firstWorkspace, secondWorkspace, adminlessWorkspace },
    roles: ['anonymous', 'manager', 'viewer', 'superuser'],
    scenarios: ['list error/loading/empty', 'administrator read error', 'rename pending/selection race', 'sidecar pending', 'authority loss focus', 'invalid blur', 'keyboard selection', 'close/final reachability'],
    focusStyle,
    calls,
    environments,
    forcedColors,
    ime: { syntheticComposition: 'passed', nativeWindowsCandidateUi: 'not automated; nonblocking manual surface remains untested' },
  }, null, 2));
  console.log('PASS issue72 roles, live races, accessibility, and 12-environment product matrix');
} finally {
  await context?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
