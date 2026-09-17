const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue66');
const screenshots = path.join(evidence, 'screenshots');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const baseUrl = 'http://127.0.0.1:3426/test/issue66-relocation-fixture.html';
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
fs.mkdirSync(screenshots, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3426', '--strictPort'], {
  cwd: webRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
const serverExited = new Promise((resolve) => server.once('exit', resolve));

async function waitServer() {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned Vite fixture server did not start');
}

function extensionAt(temp) {
  const extension = path.join(temp, 'extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 66 zoom verifier', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

function rgb(value) {
  const parts = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert(parts?.length === 3, `unsupported computed color: ${value}`);
  return parts;
}

function contrast(first, second) {
  const luminance = (value) => {
    const channels = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

async function controlState(locator, name) {
  await locator.focus();
  const focus = await locator.evaluate((node) => {
    const value = getComputedStyle(node);
    return { identity: node === document.activeElement, outlineColor: value.outlineColor, outlineWidth: value.outlineWidth, outlineOffset: value.outlineOffset, borderColor: value.borderColor, backgroundColor: value.backgroundColor, color: value.color };
  });
  assert.equal(focus.identity, true, `${name} focus identity`);
  assert.equal(focus.outlineWidth, '2px', `${name} focus width`);
  assert.equal(focus.outlineOffset, '2px', `${name} focus separation`);
  await locator.evaluate((node) => node.blur());
  await pageMouseAway(locator.page());
  const before = await locator.evaluate((node) => { const value = getComputedStyle(node); return { borderColor: value.borderColor, backgroundColor: value.backgroundColor, outlineColor: value.outlineColor, outlineWidth: value.outlineWidth }; });
  await locator.hover();
  const after = await locator.evaluate((node) => { const value = getComputedStyle(node); return { borderColor: value.borderColor, backgroundColor: value.backgroundColor, outlineColor: value.outlineColor, outlineWidth: value.outlineWidth }; });
  assert.notDeepEqual(after, before, `${name} hover computed style`);
  return { focus, hover: { before, after } };
}

async function pageMouseAway(page) {
  await page.mouse.move(1, 1);
}

async function inspect(page, metadata) {
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const close = page.getByRole('button', { name: '이동 닫기' });
  assert.equal(await close.evaluate((node) => node === document.activeElement), true, 'close receives initial focus');
  await page.keyboard.press('Tab');
  assert.equal(await page.getByLabel('목적지').evaluate((node) => node === document.activeElement), true, 'Tab reaches native select');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: '이동', exact: true }).evaluate((node) => node === document.activeElement), true, 'Shift+Tab wraps to primary action');
  await page.getByLabel('목적지').selectOption('d17');
  const shortSelection = await page.evaluate(() => {
    const select = document.querySelector('select'); const readout = document.querySelector('[data-testid="selected-destination-path"]');
    return { value: select.value, selectedOption: select.selectedOptions[0]?.textContent, readout: readout.textContent };
  });
  assert.deepEqual(shortSelection, { value: 'd17', selectedOption: '부서 18/업무 자료/보관 위치 18', readout: '부서 18/업무 자료/보관 위치 18' });
  await page.getByLabel('목적지').selectOption('one');
  const select = page.getByLabel('목적지');
  const beforeHover = await select.evaluate((node) => getComputedStyle(node).borderColor);
  await select.hover();
  const afterHover = await select.evaluate((node) => getComputedStyle(node).borderColor);
  assert.notEqual(afterHover, beforeHover, 'closed native select hover is distinguishable');
  await select.focus();
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('[data-relocation-dialog]');
    const body = document.querySelector('[data-relocation-body]');
    const actions = document.querySelector('[data-relocation-actions]');
    const select = document.querySelector('select');
    const pathReadout = document.querySelector('[data-testid="selected-destination-path"]');
    const rect = (node) => node.getBoundingClientRect().toJSON();
    const style = (node) => { const value = getComputedStyle(node); return { fontSize: value.fontSize, lineHeight: value.lineHeight, outlineColor: value.outlineColor, outlineWidth: value.outlineWidth, outlineOffset: value.outlineOffset, borderColor: value.borderColor, backgroundColor: value.backgroundColor, color: value.color }; };
    const primary = dialog.querySelector('[data-relocation-actions] [data-variant="primary"]');
    const cancel = dialog.querySelector('[data-relocation-actions] [data-variant="secondary"]');
    const close = dialog.querySelector('[data-relocation-close]');
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      dialog: rect(dialog), body: rect(body), actions: rect(actions), select: rect(select),
      selection: { value: select.value, selectedOption: select.selectedOptions[0]?.textContent, readout: pathReadout.textContent },
      path: { text: pathReadout.textContent, rect: rect(pathReadout), scrollWidth: pathReadout.scrollWidth, clientWidth: pathReadout.clientWidth, wraps: rect(pathReadout).height > parseFloat(getComputedStyle(pathReadout).lineHeight) + 1 },
      styles: { dialog: style(dialog), select: style(select), title: style(document.querySelector('h2')), help: style(pathReadout), primary: style(primary), cancel: style(cancel), close: style(close) },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      rosterNames: [...dialog.querySelectorAll('*')].filter((node) => /한범|지원/.test(node.textContent ?? '')).length,
      readonlyCount: dialog.querySelectorAll('[readonly]').length,
      invalidCount: dialog.querySelectorAll('[aria-invalid="true"]').length,
    };
  });
  assert(result.dialog.width <= 560.5 && result.dialog.left >= 23, `dialog geometry ${JSON.stringify(result.dialog)}`);
  assert(result.dialog.height <= result.viewport.height - 47, 'dialog exceeds 24px vertical gutters');
  assert(result.select.height >= 36, 'native select target below 36px');
  assert(result.actions.bottom <= result.dialog.bottom + 1, 'actions unreachable');
  assert.equal(result.horizontalOverflow, false, 'horizontal viewport overflow');
  assert.equal(result.path.text.includes('본사 문서함/제품 전략과 장기 계획'), true, 'full selected path absent');
  assert.deepEqual(result.selection, { value: 'one', selectedOption: result.path.text, readout: result.path.text }, 'native value, selected option, and readout diverged');
  assert.equal(result.path.wraps, true, 'long Korean selected path did not wrap');
  assert.equal(result.rosterNames, 0); assert.equal(result.readonlyCount, 0); assert.equal(result.invalidCount, 0);
  assert.equal(result.styles.select.outlineWidth, '2px'); assert.equal(result.styles.select.outlineOffset, '2px');
  const surface = result.styles.dialog.backgroundColor;
  const contrastRatios = {
    titleText: contrast(result.styles.title.color, surface),
    helpText: contrast(result.styles.help.color, surface),
    selectText: contrast(result.styles.select.color, result.styles.select.backgroundColor),
    primaryText: contrast(result.styles.primary.color, result.styles.primary.backgroundColor),
    cancelText: contrast(result.styles.cancel.color, result.styles.cancel.backgroundColor),
    closeText: contrast(result.styles.close.color, surface),
    selectBoundary: contrast(result.styles.select.borderColor, result.styles.select.backgroundColor),
    selectFocus: contrast(result.styles.select.outlineColor, surface),
  };
  assert(contrastRatios.titleText >= 3, `large title contrast ${contrastRatios.titleText}`);
  for (const key of ['helpText', 'selectText', 'primaryText', 'cancelText', 'closeText']) assert(contrastRatios[key] >= 4.5, `${key} contrast ${contrastRatios[key]}`);
  assert(contrastRatios.selectBoundary >= 3, `select boundary contrast ${contrastRatios.selectBoundary}`);
  assert(contrastRatios.selectFocus >= 3, `select focus contrast ${contrastRatios.selectFocus}`);
  const controls = {
    primary: await controlState(page.getByRole('button', { name: '이동', exact: true }), 'primary'),
    cancel: await controlState(page.getByRole('button', { name: '취소' }), 'cancel'),
    close: await controlState(close, 'close'),
  };
  await select.focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-cancel-count'), '1');
  await page.screenshot({ path: path.join(screenshots, `${metadata.theme}-${metadata.width}x${metadata.height}-${metadata.zoom}pct.png`) });
  return { ...metadata, ...result, nativeSelect: true, shortSelection, contrastRatios, controls, keyboard: { initialClose: true, tabToSelect: true, shiftTabWrap: true, escapeCancel: true }, hover: { beforeHover, afterHover } };
}

