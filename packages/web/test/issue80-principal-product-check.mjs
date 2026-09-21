import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const output = required('DOCULIGHT_ISSUE80_OUTPUT');
const browserRoot = required('DOCULIGHT_ISSUE80_BROWSER_ROOT');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(browserRoot, { recursive: true });

const credentials = {
  superuser: [required('DOCULIGHT_ISSUE80_SUPER_NAME'), required('DOCULIGHT_ISSUE80_SUPER_PASS')],
  ordinary: [required('DOCULIGHT_ISSUE80_ORDINARY_NAME'), required('DOCULIGHT_ISSUE80_ORDINARY_PASS')],
  manager: [required('DOCULIGHT_ISSUE80_MANAGER_NAME'), required('DOCULIGHT_ISSUE80_MANAGER_PASS')],
};
const pendingId = required('DOCULIGHT_ISSUE80_PENDING_ID');
const pendingName = required('DOCULIGHT_ISSUE80_PENDING_NAME');
const secondPendingId = required('DOCULIGHT_ISSUE80_SECOND_PENDING_ID');
const rejectedId = required('DOCULIGHT_ISSUE80_REJECTED_ID');

const extension = path.join(browserRoot, 'zoom-extension');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3,
  name: 'Issue 80 isolated zoom controller',
  version: '1.0.0',
  permissions: ['tabs'],
  background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');

const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const requests = [];
const observations = [];
const accessibility = { unauthorizedRolesAbsent: [], authorizedFocusChecks: [] };
let context;

const settings = async (page) => {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const dialog = page.locator('[data-settings-dialog]');
  await dialog.waitFor();
  return dialog;
};

