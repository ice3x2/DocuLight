const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue59');
const runOutput = path.resolve(output, 'pre-auth-latest');
const stageOutput = path.resolve(output, `.pre-auth-stage-${process.pid}-${Date.now()}`);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3420/test/newspaper-pre-auth-fixture.html';
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
const themes = ['light', 'dark'];
const states = [
  ['login', 'initial'],
  ['login', 'pending'],
  ['login', 'error'],
  ['signup', 'success'],
  ['signup', 'error'],
];

fs.mkdirSync(output, { recursive: true });
assert.equal(path.dirname(runOutput), path.resolve(output));
assert.equal(path.dirname(stageOutput), path.resolve(output));
fs.rmSync(runOutput, { recursive: true, force: true });
fs.mkdirSync(stageOutput, { recursive: true });

function startVite() {
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3420', '--strictPort'], {
    cwd: webRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  server.ownedExit = new Promise((resolve) => server.once('exit', (code, signal) => resolve({ code, signal })));
  return server;
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`owned fixture server exited before readiness (${server.exitCode})`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('pre-auth fixture server did not start');
}

async function stopVite(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    server.ownedExit,
    new Promise((_, reject) => setTimeout(() => reject(new Error('owned fixture server did not exit')), 5_000)),
  ]);
}

async function submitForState(page, screen, state) {
  if (state === 'initial') return;
  await page.getByLabel('이름').fill('긴 한글 사용자 이름');
  await page.getByLabel('비밀번호').fill('synthetic-password');
  await page.getByRole('button', { name: screen === 'login' ? '로그인' : '가입 신청' }).click();
  if (state === 'pending') await page.getByRole('button', { name: screen === 'login' ? '로그인 중…' : '신청 중…' }).waitFor();
  if (state === 'error') await page.getByRole('alert').waitFor();
  if (state === 'success' && screen === 'signup') await page.getByRole('status').waitFor();
}

async function inspect(page, screen) {
  return page.evaluate((screenId) => {
    const main = document.querySelector(`[data-pre-auth="${screenId}"]`);
    const column = document.querySelector('[data-pre-auth-column]');
    const name = document.querySelector('input[name="name"]');
    const password = document.querySelector('input[name="password"]');
    const submit = document.querySelector('button[type="submit"]');
    const alternate = document.querySelector('[data-pre-auth-alternate]');
    const notice = document.querySelector('[data-slot="inline-notice"]');
    const rect = (element) => element?.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      page: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      main: rect(main),
      column: rect(column),
      name: rect(name),
      password: rect(password),
      submit: rect(submit),
      alternate: rect(alternate),
      styles: {
        mainBackground: main && getComputedStyle(main).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        inputBackground: name && getComputedStyle(name).backgroundColor,
        inputBorder: name && getComputedStyle(name).borderColor,
        inputColor: name && getComputedStyle(name).color,
        focusOutlineWidth: name && getComputedStyle(name).outlineWidth,
        focusOutlineOffset: name && getComputedStyle(name).outlineOffset,
        focusOutlineColor: name && getComputedStyle(name).outlineColor,
        submitBackground: submit && getComputedStyle(submit).backgroundColor,
        submitColor: submit && getComputedStyle(submit).color,
        alternateColor: alternate && getComputedStyle(alternate).color,
        noticeBackground: notice && getComputedStyle(notice).backgroundColor,
        noticeColor: notice && getComputedStyle(notice).color,
        noticeBorder: notice && getComputedStyle(notice).borderColor,
      },
      theme: document.documentElement.dataset.theme,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      shell: document.querySelector('[data-shell="root"]') !== null,
      settings: document.querySelector('[data-shell="settings-corner"]') !== null,
    };
  }, screen);
}

function rgb(value) {
  const channels = value?.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert(channels?.length === 3, `unparseable color: ${value}`);
  return channels;
}