async function stateChecks(page) {
  const visit = async (state) => { await page.goto(`${baseUrl}?state=${state}`, { waitUntil: 'networkidle' }); return page.getByRole('dialog'); };
  await visit('equal'); assert.equal(await page.getByTestId('relocation-count').count(), 2); assert.equal(await page.getByText(/늘어납니다|줄어듭니다/).count(), 0);
  await visit('decrease'); await page.getByText('볼 수 있는 사람이 줄어듭니다.').waitFor();
  await visit('copy'); await page.getByText('접근 가능 7명', { exact: false }).waitFor(); await page.getByText('권한에 따라 일부 항목이 제외될 수 있습니다', { exact: true }).waitFor(); assert.equal(await page.getByText(/이동 전|이동 후/).count(), 0);
  await visit('empty'); await page.getByText('제공된 목적지가 없습니다.').waitFor();
  const disabled = page.getByRole('button', { name: '이동', exact: true }); assert.equal(await disabled.isDisabled(), true);
  await disabled.evaluate((node) => { node.click(); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-confirm-count'), '0');
  assert.equal(await disabled.evaluate((node) => node === document.activeElement), false); await page.getByRole('button', { name: '취소' }).click();
  await visit('missing'); await page.getByText('영향 정보가 전달되지 않았습니다.').waitFor(); assert.equal(await page.getByText(/불러오는 중|불러오지 못했습니다/).count(), 0);
  await visit('increase'); const primary = page.getByRole('button', { name: '이동', exact: true }); await primary.click();
  const alert = page.getByRole('alertdialog'); await alert.waitFor();
  const stack = await page.evaluate(() => ({ parent: Number(getComputedStyle(document.querySelector('[data-relocation-dialog]')).zIndex), alert: Number(getComputedStyle(document.querySelector('[data-slot="alert-dialog-content"]')).zIndex) }));
  assert(stack.alert > stack.parent, `L2 is not topmost: ${JSON.stringify(stack)}`);
  assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-cancel-count'), '0'); assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-confirm-count'), '0');
  await page.keyboard.press('Escape'); await alert.waitFor({ state: 'detached' }); assert.equal(await page.getByRole('dialog').count(), 1);
  assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-cancel-count'), '0'); assert.equal(await page.locator('[data-issue66-component-harness]').getAttribute('data-confirm-count'), '0');
  const focusReturn = await page.evaluate(() => ({ tag: document.activeElement?.tagName, name: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent, insideParent: document.querySelector('[data-relocation-dialog]')?.contains(document.activeElement) }));
  assert.equal(focusReturn.insideParent, true, `L2 Escape focus left parent dialog: ${JSON.stringify(focusReturn)}`);
  return { equal: true, decrease: true, copy: true, empty: { disabledClickAndKeyboardConfirmCount: 0, disabledReceivesFocus: false }, missingPreview: true, suppliedL2: { openTopmost: stack, escapeClosedAlertOnly: true, parentCancelCount: 0, writeCount: 0, focusReturn }, integrationStates: 'loading/error/query/result async lifecycle not exposed by existing props; owned by #79 IR-SHELL-011' };
}

