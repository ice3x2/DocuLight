const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue67');
const screenshots = path.join(output, 'screenshots');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const runNonce = randomUUID();
const runtimePassword = (salt) => Array.from(
  { length: 16 },
  (_, index) => String.fromCharCode(65 + ((index * 7 + salt) % 26)),
).join('');
const registrationPassword = ` ${runtimePassword(3)} `;
let baseUrl;
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
fs.mkdirSync(screenshots, { recursive: true });

let viteServer;

async function startServer() {
  const { createServer } = await import('vite');
  viteServer = await createServer({ root: webRoot, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  assert(address && typeof address === 'object');
  const port = address.port;
  baseUrl = `http://127.0.0.1:${port}/test/issue67-principal-fixture.html?nonce=${encodeURIComponent(runNonce)}`;
}

async function waitServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseUrl)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned issue67 Vite server did not start');
}

function extensionAt(temp) {
  const extension = path.join(temp, 'extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 67 zoom verifier', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

function rgb(value) {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(channels?.length, 3, `unsupported color ${value}`);
  return channels;
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

async function mountFixture(page, theme) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-issue67-component-bundle]').getAttribute('data-run-nonce'), runNonce, 'fixture nonce mismatch');
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

async function openSettings(page, role, theme, options = {}) {
  await page.evaluate(({ role, options }) => window.__issue67Configure({ role, empty: false, noRegister: false, ...options }), { role, options });
  await page.locator(`[data-issue67-component-bundle][data-role="${role}"]`).waitFor();
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  await page.getByRole('button', { name: '설정' }).click();
  return page.getByRole('dialog', { name: '설정' });
}

async function assertRoleGates(page, role, theme) {
  const dialog = await openSettings(page, role, theme);
  const users = dialog.getByRole('tab', { name: '사용자 관리' });
  const approval = dialog.getByRole('tab', { name: '가입 승인' });
  const expected = role === 'superuser' ? 1 : 0;
  assert.equal(await users.count(), expected, `${role} 사용자 관리 gate`);
  assert.equal(await approval.count(), expected, `${role} 가입 승인 gate`);
  if (role !== 'superuser') {
    const accessible = await dialog.getByRole('tab').allTextContents();
    assert.equal(accessible.includes('사용자 관리'), false);
    assert.equal(accessible.includes('가입 승인'), false);
    assert.equal(await dialog.locator('[data-principal-panel]').count(), 0, `${role} privileged component DOM`);
  }
  return { role, users: expected, approval: expected };
}

async function inspectSuperuser(page, theme, identity) {
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '사용자 관리' }).click();
  const roster = dialog.locator('[data-principal-panel="roster"]');
  await roster.waitFor();
  assert.deepEqual(await roster.getByTestId('roster-status').allTextContents(), ['활성', '대기', '정지', '거절', '활성', '대기', '정지', '거절', '활성', '대기', '정지', '거절', '활성', '대기', '정지', '거절']);
  assert.deepEqual(await roster.getByTestId('roster-status').evaluateAll((nodes) => nodes.slice(0, 4).map((node) => node.getAttribute('data-variant'))), ['success', 'warning', 'neutral', 'danger']);
  const selectableName = roster.locator('[data-slot="table-body"] [data-slot="table-cell"]').first();
  const selectedText = await selectableName.evaluate((node) => {
    const selection = getSelection(); const range = document.createRange();
    range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range);
    return { text: selection.toString(), userSelect: getComputedStyle(node).userSelect };
  });
  assert(selectedText.text.includes('활성 사용자 이름'));
  assert.notEqual(selectedText.userSelect, 'none');
  await page.keyboard.press('Control+C');
  const copiedText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copiedText, selectedText.text, 'clipboard text differs from selected readonly name');
  const name = roster.getByLabel('새 사용자 이름');
  const password = roster.getByLabel('임시 비밀번호');
  assert.equal(await password.getAttribute('type'), 'password');
  assert.equal(await name.getAttribute('autocomplete'), 'username');
  assert.equal(await password.getAttribute('autocomplete'), 'new-password');
  assert.equal(await roster.locator('[aria-invalid="true"]').count(), 0);
  assert.equal(await roster.getByRole('button', { name: '등록' }).isDisabled(), true, 'empty registration must be disabled');

  await name.evaluate((node) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, '붙여넣은 이름');
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: '붙여넣은 이름', inputType: 'insertFromPaste' }));
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }));
  });
  assert.equal(await name.inputValue(), '붙여넣은 이름', 'synthetic paste-style input did not synchronize controlled value');

  const compositionSequence = await name.evaluate((node) => {
    const seen = [];
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend']) node.addEventListener(type, () => seen.push(type), { once: true });
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '한' }));
    node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '한글' }));
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node, ' 한글 이름 ');
    node.dispatchEvent(new InputEvent('input', { bubbles: true, data: ' 한글 이름 ', inputType: 'insertCompositionText', isComposing: true }));
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, isComposing: true }));
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: ' 한글 이름 ' }));
    return seen;
  });
  assert.deepEqual(compositionSequence, ['compositionstart', 'compositionupdate', 'compositionend']);
  assert.equal(await page.evaluate(() => window.__issue67.registerCount), 0, 'composition dispatched registration');
  await password.fill(registrationPassword);
  assert.equal(await password.inputValue(), registrationPassword, 'DOM/autofill-style value did not synchronize');
  await name.focus();
  const focus = await name.evaluate((node) => { const style = getComputedStyle(node); return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor, background: style.backgroundColor }; });
  assert.equal(focus.width, '2px'); assert.equal(focus.offset, '2px');
  await page.keyboard.press('Tab');
  assert.equal(await password.evaluate((node) => node === document.activeElement), true, 'Tab did not reach password');
  await page.keyboard.press('Tab');
  const register = roster.getByRole('button', { name: '등록' });
  assert.equal(await register.evaluate((node) => node === document.activeElement), true, 'Tab did not reach registration action');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await password.evaluate((node) => node === document.activeElement), true, 'Shift+Tab did not return to password');
  const registerBeforeHover = await register.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor }; });
  await register.hover();
  const registerAfterHover = await register.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor }; });
  assert.notDeepEqual(registerAfterHover, registerBeforeHover, 'registration hover has no computed change');
  const rosterVisual = await roster.evaluate((root) => {
    const style = (node) => { const value = getComputedStyle(node); return { color: value.color, background: value.backgroundColor, border: value.borderColor }; };
    return {
      cell: style(root.querySelector('[data-slot="table-cell"]')),
      badges: [...root.querySelectorAll('[data-testid="roster-status"]')].slice(0, 4).map(style),
      register: style(root.querySelector('[data-slot="button"]')),
      surface: getComputedStyle(root.closest('[role="dialog"]')).backgroundColor,
      title: (() => { const value = getComputedStyle(root.querySelector('[data-principal-title]')); return { fontFamily: value.fontFamily, fontSize: value.fontSize, fontWeight: value.fontWeight, lineHeight: value.lineHeight }; })(),
      caption: (() => { const value = getComputedStyle(root.querySelector('caption')); return { fontFamily: value.fontFamily, fontSize: value.fontSize, fontWeight: value.fontWeight, lineHeight: value.lineHeight }; })(),
      registration: (() => { const node = root.querySelector('[data-principal-registration]'); const rect = node.getBoundingClientRect(); const parent = node.parentElement.getBoundingClientRect(); return { width: rect.width, availableWidth: parent.width }; })(),
    };
  });
  for (const [kind, typography] of Object.entries({ title: rosterVisual.title, caption: rosterVisual.caption })) {
    assert.equal(typography.fontSize, '18px', `${kind} font size`);
    assert.equal(typography.lineHeight, '26px', `${kind} line height`);
    assert.equal(typography.fontWeight, '600', `${kind} font weight`);
    assert(/sans/i.test(typography.fontFamily), `${kind} is not sans-serif: ${typography.fontFamily}`);
  }
  assert(rosterVisual.registration.width <= 560.5, `registration wider than 560px: ${rosterVisual.registration.width}`);
  assert(rosterVisual.registration.width <= rosterVisual.registration.availableWidth + 0.5, 'registration exceeds available width');
  await page.screenshot({ path: path.join(screenshots, `${identity}-users.png`) });
  await register.click();
  assert.deepEqual(await page.evaluate(() => ({ count: window.__issue67.registerCount, exact: window.__issue67.registerExact })), { count: 1, exact: true });

  await dialog.getByRole('tab', { name: '가입 승인' }).click();
  const approval = dialog.locator('[data-principal-panel="approval"]');
  await approval.getByRole('tab', { name: '대기 중 (4)' }).waitFor();
  assert.equal(await approval.getByRole('button', { name: /Pending User.* 승인/ }).count(), 1);
  assert.equal(await approval.getByRole('button', { name: /Pending User.* 거절/ }).count(), 1);
  const approve = approval.getByRole('button', { name: /Pending User.* 승인/ });
  const reject = approval.getByRole('button', { name: /Pending User.* 거절/ });
  const pendingTab = approval.getByRole('tab', { name: '대기 중 (4)' });
  const rejectedTab = approval.getByRole('tab', { name: '거절됨 (4)' });
  const tabBeforeHover = await rejectedTab.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color }; });
  await rejectedTab.hover();
  const tabAfterHover = await rejectedTab.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, color: style.color }; });
  assert.notDeepEqual(tabAfterHover, tabBeforeHover, 'tab hover has no computed change');
  const beforeHover = await approve.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor }; });
  await approve.hover();
  const afterHover = await approve.evaluate((node) => { const style = getComputedStyle(node); return { background: style.backgroundColor, border: style.borderColor }; });
  assert.notDeepEqual(afterHover, beforeHover, 'approval action hover has no computed change');
  await approve.click();
  await reject.click();
  await rejectedTab.focus();
  assert.equal(await rejectedTab.evaluate((node) => node === document.activeElement), true, 'rejected tab focus identity');
  await rejectedTab.press('Enter');
  assert.equal(await rejectedTab.getAttribute('data-state'), 'active');
  assert.equal(await approval.getByRole('button', { name: '거절 사용자 재심사' }).count(), 1);
  assert.equal(await approval.getByRole('button', { name: /승인/ }).count(), 0, 'rejected tab exposes approve');
  const lastAction = approval.getByRole('button', { name: /재심사/ }).last();
  await lastAction.scrollIntoViewIfNeeded();
  const lastActionVisible = await lastAction.evaluate((node) => {
    const dialog = node.closest('[role="dialog"]'); const action = node.getBoundingClientRect(); const boundary = dialog.getBoundingClientRect();
    return action.top >= boundary.top && action.bottom <= boundary.bottom && action.left >= boundary.left && action.right <= boundary.right;
  });
  assert.equal(lastActionVisible, true, 'last row action is not within the visible dialog viewport after scroll');
  await approval.getByRole('button', { name: '거절 사용자 재심사' }).click();
  const callbackIds = await page.evaluate(() => ({ approve: window.__issue67.approveIds, reject: window.__issue67.rejectIds, reopen: window.__issue67.reopenIds }));
  assert.deepEqual(callbackIds, { approve: ['pending-id'], reject: ['pending-id'], reopen: ['rejected-id'] });
  await rejectedTab.focus();
  const tabFocus = await rejectedTab.evaluate((node) => { const style = getComputedStyle(node); return { width: style.outlineWidth, offset: style.outlineOffset }; });
  assert.deepEqual(tabFocus, { width: '2px', offset: '2px' });
  await page.screenshot({ path: path.join(screenshots, `${identity}-approval.png`) });

  const metrics = await approval.evaluate((root) => {
    const dialog = root.closest('[role="dialog"]');
    const row = root.querySelector('[data-slot="table-row"]');
    const action = root.querySelector('[data-slot="button"]');
    const tab = root.querySelector('[role="tab"][data-state="active"]');
    const style = (node) => { const value = getComputedStyle(node); return { color: value.color, background: value.backgroundColor, border: value.borderColor }; };
    const rect = (node) => node.getBoundingClientRect().toJSON();
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      dialog: rect(dialog), row: rect(row), action: rect(action), tab: rect(tab),
      styles: { action: style(action), tab: style(tab), dialog: style(dialog) },
      typography: {
        title: (() => { const value = getComputedStyle(root.querySelector('[data-principal-title]')); return { fontFamily: value.fontFamily, fontSize: value.fontSize, fontWeight: value.fontWeight, lineHeight: value.lineHeight }; })(),
        caption: (() => { const value = getComputedStyle(root.querySelector('caption')); return { fontFamily: value.fontFamily, fontSize: value.fontSize, fontWeight: value.fontWeight, lineHeight: value.lineHeight }; })(),
      },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      lastActionVisible: true,
      indicator: getComputedStyle(tab, '::after').backgroundColor,
      forcedColors: matchMedia('(forced-colors: active)').matches,
    };
  });
  assert(metrics.row.height >= 40, `row below 40px ${metrics.row.height}`);
  assert(metrics.action.height >= 36, `action below 36px ${metrics.action.height}`);
  for (const [kind, typography] of Object.entries(metrics.typography)) {
    assert.equal(typography.fontSize, '18px', `approval ${kind} font size`);
    assert.equal(typography.lineHeight, '26px', `approval ${kind} line height`);
    assert.equal(typography.fontWeight, '600', `approval ${kind} font weight`);
    assert(/sans/i.test(typography.fontFamily), `approval ${kind} is not sans-serif: ${typography.fontFamily}`);
  }
  assert.equal(metrics.horizontalOverflow, false);
  assert.equal(metrics.lastActionVisible, true);
  const actionContrast = contrast(metrics.styles.action.color, metrics.styles.action.background);
  assert(actionContrast >= 4.5, `action contrast ${actionContrast}`);
  const contrastRatios = {
    rosterText: contrast(rosterVisual.cell.color, rosterVisual.surface),
    registerText: contrast(rosterVisual.register.color, rosterVisual.register.background),
    focusRing: contrast(focus.color, focus.background),
    tabText: contrast(metrics.styles.tab.color, metrics.styles.tab.background),
    tabIndicator: contrast(metrics.indicator, metrics.styles.tab.background),
    badges: rosterVisual.badges.map((badge) => contrast(badge.color, badge.background)),
  };
  for (const key of ['rosterText', 'registerText', 'tabText']) assert(contrastRatios[key] >= 4.5, `${key} contrast ${contrastRatios[key]}`);
  assert(contrastRatios.focusRing >= 3, `focus ring contrast ${contrastRatios.focusRing}`);
  assert(contrastRatios.tabIndicator >= 3, `tab indicator contrast ${contrastRatios.tabIndicator}`);
  contrastRatios.badges.forEach((value, index) => assert(value >= 4.5, `badge ${index} contrast ${value}`));
  return { metrics, focus, tabFocus, typography: { title: rosterVisual.title, caption: rosterVisual.caption }, registrationGeometry: rosterVisual.registration, hover: { registration: { before: registerBeforeHover, after: registerAfterHover }, tab: { before: tabBeforeHover, after: tabAfterHover }, action: { before: beforeHover, after: afterHover } }, contrastRatios, callbackIds, compositionSequence, compositionCallbacks: 0, registration: { count: 1, exactRawValues: true, passwordSerialized: false }, keyboard: { tabToPassword: true, tabToRegister: true, shiftTabReturn: true, tabActivation: true, copiedSelectedReadonlyText: copiedText === selectedText.text }, pasteStyleInput: true, autofillStyleDomInput: true };
}

