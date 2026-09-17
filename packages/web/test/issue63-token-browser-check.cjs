const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue63');
const stage = path.join(output, `.browser-stage-${process.pid}-${Date.now()}`);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3428/test/issue63-token-fixture.html';
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
const themes = ['light', 'dark'];
fs.mkdirSync(stage, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3428', '--strictPort'], { cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
server.stdout.resume();
server.stderr.resume();
const exited = new Promise((resolve) => server.once('exit', resolve));
async function waitServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned Vite did not start');
}

const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((part) => { const scaled = part / 255; return scaled <= .04045 ? scaled / 12.92 : ((scaled + .055) / 1.055) ** 2.4; });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (foreground, background) => { const a = luminance(foreground); const b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };

async function auditFocus(locator, label) {
  const result = await locator.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    let background = style.backgroundColor;
    let parent = node.parentElement;
    while ((background === 'transparent' || background === 'rgba(0, 0, 0, 0)') && parent !== null) {
      background = getComputedStyle(parent).backgroundColor;
      parent = parent.parentElement;
    }
    const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (value) => { const channels = parse(value).map((part) => { const scaled = part / 255; return scaled <= .04045 ? scaled / 12.92 : ((scaled + .055) / 1.055) ** 2.4; }); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]; };
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    return {
      active: document.activeElement === node,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      outlineOffset: Number.parseFloat(style.outlineOffset),
      outlineColor: style.outlineColor,
      background,
      contrast: ratio(style.outlineColor, background),
      bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert(result.active, `${label} focus`);
  assert(result.outlineWidth >= 2, `${label} outline ${result.outlineWidth}`);
  assert(result.outlineOffset >= 2, `${label} gap ${result.outlineOffset}`);
  assert(result.contrast >= 3, `${label} focus contrast ${result.contrast}`);
  assert(result.bounds.width > 0 && result.bounds.height > 0, `${label} positive bounds`);
  assert(result.bounds.left >= 0 && result.bounds.top >= 0 && result.bounds.right <= result.viewport.width && result.bounds.bottom <= result.viewport.height, `${label} in viewport`);
  return result;
}

async function setClipboardMode(page, mode) {
  await page.evaluate((value) => {
    window.__issue63ClipboardOriginal ??= navigator.clipboard;
    if (value === 'restore') {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: window.__issue63ClipboardOriginal });
      return;
    }
    const clipboard = value === 'unavailable' ? undefined : {
      writeText() {
        if (value === 'throw') throw new Error('synthetic synchronous clipboard failure');
        if (value === 'reject') return Promise.reject(new Error('synthetic rejected clipboard failure'));
        return new Promise((resolve, reject) => {
          window.__issue63ClipboardResolve = resolve;
          window.__issue63ClipboardReject = reject;
        });
      },
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
  }, mode);
}

async function openTokens(page, theme) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.locator('[data-settings-dialog]');
  await dialog.getByRole('tab', { name: '액세스 토큰' }).click();
  return dialog;
}

