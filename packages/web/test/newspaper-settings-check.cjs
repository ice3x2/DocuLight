const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue61');
const stage = path.join(output, `.settings-stage-${process.pid}-${Date.now()}`);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3422/test/newspaper-shell-fixture.html';
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
const themes = ['light', 'dark'];
const failures = [];
fs.mkdirSync(stage, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3422', '--strictPort'], {
  cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
const serverExit = new Promise((resolve) => server.once('exit', resolve));

async function waitServer() {
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned Vite did not start');
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
}

function contrast(a, b) {
  const luminance = ([r, g, blue]) => .2126 * channel(r) + .7152 * channel(g) + .0722 * channel(blue);
  const high = Math.max(luminance(a), luminance(b));
  const low = Math.min(luminance(a), luminance(b));
  return (high + .05) / (low + .05);
}

function rgb(value) {
  const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(parts?.length, 3, `unsupported color ${value}`);
  return parts;
}

async function mockInstanceSettings(page) {
  await page.route('**/settings', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          'signup-mode': 'approval',
          'upload-size-limit-bytes': '104857600',
          'retained-version-count': '30',
          'trash-retention-days': '30',
          'audit-retention-days': '365',
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  });
}

async function waitForFocus(locator, label) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await locator.evaluate((el) => document.activeElement === el)) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const active = await locator.page().evaluate(() => ({
    tag: document.activeElement?.tagName,
    role: document.activeElement?.getAttribute('role'),
    text: document.activeElement?.textContent?.trim(),
  }));
  assert.fail(`${label}; active=${JSON.stringify(active)}`);
}

