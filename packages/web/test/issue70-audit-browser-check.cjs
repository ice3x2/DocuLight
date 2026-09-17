const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue70/browser');
const screenshots = path.join(evidence, 'screenshots');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue70-'));
const extension = path.join(temp, 'zoom-extension');
const nonce = randomUUID();
const environments = [];
let server;

fs.mkdirSync(extension, { recursive: true });
fs.mkdirSync(screenshots, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue70 Zoom', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');

async function start() {
  const { createServer } = await import('vite');
  server = await createServer({ root: webRoot, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address === 'object' && address.port > 0);
  return `http://127.0.0.1:${address.port}/test/issue70-audit-browser.html?nonce=${encodeURIComponent(nonce)}`;
}

async function workerFor(context) {
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  return context.serviceWorkers()[0];
}

async function setZoom(worker, page, value) {
  await worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((item) => item.url === target);
    if (!tab || tab.id === undefined) throw new Error('owned fixture tab missing');
    await chrome.tabs.setZoom(tab.id, value);
  }, { target: page.url(), value });
}

async function getZoom(worker, page) {
  return worker.evaluate(async (target) => {
    const tab = (await chrome.tabs.query({})).find((item) => item.url === target);
    if (!tab || tab.id === undefined) throw new Error('owned fixture tab missing');
    return chrome.tabs.getZoom(tab.id);
  }, page.url());
}

async function configure(page, next) {
  await page.evaluate((value) => window.__issue70Configure(value), next);
  const fixture = page.locator('[data-issue70-fixture]');
  await fixture.waitFor();
  for (const [key, value] of Object.entries(next)) {
    const attribute = key === 'role' ? 'data-role' : key === 'audit' ? 'data-audit' : key === 'queue' ? 'data-queue' : null;
    if (attribute) await page.waitForFunction(({ attribute, value }) => document.querySelector('[data-issue70-fixture]')?.getAttribute(attribute) === value, { attribute, value });
  }
}

async function openAudit(page) {
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '감사 로그' }).click();
  await dialog.getByRole('heading', { name: '감사 로그' }).waitFor();
  return dialog;
}

async function exerciseReady(page, label) {
  const dialog = page.getByRole('dialog', { name: '설정' });
  const select = dialog.getByLabel('조작');
  await select.selectOption('서버에서 새로 추가된 아주 긴 조작 이름');
  assert.equal(await select.inputValue(), '서버에서 새로 추가된 아주 긴 조작 이름');
  const groups = dialog.getByTestId('audit-group');
  assert.equal(await groups.count(), 2, 'duplicate summaries merged or dropped');
  const first = groups.first().locator('[data-audit-disclosure]');
  const second = groups.nth(1).locator('[data-audit-disclosure]');
  await first.focus();
  await first.press('Enter');
  await second.focus();
  await second.press('Space');
  assert.equal(await dialog.getByTestId('audit-row').count(), 3);
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  assert.ok(await first.getAttribute('aria-controls'));
  assert.match(await groups.first().textContent(), /2건/);
  assert.match(await groups.first().textContent(), /2026-09-18 10:00:01/);
  assert.match(await groups.first().textContent(), /다른 워크스페이스의 노드/);
  assert.equal((await groups.first().locator('script').count()), 0, 'before value became executable markup');
  assert.match(await groups.first().textContent(), /<script>이전 값<\/script>/);
  assert.match(await groups.nth(1).textContent(), /historical-level/);
  await second.press('Space');

  await dialog.getByRole('button', { name: '재조정 대기열' }).click();
  const queueHeading = dialog.getByRole('heading', { name: '재조정 대기열' });
  await queueHeading.waitFor();
  await page.waitForTimeout(30);
  const headingFocus = await queueHeading.evaluate((node) => {
    const style = getComputedStyle(node);
    return { focused: document.activeElement === node, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset };
  });
  assert.equal(headingFocus.focused, true);
  assert.equal(headingFocus.outlineWidth, '2px');
  assert.equal(headingFocus.outlineOffset, '2px');
  assert.equal(await dialog.getByTestId('queue-item').count(), 24);
  assert.equal(await dialog.getByRole('button', { name: /해소|무시|수동 연결|다시 실행/ }).count(), 0);
  const last = dialog.getByTestId('queue-item').last();
  await last.scrollIntoViewIfNeeded();
  assert(await last.isVisible(), 'last queue item unreachable');
  const back = dialog.getByRole('button', { name: '감사 로그' });
  await back.focus();
  await back.click();
  await page.waitForTimeout(30);
  assert.equal(await dialog.getByLabel('조작').inputValue(), '서버에서 새로 추가된 아주 긴 조작 이름');
  assert.equal(await first.getAttribute('aria-expanded'), 'true');
  await first.focus();
  return { dialog, focus: first, headingFocus };
}