const emptyCopy = {
  open: '현재 자유 가입 모드라 승인 대기가 발생하지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
  approval: '아직 들어온 가입 신청이 없습니다.',
  'invite-only': '현재 슈퍼유저 직접 등록 모드라 가입 신청을 받지 않습니다. 가입 모드는 인스턴스 설정에서 볼 수 있습니다.',
  unknown: '승인 대기 중인 계정이 없습니다.',
};

async function assertEmptyModes(page, theme) {
  const result = {};
  for (const [mode, text] of Object.entries(emptyCopy)) {
    const supplied = { signupMode: mode === 'unknown' ? 'future' : mode };
    let dialog = await openSettings(page, 'superuser', theme, supplied);
    await dialog.getByRole('tab', { name: '가입 승인' }).click();
    let approval = dialog.locator('[data-principal-panel="approval"]');
    assert.equal(await approval.getByRole('tab', { name: '대기 중 (4)' }).count(), 1, `${mode} erased supplied pending rows`);
    assert.equal(await approval.getByRole('button', { name: /Pending User.* 승인/ }).count(), 1, `${mode} disabled supplied pending action`);
    dialog = await openSettings(page, 'superuser', theme, { ...supplied, empty: true });
    await dialog.getByRole('tab', { name: '가입 승인' }).click();
    approval = dialog.locator('[data-principal-panel="approval"]');
    assert.equal(await approval.getByRole('note', { name: '빈 상태 안내' }).textContent(), text);
    await approval.getByRole('tab', { name: '거절됨 (0)' }).click();
    assert.equal(await approval.getByRole('note', { name: '빈 상태 안내' }).textContent(), '거절된 계정이 없습니다.');
    result[mode] = true;
  }
  return result;
}