async function exercise(page, theme, file, environment) {
  const dialog = await openTokens(page, theme);
  const panel = dialog.locator('[data-token-panel]');
  const list = await panel.evaluate((node) => {
    const rows = [...node.querySelectorAll('tbody tr')];
    const rect = (element) => element.getBoundingClientRect();
    const normal = getComputedStyle(rows[0].querySelector('td'));
    const expired = getComputedStyle(rows[1].querySelector('td'));
    const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (value) => { const channels = parse(value).map((part) => { const scaled = part / 255; return scaled <= .04045 ? scaled / 12.92 : ((scaled + .055) / 1.055) ** 2.4; }); return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]; };
    const ratio = (foreground, background) => { const a = lum(foreground); const b = lum(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
    return {
      stage: node.dataset.stage,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      rowCount: rows.length,
      minRow: Math.min(...rows.map((row) => rect(row).height)),
      firstNameWraps: rect(rows[0].querySelector('td')).height > 40,
      listOverflow: getComputedStyle(node.querySelector('[data-token-table-scroll]')).overflowX,
      dialogRight: rect(node.closest('[data-settings-dialog]')).right,
      tableRight: rect(node.querySelector('[data-token-table-scroll]')).right,
      expiredText: rows[1].textContent,
      normalColor: normal.color,
      expiredColor: expired.color,
      normalBackground: normal.backgroundColor,
      expiredBackground: expired.backgroundColor,
      normalContrast: ratio(normal.color, normal.backgroundColor),
      expiredContrast: ratio(expired.color, expired.backgroundColor),
      revokedNoAction: !rows[2].querySelector('button'),
    };
  });
  assert.equal(list.stage, 'list'); assert.equal(list.rowCount, 14); assert(list.minRow >= 40); assert(list.firstNameWraps);
  assert.equal(list.listOverflow, 'auto'); assert(list.tableRight <= list.dialogRight); assert(list.expiredText.includes('(만료됨)'));
  assert.notEqual(list.expiredColor, list.normalColor); assert(list.normalContrast >= 4.5); assert(list.expiredContrast >= 4.5); assert(list.revokedNoAction);

  const newToken = panel.getByRole('button', { name: '새 액세스 토큰' });
  await newToken.focus();
  const listFocus = await auditFocus(newToken, 'list');
  await newToken.click();
  const name = panel.getByLabel('이름'); await name.waitFor(); assert(await name.evaluate((node) => document.activeElement === node));
  const formFocus = await auditFocus(name, 'form');
  await panel.getByRole('button', { name: '취소' }).click();
  const newAfterCancel = panel.getByRole('button', { name: '새 액세스 토큰' });
  assert(await newAfterCancel.evaluate((node) => document.activeElement === node));
  await newAfterCancel.click();
  await name.waitFor(); assert(await name.evaluate((node) => document.activeElement === node));
  await page.keyboard.press('Tab');
  const readOnlyRadio = panel.getByRole('radio', { name: '읽기 전용' });
  assert(await readOnlyRadio.evaluate((node) => document.activeElement === node));
  await page.keyboard.press('ArrowRight');
  assert(await panel.getByRole('radio', { name: '읽기+쓰기' }).isChecked());
  await page.keyboard.press('Shift+Tab');
  assert(await name.evaluate((node) => document.activeElement === node));
  const expiry = panel.getByLabel('만료 기간');
  await expiry.focus(); await page.keyboard.press('End'); assert.equal(await expiry.inputValue(), '365');
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); assert.equal(await expiry.inputValue(), '90');
  await name.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '합성 입력');
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: '합성 입력', inputType: 'insertCompositionText' }));
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '합성 입력' }));
    node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', isComposing: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '합성 입력' }));
  });
  assert.equal(await page.evaluate(() => window.__issue63Issued), 0);
  await panel.getByRole('button', { name: '발급' }).click();
  await panel.getByText('토큰을 발급하지 못했습니다. 입력을 확인하고 다시 시도하십시오.').waitFor();
  await panel.getByRole('button', { name: '발급' }).click();
  const secret = panel.getByLabel('발급된 액세스 토큰'); await secret.waitFor(); assert(await secret.evaluate((node) => document.activeElement === node));
  const revealFocus = await auditFocus(secret, 'reveal');
  await page.keyboard.press('Control+A');
  const selectedAll = await secret.evaluate((node) => node.selectionStart === 0 && node.selectionEnd === node.value.length && node.readOnly && node.spellcheck === false && node.autocomplete === 'off');
  assert(selectedAll);
  await page.keyboard.press('Control+C');
  assert(await page.evaluate(async () => (await navigator.clipboard.readText()) === 'dl_pat_fixture_secret_never_written_to_artifact'));
  await page.keyboard.press('Escape'); assert.equal(await panel.getAttribute('data-stage'), 'reveal');
  await page.mouse.click(4, 4); assert.equal(await panel.getAttribute('data-stage'), 'reveal');
  assert((await secret.inputValue()).length > 0);

  await panel.getByRole('button', { name: '닫기', exact: true }).focus(); await page.keyboard.press('Enter');
  let keep = panel.getByRole('button', { name: '계속 보기' });
  assert(await keep.evaluate((node) => document.activeElement === node));
  await page.keyboard.press('Escape'); assert.equal(await panel.getAttribute('data-stage'), 'discard');
  await page.mouse.click(4, 4); assert.equal(await panel.getAttribute('data-stage'), 'discard');
  assert((await secret.inputValue()).length > 0);
  await keep.focus();
  await page.keyboard.press('Enter');
  assert(await panel.getByRole('button', { name: '복사하고 닫기' }).evaluate((node) => document.activeElement === node));

  const clipboardFailures = {};
  for (const mode of ['unavailable', 'throw', 'reject']) {
    await setClipboardMode(page, mode);
    await panel.getByRole('button', { name: '복사하고 닫기' }).click();
    await panel.getByTestId('token-copy-failed').waitFor();
    assert.equal(await panel.getAttribute('data-stage'), 'reveal');
    clipboardFailures[mode] = true;
  }
  await setClipboardMode(page, 'restore');
  await panel.getByRole('button', { name: '닫기', exact: true }).click();
  keep = panel.getByRole('button', { name: '계속 보기' }); assert(await keep.evaluate((node) => document.activeElement === node));
  const discardFocus = await auditFocus(keep, 'discard');
  await panel.getByRole('button', { name: '그래도 닫기' }).click();
  assert.equal(await panel.getAttribute('data-stage'), 'list'); assert.equal((await page.locator('body').textContent()).includes('dl_pat_fixture_secret'), false);

  await panel.getByRole('button', { name: '새 액세스 토큰' }).click();
  await panel.getByLabel('이름').fill('지연 클립보드');
  await panel.getByRole('button', { name: '발급' }).click();
  await panel.getByLabel('발급된 액세스 토큰').waitFor();
  await setClipboardMode(page, 'delayed');
  await panel.getByRole('button', { name: '복사하고 닫기' }).click();
  assert.equal(await panel.getAttribute('data-stage'), 'copying');
  assert(await panel.getByRole('button', { name: '복사 중' }).isDisabled());
  await dialog.getByRole('tab', { name: '에디터' }).click();
  await panel.getByTestId('token-close-reconfirm').waitFor();
  await page.evaluate(() => window.__issue63ClipboardResolve());
  await panel.getByRole('button', { name: '새 액세스 토큰' }).waitFor();
  await setClipboardMode(page, 'restore');
  assert.equal((await page.locator('body').textContent()).includes('dl_pat_fixture_secret'), false);
  await dialog.getByRole('tab', { name: '에디터' }).click();
  await dialog.getByRole('tabpanel', { name: '에디터' }).waitFor();
  await dialog.getByRole('tab', { name: '액세스 토큰' }).click();

  await panel.getByRole('button', { name: '새 액세스 토큰' }).click();
  await panel.getByLabel('이름').fill('지연 거절');
  await panel.getByRole('button', { name: '발급' }).click();
  await panel.getByLabel('발급된 액세스 토큰').waitFor();
  await setClipboardMode(page, 'delayed');
  await panel.getByRole('button', { name: '복사하고 닫기' }).click();
  await dialog.getByRole('tab', { name: '에디터' }).click();
  await panel.getByTestId('token-close-reconfirm').waitFor();
  await page.evaluate(() => window.__issue63ClipboardReject(new Error('delayed denied')));
  await panel.getByTestId('token-copy-failed').waitFor();
  await setClipboardMode(page, 'restore');
  await dialog.getByRole('tab', { name: '에디터' }).click();
  await panel.getByTestId('token-close-reconfirm').waitFor();
  await panel.getByRole('button', { name: '그래도 닫기' }).click();
  await dialog.getByRole('tabpanel', { name: '에디터' }).waitFor();
  await dialog.getByRole('tab', { name: '액세스 토큰' }).click();

  const ownerInvalidations = [
    { label: 'logout', next: undefined },
    { label: 'differentOwner', next: { userId: 'fixture-owner-b', generation: 21 } },
    { label: 'sameIdGeneration', next: { userId: 'fixture-owner', generation: 22 } },
  ];
  for (let index = 0; index < ownerInvalidations.length; index += 1) {
    const baseline = { userId: 'fixture-owner', generation: 10 + index };
    await page.evaluate((value) => window.__issue63SetOwner(value), baseline);
    await panel.getByRole('button', { name: '새 액세스 토큰' }).click();
    await panel.getByLabel('이름').fill(`owner-${index}`);
    await panel.getByRole('button', { name: '발급' }).click();
    await panel.getByLabel('발급된 액세스 토큰').waitFor();
    await setClipboardMode(page, 'delayed');
    await panel.getByRole('button', { name: '복사하고 닫기' }).click();
    await page.evaluate((value) => window.__issue63SetOwner(value), ownerInvalidations[index].next);
    await panel.getByRole('button', { name: '새 액세스 토큰' }).waitFor();
    assert.equal(await panel.getByTestId('token-plaintext').count(), 0);
    assert.equal((await page.locator('body').textContent()).includes('dl_pat_fixture_secret'), false);
    await page.evaluate(() => window.__issue63ClipboardResolve());
    await page.waitForTimeout(0);
    assert.equal(await panel.getByTestId('token-plaintext').count(), 0);
    assert.equal((await page.locator('body').textContent()).includes('dl_pat_fixture_secret'), false);
    await setClipboardMode(page, 'restore');
  }
  await page.evaluate(() => window.__issue63SetOwner({ userId: 'fixture-owner', generation: 30 }));

  await page.evaluate(() => window.__issue63SetQuery('error'));
  await panel.getByRole('button', { name: '다시 시도' }).click(); await panel.getByRole('button', { name: /자동화 토큰 2 폐기/ }).waitFor();
  const revoke = panel.getByRole('button', { name: /자동화 토큰 2 폐기/ }); await revoke.focus(); await page.keyboard.press('Enter');
  let gate = page.getByRole('alertdialog'); assert.equal(await gate.getAttribute('data-grade'), 'L2');
  const l2Focus = await auditFocus(gate.getByRole('button', { name: '취소' }), 'L2');
  await page.keyboard.press('Tab'); assert(await gate.getByRole('button', { name: '실행' }).evaluate((node) => document.activeElement === node));
  await page.keyboard.press('Enter'); await panel.getByText('토큰을 폐기하지 못했습니다. 다시 시도하십시오.').waitFor();
  await revoke.focus(); await page.keyboard.press('Enter'); gate = page.getByRole('alertdialog'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await revoke.waitFor({ state: 'detached' });
  await page.screenshot({ path: file, fullPage: false });
  return { environment, list, stages: { listFocus, formFocus, formCancelFocusToNew: true, keyboardTabShiftTab: true, nativeRadioAndSelectKeys: true, compositionSubmitBlocked: true, issueFailureRetry: true, revealFocus, readonlySelectionAndKeyboardCopy: true, revealEscapeAndOutsideBlocked: true, inlineBackEnteredDiscard: true, discardEscapeAndOutsideBlocked: true, manualCopyExplicitCloseReconfirm: true, continueFocusToCopyArea: true, clipboardFailures, clipboardDelayedSuccessWithDeferredNavigation: true, clipboardDelayedRejectWithDeferredNavigation: true, authInvalidationDuringClipboard: ownerInvalidations.map(({ label }) => label), discardFocus, queryFailureRetry: true, keyboardRevoke: true, l2Focus, l2FailureRetry: true }, requestCounts: { issue: await page.evaluate(() => window.__issue63Issued), revoke: await page.evaluate(() => window.__issue63Revoked) } };
}

