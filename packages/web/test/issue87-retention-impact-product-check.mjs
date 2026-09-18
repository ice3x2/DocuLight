import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { login, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const configuredOutput = process.env.DOCULIGHT_ISSUE87_OUTPUT_DIR;
if (!configuredOutput) throw new Error('DOCULIGHT_ISSUE87_OUTPUT_DIR is required');
const output = path.resolve(configuredOutput);
fs.mkdirSync(output, { recursive: true });
const profileRoot = process.env.DOCULIGHT_ISSUE87_PROFILE_ROOT;
if (!profileRoot) throw new Error('isolated profile root missing');
const extension = path.join(profileRoot, 'zoom-extension');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Issue 87 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const rgb = (value) => {
  const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
  if (!match) throw new Error(`unparseable color ${value}`);
  return match.slice(1, 4).map(Number);
};
const luminance = (value) => rgb(value).map((channel) => channel / 255)
  .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const IPC_TIMEOUT_MS = 10_000;
const parentRoundtrip = (type) => new Promise((resolve, reject) => {
  if (typeof process.send !== 'function') { reject(new Error('runner IPC unavailable')); return; }
  const expected = `${type}-ok`;
  const cleanup = () => {
    clearTimeout(timeout);
    process.off('message', receive);
  };
  const receive = (message) => {
    if (message?.type !== expected) return;
    cleanup();
    if (message.ok === false) reject(new Error(`runner rejected ${type}: ${message.error ?? 'unknown failure'}`));
    else resolve();
  };
  const timeout = setTimeout(() => {
    cleanup();
    reject(new Error(`runner IPC timed out for ${type} after ${IPC_TIMEOUT_MS}ms`));
  }, IPC_TIMEOUT_MS);
  process.on('message', receive);
  process.send({ type }, (error) => {
    if (error === null) return;
    cleanup();
    reject(error);
  });
});
let context; let secondContext;
try {
  context = await chromium.launchPersistentContext(path.join(profileRoot, 'primary'), {
    headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const traffic = [];
  page.on('response', async (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname === '/api/settings' || pathname === '/api/settings/retention-impact') {
      traffic.push({ method: response.request().method(), pathname, status: response.status() });
    }
  });
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정' }).click();
  const settings = page.getByRole('dialog', { name: '설정' });
  await settings.getByRole('tab', { name: '인스턴스 설정' }).click();
  const form = settings.getByRole('form', { name: '인스턴스 설정' });
  await form.getByLabel('휴지통 보존 일수').fill('0.000001');
  await form.getByLabel('감사 로그 보존 기간').fill('0.000001');
  await parentRoundtrip('preview-start');
  const previewResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/settings/retention-impact' && response.request().method() === 'POST')
    .catch((error) => { throw new Error('POST /api/settings/retention-impact response timeout', { cause: error }); });
  await form.getByRole('button', { name: '저장' }).click();
  const previewResponse = await previewResponsePromise;
  const previewBody = await previewResponse.json();
  await parentRoundtrip('preview-complete');
  const confirmation = page.getByRole('alertdialog');
  await confirmation.waitFor();
  assert.equal(previewBody.grade, 'L3');
  assert(previewBody.impact.total > 0);
  assert.equal(previewBody.impact.trashNodes, 3);
  assert.equal(previewBody.typingToken, String(previewBody.impact.total));
  assert.equal(previewBody.impact.total, previewBody.impact.trashNodes + previewBody.impact.auditRows + previewBody.impact.findings);
  assert.equal(new Date(previewBody.computedAt).toISOString(), previewBody.computedAt);
  const confidential = JSON.stringify(previewBody);
  for (const secret of [
    process.env.DOCULIGHT_E2E_USER, process.env.DOCULIGHT_E2E_PASS,
    process.env.DOCULIGHT_E2E_SECOND, process.env.DOCULIGHT_E2E_SECOND_PASS,
    'secret-before-0', 'secret-after-1199', 'target-file.md', 'secret topology body', 'directory-link',
  ]) {
    assert(!confidential.includes(secret));
    assert(!confidential.includes(Buffer.from(secret).toString('base64')));
  }
  const cancel = confirmation.getByTestId('retention-impact-cancel');
  const normalVisual = await confirmation.evaluate((node) => {
    const action = node.querySelector('[data-slot="alert-dialog-actions"] button:last-child');
    const style = getComputedStyle(action);
    return { color: style.color, background: style.backgroundColor, border: style.borderColor, opacity: style.opacity };
  });
  assert.equal(await cancel.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await confirmation.evaluate((node) => node.contains(document.activeElement)), true);
  await page.keyboard.press('Tab');
  assert.equal(await confirmation.evaluate((node) => node.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'submit');
  assert.equal(await form.getByRole('button', { name: '저장' }).evaluate((node) => document.activeElement === node), true);
  const reopenedPreviewPromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/settings/retention-impact' && response.request().method() === 'POST');
  await form.getByRole('button', { name: '저장' }).click();
  const consentBody = await (await reopenedPreviewPromise).json();
  await confirmation.waitFor();
  const tokenInput = confirmation.getByTestId('retention-impact-token');
  for (const outerWhitespace of [` ${consentBody.typingToken}`, `${consentBody.typingToken} `]) {
    await tokenInput.fill(outerWhitespace);
    assert.equal(await confirmation.getByTestId('retention-impact-confirm').isDisabled(), true);
    const beforeRejectedConsent = traffic.length;
    await tokenInput.press('Enter');
    await confirmation.getByTestId('retention-impact-confirm').dispatchEvent('click');
    assert.equal(traffic.length, beforeRejectedConsent);
  }
  await tokenInput.fill(consentBody.typingToken);
  await tokenInput.dispatchEvent('compositionstart');
  const beforeComposition = traffic.length;
  await tokenInput.press('Enter');
  assert.equal(traffic.length, beforeComposition);
  assert.equal(await tokenInput.inputValue(), consentBody.typingToken);
  await tokenInput.dispatchEvent('compositionend');
  assert.equal(await confirmation.getByTestId('retention-impact-cancel').evaluate((node) => document.activeElement === node), false);
  await page.mouse.click(1, 1);
  assert.equal(await confirmation.count(), 1);
  assert.deepEqual(traffic.slice(-2).map(({ method, pathname }) => `${method} ${pathname}`), [
    'GET /api/settings', 'POST /api/settings/retention-impact',
  ]);

  secondContext = await chromium.launchPersistentContext(path.join(profileRoot, 'second'), { headless: true });
  const secondPage = secondContext.pages()[0] ?? await secondContext.newPage();
  process.env.DOCULIGHT_E2E_USER = process.env.DOCULIGHT_E2E_SECOND;
  process.env.DOCULIGHT_E2E_PASS = process.env.DOCULIGHT_E2E_SECOND_PASS;
  await login(secondPage);
  await secondPage.goto(WEB_URL, { waitUntil: 'networkidle' });
  await secondPage.getByRole('button', { name: '설정' }).click();
  const secondSettings = secondPage.getByRole('dialog', { name: '설정' });
  await secondSettings.getByRole('tab', { name: '인스턴스 설정' }).click();
  const secondForm = secondSettings.getByRole('form', { name: '인스턴스 설정' });
  await secondForm.waitFor();
  assert.equal(await secondForm.getByLabel('휴지통 보존 일수').inputValue(), '30');
  const changed = await secondPage.evaluate(async () => {
    const response = await fetch('/api/settings', {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 'trash-retention-days': '60' }),
    });
    return response.status;
  });
  assert.equal(changed, 204);
  const persistedBeforeStale = await page.evaluate(async () => ({
    settings: await (await fetch('/api/settings')).json(),
    audit: await (await fetch('/api/audit-log')).json(),
  }));
  await confirmation.getByTestId('retention-impact-confirm').click();
  await confirmation.getByTestId('retention-impact-stale').waitFor();
  assert.equal(traffic.at(-1).status, 409);
  const persistedAfterStale = await page.evaluate(async () => ({
    settings: await (await fetch('/api/settings')).json(),
    audit: await (await fetch('/api/audit-log')).json(),
  }));
  assert.deepEqual(persistedAfterStale, persistedBeforeStale);
  assert.equal(await tokenInput.inputValue(), '');
  const freshPreviewPromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/settings/retention-impact' && response.request().method() === 'POST');
  await confirmation.getByTestId('retention-impact-review').click();
  const freshPreviewBody = await (await freshPreviewPromise).json();
  const freshToken = confirmation.getByTestId('retention-impact-token');
  await freshToken.fill(freshPreviewBody.typingToken);
  await confirmation.getByTestId('retention-impact-confirm').click();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  assert.equal(await form.getByRole('status').filter({ hasText: '설정을 저장했습니다.' }).count(), 1);
  await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'submit');
  assert.equal(await form.getByRole('button', { name: '저장' }).evaluate((node) => document.activeElement === node), true);
  assert.deepEqual(traffic.slice(-4).map(({ method, pathname }) => `${method} ${pathname}`), [
    'GET /api/settings', 'POST /api/settings/retention-impact', 'PUT /api/settings', 'GET /api/settings',
  ]);
  const successfulReadback = await page.evaluate(async () => ({
    settings: await (await fetch('/api/settings')).json(),
    audit: await (await fetch('/api/audit-log')).json(),
  }));
  assert.equal(successfulReadback.settings['trash-retention-days'], '0.000001');
  assert.equal(successfulReadback.settings['audit-retention-days'], '0.000001');
  assert(successfulReadback.audit.groups.some((group) => group.operation === 'settings.trash-retention-days'));
  assert(successfulReadback.audit.groups.some((group) => group.operation === 'settings.audit-retention-days'));
  async function setZoom(value) {
    return worker.evaluate(async ({ target, value }) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
      if (!tab?.id) throw new Error('product tab missing');
      await chrome.tabs.setZoom(tab.id, value);
      return chrome.tabs.getZoom(tab.id);
    }, { target: page.url(), value });
  }
  async function settleCssViewport(width, height, zoom) {
    const expected = { width: Math.round(width / zoom), height: Math.round(height / zoom) };
    await page.waitForFunction((value) => Math.abs(innerWidth - value.width) <= 1 && Math.abs(innerHeight - value.height) <= 1, expected);
    return page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  }

  await form.getByLabel('휴지통 보존 일수').fill('0.0000005');
  await form.getByLabel('감사 로그 보존 기간').fill('0.0000005');
  const matrixPreviewPromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/settings/retention-impact' && response.request().method() === 'POST');
  await form.getByRole('button', { name: '저장' }).click();
  const matrixPreview = await (await matrixPreviewPromise).json();
  await confirmation.waitFor();
  const matrixToken = confirmation.getByTestId('retention-impact-token');
  await matrixToken.fill(matrixPreview.typingToken);
  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction(
        (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
        theme,
      );
      for (const zoom of [1, 2]) {
        const observed = await setZoom(zoom);
        assert.equal(observed, zoom);
        const viewport = await settleCssViewport(width, height, zoom);
        assert(Math.abs(viewport.width * viewport.dpr - width * (viewport.dpr / zoom)) <= 2);
        const geometry = await confirmation.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
        assert(geometry.left >= 0 && geometry.right <= viewport.width + 1 && geometry.top >= 0 && geometry.bottom <= viewport.height + 1);
        assert(geometry.scrollWidth <= geometry.clientWidth + 1);
        const visual = await confirmation.evaluate((node) => {
          const total = node.querySelector('[data-testid="retention-impact-total"]');
          const action = node.querySelector('[data-testid="retention-impact-confirm"]');
          action.focus();
          const effectiveBackground = (element) => {
            let current = element;
            while (current) {
              const color = getComputedStyle(current).backgroundColor;
              if (!/rgba\([^)]*,\s*0\)/.test(color) && color !== 'transparent') return color;
              current = current.parentElement;
            }
            return getComputedStyle(document.documentElement).backgroundColor;
          };
          const totalStyle = getComputedStyle(total);
          const actionStyle = getComputedStyle(action);
          return {
            text: totalStyle.color,
            background: effectiveBackground(total),
            outline: actionStyle.outlineColor,
            outlineWidth: actionStyle.outlineWidth,
            outerRing: actionStyle.boxShadow,
            actionBackground: effectiveBackground(action),
            adjacentBackground: effectiveBackground(action.parentElement ?? node),
          };
        });
        assert(contrast(visual.text, visual.background) >= 4.5);
        assert(parseFloat(visual.outlineWidth) > 0);
        assert(contrast(visual.outline, visual.actionBackground) >= 3, JSON.stringify({ theme, width, height, zoom, visual, surface: 'action' }));
        assert(contrast(visual.outerRing, visual.adjacentBackground) >= 3, JSON.stringify({ theme, width, height, zoom, visual, surface: 'adjacent' }));
        await confirmation.evaluate((node) => { node.scrollTop = node.scrollHeight; });
        const actionReachable = await confirmation.locator('[data-slot="alert-dialog-actions"]').evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom <= innerHeight + 1 && rect.top >= 0;
        });
        assert(actionReachable);
        const screenshot = `retention-${theme}-${width}x${height}-${zoom * 100}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        if (width === 1280 && height === 720 && zoom === 2) {
          const overflow = await confirmation.evaluate((node) => ({
            scrollHeight: node.scrollHeight, clientHeight: node.clientHeight,
            scrollTop: node.scrollTop, max: node.scrollHeight - node.clientHeight,
          }));
          assert(overflow.scrollHeight > overflow.clientHeight);
          assert(Math.abs(overflow.scrollTop - overflow.max) <= 1);
        }
        environments.push({ width, height, theme, zoom: zoom * 100, observed, viewport, geometry, visual, textContrast: contrast(visual.text, visual.background), screenshot });
      }
      assert.equal(await setZoom(1), 1);
      const resetViewport = await settleCssViewport(width, height, 1);
      assert.equal(resetViewport.width, width);
      assert.equal(await matrixToken.inputValue(), matrixPreview.typingToken);
    }
  }
  assert.equal(environments.length, 12);
  const forcedColors = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [1, 2]) {
    assert.equal(await setZoom(zoom), zoom);
    const viewport = await settleCssViewport(1280, 720, zoom);
    await confirmation.getByTestId('retention-impact-confirm').focus();
    const forcedState = await confirmation.evaluate(() => {
      const active = document.activeElement;
      const adjacent = active?.parentElement ?? active;
      return ({
      active: matchMedia('(forced-colors: active)').matches,
      outline: getComputedStyle(active).outlineStyle,
      outlineColor: getComputedStyle(active).outlineColor,
      outlineWidth: getComputedStyle(active).outlineWidth,
      background: getComputedStyle(active).backgroundColor,
      adjacentBackground: getComputedStyle(adjacent).backgroundColor,
    }); });
    assert(forcedState.active);
    assert.notEqual(forcedState.outline, 'none');
    assert(parseFloat(forcedState.outlineWidth) > 0);
    assert(contrast(forcedState.outlineColor, forcedState.background) >= 3);
    assert(contrast(forcedState.outlineColor, forcedState.adjacentBackground) >= 3);
    const screenshot = `retention-forced-colors-${zoom * 100}.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    forcedColors.push({ zoom: zoom * 100, viewport, screenshot });
  }
  assert.equal(await setZoom(1), 1);
  await page.emulateMedia({ forcedColors: 'none' });
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'hidden' });

  let releasePending;
  const pendingGate = new Promise((resolve) => { releasePending = resolve; });
  const pendingRoute = async (route) => { await pendingGate; await route.fallback(); };
  await page.route('**/api/settings/retention-impact', pendingRoute);
  await form.getByRole('button', { name: '저장' }).click();
  await confirmation.getByTestId('retention-impact-pending').waitFor();
  const pendingConfirm = confirmation.getByTestId('retention-impact-confirm');
  if (await pendingConfirm.count() === 1) assert.equal(await pendingConfirm.isDisabled(), true);
  assert.equal(await confirmation.getByTestId('retention-impact-cancel').isVisible(), true);
  const pendingVisual = await confirmation.getByTestId('retention-impact-pending').evaluate((node) => {
    const style = getComputedStyle(node);
    const dialog = node.closest('[role="alertdialog"]');
    const background = getComputedStyle(dialog).backgroundColor;
    return { color: style.color, background, border: style.borderColor, opacity: style.opacity };
  });
  assert(contrast(pendingVisual.color, pendingVisual.background) >= 4.5);
  assert.notDeepEqual(pendingVisual, normalVisual);
  releasePending();
  await confirmation.getByTestId('retention-impact-total').waitFor();
  await page.unroute('**/api/settings/retention-impact', pendingRoute);
  await page.keyboard.press('Escape');

  const errorRoute = async (route) => route.fulfill({
    status: 503, contentType: 'application/json', headers: { 'cache-control': 'no-store' },
    body: JSON.stringify({ code: 'injected-preview-failure' }),
  });
  await page.route('**/api/settings/retention-impact', errorRoute);
  await form.getByRole('button', { name: '저장' }).click();
  const previewError = confirmation.getByTestId('retention-impact-error');
  await previewError.waitFor();
  assert.equal(await previewError.getAttribute('role'), 'alert');
  const errorVisual = await previewError.evaluate((node) => {
    const style = getComputedStyle(node);
    const dialog = node.closest('[role="alertdialog"]');
    const background = getComputedStyle(dialog).backgroundColor;
    return { color: style.color, background, border: style.borderColor, opacity: style.opacity };
  });
  assert(contrast(errorVisual.color, errorVisual.background) >= 4.5);
  assert.notDeepEqual(errorVisual, pendingVisual);
  const errorText = await previewError.innerText();
  const draftBeforeResize = {
    trash: await form.getByLabel('휴지통 보존 일수').inputValue(),
    audit: await form.getByLabel('감사 로그 보존 기간').inputValue(),
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await setZoom(1), 1);
  await settleCssViewport(1440, 900, 1);
  assert.equal(await setZoom(2), 2);
  await settleCssViewport(1440, 900, 2);
  assert.equal(await setZoom(1), 1);
  await settleCssViewport(1440, 900, 1);
  assert.equal(await previewError.innerText(), errorText);
  assert.deepEqual({
    trash: await form.getByLabel('휴지통 보존 일수').inputValue(),
    audit: await form.getByLabel('감사 로그 보존 기간').inputValue(),
  }, draftBeforeResize);
  await confirmation.getByTestId('retention-impact-continue-edit').click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('type') === 'submit');
  assert.equal(await form.getByRole('button', { name: '저장' }).evaluate((node) => document.activeElement === node), true);
  await page.unroute('**/api/settings/retention-impact', errorRoute);
  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright Chromium profiles and isolated SQLite/vault',
    actualFlow: traffic,
    environments,
    forcedColors,
  }, null, 2));
} catch (error) {
  if (error?.message !== 'POST /api/settings/retention-impact response timeout' || error?.cause?.name !== 'TimeoutError') throw error;
  console.log(`ISSUE87_RED_SENTINEL ${JSON.stringify({
    type: 'preview-post-timeout', method: 'POST', path: '/api/settings/retention-impact', timeoutMs: 30000,
  })}`);
  process.exitCode = 87;
} finally {
  const closeResults = await Promise.allSettled([
    secondContext?.close(),
    context?.close(),
  ]);
  const closeErrors = closeResults.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
  if (closeErrors.length === 1) throw closeErrors[0];
  if (closeErrors.length > 1) throw new AggregateError(closeErrors, 'browser context cleanup failed');
}
