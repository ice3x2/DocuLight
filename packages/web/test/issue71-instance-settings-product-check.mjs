import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { login, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue71/browser-matrix');
fs.mkdirSync(output, { recursive: true });
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue71-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Issue 71 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');

let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const settingsRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/settings') {
      settingsRequests.push({ method: request.method(), body: request.postDataJSON() });
    }
  });
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  const form = dialog.getByRole('form', { name: '인스턴스 설정' });
  await form.waitFor();
  assert.equal(await form.getByRole('combobox').count(), 1);
  assert.equal(await form.getByRole('textbox').count(), 4);
  assert.deepEqual(await form.locator('label').allTextContents(), ['가입 모드', '업로드 크기 제한', '보관 버전 개수', '휴지통 보존 일수', '감사 로그 보존 기간']);

  const signup = form.getByLabel('가입 모드');
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  const initialFlow = settingsRequests.map((request) => request.method);
  assert.deepEqual(initialFlow, ['GET', 'GET', 'PUT', 'GET']);
  assert.deepEqual(settingsRequests[2].body, { 'signup-mode': 'open' });
  assert.equal(await signup.inputValue(), 'open');

  let releasePreflight;
  const preflightGate = new Promise((resolve) => { releasePreflight = resolve; });
  let delayedPreflight = false;
  const pendingRoute = async (route) => {
    if (!delayedPreflight && route.request().method() === 'GET') {
      delayedPreflight = true;
      await preflightGate;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', pendingRoute);
  await signup.selectOption('invite-only');
  await form.getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(50);
  assert.equal(await signup.isDisabled(), true);
  releasePreflight();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  await page.unroute('**/api/settings', pendingRoute);

  let abortedPut = false;
  const uncertainRoute = async (route) => {
    if (!abortedPut && route.request().method() === 'PUT') {
      abortedPut = true;
      await route.abort('connectionfailed');
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', uncertainRoute);
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByRole('button', { name: '저장 상태 확인' }).waitFor();
  await page.unroute('**/api/settings', uncertainRoute);
  await form.getByRole('button', { name: '저장 상태 확인' }).click();
  await form.getByText('저장 여부를 확인했습니다. 다시 저장할 수 있습니다.').waitFor();
  await form.getByRole('button', { name: '되돌리기' }).click();

  const beforeBlocked = settingsRequests.length;
  const trash = form.getByLabel('휴지통 보존 일수');
  await trash.fill('7');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByRole('alert').waitFor();
  assert.match(await form.getByRole('alert').innerText(), /영향 건수를 새로 확인할 수 없어/);
  assert.equal(settingsRequests.length, beforeBlocked + 1);
  assert.equal(settingsRequests.at(-1).method, 'GET');
  assert.equal(await trash.inputValue(), '7');
  await form.getByRole('button', { name: '되돌리기' }).click();

  const upload = form.getByLabel('업로드 크기 제한');
  await upload.fill('104857601');
  await upload.focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await upload.inputValue(), '104857601');
  assert.equal(await upload.evaluate((node) => document.activeElement === node), true);

  async function setZoom(value) {
    return worker.evaluate(async ({ target, value }) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
      if (!tab?.id) throw new Error('product tab missing');
      await chrome.tabs.setZoom(tab.id, value);
      return chrome.tabs.getZoom(tab.id);
    }, { target: page.url(), value });
  }

  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const resetZoom = await setZoom(1);
      assert.equal(resetZoom, 1);
      await page.waitForTimeout(80);
      for (const zoom of [100, 200]) {
        const observedZoom = zoom === 100 ? await setZoom(1) : await setZoom(2);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(100);
        await form.getByRole('button', { name: '저장' }).scrollIntoViewIfNeeded();
        const metrics = await form.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const action = node.querySelector('[data-instance-settings-action]').getBoundingClientRect();
          const controls = [...node.querySelectorAll('input, select, button')].map((item) => item.getBoundingClientRect().height);
          const note = node.querySelector('[data-instance-retention-note]').getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            form: { width: rect.width, right: rect.right },
            action: { top: action.top, bottom: action.bottom },
            controls,
            note: { height: note.height, scrollWidth: node.querySelector('[data-instance-retention-note]').scrollWidth, clientWidth: node.querySelector('[data-instance-retention-note]').clientWidth },
            fieldGap: getComputedStyle(node.querySelector('[data-instance-settings-fields]')).rowGap,
          };
        });
        assert(metrics.form.width <= 640.5);
        assert(metrics.controls.every((heightValue) => heightValue >= 36));
        assert(metrics.action.bottom <= metrics.viewport.height + 1);
        assert(metrics.note.scrollWidth <= metrics.note.clientWidth + 1);
        assert.equal(metrics.fieldGap, '32px');
        const file = `instance-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        environments.push({ theme, width, height, zoom, observedZoom, resetZoom, metrics, screenshot: file });
      }
    }
  }
  assert.equal(environments.length, 12);
  assert.equal(await upload.inputValue(), '104857601');
  await setZoom(1);
  assert.equal(await setZoom(1), 1);
  await form.getByRole('button', { name: '되돌리기' }).click();

  await upload.fill('-');
  await upload.blur();
  await form.locator('[data-instance-setting-error]').waitFor();
  assert.equal(await upload.getAttribute('aria-invalid'), 'true');
  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    const observedZoom = await setZoom(zoom / 100);
    assert.equal(observedZoom, zoom / 100);
    await page.waitForTimeout(80);
    const file = `instance-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    const state = await form.evaluate((node) => ({
      forced: matchMedia('(forced-colors: active)').matches,
      invalidStyle: getComputedStyle(node.querySelector('input')).borderStyle,
      actionVisible: node.querySelector('[data-instance-settings-action]').getBoundingClientRect().bottom <= innerHeight + 1,
    }));
    assert(state.forced && state.actionVisible);
    assert.notEqual(state.invalidStyle, 'none');
    forcedColors.push({ zoom, observedZoom, state, screenshot: file });
  }
  await page.emulateMedia({ forcedColors: 'none' });
  await setZoom(1);
  await form.getByRole('button', { name: '되돌리기' }).click();

  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  let failedLoad = false;
  const loadErrorRoute = async (route) => {
    if (!failedLoad && route.request().method() === 'GET') {
      failedLoad = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', loadErrorRoute);
  await page.getByRole('button', { name: '설정' }).click();
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  await dialog.getByRole('alert').filter({ hasText: '설정을 불러오지 못했습니다.' }).waitFor();
  assert.equal(await form.count(), 0);
  await page.unroute('**/api/settings', loadErrorRoute);
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  await form.waitFor();

  const roleLossRoute = async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', roleLossRoute);
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await dialog.getByRole('alert').filter({ hasText: '편집을 중단했습니다.' }).waitFor();
  assert.equal(await form.count(), 0);
  await page.unroute('**/api/settings', roleLossRoute);
  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('button', { name: '설정' }).click();
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  await form.waitFor();

  await signup.selectOption('approval');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  assert.equal(await signup.inputValue(), 'approval');

  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright-owned persistent Chromium with extension chrome.tabs.setZoom/getZoom',
    actualAppShell: true,
    actualSettingsApi: true,
    stateChecks: ['pending-lock', 'transport-uncertain-reconciliation', 'load-error-retry', 'role-loss-stop', 'invalid', 'retention-blocked'],
    environments,
    forcedColors,
    requestMethods: settingsRequests.map((request) => request.method),
  }, null, 2));
  console.log('PASS issue71 actual AppShell/settings API and 12-environment browser matrix');
} finally {
  await context?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