function extensionAt(dir) {
  const extension = path.join(dir, 'extension'); fs.mkdirSync(extension, { recursive: true });
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue63 isolated zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

async function normalMatrix() {
  const browser = await chromium.launch({ headless: true }); const result = [];
  try {
    for (const theme of themes) for (const [width, height] of viewports) {
      console.log(`checking ${theme} ${width}x${height} 100%`);
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'] });
      try {
        const page = await context.newPage();
        const measured = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })).catch(() => ({ width, height, dpr: 1 }));
        result.push(await exercise(page, theme, path.join(stage, `token-${theme}-${width}x${height}-100.png`), { owner: 'fresh Playwright isolated Chromium', theme, requestedViewport: { width, height }, zoom: 1, preZoomViewport: measured, postZoomViewport: measured }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return result;
}

async function zoomMatrix() {
  const result = [];
  for (const theme of themes) for (const [width, height] of viewports) {
    console.log(`checking ${theme} ${width}x${height} 200%`);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue63-zoom-')); const extension = extensionAt(temp); let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0]; const page = context.pages()[0] || await context.newPage(); await page.goto(url, { waitUntil: 'networkidle' });
      const preZoomViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const zoom = await worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); }, url);
      assert.equal(zoom, 2); await page.waitForTimeout(250); const postZoomViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      assert(postZoomViewport.width < preZoomViewport.width); assert(postZoomViewport.height < preZoomViewport.height);
      result.push(await exercise(page, theme, path.join(stage, `token-${theme}-${width}x${height}-200.png`), { owner: 'fresh Playwright persistent isolated Chromium', theme, requestedViewport: { width, height }, zoom, preZoomViewport, postZoomViewport }));
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return result;
}

async function forcedColorsEvidence() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active', permissions: ['clipboard-read', 'clipboard-write'] });
    try {
      const page = await context.newPage(); const dialog = await openTokens(page, 'light'); const panel = dialog.locator('[data-token-panel]');
      await panel.getByRole('button', { name: '새 액세스 토큰' }).click(); await panel.getByLabel('이름').fill('강제 색상');
      await panel.getByRole('button', { name: '발급' }).click(); await panel.getByText('토큰을 발급하지 못했습니다. 입력을 확인하고 다시 시도하십시오.').waitFor(); await panel.getByRole('button', { name: '발급' }).click();
      await panel.getByRole('button', { name: '닫기', exact: true }).click(); await panel.getByRole('button', { name: '그래도 닫기' }).click();
      assert.equal((await page.locator('body').textContent()).includes('dl_pat_fixture_secret'), false);
      await page.screenshot({ path: path.join(stage, 'token-forced-colors-after-secret-cleared.png') });
      return { owner: 'fresh Playwright isolated Chromium', forcedColors: true, secretArtifactCount: 0 };
    } finally { await context.close(); }
  } finally { await browser.close(); }
}

(async () => {
  try {
    await waitServer(); const matrix = [...await normalMatrix(), ...await zoomMatrix()]; const forcedColors = await forcedColorsEvidence(); assert.equal(matrix.length, 12);
    const signatures = new Set(matrix.map((row) => `${row.environment.requestedViewport.width}x${row.environment.requestedViewport.height}-${row.environment.zoom}`)); assert.equal(signatures.size, 6);
    fs.writeFileSync(path.join(stage, 'browser-matrix.json'), JSON.stringify({ environments: matrix.length, forcedColors, matrix }, null, 2));
    const final = path.join(output, 'browser-matrix'); fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(stage, final);
    console.log(`PASS ${matrix.length} isolated environments; every environment exercised list/form/reveal/discard/L2 and failure recovery; forced-colors passed`);
  } finally { if (server.exitCode === null) { server.kill(); await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]); } }
})().catch((error) => { fs.rmSync(stage, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