async function assertMissingRegistration(page, theme) {
  const dialog = await openSettings(page, 'superuser', theme, { noRegister: true });
  await dialog.getByRole('tab', { name: '사용자 관리' }).click();
  const roster = dialog.locator('[data-principal-panel="roster"]');
  await roster.getByLabel('새 사용자 이름').fill('값이 있어도');
  await roster.getByLabel('임시 비밀번호').fill(runtimePassword(4));
  assert.equal(await roster.getByRole('button', { name: '등록' }).isDisabled(), true);
  assert.equal(await roster.getByText('등록 기능을 사용할 수 없습니다.').count(), 1);
  return { disabled: true, explanation: true };
}

async function exerciseEnvironment(page, metadata) {
  const gates = [];
  for (const role of ['ordinary', 'workspace-manager', 'superuser']) gates.push(await assertRoleGates(page, role, metadata.theme));
  const principal = await inspectSuperuser(page, metadata.theme, metadata.identity);
  const missingRegistration = await assertMissingRegistration(page, metadata.theme);
  const emptyModes = await assertEmptyModes(page, metadata.theme);
  return { ...metadata, gates, principal, missingRegistration, emptyModes };
}

async function regularMatrix() {
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const [width, height] of viewports) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      try {
        const page = await context.newPage();
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
        await mountFixture(page, theme);
        rows.push(await exerciseEnvironment(page, { width, height, theme, zoom: 100, identity: `${theme}-${width}x${height}-100`, owner: 'fresh Playwright isolated context' }));
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return rows;
}

