const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const evidence = path.resolve(webRoot, '../../.kiwi/sessions/newspaper-20260916/evidence/issue69/browser');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue69-'));
const extension = path.join(temp, 'zoom-extension');
fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue69 Zoom', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
fs.mkdirSync(evidence, { recursive: true });

let server;
const rows = [];

async function start() {
  const { createServer } = await import('vite');
  server = await createServer({ root: webRoot, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  assert.ok(port > 0);
  return `http://127.0.0.1:${port}`;
}

async function mount(page, base, theme) {
  await page.goto(`${base}/test/issue69-acl-browser.html?nonce=${Date.now()}`);
  await page.evaluate((next) => { document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next; }, theme);
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '권한 감사' }).click();
  await dialog.getByRole('tab', { name: '권한 회수' }).click();
  return dialog;
}

async function inspect(page, label, expectedForced) {
  const data = await page.evaluate(() => {
    const tabs = document.querySelector('.acl-audit-tabs');
    const section = document.querySelector('.acl-audit-section');
    const heading = section?.querySelector('h2');
    const button = section?.querySelector('button');
    const table = section?.querySelector('table');
    if (!tabs || !section || !heading || !button || !table) throw new Error('ACL audit surface missing');
    const focusTarget = document.activeElement;
    if (!(focusTarget instanceof HTMLElement) || !section.contains(focusTarget)) throw new Error('expected focus inside ACL section');
    const hs = getComputedStyle(heading);
    const bs = getComputedStyle(focusTarget);
    const ts = getComputedStyle(tabs);
    const tableRect = table.getBoundingClientRect();
    return {
      tabCount: tabs.querySelectorAll('[role=tab]').length,
      tabDisplay: ts.display,
      tabOverflowX: ts.overflowX,
      headingFontSize: hs.fontSize,
      headingLineHeight: hs.lineHeight,
      buttonHeight: button.getBoundingClientRect().height,
      focusWidth: bs.outlineWidth,
      focusOffset: bs.outlineOffset,
      tableInsideViewport: tableRect.right <= document.documentElement.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      forced: matchMedia('(forced-colors: active)').matches,
      activeTag: focusTarget.tagName,
      activeLabel: focusTarget.getAttribute('aria-label'),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
  });
  assert.equal(data.tabCount, 3);
  assert.equal(data.headingFontSize, '18px');
  assert.equal(data.headingLineHeight, '26px');
  assert.ok(data.buttonHeight >= 36);
  assert.equal(data.focusWidth, '2px');
  assert.equal(data.focusOffset, '2px');
  assert.equal(data.pageOverflow, false);
  assert.equal(data.forced, expectedForced);
  await page.screenshot({ path: path.join(evidence, `${label}.png`), fullPage: true });
  return data;
}

async function workerFor(context) {
  let workers = context.serviceWorkers();
  if (workers.length === 0) {
    await context.waitForEvent('serviceworker');
    workers = context.serviceWorkers();
  }
  return workers[0];
}

async function zoom(worker, page, value) {
  await worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((item) => item.url === target);
    if (!tab || tab.id === undefined) throw new Error('fixture tab missing');
    await chrome.tabs.setZoom(tab.id, value);
  }, { target: page.url(), value });
}

async function readZoom(worker, page) {
  return worker.evaluate(async (target) => {
    const tab = (await chrome.tabs.query({})).find((item) => item.url === target);
    if (!tab || tab.id === undefined) throw new Error('fixture tab missing');
    return chrome.tabs.getZoom(tab.id);
  }, page.url());
}