async function inspect(page, { screenshotPath, zoom }) {
  const gear = page.locator("[data-shell='settings-corner'] > button");
  await gear.click();
  const dialog = page.locator('[data-settings-dialog]');
  await dialog.waitFor();
  const result = await dialog.evaluate((node) => {
    const nav = node.querySelector('[data-settings-navigation]');
    const content = node.querySelector('[data-settings-content]');
    const header = node.querySelector('[data-settings-header]');
    const close = header.querySelector('button');
    const rect = (el) => el.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      dialog: rect(node), nav: rect(nav), content: rect(content), header: rect(header), close: rect(close),
      paddingRight: parseFloat(getComputedStyle(content).paddingRight),
      tabs: node.querySelectorAll('[role="tab"]').length,
      columns: getComputedStyle(node.querySelector('[data-settings-layout]')).gridTemplateColumns,
      overflow: { nav: getComputedStyle(nav).overflowY, content: getComputedStyle(content).overflowY },
    };
  });
  const near = (a, b) => Math.abs(a - b) <= 2;
  const issues = [];
  const check = (condition, message) => { if (!condition) issues.push(message); };
  check(near(result.dialog.width, Math.min(1200, result.viewport.width * .94)), `dialog width ${result.dialog.width}`);
  check(near(result.dialog.height, Math.min(820, result.viewport.height * .9)), `dialog height ${result.dialog.height}`);
  check(result.tabs === 14, `tab count ${result.tabs}`);
  check(result.overflow.nav === 'auto', `navigation overflow ${result.overflow.nav}`);
  check(result.overflow.content === 'auto', `content overflow ${result.overflow.content}`);
  check(near(result.nav.width, result.viewport.width >= 900 ? 260 : Math.min(260, result.dialog.width * .32)), `nav width ${result.nav.width}`);
  check(result.paddingRight === (result.viewport.width >= 900 ? 24 : 16), `content right padding ${result.paddingRight}`);
  check(result.close.right <= result.dialog.right && result.close.top >= result.dialog.top, 'close button escapes dialog bounds');

  const nav = dialog.locator('[data-settings-navigation]');
  const content = dialog.locator('[data-settings-content]');
  const tabs = dialog.getByRole('tab');
  const first = tabs.first();
  const last = tabs.last();
  const instance = tabs.nth(12);

  await first.focus();
  await page.keyboard.press('ArrowDown');
  await waitForFocus(tabs.nth(1), 'ArrowDown focuses the next category');
  await page.keyboard.press('ArrowUp');
  await waitForFocus(first, 'ArrowUp focuses the previous category');
  await page.keyboard.press('End');
  await waitForFocus(last, 'End focuses the last category');
  assert.equal(await last.getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  await waitForFocus(first, 'Home focuses the first category');
  await page.keyboard.press('End');
  await waitForFocus(last, 'End refocuses the last category');
  await page.keyboard.press('ArrowUp');
  await waitForFocus(instance, 'ArrowUp reaches instance settings');
  assert.equal(await instance.getAttribute('aria-selected'), 'true');

  const inputs = dialog.locator('form input');
  await inputs.first().waitFor();
  await page.keyboard.press('Tab');
  await waitForFocus(inputs.first(), 'Tab enters the real instance-settings form');
  await page.keyboard.press('Shift+Tab');
  await waitForFocus(instance, 'Shift+Tab returns to the selected category');
  await page.keyboard.press('Tab');
  const inputCount = await inputs.count();
  for (let index = 1; index < inputCount; index += 1) await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const save = dialog.locator('form button[type="submit"]');
  await waitForFocus(save, 'keyboard reaches the real final action');
  const realReachability = await dialog.evaluate((node) => {
    const currentContent = node.querySelector('[data-settings-content]');
    const action = node.querySelector('form button[type="submit"]');
    const close = node.querySelector('[data-settings-header] button');
    const contentRect = currentContent.getBoundingClientRect();
    const actionRect = action.getBoundingClientRect();
    return {
      contentScrollTop: currentContent.scrollTop,
      actionVisible: actionRect.top >= contentRect.top && actionRect.bottom <= contentRect.bottom,
      headerCloseTop: close.getBoundingClientRect().top,
    };
  });
  assert.equal(realReachability.actionVisible, true, 'real final action is fully visible');
  await tabs.nth(10).hover();
  if (screenshotPath) await page.screenshot({ path: screenshotPath });
  await page.keyboard.press('Shift+Tab');
  await waitForFocus(inputs.last(), 'Shift+Tab reaches the real final input');

  await instance.focus();
  const visual = await instance.evaluate((el) => {
    const currentNav = el.closest('[data-settings-navigation]');
    const tabRect = el.getBoundingClientRect();
    const navRect = currentNav.getBoundingClientRect();
    const style = getComputedStyle(el);
    const navStyle = getComputedStyle(currentNav);
    const outlineExtent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return {
      color: style.color,
      background: style.backgroundColor,
      focus: style.outlineColor,
      navBackground: navStyle.backgroundColor,
      focusExtent: {
        left: tabRect.left - outlineExtent - navRect.left,
        top: tabRect.top - outlineExtent - navRect.top,
        right: navRect.right - tabRect.right - outlineExtent,
        bottom: navRect.bottom - tabRect.bottom - outlineExtent,
      },
    };
  });
  check(contrast(rgb(visual.color), rgb(visual.background)) >= 4.5, `selected text contrast ${JSON.stringify(visual)}`);
  check(contrast(rgb(visual.focus), rgb(visual.navBackground)) >= 3, `focus contrast ${JSON.stringify(visual)}`);
  for (const [edge, extent] of Object.entries(visual.focusExtent)) check(extent >= 0, `${edge} focus ring clipped by ${extent}px`);

  await nav.evaluate((el) => { el.scrollTop = 0; });
  await content.evaluate((el) => { el.scrollTop = 0; });
  await page.evaluate(() => {
    const left = document.createElement('div'); left.style.height = '1400px'; left.dataset.settingsStress = 'left';
    const right = document.createElement('div'); right.style.height = '1400px'; right.dataset.settingsStress = 'right';
    document.querySelector('[data-settings-navigation]').append(left);
    document.querySelector('[data-settings-content]').append(right);
  });
  const headerTop = await dialog.locator('[data-settings-header]').evaluate((el) => el.getBoundingClientRect().top);
  await nav.evaluate((el) => { el.scrollTop = 300; });
  check(await content.evaluate((el) => el.scrollTop) === 0, 'navigation scroll moved content');
  await content.evaluate((el) => { el.scrollTop = 300; });
  check(await nav.evaluate((el) => el.scrollTop) === 300, `navigation did not retain independent scroll: ${await nav.evaluate((el) => el.scrollTop)}`);
  check(await content.evaluate((el) => el.scrollTop) === 300, `content did not scroll independently: ${await content.evaluate((el) => el.scrollTop)}`);
  check(await dialog.locator('[data-settings-header]').evaluate((el) => el.getBoundingClientRect().top) === headerTop, 'header moved during child scrolling');

  await dialog.locator('[data-settings-header] button').click();
  assert.equal(await dialog.count(), 0);
  assert.equal(await gear.evaluate((el) => document.activeElement === el), true);
  if (issues.length) throw new Error(`inspection failures (${issues.length}): ${issues.join('; ')}`);
  return { ...result, realReachability, visual };
}