async function regularMatrix() {
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  let states;
  try {
    for (const theme of ['light', 'dark']) for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      try {
        const page = await context.newPage(); await page.goto(`${baseUrl}?state=increase`, { waitUntil: 'networkidle' });
        await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
        rows.push(await inspect(page, { theme, width, height, zoom: 100, owner: 'fresh Playwright isolated Chromium context' }));
        if (theme === 'light' && width === 1280) states = await stateChecks(page);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return { rows, states };
}

async function zoomMatrix() {
  const rows = [];
  for (const theme of ['light', 'dark']) for (const [width, height] of viewports) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue66-'));
    let context;
    try {
      const extension = extensionAt(temp);
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
      await page.goto(`${baseUrl}?state=increase`, { waitUntil: 'networkidle' }); await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
      const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
      const getZoom = () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
      await setZoom(1); assert.equal(await getZoom(), 1); const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      await setZoom(2); await page.waitForTimeout(150); const independentlyReadZoom = await getZoom(); assert.equal(independentlyReadZoom, 2);
      const row = await inspect(page, { theme, width, height, zoom: 200, owner: 'fresh Playwright persistent Chromium with disposable profile and extension' });
      await setZoom(1); const independentlyReadResetZoom = await getZoom(); assert.equal(independentlyReadResetZoom, 1);
      rows.push({ ...row, beforeZoom: before, independentlyReadZoom, independentlyReadResetZoom, zoomCalls: { setter: [1, 2, 1], readOnlyGetZoom: [1, 2, 1] } });
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return rows;
}

async function forcedColors() {
  const browser = await chromium.launch({ headless: true });
  const at100 = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active' });
  let one;
  try { const page = await at100.newPage(); await page.goto(`${baseUrl}?state=increase`); one = await inspect(page, { theme: 'forced', width: 1280, height: 720, zoom: 100 }); assert.equal(one.forcedColors, true); } finally { await at100.close(); await browser.close(); }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue66-forced-')); let context;
  try {
    const extension = extensionAt(temp); context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, forcedColors: 'active', args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker'); const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage(); await page.goto(`${baseUrl}?state=increase`);
    const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
    const getZoom = () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
    await setZoom(2); const zoom = await getZoom(); assert.equal(zoom, 2);
    const two = await inspect(page, { theme: 'forced', width: 1280, height: 720, zoom: 200 }); assert.equal(two.forcedColors, true);
    await setZoom(1); const reset = await getZoom(); assert.equal(reset, 1);
    return { at100: one, at200: { ...two, independentlyReadZoom: zoom, independentlyReadResetZoom: reset, zoomCalls: { setter: [2, 1], readOnlyGetZoom: [2, 1] } } };
  } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
}

(async () => {
  try {
    await waitServer(); const regular = await regularMatrix(); const zoomed = await zoomMatrix(); const forced = await forcedColors();
    assert.equal(regular.rows.length + zoomed.length, 12);
    fs.writeFileSync(path.join(evidence, 'browser.json'), JSON.stringify({ harness: 'component bundle using actual RelocationDialog and RelocationPreview; not product App integration evidence', environments: 12, regular: regular.rows, zoomed, forcedColors: forced, states: regular.states, nativeWindowsImeCandidateUi: 'nonblocking untested; no text input added; no OS input used' }, null, 2));
    process.stdout.write('PASS issue66 component bundle: 12 environments + forced colors 100/200\n');
  } finally {
    if (server.exitCode === null) { server.kill(); await Promise.race([serverExited, new Promise((resolve) => setTimeout(resolve, 5000))]); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