function contrast(first, second) {
  const luminance = (value) => {
    const linear = rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const [bright, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function assertGeometry(result) {
  assert(result.main && result.column && result.name && result.password && result.submit && result.alternate, 'pre-auth geometry is incomplete');
  assert(result.main.height >= result.viewport.height - 1, `main height ${result.main.height} < viewport ${result.viewport.height}`);
  assert(result.column.width <= 401, `column width ${result.column.width}`);
  assert(result.column.left >= 23, `left gutter ${result.column.left}`);
  assert(result.viewport.width - result.column.right >= 23, `right gutter ${result.viewport.width - result.column.right}`);
  assert(result.name.height >= 40 && result.password.height >= 40 && result.submit.height >= 40, 'auth controls are below 40px');
  assert(Math.abs(result.name.width - result.column.width) <= 1, `name width ${result.name.width}, column ${result.column.width}`);
  assert(Math.abs(result.password.width - result.column.width) <= 1, `password width ${result.password.width}, column ${result.column.width}`);
  assert(Math.abs(result.submit.width - result.column.width) <= 1, `submit width ${result.submit.width}, column ${result.column.width}`);
  assert(result.alternate.height >= 36, `alternate target height ${result.alternate.height}`);
  assert(result.page.scrollWidth <= result.page.clientWidth, `horizontal overflow ${result.page.scrollWidth}/${result.page.clientWidth}`);
  assert.equal(result.shell, false);
  assert.equal(result.settings, false);
  assert.equal(result.styles.mainBackground, result.styles.bodyBackground);
  assert(contrast(result.styles.inputColor, result.styles.inputBackground) >= 4.5, 'input text contrast below 4.5:1');
  assert(contrast(result.styles.inputBorder, result.styles.inputBackground) >= 3, 'input boundary contrast below 3:1');
  assert(contrast(result.styles.focusOutlineColor, result.styles.mainBackground) >= 3, 'focus boundary contrast below 3:1');
  assert.equal(result.styles.focusOutlineWidth, '2px');
  assert.equal(result.styles.focusOutlineOffset, '2px');
  const focusExtent = 4;
  assert(result.name.left - focusExtent >= 0 && result.name.top - focusExtent >= 0, 'focus ring clips at top/left viewport edge');
  assert(result.name.right + focusExtent <= result.viewport.width && result.name.bottom + focusExtent <= result.viewport.height, 'focus ring clips at bottom/right viewport edge');
  const submitContrast = contrast(result.styles.submitColor, result.styles.submitBackground);
  assert(submitContrast >= 4.5, `submit text contrast ${submitContrast}: ${result.styles.submitColor} on ${result.styles.submitBackground}`);
  assert(contrast(result.styles.alternateColor, result.styles.mainBackground) >= 4.5, 'alternate text contrast below 4.5:1');
  if (result.styles.noticeColor) {
    assert(contrast(result.styles.noticeColor, result.styles.noticeBackground) >= 4.5, 'notice text contrast below 4.5:1');
    assert(contrast(result.styles.noticeBorder, result.styles.noticeBackground) >= 3, 'notice boundary contrast below 3:1');
  }
  assert(['light', 'dark'].includes(result.theme), `missing root theme: ${result.theme}`);
  assert.equal(result.colorScheme, result.theme);
}

async function assertPageEndsReachable(page) {
  const column = page.locator('[data-pre-auth-column]');
  const alternate = page.locator('[data-pre-auth-alternate]');
  await alternate.scrollIntoViewIfNeeded();
  assert(await alternate.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= -1 && box.bottom <= innerHeight + 1;
  }), 'final navigation is outside the viewport after scrolling');
  await column.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  assert(await page.locator('[data-pre-auth-product]').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= -1 && box.bottom <= innerHeight + 1;
  }), 'top content is outside the viewport after scrolling back');
}