const directDenial = async (page, who) => {
  const result = await page.evaluate(async () => {
    const call = async (path, init) => {
      const response = await fetch(path, init);
      return response.status;
    };
    return {
      roster: await call('/api/roster/users'),
      mode: await call('/api/instance/signup-mode'),
      register: await call('/api/roster/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'denied', password: 'not-recorded' }) }),
      approve: await call(`/api/roster/users/${encodeURIComponent('missing')}/approve`, { method: 'POST' }),
      status: await call(`/api/roster/users/${encodeURIComponent('missing')}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) }),
      reopen: await call(`/api/roster/users/${encodeURIComponent('missing')}/reopen`, { method: 'POST' }),
    };
  });
  assert.deepEqual(result, { roster: 404, mode: 404, register: 404, approve: 403, status: 404, reopen: 403 }, `${who}: ${JSON.stringify(result)}`);
};

const rgba = (value) => value.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
const luminance = (value) => {
  const [r, g, b] = rgba(value);
  const channel = (one) => (one /= 255) <= .04045 ? one / 12.92 : ((one + .055) / 1.055) ** 2.4;
  return .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(b);
};
const contrast = (foreground, background) => {
  const a = luminance(foreground); const b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};

try {
  context = await chromium.launchPersistentContext(path.join(browserRoot, 'profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const environmentMatrix = [[1280, 720], [1440, 900], [1920, 1080]];
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('owned product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
  }, { target: page.url(), value });
  const getZoom = async () => worker.evaluate(async (target) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('owned product tab missing');
    return chrome.tabs.getZoom(tab.id);
  }, page.url());
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/api/roster/users') || url.pathname.includes('/api/instance/signup-mode')) {
      requests.push({ method: request.method(), path: url.pathname, body: request.postDataJSON?.() });
    }
  });
  const roleCookies = {};
  for (const role of ['ordinary', 'manager', 'superuser']) {
    await context.clearCookies();
    await loginAs(page, ...credentials[role]);
    roleCookies[role] = await context.cookies();
  }
  const useRole = async (role) => {
    await context.clearCookies();
    await context.addCookies(roleCookies[role]);
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  };

  for (const [width, height] of environmentMatrix) {
    for (const theme of ['light', 'dark']) {
      for (const zoom of [100, 200]) {
        for (const role of ['ordinary', 'manager']) {
          await useRole(role);
          await page.setViewportSize({ width, height });
          await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
          await setZoom(zoom / 100);
          assert.equal(await getZoom(), zoom / 100);
          const dialog = await settings(page);
          assert.equal(await dialog.getByRole('tab', { name: '사용자 관리', exact: true }).count(), 0);
          assert.equal(await dialog.getByRole('tab', { name: '가입 승인', exact: true }).count(), 0);
          assert.equal(await dialog.locator('[data-principal-panel]').count(), 0);
          await directDenial(page, `${role}:${width}x${height}:${theme}:${zoom}`);
          accessibility.unauthorizedRolesAbsent.push({ role, width, height, theme, zoom });
          await dialog.getByRole('button', { name: '설정 닫기' }).click();
        }
      }
    }
  }
  assert.equal(accessibility.unauthorizedRolesAbsent.length, 24);
  await setZoom(1);
  assert.equal(await getZoom(), 1);

  let allowRoster = false;
  let allowMode = false;
  let failNextRoster = false;
  let uncertainApprove = true;
  let delayedApprove = true;
  let refuseRegistration = true;
  let delayRegistration = true;
  await page.route('**/api/roster/users**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/roster/users' && (!allowRoster || failNextRoster)) {
      failNextRoster = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"private raw detail"}' });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/roster/users' && refuseRegistration) {
      refuseRegistration = false;
      await route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"account exists: private raw detail"}' });
      return;
    }
    if (request.method() === 'POST' && url.pathname === '/api/roster/users' && delayRegistration) {
      delayRegistration = false;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (request.method() === 'POST' && url.pathname === `/api/roster/users/${secondPendingId}/approve` && uncertainApprove) {
      uncertainApprove = false;
      await route.abort('failed');
      return;
    }
    if (request.method() === 'POST' && url.pathname === `/api/roster/users/${secondPendingId}/approve` && delayedApprove) {
      delayedApprove = false;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await route.continue();
  });
  await page.route('**/api/instance/signup-mode', async (route) => {
    if (!allowMode) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"private mode detail"}' });
      return;
    }
    await route.continue();
  });

  await useRole('superuser');
  let dialog = await settings(page);
  await dialog.getByRole('tab', { name: '가입 승인', exact: true }).click();
  const approval = dialog.locator('[data-principal-panel="approval"]');
  await approval.getByRole('alert').filter({ hasText: '가입 승인 목록' }).waitFor();
  assert.equal(await approval.locator('[data-principal-account-id]').count(), 0, 'failed roster must hide stale privileged rows');
  const rosterGetsBefore = requests.filter((one) => one.method === 'GET' && one.path === '/api/roster/users').length;
  const modeGetsBefore = requests.filter((one) => one.method === 'GET' && one.path === '/api/instance/signup-mode').length;
  allowRoster = true;
  await approval.getByRole('button', { name: '가입 승인 목록 다시 불러오기' }).click();
  await approval.locator(`[data-principal-account-id="${pendingId}"]`).waitFor();
  assert.equal(requests.filter((one) => one.method === 'GET' && one.path === '/api/roster/users').length, rosterGetsBefore + 1);
  assert.equal(requests.filter((one) => one.method === 'GET' && one.path === '/api/instance/signup-mode').length, modeGetsBefore);
  await approval.getByText('가입 모드를 불러오지 못했습니다.').waitFor();
  assert((await approval.getByRole('tab', { name: /대기 중/ }).innerText()).includes('(2)'));
  allowMode = true;
  await approval.getByRole('button', { name: '가입 모드 다시 불러오기' }).click();
  await approval.getByRole('tab', { name: /거절됨 \(1\)/ }).waitFor();

  await dialog.getByRole('tab', { name: '사용자 관리', exact: true }).click();
  const roster = dialog.locator('[data-principal-panel="roster"]');
  const registrationName = `브라우저 등록 ${Date.now()}`;
  const registrationPassword = `Issue80-Browser-${Date.now()}`;
  const nameInput = roster.getByLabel('새 사용자 이름');
  const passwordInput = roster.getByLabel('임시 비밀번호');
  await nameInput.fill(registrationName);
  await passwordInput.fill(registrationPassword);
  const registerPostsBeforeComposition = requests.filter((one) => one.method === 'POST' && one.path === '/api/roster/users').length;
  await nameInput.focus();
  await nameInput.dispatchEvent('compositionstart', { data: '브' });
  await page.keyboard.press('Enter');
  await nameInput.dispatchEvent('compositionend', { data: '브' });
  await page.waitForTimeout(100);
  assert.equal(requests.filter((one) => one.method === 'POST' && one.path === '/api/roster/users').length, registerPostsBeforeComposition, 'synthetic composition Enter must perform zero writes');

  await roster.getByRole('button', { name: '등록', exact: true }).click();
  await roster.getByText('사용자를 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도하십시오.').waitFor();
  assert.equal(await nameInput.inputValue(), registrationName);
  assert.equal(await passwordInput.inputValue(), registrationPassword);
  assert.equal(await passwordInput.getAttribute('type'), 'password');
  assert.equal(await roster.getByText(/account exists|private raw detail/).count(), 0);

  const registerResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/roster/users');
  const registrationDispatch = roster.getByRole('button', { name: '등록', exact: true }).evaluate((button) => {
    button.click();
    button.closest('form')?.requestSubmit(); // same-tick duplicate path
  });
  await roster.getByText('사용자를 등록하는 중입니다.').waitFor();
  assert.equal(await nameInput.isEditable(), false);
  assert.equal(await passwordInput.isEditable(), false);
  assert.equal(await nameInput.inputValue(), registrationName);
  assert.equal(await passwordInput.inputValue(), registrationPassword);
  await registrationDispatch;
  const created = await registerResponse;
  assert.equal(created.status(), 201);
  const receipt = await created.json();
  assert.equal(typeof receipt.id, 'string');
  assert(receipt.id.length > 0);
  await roster.getByText('사용자를 등록했습니다.').waitFor();
  assert.equal(await nameInput.inputValue(), '');
  assert.equal(await passwordInput.inputValue(), '');
  assert.equal(requests.filter((one) => one.method === 'POST' && one.path === '/api/roster/users').length, registerPostsBeforeComposition + 2, 'refusal plus same-tick accepted intent must be two POSTs');

  await dialog.getByRole('tab', { name: '가입 승인', exact: true }).click();
  const targetRow = approval.locator(`[data-principal-account-id="${pendingId}"]`);
  const nextRow = approval.locator(`[data-principal-account-id="${secondPendingId}"]`);
  const rejectButton = targetRow.getByRole('button', { name: `${pendingName} 거절` });
  await rejectButton.focus();
  failNextRoster = true;
  await rejectButton.evaluate((button) => { button.click(); button.click(); });
  await approval.getByText('가입을 거절했습니다.').waitFor();
  const undo = approval.getByRole('button', { name: '실행취소' });
  assert.equal(await undo.isDisabled(), true);
  assert.equal(await approval.getByText('private raw detail').count(), 0);
  await approval.getByRole('button', { name: '가입 승인 목록 다시 불러오기' }).click();
  await approval.getByRole('tab', { name: /거절됨 \(2\)/ }).waitFor();
  assert.equal(await undo.isEnabled(), true);
  await undo.evaluate((button) => { button.click(); button.click(); });
  await approval.getByText('재심사 대상으로 되돌렸습니다.').waitFor();
  await approval.locator(`[data-principal-account-id="${pendingId}"]`).waitFor();

  const pendingApprove = approval.locator(`[data-principal-account-id="${pendingId}"]`).getByRole('button', { name: `${pendingName} 승인` });
  await pendingApprove.focus();
  await pendingApprove.evaluate((button) => { button.click(); button.click(); });
  await approval.getByText('가입을 승인했습니다.').waitFor();
  await approval.locator(`[data-principal-account-id="${pendingId}"]`).waitFor({ state: 'detached' });
  await page.waitForFunction((id) => {
    const row = document.querySelector(`[data-principal-account-id="${id}"]`);
    return row?.querySelector('button') === document.activeElement;
  }, secondPendingId);
  assert.equal(await nextRow.getByRole('button', { name: /승인/ }).evaluate((node) => document.activeElement === node), true);
  accessibility.authorizedFocusChecks.push('stable-id-next-action');

  await approval.getByRole('tab', { name: /거절됨/ }).click();
  const rejectedRow = approval.locator(`[data-principal-account-id="${rejectedId}"]`);
  await rejectedRow.getByRole('button', { name: /재심사/ }).evaluate((button) => { button.click(); button.click(); });
  await approval.getByText('재심사 대상으로 되돌렸습니다.').waitFor();

  await approval.getByRole('tab', { name: /대기 중/ }).click();
  const secondApprove = approval.locator(`[data-principal-account-id="${secondPendingId}"]`).getByRole('button', { name: /승인/ });
  await secondApprove.click();
  await approval.getByText('요청을 완료하지 못했습니다. 목록을 새로 불러온 뒤 다시 시도하십시오.').waitFor();
  assert.equal(await secondApprove.isDisabled(), true);
  await approval.getByRole('button', { name: '목록 새로 불러오기' }).click();
  await page.waitForFunction((id) => {
    const row = document.querySelector(`[data-principal-account-id="${id}"]`);
    return row?.querySelector('button:not(:disabled)') !== null;
  }, secondPendingId);

  await secondApprove.click();
  await dialog.getByRole('tab', { name: '사용자 관리', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await roster.getByText('가입을 승인했습니다.').count(), 0, 'old category completion must not repaint or steal focus');

  await dialog.getByRole('tab', { name: '가입 승인', exact: true }).click();
  const activeTabName = await approval.locator('[role="tab"][data-state="active"]').innerText();
  for (const [width, height] of environmentMatrix) {
    await setZoom(1);
    assert.equal(await getZoom(), 1);
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
      for (const zoom of [100, 200]) {
        await setZoom(zoom / 100);
        const observedZoom = await getZoom();
        assert.equal(observedZoom, zoom / 100);
        await approval.locator('[data-principal-table-wrap]').first().scrollIntoViewIfNeeded();
        const geometry = await approval.evaluate((node) => {
          const dialog = node.closest('[data-settings-dialog]');
          const action = node.querySelector('button:not(:disabled)');
          const nodeStyle = getComputedStyle(node);
          const actionStyle = action ? getComputedStyle(action) : null;
          const opaqueBackground = (element) => {
            let current = element;
            while (current instanceof Element) {
              const color = getComputedStyle(current).backgroundColor;
              const alpha = color.match(/[\d.]+/g)?.map(Number)[3] ?? 1;
              if (alpha > .99) return color;
              current = current.parentElement;
            }
            return getComputedStyle(document.documentElement).backgroundColor;
          };
          const rect = dialog?.getBoundingClientRect();
          if (dialog) dialog.scrollTop = dialog.scrollHeight;
          return {
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
            overflowX: node.scrollWidth > node.clientWidth + 1,
            dialogRect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null,
            text: { color: nodeStyle.color, background: opaqueBackground(node) },
            action: actionStyle ? { color: actionStyle.color, background: opaqueBackground(action) } : null,
            actionReachable: action instanceof HTMLElement && action.getBoundingClientRect().bottom <= innerHeight + 1,
          };
        });
        assert.equal(geometry.overflowX, false, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert(geometry.dialogRect && geometry.dialogRect.left >= -1 && geometry.dialogRect.right <= geometry.viewport.width + 1, JSON.stringify(geometry));
        const textRatio = contrast(geometry.text.color, geometry.text.background);
        assert(textRatio >= 4.5, `text contrast ${textRatio}`);
        if (geometry.action) assert(contrast(geometry.action.color, geometry.action.background) >= 3);
        assert.equal(await approval.locator('[role="tab"][data-state="active"]').innerText(), activeTabName);
        const screenshot = `principal-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        observations.push({ width, height, theme, zoom, observedZoom, geometry, textRatio, screenshot });
      }
    }
  }
  assert.equal(observations.length, 12);

  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    await setZoom(zoom / 100);
    assert.equal(await getZoom(), zoom / 100);
    const focusTarget = approval.getByRole('tab', { name: /대기 중/ });
    await focusTarget.focus();
    const focus = await focusTarget.evaluate((node) => {
      const style = getComputedStyle(node);
      return { forced: matchMedia('(forced-colors: active)').matches, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.equal(focus.forced, true);
    assert.notEqual(focus.outlineStyle, 'none');
    const screenshot = `principal-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    forcedColors.push({ zoom, observedZoom: await getZoom(), focus, screenshot });
  }
  await page.emulateMedia({ forcedColors: 'none' });
  await setZoom(1);
  assert.equal(await getZoom(), 1, 'reset must be confirmed by a separate read-only getZoom');

  const allWriteCounts = {
    register: requests.filter((one) => one.method === 'POST' && one.path === '/api/roster/users').length,
    approve: requests.filter((one) => one.method === 'POST' && one.path.endsWith('/approve')).length,
    reject: requests.filter((one) => one.method === 'POST' && one.path.endsWith('/status')).length,
    reopen: requests.filter((one) => one.method === 'POST' && one.path.endsWith('/reopen')).length,
  };
  const deniedWriteCounts = { register: 24, approve: 24, reject: 24, reopen: 24 };
  const writeCounts = Object.fromEntries(Object.entries(allWriteCounts).map(([key, value]) => [key, value - deniedWriteCounts[key]]));
  assert.deepEqual(writeCounts, { register: 2, approve: 3, reject: 1, reopen: 2 });
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({
    requirement: 'IR-PRINCIPAL-002',
    ownedPersistentContexts: 1,
    isolatedProfile: true,
    matrixCount: observations.length,
    forcedColorsCount: forcedColors.length,
    observations,
    forcedColors,
    requests: requests.map(({ method, path: requestPath }) => ({ method, path: requestPath })),
    writeCounts,
    deniedWriteCounts,
    accessibility,
    refreshFailed: 'covered by intercepted post-write roster GET only',
    registrationRefusal: 'covered by intercepted 400 with raw detail; raw name and masked password retained without detail disclosure',
    uncertain: 'covered by intercepted transport abort followed by explicit GET reconciliation',
    sameTick: 'button click plus requestSubmit dispatched in one browser task',
    nativeWindowsImeCandidateUi: 'nonblocking-unverified',
    passwordManagerUi: 'nonblocking-unverified',
    autofillNativeUi: 'nonblocking-unverified',
    syntheticCompositionBoundary: 'covered',
  }, null, 2));
} finally {
  await context?.close();
}