function extensionAt(dir) {
  const ext = path.join(dir, 'extension'); fs.mkdirSync(ext, { recursive: true });
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'DocuLight settings zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(ext, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return ext;
}

async function runNormal() {
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const theme of themes) for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      try {
        const page = await context.newPage(); await mockInstanceSettings(page); await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
        rows.push({ owner: 'Playwright fresh isolated Chromium', theme, physical: { width, height }, zoom: 1, measurement: await inspect(page, { zoom: 1, screenshotPath: path.join(stage, `settings-${theme}-${width}x${height}-100.png`) }) });
      } catch (error) {
        failures.push(`100% ${theme} ${width}x${height}: ${error.stack ?? error}`);
      } finally { await context.close(); }
    }
    for (const width of [899, 900, 901]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } }); const page = await context.newPage();
      try {
        await mockInstanceSettings(page); await page.goto(url, { waitUntil: 'networkidle' }); const value = await inspect(page, { zoom: 1 });
        assert.equal(value.paddingRight, width < 900 ? 16 : 24);
      } catch (error) {
        failures.push(`breakpoint ${width}px: ${error.stack ?? error}`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return rows;
}

async function runZoom() {
  const rows = [];
  for (const theme of themes) for (const [width, height] of viewports) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue61-zoom-'));
    const ext = extensionAt(temp); let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: null, colorScheme: theme,
        args: [`--window-size=${width},${height}`, '--window-position=-32000,-32000', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0]; const page = context.pages()[0] || await context.newPage();
      await mockInstanceSettings(page); await page.goto(url, { waitUntil: 'networkidle' }); await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const zoom = await worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((x) => x.url === target); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); }, url);
      await page.waitForTimeout(300); assert.equal(zoom, 2);
      rows.push({ owner: 'Playwright persistent isolated Chromium', theme, physical: { width, height }, zoom, before, measurement: await inspect(page, { zoom, screenshotPath: path.join(stage, `settings-${theme}-${width}x${height}-200.png`) }) });
    } catch (error) {
      failures.push(`200% ${theme} ${width}x${height}: ${error.stack ?? error}`);
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return rows;
}

(async () => {
  try {
    await waitServer();
    const matrix = [...await runNormal(), ...await runZoom()];
    if (failures.length) throw new Error(`settings matrix failed (${failures.length})\n\n${failures.join('\n\n')}`);
    const final = path.join(output, 'settings-matrix'); fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(stage, final);
    fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({ environments: matrix.length, matrix }, null, 2));
    console.log(`PASS ${matrix.length} Playwright-owned isolated Chromium environments`);
  } finally {
    if (server.exitCode === null) { server.kill(); await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5000))]); }
  }
})().catch((error) => { fs.rmSync(stage, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