async function persistenceCycle(page, theme, viewport, setZoom, getZoom) {
  let dialog = await openSettings(page, 'superuser', theme);
  await dialog.getByRole('tab', { name: '사용자 관리' }).click();
  const roster = dialog.locator('[data-principal-panel="roster"]');
  const name = roster.getByLabel('새 사용자 이름');
  const password = roster.getByLabel('임시 비밀번호');
  await name.fill('크기 변경에도 유지되는 이름');
  const persistencePassword = runtimePassword(5);
  await password.fill(persistencePassword);
  await name.focus();
  const assertRosterState = async (label) => {
    assert.equal(await dialog.getByRole('tab', { name: '사용자 관리' }).getAttribute('data-state'), 'active', `${label} category state`);
    assert.equal(await name.inputValue(), '크기 변경에도 유지되는 이름', `${label} name value`);
    assert.equal(await password.inputValue(), persistencePassword, `${label} password value`);
    assert.equal(await name.evaluate((node) => node === document.activeElement), true, `${label} input focus`);
  };
  await page.setViewportSize({ width: viewport.width - 96, height: viewport.height - 48 });
  await assertRosterState('viewport resize');
  await page.setViewportSize(viewport);
  await assertRosterState('viewport restore');
  await setZoom(2); await page.waitForTimeout(100); assert.equal(await getZoom(), 2); await assertRosterState('zoom 200');
  await setZoom(1); await page.waitForTimeout(100); assert.equal(await getZoom(), 1); await assertRosterState('zoom reset');

  await dialog.getByRole('tab', { name: '가입 승인' }).click();
  const approval = dialog.locator('[data-principal-panel="approval"]');
  const rejected = approval.getByRole('tab', { name: '거절됨 (4)' });
  await rejected.focus(); await rejected.press('Enter');
  const assertApprovalState = async (label) => {
    assert.equal(await dialog.getByRole('tab', { name: '가입 승인' }).getAttribute('data-state'), 'active', `${label} approval category`);
    assert.equal(await rejected.getAttribute('data-state'), 'active', `${label} selected approval tab`);
    assert.equal(await rejected.evaluate((node) => node === document.activeElement), true, `${label} tab focus`);
  };
  await page.setViewportSize({ width: viewport.width - 96, height: viewport.height - 48 });
  await assertApprovalState('approval viewport resize');
  await page.setViewportSize(viewport);
  await assertApprovalState('approval viewport restore');
  await setZoom(2); await page.waitForTimeout(100); assert.equal(await getZoom(), 2); await assertApprovalState('approval zoom 200');
  await setZoom(1); await page.waitForTimeout(100); assert.equal(await getZoom(), 1); await assertApprovalState('approval zoom reset');
  return { noReload: true, viewportResize: true, roster: { category: true, values: true, focus: true }, approval: { category: true, selectedTab: true, focus: true }, zoomReads: [2, 1, 2, 1], passwordSerialized: false };
}

