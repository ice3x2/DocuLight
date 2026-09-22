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
const superuserName = required('DOCULIGHT_E2E_USER');
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
    if (url.pathname === '/api/workspaces' || url.pathname.startsWith('/api/workspaces/')
      || url.pathname === '/api/grant-warnings' || url.pathname.startsWith('/api/acl-entries/')) {
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
  await managed.locator('[data-workspace-administrators]').getByText(managerName, { exact: true }).waitFor();

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

  const administratorSection = managed.locator('[data-workspace-administrators]');
  const revokeEntry = administratorSection.getByRole('button', { name: `${managerName} \uAD00\uB9AC \uAD8C\uD55C \uD68C\uC218` });
  const deletesBeforeCancel = calls.filter((call) => call.method === 'DELETE' && call.path.includes(secondEntry)).length;
  await revokeEntry.click();
  let revokeDialog = page.getByRole('alertdialog');
  await revokeDialog.getByTestId('grant-warning').waitFor();
  const cancel = revokeDialog.getByRole('button', { name: '\uCDE8\uC18C' });
  assert.equal(await cancel.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Escape');
  await revokeDialog.waitFor({ state: 'hidden' });
  assert.equal(calls.filter((call) => call.method === 'DELETE' && call.path.includes(secondEntry)).length, deletesBeforeCancel);
  await revokeEntry.evaluate((node) => new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (document.activeElement === node) resolve(undefined);
      else if (performance.now() - started > 1000) reject(new Error('revoke entry focus was not restored'));
      else requestAnimationFrame(check);
    };
    check();
  }));

  await revokeEntry.click();
  revokeDialog = page.getByRole('alertdialog');
  await revokeDialog.getByTestId('grant-warning').waitFor();
  await revokeDialog.getByRole('button', { name: '\uAD00\uB9AC \uAD8C\uD55C \uD68C\uC218' }).click();
  const mutationStatus = managed.locator('[data-workspace-admin-mutation-status]');
  await mutationStatus.waitFor();
  assert((await mutationStatus.innerText()).includes('\uAD00\uB9AC \uAD8C\uD55C\uC744 \uD68C\uC218'));
  assert.equal(calls.filter((call) => call.method === 'DELETE' && call.path.includes(secondEntry)).length, deletesBeforeCancel + 1);
  assert(calls.filter((call) => call.method === 'GET' && call.path.includes(`/api/grant-warnings?entryId=${encodeURIComponent(secondEntry)}`)).length >= 2);
  const unavailable = managed.locator('[data-workspace-unavailable]');
  await unavailable.waitFor();
  assert.equal(await mutationStatus.evaluate((node) => document.activeElement === node), true);
  assert.equal(await managed.getByRole('textbox', { name: '\uD45C\uC2DC \uC774\uB984' }).count(), 0);
  assert.equal(await list.getByRole('button').count(), 1);
  assert.equal(await list.locator('[data-workspace-static]').count(), 0);
  await list.getByRole('button').click();
  await managed.getByRole('textbox', { name: '\uD45C\uC2DC \uC774\uB984' }).waitFor();
  assert.equal(await list.locator('[data-workspace-static][aria-current="true"]').count(), 1);
  const firstDeleteStatus = await page.evaluate(async (id) => {
    const response = await fetch(`/api/acl-entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return response.status;
  }, firstEntry);
  assert.equal(firstDeleteStatus, 204);
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
  await allRows.nth(1).evaluate((node) => new Promise((resolve, reject) => { const deadline = performance.now() + 2_000; const frame = () => { if (node.getAttribute('aria-current') === 'true') return resolve(true); if (performance.now() >= deadline) return reject(new Error('workspace selection timeout')); requestAnimationFrame(frame); }; requestAnimationFrame(frame); }));
  assert.equal(await allRows.nth(1).getAttribute('aria-current'), 'true');
  const focusStyle = await allRows.nth(1).evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });

  const firstAllRow = all.locator(`[data-workspace-id=\"${firstWorkspace}\"] button`);
  await firstAllRow.click();
  const superuserRevoke = all.locator('[data-workspace-administrators]').getByRole('button', { name: `${superuserName} \uAD00\uB9AC \uAD8C\uD55C \uD68C\uC218` });
  await superuserRevoke.click();
  const revokeMatrixDialog = page.getByRole('alertdialog');
  await revokeMatrixDialog.getByTestId('grant-warning').waitFor();
  const matrixCancel = revokeMatrixDialog.getByRole('button', { name: '\uCDE8\uC18C' });
  assert.equal(await matrixCancel.evaluate((node) => document.activeElement === node), true);

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
        const geometry = await revokeMatrixDialog.evaluate((node) => {
          const actions = node.querySelector('[data-slot="alert-dialog-actions"]');
          const before = node.getBoundingClientRect();
          node.scrollTop = node.scrollHeight;
          const maxScrollTop = node.scrollHeight - node.clientHeight;
          const reachedScrollEnd = Math.abs(node.scrollTop - maxScrollTop) <= 1;
          return {
            cssViewport: { width: innerWidth, height: innerHeight },
            window: { outerWidth, outerHeight },
            devicePixelRatio,
            visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null,
            rect: { left: before.left, top: before.top, right: before.right, bottom: before.bottom },
            overflowX: node.scrollWidth > node.clientWidth + 1,
            maxScrollTop,
            reachedScrollEnd,
            controls: [...node.querySelectorAll('button,input')].map((item) => item.getBoundingClientRect().height),
            actionsReachable: actions instanceof HTMLElement && actions.getBoundingClientRect().width > 0,
            warningCount: node.querySelectorAll('[data-testid="grant-warning"]').length,
          };
        });
        const expectedCssViewport = { width: Math.round(width / (zoom / 100)), height: Math.round(height / (zoom / 100)) };
        assert(Math.abs(geometry.cssViewport.width - expectedCssViewport.width) <= 2, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert(Math.abs(geometry.cssViewport.height - expectedCssViewport.height) <= 2, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert.equal(geometry.overflowX, false, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert(geometry.controls.every((value) => value >= 36), JSON.stringify({ width, height, theme, zoom, geometry }));
        assert.equal(geometry.actionsReachable, true);
        assert.equal(geometry.warningCount, 1);
        assert.equal(geometry.reachedScrollEnd, true);
        assert(geometry.rect.left >= -1 && geometry.rect.right <= geometry.cssViewport.width + 1, JSON.stringify(geometry));
        assert(geometry.rect.top >= -1 && geometry.rect.bottom <= geometry.cssViewport.height + 1, JSON.stringify(geometry));
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
    await matrixCancel.focus();
    const computed = await matrixCancel.evaluate((node) => {
      const style = getComputedStyle(node);
      return { color: style.color, backgroundColor: style.backgroundColor, outlineColor: style.outlineColor, outlineStyle: style.outlineStyle };
    });
    const file = `workspace-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    forcedColors.push({ zoom, observedZoom, computed, screenshot: file, active: await page.evaluate(() => matchMedia('(forced-colors: active)').matches) });
  }
  assert(forcedColors.every((entry) => entry.active));
  await page.emulateMedia({ forcedColors: 'none' });
  assert.equal(await setZoom(2), 2);
  await page.setViewportSize({ width: 1000, height: 640 });
  assert.equal(await revokeMatrixDialog.getByTestId('grant-warning').count(), 1);
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await revokeMatrixDialog.getByTestId('grant-warning').count(), 1);
  assert.equal(await setZoom(1), 1);
  await matrixCancel.click();
  await revokeMatrixDialog.waitFor({ state: 'hidden' });
  await superuserRevoke.evaluate((node) => new Promise((resolve, reject) => {
    const started = performance.now();
    const check = () => {
      if (document.activeElement === node) resolve(undefined);
      else if (performance.now() - started > 1000) reject(new Error('superuser revoke focus was not restored'));
      else requestAnimationFrame(check);
    };
    check();
  }));
  await dialog.getByRole('button', { name: '설정 닫기' }).focus();
  await page.keyboard.press('Enter');
  await dialog.waitFor({ state: 'hidden' });

  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright-owned persistent Chromium with extension setZoom/getZoom/reset',
    fixture: { firstWorkspace, secondWorkspace, adminlessWorkspace },
    roles: ['anonymous', 'manager', 'viewer', 'superuser'],
    scenarios: ['list error/loading/empty', 'administrator read error', 'rename pending/selection race', 'sidecar pending', 'authority loss focus', 'invalid blur', 'keyboard selection', 'revoke cancel/confirm/focus', 'revoke dialog scroll/resize/zoom reachability'],
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