async function exerciseKeyboardAndNativeValues(page) {
  const name = page.getByLabel('이름');
  const password = page.getByLabel('비밀번호');
  assert.equal(await name.getAttribute('name'), 'name');
  assert.equal(await name.getAttribute('autocomplete'), 'username');
  assert.equal(await password.getAttribute('name'), 'password');
  assert.equal(await password.getAttribute('autocomplete'), 'current-password');
  await name.focus();
  await page.keyboard.press('Tab');
  assert.equal(await password.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: '로그인' }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: '가입 신청하기' }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.getByRole('button', { name: '로그인' }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await password.evaluate((element) => element === document.activeElement), true);

  await page.evaluate(() => {
    const nameInput = document.querySelector('input[name="name"]');
    const passwordInput = document.querySelector('input[name="password"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(nameInput, '  자동 채움 사용자  ');
    setter.call(passwordInput, '  synthetic-secret  ');
  });
  await page.getByRole('button', { name: '로그인' }).click();
  const nativeRequest = await page.evaluate(() => window.authRequests.at(-1));
  assert.deepEqual(nativeRequest, { nameLength: 13, passwordLength: 20, screen: 'login' });

  await page.reload({ waitUntil: 'networkidle' });
  const composing = page.getByLabel('이름');
  await composing.dispatchEvent('compositionstart');
  await composing.dispatchEvent('compositionupdate', { data: 'ㅎ' });
  const composingPrevented = await composing.evaluate((element) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    Object.defineProperty(event, 'keyCode', { value: 229 });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  await composing.dispatchEvent('compositionend', { data: '한' });
  await composing.dispatchEvent('keyup', { key: 'Enter', code: 'Enter' });
  assert.equal(composingPrevented, true);
  assert.equal(await page.evaluate(() => window.authRequests.length), 0);
  await composing.press('Enter');
  assert.equal(await page.evaluate(() => window.authRequests.length), 1);

  for (const data of ['한', '']) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    const candidate = page.getByLabel('이름');
    await candidate.dispatchEvent('compositionstart');
    await candidate.dispatchEvent('compositionupdate', { data: data || 'ㅎ' });
    if (data) {
      await candidate.evaluate((element, committed) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(element, committed);
        element.dispatchEvent(new InputEvent('input', { data: committed, inputType: 'insertCompositionText', isComposing: true, bubbles: true }));
      }, data);
    }
    await candidate.dispatchEvent('compositionend', { data });
    await page.evaluate(() => Promise.resolve());
    await candidate.press('Enter');
    assert.equal(await page.evaluate(() => window.authRequests.length), 1, `composition ${data ? 'commit' : 'cancel'} blocked deliberate Enter`);
    assert.equal(await page.evaluate(() => window.authRequests[0].nameLength), data.length, `composition ${data ? 'commit' : 'cancel'} lost or duplicated characters`);
  }
}

async function runNormalMatrix(browser) {
  const evidence = [];
  for (const theme of themes) {
    for (const [width, height] of viewports) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width, height } });
      const page = await context.newPage();
      for (const [screen, state] of states) {
        await page.goto(`${url}?screen=${screen}&state=${state}`, { waitUntil: 'networkidle' });
        await submitForState(page, screen, state);
        await page.getByLabel('이름').focus();
        const result = await inspect(page, screen);
        assertGeometry(result);
        await assertPageEndsReachable(page);
        await page.screenshot({ path: path.join(stageOutput, `green-${screen}-${state}-${theme}-${width}x${height}-100.png`), fullPage: true });
        evidence.push({ zoom: 1, theme, width, height, screen, state, result });
      }
      if (theme === 'light' && width === 1280) {
        await page.goto(`${url}?screen=login&state=initial`, { waitUntil: 'networkidle' });
        await exerciseKeyboardAndNativeValues(page);
      }
      await context.close();
    }
  }
  return evidence;
}