async function zoomMatrix() {
  const rows = [];
  for (const [width, height] of viewports) for (const theme of ['light', 'dark']) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue67-'));
    let context;
    try {
      const extension = extensionAt(temp);
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0];
      const page = context.pages()[0] ?? await context.newPage();
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin });
      await mountFixture(page, theme);
      const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('fixture tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
      const getZoom = () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('fixture tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
      await setZoom(1); assert.equal(await getZoom(), 1);
      const before = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const persistence = await persistenceCycle(page, theme, { width, height }, setZoom, getZoom);
      await setZoom(2); await page.waitForTimeout(100);
      const independentlyReadZoom = await getZoom(); assert.equal(independentlyReadZoom, 2);
      const row = await exerciseEnvironment(page, { width, height, theme, zoom: 200, identity: `${theme}-${width}x${height}-200`, owner: 'fresh Playwright persistent Chromium with disposable profile and extension' });
      await setZoom(1); const independentlyReadResetZoom = await getZoom(); assert.equal(independentlyReadResetZoom, 1);
      rows.push({ ...row, before, persistence, independentlyReadZoom, independentlyReadResetZoom, zoomCalls: { setter: [1, 2, 1], readOnlyGetZoom: [1, 2, 1] } });
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return rows;
}

async function forcedColors(zoom) {
  if (zoom === 100) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active' });
    try { const page = await context.newPage(); await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin }); await mountFixture(page, 'light'); const result = await exerciseEnvironment(page, { width: 1280, height: 720, theme: 'light', zoom, identity: 'forced-100', owner: 'fresh Playwright forced-colors context' }); assert.equal(result.principal.metrics.forcedColors, true); return result; }
    finally { await context.close(); await browser.close(); }
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue67-forced-'));
  let context;
  try {
    const extension = extensionAt(temp);
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, forcedColors: 'active', args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage(); await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseUrl).origin }); await mountFixture(page, 'light');
    const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
    const getZoom = () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); return chrome.tabs.getZoom(tab.id); }, page.url());
    await setZoom(2); const independentlyReadZoom = await getZoom(); assert.equal(independentlyReadZoom, 2);
    const result = await exerciseEnvironment(page, { width: 1280, height: 720, theme: 'light', zoom, identity: 'forced-200', owner: 'fresh Playwright forced-colors persistent profile' });
    assert.equal(result.principal.metrics.forcedColors, true);
    await setZoom(1); const independentlyReadResetZoom = await getZoom(); assert.equal(independentlyReadResetZoom, 1);
    return { ...result, independentlyReadZoom, independentlyReadResetZoom };
  } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
}

(async () => {
  try {
    await startServer();
    await waitServer();
    const regular = await regularMatrix();
    const zoomed = await zoomMatrix();
    const forced = { at100: await forcedColors(100), at200: await forcedColors(200) };
    fs.writeFileSync(path.join(output, 'browser.json'), JSON.stringify({
      claim: 'production AppShell/settings role fixture and production UserRoster/SignupApproval component bundle; not login/API integration evidence',
      environments: regular.length + zoomed.length,
      regular, zoomed, forcedColors: forced,
      limitations: ['native Windows IME candidate UI untested', 'password-manager/autofill native UI untested', 'synthetic composition and DOM input only', 'query/loading/error/Promise outcomes owned by #80 IR-PRINCIPAL-002'],
      rawPasswordsSerialized: false,
    }, null, 2));
    console.log(`PASS issue67 production AppShell role gates and principal components (${regular.length + zoomed.length} environments; forced colors 100/200)`);
  } finally {
    await viteServer?.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
