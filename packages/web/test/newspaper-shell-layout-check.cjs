const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue50');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const url = 'http://127.0.0.1:3417/test/newspaper-shell-fixture.html';

fs.mkdirSync(output, { recursive: true });

function startVite() {
  const vite = path.join(root, 'node_modules/vite/bin/vite.js');
  return spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '3417', '--strictPort'], {
    cwd: webRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite fixture server did not start');
}

async function measure(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-shell="root"]');
    const left = document.querySelector('[data-side="left"]');
    const main = document.querySelector('main');
    const right = document.querySelector('[data-side="right"]');
    const strip = document.querySelector('[aria-label="열린 문서"]');
    const header = document.querySelector('[aria-label="문서 헤더"]');
    const breadcrumb = document.querySelector('[aria-label="브레드크럼"]');
    const settings = document.querySelector('[data-shell="settings-corner"]');
    const status = header?.querySelector('[role="status"]');
    const menu = header?.querySelector('button');
    const rect = (element) => element && element.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { clientWidth: root?.clientWidth, scrollWidth: root?.scrollWidth },
      widths: { left: rect(left)?.width, center: rect(main)?.width, right: rect(right)?.width },
      rows: { strip: rect(strip), header: rect(header) },
      breadcrumb: {
        rect: rect(breadcrumb),
        text: breadcrumb?.textContent,
        overflowY: breadcrumb && getComputedStyle(breadcrumb).overflowY,
        lineHeight: breadcrumb && getComputedStyle(breadcrumb).lineHeight,
      },
      protected: { settings: rect(settings), status: rect(status), menu: rect(menu) },
      surfaces: {
        left: left && getComputedStyle(left).backgroundColor,
        right: right && getComputedStyle(right).backgroundColor,
        activeTab: strip?.querySelector('[data-state="active"]') && getComputedStyle(strip.querySelector('[data-state="active"]')).backgroundColor,
        inactiveTab: strip?.querySelector('[data-state="inactive"]') && getComputedStyle(strip.querySelector('[data-state="inactive"]')).backgroundColor,
      },
    };
  });
}

function assertGeometry(result, expected) {
  const near = (actual, wanted) => Math.abs(actual - wanted) <= 1;
  assert(near(result.widths.left, expected[0]), `left ${result.widths.left}, expected ${expected[0]}`);
  assert(near(result.widths.center, expected[1]), `center ${result.widths.center}, expected ${expected[1]}`);
  assert(near(result.widths.right, expected[2]), `right ${result.widths.right}, expected ${expected[2]}`);
  assert(result.rows.strip.height >= 48, `tab strip height ${result.rows.strip.height}`);
  assert(result.rows.header.height >= 52, `header height ${result.rows.header.height}`);
  assert(result.rows.strip.bottom <= result.rows.header.top + 1, 'tab strip and header overlap');
  assert(result.protected.settings.bottom <= result.viewport.height, 'settings row is covered below the shell');
  assert(result.protected.settings.height >= 52 && result.protected.settings.height <= 53, `settings row height ${result.protected.settings.height}`);
  assert(result.protected.status.width > 0 && result.protected.menu.width >= 36, 'status or menu is clipped');
  assert(result.breadcrumb.text.includes('매우 긴 한글 부서 이름과 프로젝트 경로'), 'full breadcrumb was replaced');
}

