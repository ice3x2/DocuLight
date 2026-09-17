const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue60');
const runOutput = path.join(output, 'install-matrix-latest');
const stageOutput = path.join(output, `.install-stage-${process.pid}-${Date.now()}`);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3421/test/newspaper-install-fixture.html';
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
const themes = ['light', 'dark'];

fs.mkdirSync(output, { recursive: true });
fs.rmSync(runOutput, { recursive: true, force: true });
fs.mkdirSync(stageOutput, { recursive: true });

function startVite() {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3421', '--strictPort'], {
    cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.ownedExit = new Promise((resolve) => child.once('exit', resolve));
  return child;
}
async function waitForServer(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned fixture server did not start');
}
async function stopVite(server) {
  if (server.exitCode !== null) return;
  server.kill();
  await Promise.race([server.ownedExit, new Promise((_, reject) => setTimeout(() => reject(new Error('owned Vite did not exit')), 5000))]);
}
function rgb(value) { return value.match(/[\d.]+/g).slice(0, 3).map(Number); }
function contrast(a, b) {
  const luminance = (value) => {
    const c = rgb(value).map((n) => { const s = n / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
    return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + .05) / (lo + .05);
}
async function inspect(page, expectedStep) {
  const result = await page.evaluate((step) => {
    const wizard = document.querySelector('[data-install-wizard]');
    const main = document.querySelector('[data-pre-auth="install"]');
    const control = wizard.querySelector('input,select,button');
    const rect = (node) => node?.getBoundingClientRect().toJSON();
    return {
      step: wizard.getAttribute('data-install-step'), viewport: { width: innerWidth, height: innerHeight },
      page: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth },
      wizard: rect(wizard), main: rect(main), control: rect(control),
      colors: { foreground: getComputedStyle(wizard).color, background: getComputedStyle(main).backgroundColor },
      theme: document.documentElement.dataset.theme, expectedStep: String(step),
    };
  }, expectedStep);
  assert.equal(result.step, result.expectedStep);
  assert(result.wizard.width <= 641, `wizard width ${result.wizard.width}`);
  assert(result.wizard.left >= 23 && result.viewport.width - result.wizard.right >= 23, 'safe side gutter missing');
  assert(result.control.height >= 40, `control height ${result.control.height}`);
  assert(result.page.scrollWidth <= result.page.clientWidth, 'horizontal overflow');
  assert(contrast(result.colors.foreground, result.colors.background) >= 4.5, 'text contrast below 4.5');
  return result;
}
async function setNativeValue(page, selector, value) {
  await page.locator(selector).evaluate((node, input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, input.value);
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: input.value, inputType: 'insertText' }));
  }, { value });
  assert.equal(await page.locator(selector).inputValue(), value);
}
async function setComposingValueAndPressEnter(page, selector, value) {
  await page.locator(selector).evaluate((node, input) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: input.value }));
    setter.call(node, input.value);
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: input.value, inputType: 'insertCompositionText', isComposing: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', isComposing: true }));
  }, { value });
  assert.equal(await page.locator(selector).inputValue(), value);
  assert.equal(await page.locator('[data-install-wizard]').getAttribute('data-install-step'), '2');
  await page.locator(selector).evaluate((node, input) => {
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: input }));
  }, value);
}
async function inspectFocus(page, selector) {
  const target = page.locator(selector);
  await target.focus();
  const result = await target.evaluate((node) => {
    const style = getComputedStyle(node);
    const bounds = node.getBoundingClientRect();
    const extent = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    return {
      outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset,
      outlineColor: style.outlineColor, background: getComputedStyle(document.querySelector('[data-pre-auth="install"]')).backgroundColor,
      bounds: bounds.toJSON(), extent, viewport: { width: innerWidth, height: innerHeight },
    };
  });
  assert.equal(result.outlineWidth, '2px');
  assert.equal(result.outlineOffset, '2px');
  assert(contrast(result.outlineColor, result.background) >= 3, 'focus indicator contrast below 3');
  assert(result.bounds.left - result.extent >= 0 && result.bounds.top - result.extent >= 0, 'focus indicator begins outside viewport');
  assert(result.bounds.right + result.extent <= result.viewport.width && result.bounds.bottom + result.extent <= result.viewport.height, 'focus indicator ends outside viewport');
  return result;
}
async function drive(page, label) {
  const stages = [await inspect(page, 1)];
  const focus = await inspectFocus(page, 'input[name="installToken"]');
  await page.locator('input[name="installToken"]').fill('invalid-token');
  await page.getByRole('button', { name: '다음' }).click();
  const tokenError = {
    text: await page.getByText(/설치 토큰이 올바르지 않습니다/).textContent(),
    invalid: await page.locator('input[name="installToken"]').getAttribute('aria-invalid'),
  };
  assert.equal(tokenError.invalid, 'true');
  await setNativeValue(page, 'input[name="installToken"]', 'synthetic-token');
  await page.getByRole('button', { name: '다음' }).click();
  const tokenSubmission = await page.evaluate(() => ({
    calls: window.__installFixture.verifyCalls,
    last: window.__installFixture.verifiedTokens.at(-1),
  }));
  assert.deepEqual(tokenSubmission, { calls: 2, last: 'synthetic-token' });
  stages.push(await inspect(page, 2));
  const imeName = '매우 긴 한글 설치 관리자 이름 가나다라마바사아자차카타파하';
  await setComposingValueAndPressEnter(page, 'input[name="superuserName"]', imeName);
  assert.deepEqual(await page.evaluate(() => ({ verify: window.__installFixture.verifyCalls, commit: window.__installFixture.commitCalls })), { verify: 2, commit: 0 });
  await page.getByLabel('비밀번호', { exact: true }).fill('synthetic-secret');
  await page.getByLabel('비밀번호 확인').fill('mismatch');
  await page.getByRole('button', { name: '다음' }).click();
  const passwordError = {
    text: await page.getByText('비밀번호가 일치하지 않습니다.').textContent(),
    step: await page.locator('[data-install-wizard]').getAttribute('data-install-step'),
    invalid: await page.getByLabel('비밀번호 확인').getAttribute('aria-invalid'),
  };
  assert.deepEqual([passwordError.step, passwordError.invalid], ['2', 'true']);
  await setNativeValue(page, 'input[name="passwordConfirm"]', 'synthetic-secret');
  await page.getByLabel('비밀번호 확인').press('Enter');
  stages.push(await inspect(page, 3));
  await page.getByLabel('가입 모드').selectOption('open');
  await page.getByLabel('기본 그룹 초기 권한').selectOption('edit');
  assert.equal(await page.getByTestId('grant-warning').count(), 1);
  await page.getByRole('button', { name: '다음' }).click();
  stages.push(await inspect(page, 4));
  await page.getByRole('button', { name: '설치 완료' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '취소');
  assert.equal((await dialog.textContent()).includes(imeName), true);
  await page.screenshot({ path: path.join(stageOutput, `${label}.png`), fullPage: true });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '설치 완료');
  await page.getByRole('button', { name: '설치 완료' }).click();
  await page.getByRole('button', { name: '설치하고 부여' }).click();
  const commitError = await page.getByText('기본 워크스페이스를 만들지 못했습니다. 서버 로그를 확인하십시오.').textContent();
  assert.equal(await page.locator('[data-install-wizard]').getAttribute('data-install-step'), '4');
  await page.getByRole('button', { name: '설치 완료' }).click();
  await page.getByRole('button', { name: '설치하고 부여' }).click();
  await page.getByRole('button', { name: '설치 중…' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '취소' }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('alertdialog').isVisible(), true);
  await page.screenshot({ path: path.join(stageOutput, `${label}-pending.png`), fullPage: true });
  await page.getByRole('heading', { name: '완료' }).waitFor();
  const submission = await page.evaluate(() => ({
    commits: window.__installFixture.commitCalls,
    inputs: window.__installFixture.committedInputs,
  }));
  assert.equal(submission.commits, 2);
  assert.equal(submission.inputs.length, 2);
  for (const input of submission.inputs) assert.deepEqual(input, { superuserName: imeName, signupMode: 'open', defaultGroupLevel: 'edit', workspaceName: 'workspace' });
  stages.push(await inspect(page, 'complete'));
  assert.equal(await page.getByRole('button', { name: '이전' }).count(), 0);
  await page.screenshot({ path: path.join(stageOutput, `${label}-complete.png`), fullPage: true });
  await page.getByRole('button', { name: '시작하기' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.installStarted), 'true');
  assert.equal(await page.evaluate(() => window.__installFixture.startCalls), 1);
  return {
    stages, focus,
    errors: { token: tokenError, passwordMismatch: passwordError, commit: commitError },
    inputs: {
      nativeAutofillTokenExtracted: tokenSubmission.calls === 2 && tokenSubmission.last === 'synthetic-token',
      syntheticCompositionNameExtracted: submission.commits === 2 && submission.inputs.every((input) => input.superuserName === imeName),
      composingEnterSuppressed: true,
      deliberateEnterAdvanced: true,
    },
    completion: { visible: true, noBack: true, startHandoff: true },
  };
}
function writeZoomExtension(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'DocuLight install zoom verifier', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'service-worker.js' } }));
  fs.writeFileSync(path.join(directory, 'service-worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
}
async function normalMatrix() {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const theme of themes) for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      const dpr = await page.evaluate(() => devicePixelRatio);
      evidence.push({ runner: 'Playwright-owned fresh isolated Chromium', profile: 'ephemeral context', theme, width, height, zoom: 1, dpr: { before: dpr, after: dpr }, ...await drive(page, `install-${theme}-${width}x${height}-100`) });
      await context.close();
    }
  } finally { await browser.close(); }
  return evidence;
}
async function zoomMatrix() {
  const evidence = [];
  for (const theme of themes) for (const [width, height] of viewports) {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue60-zoom-'));
    const extension = path.join(temporaryRoot, 'extension');
    writeZoomExtension(extension);
    let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), { headless: false, viewport: null, colorScheme: theme, args: [`--window-size=${width},${height}`, '--window-position=0,0', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0];
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        if (Math.abs(current.width - width) <= 2 && Math.abs(current.height - height) <= 2) break;
        await worker.evaluate(async ({ pageUrl, dw, dh }) => {
          const tab = (await chrome.tabs.query({})).find((item) => item.url === pageUrl);
          const win = await chrome.windows.get(tab.windowId);
          await chrome.windows.update(tab.windowId, { width: win.width + dw, height: win.height + dh });
        }, { pageUrl: url, dw: width - current.width, dh: height - current.height });
        await page.waitForTimeout(150);
      }
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const zoom = await worker.evaluate(async (pageUrl) => { const tab = (await chrome.tabs.query({})).find((item) => item.url === pageUrl); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); }, url);
      assert.equal(zoom, 2);
      await page.waitForTimeout(250);
      const after = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      assert(Math.abs(before.width / after.width - 2) <= .1, 'actual zoom width ratio');
      evidence.push({ runner: 'Playwright-owned persistent Chromium extension chrome.tabs.setZoom(2)', profile: temporaryRoot, theme, width, height, zoom, before, after, dpr: { before: before.dpr, after: after.dpr }, ...await drive(page, `install-${theme}-${width}x${height}-actual200`) });
    } finally {
      await context?.close();
      const resolved = fs.realpathSync(temporaryRoot);
      assert(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  return evidence;
}

(async () => {
  const server = startVite();
  try {
    await waitForServer(server);
    const evidence = [...await normalMatrix(), ...await zoomMatrix()];
    assert.equal(evidence.length, 12);
    for (const item of evidence) {
      assert.equal(item.stages.length, 5, `${item.theme} ${item.width}x${item.height} zoom ${item.zoom}: five stages`);
      assert.deepEqual(item.stages.map((stage) => stage.step), ['1', '2', '3', '4', 'complete']);
      assert.equal(item.errors.token.invalid, 'true');
      assert.equal(item.errors.passwordMismatch.invalid, 'true');
      assert.equal(item.completion.startHandoff, true);
      assert.equal(item.inputs.nativeAutofillTokenExtracted, true);
      assert.equal(item.inputs.syntheticCompositionNameExtracted, true);
      assert.equal(item.inputs.composingEnterSuppressed, true);
      assert.equal(item.inputs.deliberateEnterAdvanced, true);
      assert.equal(typeof item.dpr.before, 'number');
      assert.equal(typeof item.dpr.after, 'number');
    }
    fs.writeFileSync(path.join(stageOutput, 'matrix.json'), JSON.stringify({ execution: 'Playwright only; all Chromium processes launched and owned by this checker', environments: evidence.length, evidence }, null, 2));
    fs.renameSync(stageOutput, runOutput);
  } finally {
    await stopVite(server);
    if (fs.existsSync(stageOutput)) fs.rmSync(stageOutput, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
