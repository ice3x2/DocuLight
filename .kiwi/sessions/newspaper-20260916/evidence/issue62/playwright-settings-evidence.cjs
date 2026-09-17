const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../../../..');
const webRoot = path.join(root, 'packages/web');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3462/test/newspaper-shell-fixture.html';
const sizes = process.env.ISSUE62_SINGLE === '1' ? [[1280, 720]] : [[1280, 720], [1440, 900], [1920, 1080]];
const themes = process.env.ISSUE62_SINGLE === '1' ? ['light'] : ['light', 'dark'];
const checks = [];
const failures = [];
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3462', '--strictPort'], {
  cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
const serverExit = new Promise((resolve) => server.once('exit', resolve));

function check(scope, name, pass, detail) {
  const row = { scope, name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) };
  checks.push(row);
  if (!row.pass) failures.push(row);
}

async function waitServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned Vite did not start');
}

function extensionAt(directory) {
  const extension = path.join(directory, 'extension');
  fs.mkdirSync(extension, { recursive: true });
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'DocuLight issue 62 zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

function contrast(foreground, background) {
  const channels = (value) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  const linear = (value) => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
  const luminance = ([r, g, b]) => .2126 * linear(r) + .7152 * linear(g) + .0722 * linear(b);
  const a = luminance(channels(foreground));
  const b = luminance(channels(background));
  return Number.isFinite(a) && Number.isFinite(b) ? (Math.max(a, b) + .05) / (Math.min(a, b) + .05) : 0;
}

async function inspect(page, label) {
  const scope = `${label.theme}-${label.width}x${label.height}-${label.zoom === 2 ? 'actual200' : '100'}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, label.theme);
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  await page.locator('[data-shell="settings-corner"] button').click();
  const dialog = page.locator('[role="dialog"]');
  const tabs = dialog.locator('[role="tab"]');
  await dialog.waitFor();

  await tabs.nth(0).click();
  const editor = dialog.locator('[role="tabpanel"]:visible');
  const editorSelects = editor.locator('select');
  const editorCount = await editorSelects.count();
  check(scope, 'exact two editor native selects', editorCount === 2, { editorCount });
  if (editorCount >= 2) {
    const options = await editorSelects.evaluateAll((items) => items.map((item) => [...item.options].map((option) => option.value)));
    check(scope, 'exact editor options', JSON.stringify(options) === JSON.stringify([['view', 'edit'], ['live-preview', 'source']]), options);
    await editorSelects.nth(0).focus();
    await page.keyboard.press('ArrowDown');
    check(scope, 'native select keyboard traversal', await editorSelects.nth(0).inputValue() === 'edit');
    await page.keyboard.press('Tab');
    check(scope, 'editor select Tab traversal', await editorSelects.nth(1).evaluate((node) => document.activeElement === node));
    await page.keyboard.press('Shift+Tab');
    check(scope, 'editor select Shift+Tab traversal', await editorSelects.nth(0).evaluate((node) => document.activeElement === node));
    for (const [state, expected, role] of [
      ['loading', '불러오는 중', 'status'], ['saving', '저장 중', 'status'], ['saved', '저장됨', 'status'],
      ['rejected', '마지막 확인값으로 복원했습니다', 'alert'], ['unknown', '저장 여부를 확인하지 못했습니다', 'alert'],
      ['auth-ended', '로그인이 필요합니다', 'alert'],
    ]) {
      if (state === 'saving') {
        await page.evaluate(() => window.__issue62EditorState('ready'));
        await editorSelects.nth(0).waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelector('[data-personal-settings] select')?.disabled);
        await editorSelects.nth(0).focus();
        await editorSelects.nth(0).evaluate((node) => node.dispatchEvent(new Event('change', { bubbles: true })));
      }
      await page.evaluate((next) => window.__issue62EditorState(next), state);
      await page.waitForFunction((text) => document.body.innerText.includes(text), expected);
      const record = editor.getByRole(role).filter({ hasText: expected });
      await record.waitFor();
      if (state === 'loading' || state === 'saving' || state === 'auth-ended') await page.waitForFunction(() => document.querySelector('[data-personal-settings] select')?.disabled === true);
      check(scope, `editor ${state} state record`, await record.count() === 1, { text: await record.allTextContents() });
      const stateColors = await record.evaluate((node) => { let parent = node; let background = 'rgba(0, 0, 0, 0)'; while (parent) { const candidate = getComputedStyle(parent).backgroundColor; if (!candidate.endsWith(', 0)') && candidate !== 'transparent') { background = candidate; break; } parent = parent.parentElement; } return { text: getComputedStyle(node).color, background }; });
      check(scope, `editor ${state} state text contrast >= 4.5`, contrast(stateColors.text, stateColors.background) >= 4.5, stateColors);
      if (state === 'saving') check(scope, 'editor saving moves focus to deterministic status anchor', await record.evaluate((node) => document.activeElement === node));
      if (state === 'saved') check(scope, 'editor save completion restores focus from status anchor', await editorSelects.nth(0).evaluate((node) => document.activeElement === node));
      if (state === 'loading' || state === 'saving' || state === 'auth-ended') check(scope, `editor ${state} disables affected controls`, await editorSelects.nth(0).isDisabled());
    }
    await page.evaluate(() => window.__issue62EditorState('ready'));
    const editorColors = await editor.evaluate((node) => { const heading = node.querySelector('h2'); const select = node.querySelector('select'); const background = getComputedStyle(node.closest('[data-settings-content]')).backgroundColor; return { heading: getComputedStyle(heading).color, select: getComputedStyle(select).color, selectBackground: getComputedStyle(select).backgroundColor, background }; });
    check(scope, 'editor heading normal-text contrast >= 4.5', contrast(editorColors.heading, editorColors.background) >= 4.5, editorColors);
    check(scope, 'editor selected control text contrast >= 4.5', contrast(editorColors.select, editorColors.selectBackground) >= 4.5, editorColors);
    const editorHeading = editor.getByRole('heading', { level: 2 });
    await editorHeading.evaluate((node) => { node.tabIndex = -1; node.focus(); });
    await page.evaluate(() => window.__issue62EditorState('saving'));
    check(scope, 'editor pending state does not steal unrelated focus', await editorHeading.evaluate((node) => document.activeElement === node));
    await page.evaluate(() => window.__issue62EditorState('ready'));
  }

  await tabs.nth(1).click();
  const appearance = dialog.locator('[role="tabpanel"]:visible');
  const themeSelect = appearance.locator('select');
  const themeCount = await themeSelect.count();
  check(scope, 'exact one theme native select', themeCount === 1, { themeCount });
  if (themeCount === 1) {
    const themeOptions = await themeSelect.locator('option').evaluateAll((items) => items.map((item) => item.value));
    check(scope, 'exact theme options', JSON.stringify(themeOptions) === JSON.stringify(['light', 'dark', 'system']), themeOptions);
    const beforeHover = await themeSelect.evaluate((item) => ({ border: getComputedStyle(item).borderColor, background: getComputedStyle(item).backgroundColor }));
    await themeSelect.hover();
    const hover = await themeSelect.evaluate((item) => ({ border: getComputedStyle(item).borderColor, background: getComputedStyle(item).backgroundColor }));
    check(scope, 'hover state changes computed presentation', hover.border !== beforeHover.border || hover.background !== beforeHover.background, { beforeHover, hover });
    const selectedValue = label.theme === 'dark' ? 'light' : 'dark';
    await themeSelect.selectOption(selectedValue);
    const selected = await dialog.locator('[role="tabpanel"]:visible select').evaluate((item) => ({ value: item.value, selected: item.selectedOptions.length === 1 && item.selectedOptions[0].matches(':checked') }));
    check(scope, 'selected theme survives rerender with native selected option', selected.value === selectedValue && selected.selected, selected);
    const enabledStyle = await dialog.locator('[role="tabpanel"]:visible select').evaluate((item) => ({ opacity: getComputedStyle(item).opacity, color: getComputedStyle(item).color, background: getComputedStyle(item).backgroundColor, border: getComputedStyle(item).borderColor }));
    await dialog.locator('[role="tabpanel"]:visible select').evaluate((item) => { item.disabled = true; });
    const disabled = await dialog.locator('[role="tabpanel"]:visible select').evaluate((item) => ({ native: item.matches(':disabled'), opacity: getComputedStyle(item).opacity, color: getComputedStyle(item).color, background: getComputedStyle(item).backgroundColor, border: getComputedStyle(item).borderColor }));
    check(scope, 'disabled state is native and visually distinct', disabled.native && (disabled.opacity !== enabledStyle.opacity || disabled.color !== enabledStyle.color || disabled.background !== enabledStyle.background || disabled.border !== enabledStyle.border), { enabledStyle, disabled });
    await dialog.locator('[role="tabpanel"]:visible select').evaluate((item) => { item.disabled = false; });
  }

  console.log(`STEP ${scope} account`);
  await tabs.nth(3).click();
  const account = dialog.locator('[role="tabpanel"]:visible');
  await account.locator('button').first().click();
  let form = account.locator('form:has(input[name="current"])');
  let current = form.locator('input[name="current"]');
  let next = form.locator('input[name="next"]');
  check(scope, 'password presentation marker exists', await form.getAttribute('data-password-change-form') !== null);
  const attributes = await form.locator('input').evaluateAll((items) => items.map((item) => ({ type: item.type, name: item.name, autocomplete: item.autocomplete })));
  check(scope, 'stable password attributes', JSON.stringify(attributes) === JSON.stringify([{ type: 'password', name: 'current', autocomplete: 'current-password' }, { type: 'password', name: 'next', autocomplete: 'new-password' }]), attributes);
  await current.focus();
  await page.keyboard.press('Tab');
  check(scope, 'Tab advances current to next', await next.evaluate((item) => document.activeElement === item));
  await page.keyboard.press('Shift+Tab');
  check(scope, 'Shift+Tab returns next to current', await current.evaluate((item) => document.activeElement === item));
  const focusStyle = await current.evaluate((item) => ({ width: getComputedStyle(item).outlineWidth, offset: getComputedStyle(item).outlineOffset, style: getComputedStyle(item).outlineStyle, color: getComputedStyle(item).outlineColor, background: getComputedStyle(item).backgroundColor }));
  check(scope, 'focused password field has 2px ring and 2px separation', parseFloat(focusStyle.width) >= 2 && parseFloat(focusStyle.offset) >= 2 && focusStyle.style !== 'none', focusStyle);
  check(scope, 'focused password ring contrast >= 3', contrast(focusStyle.color, focusStyle.background) >= 3, focusStyle);

  await current.fill('focus-preserved-current');
  await next.fill('focus-preserved-next');
  await next.focus();
  await page.evaluate(() => window.__issue62SetTheme?.(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  form = dialog.locator('[role="tabpanel"]:visible form:has(input[name="current"])');
  current = form.locator('input[name="current"]');
  next = form.locator('input[name="next"]');
  check(scope, 'theme rerender preserves password values', await current.inputValue() === 'focus-preserved-current' && await next.inputValue() === 'focus-preserved-next');
  check(scope, 'theme rerender preserves password focus', await next.evaluate((item) => document.activeElement === item));

  console.log(`STEP ${scope} states`);
  await current.fill('wrong-current');
  await next.fill('wrong-password');
  await form.locator('button[type="submit"]').click();
  const invalid = { value: await current.getAttribute('aria-invalid'), describedBy: await current.getAttribute('aria-describedby') };
  check(scope, 'wrong-password exposes connected invalid state', invalid.value === 'true' && invalid.describedBy !== null, invalid);
  await next.fill('pending-password');
  await form.locator('button[type="submit"]').click();
  const pending = { busy: await form.getAttribute('aria-busy'), disabled: await form.locator('button[type="submit"]').isDisabled() };
  check(scope, 'pending state is busy and disabled', pending.busy === 'true' && pending.disabled, pending);
  await page.evaluate(() => window.__issue62ResolvePassword?.());
  await page.waitForFunction(() => !document.querySelector('form[aria-busy="true"]'), null, { timeout: 5_000 });
  await next.fill('request-error');
  await form.locator('button[type="submit"]').click();
  check(scope, 'request error is announced', await form.locator('[role="alert"]').count() > 0);

  console.log(`STEP ${scope} composition`);
  await page.evaluate(() => { window.__issue62EventOrder = []; window.__issue62PasswordSubmits = []; });
  await current.evaluate((item) => {
    for (const type of ['compositionstart', 'compositionupdate', 'keydown', 'compositionend', 'input']) item.addEventListener(type, (event) => window.__issue62EventOrder.push({ type, data: event.data ?? null, key: event.key ?? null, composing: event.isComposing ?? null }));
  });
  await current.focus();
  await current.dispatchEvent('compositionstart', { data: 'ㅎ' });
  await current.dispatchEvent('compositionupdate', { data: '한' });
  const compositionEnterPrevented = await current.evaluate((item) => !item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true })));
  await current.dispatchEvent('compositionend', { data: '한' });
  await current.evaluate((item) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(item, '한글-현재'); item.dispatchEvent(new InputEvent('input', { bubbles: true, data: '한글-현재', inputType: 'insertCompositionText' })); item.setSelectionRange(item.value.length, item.value.length); });
  await next.evaluate((item) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(item, '한글-새값'); item.setSelectionRange(item.value.length, item.value.length); });
  await page.waitForTimeout(25);
  const composition = await page.evaluate(() => ({ order: window.__issue62EventOrder, submits: window.__issue62PasswordSubmits, current: document.querySelector('input[name="current"]')?.value, next: document.querySelector('input[name="next"]')?.value, caret: document.querySelector('input[name="current"]')?.selectionStart }));
  check(scope, 'composition event order is observable', composition.order.map((row) => row.type).join(',') === 'compositionstart,compositionupdate,keydown,compositionend,input', composition.order);
  check(scope, 'composition-ending Enter does not submit', composition.submits.length === 0, composition.submits);
  check(scope, 'composition-ending Enter is explicitly prevented', compositionEnterPrevented, { compositionEnterPrevented });
  const cancelled = await current.evaluate((item) => {
    const before = { value: item.value, caret: item.selectionStart };
    item.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    item.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: 'cancelled-composition' }));
    item.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { before, after: { value: item.value, caret: item.selectionStart }, submits: window.__issue62PasswordSubmits.length };
  });
  check(scope, 'synthetic Korean composition cancel preserves DOM value caret and zero submits', JSON.stringify(cancelled.before) === JSON.stringify(cancelled.after) && cancelled.submits === 0, cancelled);
  check(scope, 'Korean committed DOM value and caret survive', composition.current === '한글-현재' && composition.next === '한글-새값' && composition.caret === '한글-현재'.length, composition);
  await form.locator('button[type="submit"]').click();
  const submitted = await page.evaluate(() => window.__issue62PasswordSubmits);
  check(scope, 'deliberate submit sends exact Korean request bytes once', submitted.length === 1 && submitted[0].current === '한글-현재' && submitted[0].next === '한글-새값', submitted);

  console.log(`STEP ${scope} geometry`);
  const geometry = await form.evaluate((node) => {
    const content = node.closest('[data-settings-content]'); const warning = node.querySelector('[data-slot="inline-notice"]'); const controls = [...node.querySelectorAll('input, button[type="submit"]')]; const rect = (item) => item?.getBoundingClientRect().toJSON(); const style = getComputedStyle(node.querySelector('input'));
    const fields = [...node.querySelectorAll('[data-slot="field"]')].map(rect);
    return { form: rect(node), content: rect(content), warning: rect(warning), controls: controls.map(rect), fields, scroll: { height: content.scrollHeight, client: content.clientHeight, width: content.scrollWidth, clientWidth: content.clientWidth }, wrapping: { warningScrollWidth: warning?.scrollWidth, warningClientWidth: warning?.clientWidth }, colors: { text: style.color, background: style.backgroundColor, warningText: getComputedStyle(warning).color, warningBackground: getComputedStyle(warning).backgroundColor } };
  });
  check(scope, 'form geometry is bounded to 560px', geometry.form.width <= 560.5 && geometry.form.width <= geometry.content.width, geometry.form);
  check(scope, 'warning geometry is bounded by form', geometry.warning && geometry.warning.width <= geometry.form.width + .5, geometry.warning);
  check(scope, 'controls meet 36px target', geometry.controls.every((item) => item.height >= 36), geometry.controls);
  check(scope, 'password fields retain at least 20px vertical gap', geometry.fields.length === 2 && geometry.fields[1].top - geometry.fields[0].bottom >= 19.5, geometry.fields);
  check(scope, 'Korean warning and settings content do not overflow horizontally', geometry.wrapping.warningScrollWidth <= geometry.wrapping.warningClientWidth + 1 && geometry.scroll.width <= geometry.scroll.clientWidth + 1, { wrapping: geometry.wrapping, scroll: geometry.scroll });
  check(scope, 'normal text contrast >= 4.5', contrast(geometry.colors.text, geometry.colors.background) >= 4.5, geometry.colors);
  check(scope, 'warning text contrast >= 4.5', contrast(geometry.colors.warningText, geometry.colors.warningBackground) >= 4.5, geometry.colors);
  await form.locator('button[type="submit"]').scrollIntoViewIfNeeded();
  check(scope, 'final submit remains reachable', await form.locator('button[type="submit"]').isVisible(), geometry.scroll);
  const screenshot = path.join(__dirname, `green-${label.theme}-${label.width}x${label.height}-${label.zoom === 2 ? 'actual200' : '100'}.png`);
  await page.screenshot({ path: screenshot });
  return { ...label, viewport, geometry, screenshot: path.basename(screenshot), methods: { ime: 'Playwright DOM synthetic composition sequence plus committed DOM value/caret inspection', autofill: 'native HTMLInputElement.value setter without React change event; exact callback bytes asserted' } };
}

async function normalCases() {
  const browser = await chromium.launch({ headless: true }); const rows = [];
  try { for (const theme of themes) for (const [width, height] of sizes) { console.log(`RUN ${theme}-${width}x${height}-100`); const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme }); try { rows.push(await inspect(await context.newPage(), { theme, width, height, zoom: 1, owner: 'fresh Playwright browser/context' })); } catch (error) { check(`${theme}-${width}x${height}-100`, 'environment completed', false, String(error?.stack ?? error)); } finally { await context.close(); } } } finally { await browser.close(); }
  return rows;
}

async function zoomCases() {
  const rows = [];
  for (const theme of themes) for (const [width, height] of sizes) {
    const scope = `${theme}-${width}x${height}-actual200`; console.log(`RUN ${scope}`); const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue62-zoom-')); const extension = extensionAt(temporary); let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme, args: [`--window-size=${width},${height}`, '--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker'); const worker = context.serviceWorkers()[0]; const page = context.pages()[0] || await context.newPage(); await page.goto(url, { waitUntil: 'networkidle' }); const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const zoom = await worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((item) => item.url === target); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); }, url);
      check(scope, 'actual browser zoom equals 2', zoom === 2, { zoom }); await page.waitForTimeout(250); const row = await inspect(page, { theme, width, height, zoom, owner: 'fresh Playwright persistent Chromium profile + disposable extension' }); check(scope, 'actual 200% shrinks CSS viewport', row.viewport.width < before.width, { before, after: row.viewport }); rows.push({ ...row, before });
    } catch (error) { check(scope, 'environment completed', false, String(error?.stack ?? error)); } finally { await context?.close(); fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  return rows;
}

(async () => {
  try { await waitServer(); const environments = [...await normalCases(), ...await zoomCases()]; const artifact = { count: environments.length, checkCount: checks.length, failures: failures.length, environments, checks, failedChecks: failures }; fs.writeFileSync(path.join(__dirname, 'green-browser-12env.json'), JSON.stringify(artifact, null, 2)); console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${environments.length}/12 environments; ${checks.length - failures.length}/${checks.length} checks passed`); for (const failure of failures) console.error(`FAIL [${failure.scope}] ${failure.name}: ${JSON.stringify(failure.detail ?? null)}`); if (failures.length > 0 || environments.length !== 12) process.exitCode = 1; }
  finally { if (server.exitCode === null) { server.kill(); await Promise.race([serverExit, new Promise((resolve) => setTimeout(resolve, 5000))]); } }
})().catch((error) => { console.error(error); process.exitCode = 1; });