async function inspect(page, label, expectedForced) {
  const result = await page.evaluate(() => {
    const panel = document.querySelector('[data-audit-panel]');
    const heading = panel?.querySelector('h2');
    const disclosure = panel?.querySelector('[data-audit-disclosure]');
    const select = panel?.querySelector('select');
    const detail = panel?.querySelector('[data-audit-detail]');
    if (!panel || !heading || !disclosure || !select || !detail) throw new Error('audit surface missing');
    const hs = getComputedStyle(heading); const ds = getComputedStyle(disclosure); const ss = getComputedStyle(select);
    const dialog = panel.closest('[role=dialog]'); const last = panel.querySelector('[data-testid=audit-row]:last-of-type');
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      heading: { size: hs.fontSize, line: hs.lineHeight, weight: hs.fontWeight },
      disclosure: { height: disclosure.getBoundingClientRect().height, outlineWidth: ds.outlineWidth, outlineOffset: ds.outlineOffset },
      select: { height: select.getBoundingClientRect().height, radius: ss.borderRadius },
      dialog: dialog.getBoundingClientRect().toJSON(),
      panel: panel.getBoundingClientRect().toJSON(),
      detailOverflow: getComputedStyle(detail).overflowX,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      forced: matchMedia('(forced-colors: active)').matches,
      focusIsDisclosure: document.activeElement === disclosure,
      lastDetailPresent: Boolean(last),
    };
  });
  assert.deepEqual(result.heading, { size: '18px', line: '26px', weight: '600' });
  assert(result.disclosure.height >= 40);
  assert.equal(result.disclosure.outlineWidth, '2px');
  assert.equal(result.disclosure.outlineOffset, '2px');
  assert(result.select.height >= 36);
  assert.equal(result.select.radius, '4px');
  assert.equal(result.pageOverflow, false);
  assert.equal(result.forced, expectedForced);
  assert.equal(result.focusIsDisclosure, true);
  assert.equal(result.lastDetailPresent, true);
  await page.screenshot({ path: path.join(screenshots, `${label}.png`), fullPage: true });
  return result;
}

async function stateAndRoleChecks(page) {
  const dialog = page.getByRole('dialog', { name: '설정' });
  await configure(page, { audit: 'error', queue: 'ready', role: 'manager' });
  await dialog.getByText('감사 로그를 불러오지 못했습니다.').waitFor();
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  assert.equal(await page.evaluate(() => window.__issue70State.auditRetries), 1);
  await dialog.getByRole('button', { name: '재조정 대기열' }).click();
  assert.equal(await dialog.getByTestId('queue-item').count(), 24);
  await configure(page, { audit: 'ready', queue: 'error' });
  await dialog.getByText('재조정 대기열을 불러오지 못했습니다.').waitFor();
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  assert.equal(await page.evaluate(() => window.__issue70State.queueRetries), 1);
  await configure(page, { audit: 'loading', queue: 'loading' });
  await dialog.getByText('재조정 대기열을 불러오는 중입니다.').waitFor();
  assert.equal(await dialog.getByRole('region', { name: '재조정 대기열 결과' }).getAttribute('aria-busy'), 'true');
  await dialog.getByRole('button', { name: '감사 로그' }).click();
  await dialog.getByText('감사 로그를 불러오는 중입니다.').waitFor();
  assert.equal(await dialog.getByRole('region', { name: '감사 로그 결과' }).getAttribute('aria-busy'), 'true');
  await configure(page, { audit: 'empty', queue: 'empty' });
  await dialog.getByText('기록된 감사 행이 없습니다.').waitFor();
  await dialog.getByRole('button', { name: '재조정 대기열' }).click();
  await dialog.getByText('미해소 항목이 없습니다.').waitFor();
  await configure(page, { role: 'super-category', audit: 'ready', queue: 'ready' });
  assert.equal(await dialog.getByRole('tab', { name: '감사 로그' }).count(), 1);
  await configure(page, { role: 'super-zero' });
  assert.equal(await dialog.getByRole('tab', { name: '감사 로그' }).count(), 0);
  await configure(page, { role: 'ordinary' });
  assert.equal(await dialog.getByRole('tab', { name: '감사 로그' }).count(), 0);
  await configure(page, { role: 'manager' });
  assert.equal(await dialog.getByRole('tab', { name: '감사 로그' }).count(), 1);
}

