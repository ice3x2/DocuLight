import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { login, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.resolve(process.env.DOCULIGHT_ISSUE88_OUTPUT_DIR ?? '');
const profileRoot = process.env.DOCULIGHT_ISSUE88_PROFILE_ROOT;
if (!profileRoot || !process.env.DOCULIGHT_ISSUE88_OUTPUT_DIR) throw new Error('isolated profile and output roots are required');
fs.mkdirSync(output, { recursive: true });
const extension = path.join(profileRoot, 'zoom-extension');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Issue 88 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');

let context;
try {
  context = await chromium.launchPersistentContext(path.join(profileRoot, 'primary'), {
    headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const settingsTraffic = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/settings') settingsTraffic.push(request.method());
  });
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정' }).click();
  let settings = page.getByRole('dialog', { name: '설정' });
  await settings.getByRole('tab', { name: '인스턴스 설정' }).click();
  let upload = settings.getByLabel('업로드 크기 제한');
  const secretDraft = `issue88-secret-${Date.now()}`;
  await upload.fill(secretDraft);
  await upload.focus();
  await settings.getByText('변경 1건').waitFor();
  await settings.getByRole('tab', { name: '에디터' }).click();
  const warning = page.getByRole('alertdialog');
  await warning.waitFor({ timeout: 3_000 });
  assert.equal(await warning.getByRole('heading').innerText(), '저장하지 않은 변경');
  assert.match(await warning.innerText(), /저장하지 않은 변경 1건/);
  const safe = warning.getByRole('button', { name: '계속 편집' });
  assert.equal(await safe.evaluate((node) => document.activeElement === node), true);
  await safe.click();
  await warning.waitFor({ state: 'hidden' });
  assert.equal(await upload.inputValue(), secretDraft);
  assert.equal(await upload.evaluate((node) => document.activeElement === node), true);

  const instanceCategory = settings.getByRole('tab', { name: '인스턴스 설정' });
  const indexQueueCategory = settings.locator('[data-settings-category="index-queue"]');
  await instanceCategory.focus();
  await page.keyboard.press('ArrowDown');
  await warning.waitFor();
  const keyboardRadixActivation = await indexQueueCategory.getAttribute('aria-selected') === 'false';
  assert.equal(keyboardRadixActivation, true);
  await safe.click();
  await warning.waitFor({ state: 'hidden' });
  await upload.focus();

  await page.keyboard.press('Escape');
  await warning.waitFor();
  await safe.click();
  await warning.waitFor({ state: 'hidden' });
  await page.waitForTimeout(100);
  await page.mouse.click(1, 1);
  await warning.waitFor();
  await page.mouse.click(1, 1);
  const followUpOutsideBlocked = await warning.isVisible();
  assert.equal(followUpOutsideBlocked, true);
  assert.equal(await settings.count(), 1);
  assert.equal(settingsTraffic.filter((method) => method === 'PUT').length, 0);
  const storage = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)), session: Object.fromEntries(Object.entries(sessionStorage)),
  }));
  assert(!JSON.stringify(storage).includes(secretDraft));
  await safe.click();
  await warning.waitFor({ state: 'hidden' });
  await settings.getByRole('button', { name: '설정 닫기' }).click();
  await warning.waitFor();
  await warning.getByRole('button', { name: '변경 버리고 나가기' }).click();
  await settings.waitFor({ state: 'hidden' });
  const headerCloseDiscardPersisted = true;
  const settingsGear = page.locator('[data-shell="settings-corner"] > button');
  await page.waitForFunction(() => document.activeElement?.matches('[data-shell="settings-corner"] > button'));
  const headerCloseRestoredGearFocus = await settingsGear.evaluate((node) => document.activeElement === node);
  assert.equal(headerCloseRestoredGearFocus, true);
  await page.getByRole('button', { name: '설정' }).click();
  settings = page.getByRole('dialog', { name: '설정' });
  await settings.getByRole('tab', { name: '인스턴스 설정' }).click();
  upload = settings.getByLabel('업로드 크기 제한');
  await upload.waitFor();
  const persistedValueAfterReopen = await upload.inputValue();
  assert.equal(persistedValueAfterReopen, '104857600');
  const persistedFromActualGet = await page.evaluate(async () => (await (await fetch('/api/settings')).json())['upload-size-limit-bytes']);
  assert.equal(persistedFromActualGet, persistedValueAfterReopen);
  const longKoreanDraft = '저장하지않은긴한국어설정값'.repeat(8);
  await upload.fill(longKoreanDraft);
  const lastField = settings.getByLabel('감사 로그 보존 기간');
  await lastField.fill('366');
  await lastField.scrollIntoViewIfNeeded();
  const lastFormFieldReachable = await lastField.isVisible();
  assert.equal(lastFormFieldReachable, true);
  await settings.getByRole('tab', { name: '에디터' }).click();
  await warning.waitFor();
  const longKoreanWarningCount = /변경 2건/.test(await warning.innerText());
  assert.equal(longKoreanWarningCount, true);
  await safe.focus();
  await page.keyboard.press('Shift+Tab');
  const destructive = warning.getByRole('button', { name: '변경 버리고 나가기' });
  assert.equal(await destructive.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  const keyboardFocusTrap = await safe.evaluate((node) => document.activeElement === node);
  assert.equal(keyboardFocusTrap, true);

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
      await page.emulateMedia({ colorScheme: theme, forcedColors: 'none' });
      await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
      for (const zoom of [100, 200]) {
        const observedZoom = await setZoom(zoom / 100);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(80);
        await safe.focus();
        const geometry = await warning.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const buttons = [...node.querySelectorAll('button')].map((button) => {
            const buttonRect = button.getBoundingClientRect();
            return { text: button.textContent, left: buttonRect.left, right: buttonRect.right, top: buttonRect.top, bottom: buttonRect.bottom };
          });
          const activeStyle = getComputedStyle(document.activeElement);
          return {
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            buttons, focusOutlineWidth: activeStyle.outlineWidth,
          };
        });
        assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1);
        assert(geometry.scrollWidth <= geometry.clientWidth + 1);
        assert.equal(geometry.buttons.length, 2);
        assert(geometry.buttons.every((button) => button.left >= 0 && button.right <= geometry.width + 1 && button.bottom <= geometry.height + 1));
        assert(parseFloat(geometry.focusOutlineWidth) >= 2, `computed focus outline was ${geometry.focusOutlineWidth}`);
        assert(geometry.buttons[1].left - geometry.buttons[0].right >= 2);
        const screenshot = `leave-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        environments.push({ width, height, theme, zoom, observedZoom, geometry, screenshot });
      }
      assert.equal(await setZoom(1), 1);
    }
  }
  assert.equal(environments.length, 12);
  const forcedColors = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    const observedZoom = await setZoom(zoom / 100);
    assert.equal(observedZoom, zoom / 100);
    await safe.focus();
    const state = await safe.evaluate((node) => {
      const dialog = node.closest('[role="alertdialog"]');
      const actions = [...dialog.querySelectorAll('button')].map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      });
      return { active: matchMedia('(forced-colors: active)').matches, outline: getComputedStyle(node).outlineStyle, actions, width: innerWidth, height: innerHeight };
    });
    assert(state.active && state.outline !== 'none');
    assert.equal(state.actions.length, 2);
    assert(state.actions.every((action) => action.left >= 0 && action.right <= state.width + 1 && action.top >= 0 && action.bottom <= state.height + 1));
    const forcedActionGeometry = state.actions[1].left - state.actions[0].right >= 2;
    assert.equal(forcedActionGeometry, true);
    const screenshot = `leave-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    forcedColors.push({ zoom, observedZoom, state, screenshot });
  }
  assert.equal(await setZoom(1), 1);
  await warning.getByRole('button', { name: '변경 버리고 나가기' }).click();
  await warning.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.matches('[data-settings-category="editor"]'));
  const categoryDiscardRestoredTabFocus = await page.locator('[data-settings-category="editor"]').evaluate((node) => document.activeElement === node);
  assert.equal(categoryDiscardRestoredTabFocus, true);
  assert.equal(await settings.getByRole('tab', { name: '에디터' }).getAttribute('aria-selected'), 'true');
  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright-owned persistent Chromium with extension chrome.tabs.setZoom/getZoom',
    actualAppShell: true, environments, forcedColors, storage, putCount: settingsTraffic.filter((method) => method === 'PUT').length,
    headerCloseDiscardPersisted, headerCloseRestoredGearFocus, followUpOutsideBlocked, keyboardRadixActivation,
    categoryDiscardRestoredTabFocus, persistedValueAfterReopen, persistedFromActualGet,
    lastFormFieldReachable, longKoreanWarningCount, keyboardFocusTrap, forcedActionGeometry: forcedColors.every((entry) => entry.state.actions.length === 2),
  }, null, 2));
  console.log('PASS issue88 actual settings leave guard and exact browser matrix');
} finally {
  await context?.close();
}