async function runEnvironment(base, theme, width, height, forcedColors = 'none') {
  const profile = path.join(temp, `profile-${theme}-${width}-${height}-${forcedColors}`);
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width, height },
    colorScheme: theme,
    forcedColors,
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const dialog = await mount(page, base, theme);
    const worker = await workerFor(context);
    await zoom(worker, page, 1);
    assert.equal(await readZoom(worker, page), 1);
    assert.equal(await dialog.getByTestId('revocation-subjects').locator('li').count(), 2);
    await dialog.getByRole('tab', { name: '유효 권한 시뮬레이션' }).click();
    await dialog.getByRole('region', { name: '시뮬레이션 결과 표' }).waitFor();
    await dialog.getByRole('tab', { name: '상속 끊김' }).click();
    const restore = dialog.getByRole('button', { name: /상속으로 되돌리기/ });
    assert.equal(await restore.isDisabled(), true);
    await dialog.getByRole('tab', { name: '권한 회수' }).click();
    await dialog.getByRole('button', { name: '권한 전부 회수' }).click();
    const gate = page.getByRole('alertdialog');
    await gate.waitFor({ timeout: 5000 });
    assert.equal(await gate.getAttribute('data-grade'), 'L3');
    await gate.getByLabel(/1 를 입력/).fill('1');
    await gate.getByRole('button', { name: '실행' }).click();
    const result = dialog.getByRole('list', { name: '회수 실행 결과' });
    await result.waitFor();
    assert.match(await result.textContent(), /완료 · 실제 1건/);
    assert.match(await result.textContent(), /결과 확인 필요/);
    const input = dialog.getByLabel('사용자·그룹 검색');
    await input.fill('보존되는 입력');
    await input.focus();
    const inputHandle = await input.elementHandle();
    assert.ok(inputHandle);
    assert.equal(await inputHandle.evaluate((node) => node === document.activeElement), true);
    const at100 = await inspect(page, `${theme}-${width}x${height}-100-${forcedColors}`, forcedColors === 'active');
    assert.equal(await inputHandle.evaluate((node) => node === document.activeElement), true);
    await zoom(worker, page, 2);
    assert.equal(await readZoom(worker, page), 2);
    await page.waitForTimeout(100);
    const at200 = await inspect(page, `${theme}-${width}x${height}-200-${forcedColors}`, forcedColors === 'active');
    assert.equal(await inputHandle.evaluate((node) => node === document.activeElement), true);
    const preservedAt200 = await input.inputValue() === '보존되는 입력';
    await zoom(worker, page, 1);
    assert.equal(await readZoom(worker, page), 1);
    const preservedAt100 = await input.inputValue() === '보존되는 입력';
    assert.equal(await inputHandle.evaluate((node) => node === document.activeElement), true);
    assert.ok(preservedAt200 && preservedAt100);
    if (width === 1280 && forcedColors === 'none') {
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await input.inputValue(), '보존되는 입력');
      assert.equal(await inputHandle.evaluate((node) => node === document.activeElement), true);
    }
    return {
      theme, width, height, forcedColors, at100, at200,
      zoomAt200: 2,
      zoomReset: 1,
      preservedAt200,
      preservedAt100,
      sameActiveElementThroughZoomCycle: true,
      mountedSelectedPlanSubjects: 2,
      visitedTabs: ['revoke', 'simulate', 'inheritance'],
      l3Token: '1',
      partialOutcome: { completed: 1, unconfirmed: 1 },
      unsupportedRestoreDisabled: true,
    };
  } finally {
    await context.close();
  }
}

(async () => {
  const base = await start();
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) rows.push(await runEnvironment(base, theme, width, height));
  }
  rows.push(await runEnvironment(base, 'light', 1280, 720, 'active'));
  fs.writeFileSync(path.join(evidence, 'browser.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    harness: 'actual production AppShell and AclAuditPanel bundle with typed fixture data',
    environments: rows,
    limitations: { nativeWindowsImeCandidateUi: 'nonblocking untested', passwordManagerAutofillUi: 'nonblocking untested', inputEvidence: 'DOM input/focus; no OS automation' },
  }, null, 2));
})().finally(async () => {
  if (server) await server.close();
  fs.rmSync(temp, { recursive: true, force: true });
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