async function runEnvironment(url, theme, width, height, forcedColors = 'none', runExtended = false) {
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
    await page.goto(url, { waitUntil: 'networkidle' });
    assert.equal(new URL(page.url()).searchParams.get('nonce'), nonce);
    await page.evaluate((next) => { document.documentElement.dataset.theme = next; document.documentElement.style.colorScheme = next; }, theme);
    await configure(page, { role: 'manager', audit: 'ready', queue: 'ready' });
    const worker = await workerFor(context);
    await setZoom(worker, page, 1);
    assert.equal(await getZoom(worker, page), 1);
    const dialog = await openAudit(page);
    const badge = dialog.getByTestId('queue-badge');
    assert.equal(await badge.textContent(), '24');
    assert.equal(await badge.getAttribute('aria-label'), '미해소 항목 24개');
    const { focus, headingFocus } = await exerciseReady(page, `${theme}-${width}-${height}`);
    const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    const at100 = await inspect(page, `${theme}-${width}x${height}-100-${forcedColors}`, forcedColors === 'active');
    await setZoom(worker, page, 2);
    assert.equal(await getZoom(worker, page), 2);
    await page.waitForTimeout(120);
    assert.equal(await focus.evaluate((node) => node === document.activeElement), true);
    const at200 = await inspect(page, `${theme}-${width}x${height}-200-${forcedColors}`, forcedColors === 'active');
    const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    assert(after.width < before.width, 'chrome zoom did not reduce CSS viewport');
    await setZoom(worker, page, 1);
    assert.equal(await getZoom(worker, page), 1);
    assert.equal(await focus.evaluate((node) => node === document.activeElement), true);
    assert.equal(await dialog.getByLabel('조작').inputValue(), '서버에서 새로 추가된 아주 긴 조작 이름');
    assert.equal(await dialog.getByTestId('audit-group').first().locator('[data-audit-disclosure]').getAttribute('aria-expanded'), 'true');
    if (width === 1280 && forcedColors === 'none') {
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await focus.evaluate((node) => node === document.activeElement), true);
      assert.equal(await dialog.getByLabel('조작').inputValue(), '서버에서 새로 추가된 아주 긴 조작 이름');
    }
    if (runExtended) await stateAndRoleChecks(page);
    return { theme, width, height, forcedColors, owner: 'Playwright-owned isolated persistent Chromium', extensionZoom: true, before, after, getZoomAt100: 1, getZoomAt200: 2, resetGetZoom: 1, sameMountResize: width === 1280 && forcedColors === 'none', stateFocusPreserved: true, headingFocus, at100, at200 };
  } finally {
    await context.close();
  }
}

(async () => {
  const url = await start();
  for (const theme of ['light', 'dark']) {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      environments.push(await runEnvironment(url, theme, width, height, 'none', environments.length === 0));
    }
  }
  environments.push(await runEnvironment(url, 'light', 1280, 720, 'active'));
  fs.writeFileSync(path.join(evidence, 'browser.json'), JSON.stringify({
    timestamp: new Date().toISOString(), nonce, environments,
    coverage: { normalEnvironments: 12, forcedColorsEnvironments: 2, zoomTransitions: [1, 2, 1], viewports: ['1280x720', '1440x900', '1920x1080'], themes: ['light', 'dark'], states: ['loading', 'error', 'empty', 'ready'], roles: ['manager', 'super-category', 'ordinary'], blockedFollowup: { role: 'super-zero', categoryReachable: false, issue: 86, requirement: 'IR-SHELL-012' }, ime: 'N/A — no new text input', nativePasswordManagerAutofill: 'nonblocking untested' },
  }, null, 2));
  process.stdout.write('PASS issue70: 12 light/dark/viewport/zoom environments + forced-colors 100/200\n');
})().finally(async () => {
  if (server) await server.close();
  fs.rmSync(temp, { recursive: true, force: true });
}).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