function writeZoomExtension(extensionPath) {
  fs.mkdirSync(extensionPath, { recursive: true });
  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'DocuLight pre-auth zoom verifier',
    version: '1.0.0',
    permissions: ['tabs'],
    background: { service_worker: 'service-worker.js' },
  }));
  fs.writeFileSync(path.join(extensionPath, 'service-worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
}

async function runActualZoomMatrix() {
  const evidence = [];
  for (const theme of themes) {
    for (const [width, height] of viewports) {
      const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-preauth-zoom-'));
      const extensionPath = path.join(temporaryRoot, 'extension');
      writeZoomExtension(extensionPath);
      let context;
      try {
        context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
          headless: false,
          viewport: null,
          colorScheme: theme,
          args: [
            `--window-size=${width},${height}`,
            '--window-position=0,0',
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
          ],
        });
        if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker', { timeout: 10000 });
        const worker = context.serviceWorkers()[0];
        const page = context.pages()[0] ?? await context.newPage();
        for (const [screen, state] of states) {
          const stateUrl = `${url}?screen=${screen}&state=${state}`;
          await page.goto(stateUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          const resetZoom = await worker.evaluate(async (pageUrl) => {
            const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === pageUrl);
            if (!tab || tab.id === undefined) throw new Error('fixture tab not found for zoom reset');
            await chrome.tabs.setZoom(tab.id, 1);
            return chrome.tabs.getZoom(tab.id);
          }, stateUrl);
          assert.equal(resetZoom, 1);
          await page.waitForTimeout(150);
          let before;
          for (let resizeAttempt = 0; resizeAttempt < 3; resizeAttempt += 1) {
            before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
            if (before.width === width && before.height === height) break;
            await worker.evaluate(async ({ pageUrl, widthDelta, heightDelta }) => {
              const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === pageUrl);
              if (!tab || tab.windowId === undefined) throw new Error('fixture window not found');
              const current = await chrome.windows.get(tab.windowId);
              await chrome.windows.update(tab.windowId, {
                width: current.width + widthDelta,
                height: current.height + heightDelta,
              });
            }, { pageUrl: stateUrl, widthDelta: width - before.width, heightDelta: height - before.height });
            await page.waitForTimeout(150);
          }
          before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
          assert(Math.abs(before.width - width) <= 2, `viewport width ${before.width}/${width}`);
          assert(Math.abs(before.height - height) <= 2, `viewport height ${before.height}/${height}`);
          const zoom = await worker.evaluate(async (pageUrl) => {
            const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === pageUrl);
            if (!tab || tab.id === undefined) throw new Error('fixture tab not found');
            await chrome.tabs.setZoom(tab.id, 2);
            return chrome.tabs.getZoom(tab.id);
          }, stateUrl);
          assert.equal(zoom, 2);
          await page.waitForTimeout(250);
          const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
          assert(Math.abs(before.width / after.width - 2) <= 0.1, `zoom width ratio ${before.width}/${after.width}`);
          assert(Math.abs(before.height / after.height - 2) <= 0.15, `zoom height ratio ${before.height}/${after.height}`);
          await submitForState(page, screen, state);
          await page.getByLabel('이름').focus();
          const result = await inspect(page, screen);
          assertGeometry(result);
          await assertPageEndsReachable(page);
          await page.screenshot({ path: path.join(stageOutput, `green-${screen}-${state}-${theme}-${before.width}x${before.height}-200.png`), fullPage: true });
          evidence.push({ method: 'Playwright-owned persistent Chromium extension chrome.tabs.setZoom(2)', zoom, theme, requestedOuterWindow: { width, height }, before, after, screen, state, result });
        }
      } finally {
        await context?.close();
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
      }
    }
  }
  return evidence;
}

(async () => {
  const server = startVite();
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const normal = await runNormalMatrix(browser);
    await browser.close();
    browser = undefined;
    const actualZoom = await runActualZoomMatrix();
    const light = normal.find((entry) => entry.theme === 'light' && entry.screen === 'login' && entry.state === 'initial');
    const dark = normal.find((entry) => entry.theme === 'dark' && entry.screen === 'login' && entry.state === 'initial');
    assert(light && dark && light.result.styles.bodyBackground !== dark.result.styles.bodyBackground, 'light and dark surfaces are identical');
    fs.writeFileSync(path.join(stageOutput, 'green-pre-auth-measurements.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      limitations: [
        'Synthetic/CDP composition evidence is not native Windows Korean IME evidence.',
        'DOM autofill simulation is not real Chromium or third-party password-manager evidence.',
      ],
      normal,
      actualZoom,
    }, null, 2));
    fs.renameSync(stageOutput, runOutput);
    console.log('PASS newspaper pre-auth layout, state, keyboard, synthetic composition, and actual zoom checks');
  } finally {
    await browser?.close();
    await stopVite(server);
  }
})().catch((error) => {
  fs.rmSync(stageOutput, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