async function assertSidebarKeyboardReveal(page, sidebarName, firstName, lastName) {
  const sidebar = page.getByRole('complementary', { name: sidebarName });
  const list = sidebar.getByRole('tablist');
  const first = sidebar.getByRole('tab', { name: firstName });
  const last = sidebar.getByRole('tab', { name: lastName });
  await first.click();
  await first.focus();
  const before = await list.evaluate((element) => ({
    left: element.scrollLeft,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert(before.scrollWidth > before.clientWidth, `${sidebarName} tab row does not overflow in the narrow fixture`);
  await page.keyboard.press('End');
  await page.waitForFunction((name) => document.activeElement?.textContent === name, lastName, { timeout: 2000 });
  await last.evaluate((tab) => {
    if (document.activeElement !== tab) {
      throw new Error(`End did not focus the last sidebar tab; active=${document.activeElement?.textContent ?? document.activeElement?.tagName}`);
    }
    const list = tab.parentElement;
    const tabRect = tab.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (tabRect.left < listRect.left - 1 || tabRect.right > listRect.right + 1) {
      throw new Error(`focused tab is clipped: tab ${tabRect.left}..${tabRect.right}, list ${listRect.left}..${listRect.right}`);
    }
    if (list.scrollLeft <= 0) throw new Error(`focused tab did not move scrollLeft: ${list.scrollLeft}`);
  });
}

async function runMatrix(browser) {
  const cases = [
    { width: 1280, height: 720, expected: [280, 680, 320] },
    { width: 1440, height: 900, expected: [280, 840, 320] },
    { width: 1920, height: 1080, expected: [280, 1320, 320] },
    { width: 840, height: 720, expected: [230, 360, 250] },
    { width: 500, height: 720, expected: [180, 240, 180] },
  ];
  const results = [];
  for (const theme of ['light', 'dark']) {
    for (const one of cases) {
      const context = await browser.newContext({ viewport: { width: one.width, height: one.height } });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const leftLabels = await page.getByRole('complementary', { name: '좌측 사이드바' }).getByRole('tab').allTextContents();
      const rightLabels = await page.getByRole('complementary', { name: '우측 사이드바' }).getByRole('tab').allTextContents();
      assert.deepEqual(leftLabels, ['문서 트리', '검색', '즐겨찾기']);
      assert.deepEqual(rightLabels, ['백링크', '아웃고잉 링크', '태그']);
      await page.getByRole('tab', { name: '긴 문서 탭 18.md' }).focus();
      const focusedVisible = await page.getByRole('tab', { name: '긴 문서 탭 18.md' }).evaluate((tab) => {
        const strip = tab.parentElement;
        return strip.scrollLeft > 0 && tab.getBoundingClientRect().right <= strip.getBoundingClientRect().right + 1;
      });
      assert(focusedVisible, 'focused document tab did not scroll into view');
      const result = await measure(page);
      assertGeometry(result, one.expected);
      assert.notEqual(result.surfaces.left, result.surfaces.right, 'left and right panel surfaces must differ');
      assert.notEqual(result.surfaces.activeTab, result.surfaces.inactiveTab, 'active and inactive document tab surfaces must differ');
      if (one.width < 600) {
        assert(result.scroll.scrollWidth >= 600, `shell scroll width ${result.scroll.scrollWidth}`);
        await assertSidebarKeyboardReveal(page, '좌측 사이드바', '문서 트리', '즐겨찾기');
        await assertSidebarKeyboardReveal(page, '우측 사이드바', '백링크', '태그');
      }
      await page.getByRole('button', { name: '설정' }).click();
      assert.equal(await page.getByRole('dialog', { name: '설정' }).count(), 1);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: path.join(output, `green-${theme}-${one.width}x${one.height}.png`), fullPage: true });
      if (theme === 'light') {
        await page.screenshot({ path: path.join(output, `green-${one.width}x${one.height}.png`), fullPage: true });
      }
      results.push({ theme, ...result });
      await context.close();
    }
  }
  return results;
}

async function runZoom() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-shell-zoom-'));
  const extensionPath = path.join(temporaryRoot, 'extension');
  fs.mkdirSync(extensionPath, { recursive: true });
  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'DocuLight shell zoom verifier',
    version: '1.0.0',
    permissions: ['tabs'],
    background: { service_worker: 'service-worker.js' },
  }));
  fs.writeFileSync(path.join(extensionPath, 'service-worker.js'), "chrome.runtime.onInstalled.addListener(() => {});\n");
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
      headless: false,
      viewport: null,
      args: [
        '--window-size=1440,900',
        '--window-position=-32000,-32000',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker', { timeout: 10000 });
    const worker = context.serviceWorkers()[0];
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const zoom = await worker.evaluate(async (pageUrl) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === pageUrl);
      if (!tab || tab.id === undefined) throw new Error('Fixture tab not found');
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, url);
    await page.waitForTimeout(500);
    const result = await measure(page);
    assert.equal(zoom, 2);
    const width = result.viewport.width;
    const expected = width < 600
      ? [180, 240, 180]
      : width < 1080
        ? [180 + (width - 600) * 100 / 480, 240 + (width - 600) * 240 / 480, 180 + (width - 600) * 140 / 480]
        : [280, width - 600, 320];
    assertGeometry(result, expected);
    assert(result.scroll.scrollWidth >= 600, `zoom shell scroll width ${result.scroll.scrollWidth}`);
    await page.screenshot({ path: path.join(output, 'green-actual-zoom-200.png'), fullPage: true });
    return { method: 'isolated persistent Chromium + extension chrome.tabs.setZoom(2)', zoom, result };
  } finally {
    await context?.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

(async () => {
  const server = startVite();
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const matrix = await runMatrix(browser);
    await browser.close();
    browser = undefined;
    const zoom = await runZoom();
    fs.writeFileSync(path.join(output, 'green-measurements.json'), JSON.stringify({ matrix, zoom }, null, 2));
    process.stdout.write('PASS newspaper shell layout and interaction checks\n');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
