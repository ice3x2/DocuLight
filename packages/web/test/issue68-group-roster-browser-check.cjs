const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');

const webRoot = path.resolve(__dirname, '..');
const root = path.resolve(webRoot, '../..');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue68');
const screenshots = path.join(evidence, 'screenshots');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const nonce = randomUUID();
const viewports = [[1280, 720], [1440, 900], [1920, 1080]];
let server;
let baseUrl;
fs.rmSync(screenshots, { recursive: true, force: true });
fs.mkdirSync(screenshots, { recursive: true });

async function startServer() {
  const { createServer } = await import('vite');
  server = await createServer({ root: webRoot, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address === 'object');
  baseUrl = `http://127.0.0.1:${address.port}/test/issue68-group-roster-fixture.html?nonce=${encodeURIComponent(nonce)}`;
}

function extensionAt(temp) {
  const extension = path.join(temp, 'extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 68 zoom verifier', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

async function installSearchFixture(page) {
  const attempts = new Map();
  page.__issue68SearchRequests = [];
  await page.route('**/api/principals**', async (route) => {
    const requestUrl = route.request().url();
    page.__issue68SearchRequests.push(requestUrl);
    const query = new URL(requestUrl).searchParams.get('q') ?? '';
    const attempt = (attempts.get(requestUrl) ?? 0) + 1;
    attempts.set(requestUrl, attempt);
    if (query.includes('오류') && attempt === 1) return route.fulfill({ status: 503, body: 'unavailable' });
    if (query.includes('로딩')) await new Promise((resolve) => setTimeout(resolve, 350));
    const body = query.includes('없음') ? [] : [
      { id: 'user-target', name: '같은 이름 후보', kind: 'user', status: 'active' },
      { id: 'group-decoy', name: '같은 이름 후보', kind: 'group', status: 'active' },
      ...Array.from({ length: 24 }, (_, index) => ({ id: `candidate-${index}`, name: `후보 ${index}`, kind: 'user', status: index % 3 === 0 ? 'pending' : 'active' })),
    ];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mount(page, theme) {
  await installSearchFixture(page);
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('[data-issue68-component-bundle]').getAttribute('data-run-nonce'), nonce);
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
}

async function openRole(page, role, theme) {
  await page.evaluate((value) => window.__issue68Configure({ role: value, empty: false, noCallbacks: false }), role);
  await page.locator(`[data-issue68-component-bundle][data-role="${role}"]`).waitFor();
  await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
  await page.getByRole('button', { name: '설정' }).click();
  return page.getByRole('dialog', { name: '설정' });
}

async function assertRoleGates(page, theme) {
  const result = {};
  for (const role of ['ordinary', 'workspace-manager', 'superuser']) {
    const dialog = await openRole(page, role, theme);
    const category = dialog.getByRole('tab', { name: '그룹 관리' });
    const expected = role === 'superuser' ? 1 : 0;
    assert.equal(await category.count(), expected, `${role} group category gate`);
    if (!expected) {
      assert.equal(await dialog.getByText('그룹 관리', { exact: true }).count(), 0, `${role} group category DOM`);
      assert.equal((await dialog.getByRole('tab').allTextContents()).includes('그룹 관리'), false, `${role} accessible tabs`);
      assert.equal(await dialog.locator('[data-group-roster]').count(), 0, `${role} roster DOM`);
    }
    result[role] = expected;
    await page.keyboard.press('Escape');
  }
  return result;
}

function channels(value) {
  const found = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  assert.equal(found?.length, 3, `unsupported color ${value}`);
  return found;
}

function contrast(a, b) {
  const luminance = (value) => channels(value).map((channel) => {
    const n = channel / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function inspect(page, identity, theme, detailed) {
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '그룹 관리' }).click();
  const roster = dialog.locator('[data-group-roster]');
  await roster.waitFor({ timeout: 5_000 });
  const table = roster.getByRole('table', { name: '그룹 관리' });
  assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['이름', '멤버', '멤버 추가', '삭제']);
  const rows = table.locator('tbody tr');
  assert.deepEqual((await rows.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-group-id')))).slice(0, 2), ['system-superusers', 'ordinary-design']);
  assert.equal(await roster.getByText('시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다.').count(), 1);
  assert.equal(await roster.getByText('시스템 그룹의 멤버십은 해당 관리 규칙을 따릅니다.').count(), 1);
  assert.equal(await roster.getByRole('button', { name: /시스템.* 삭제/ }).count(), 0);
  const remove = roster.getByRole('button', { name: '제품 경험 설계 및 장기 문서 검토 그룹 삭제' });
  assert.equal(await remove.isDisabled(), true);
  await remove.evaluate((node) => { node.click(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  assert.deepEqual(await page.evaluate(() => window.__issue68.removed), []);
  await table.locator('caption').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(screenshots, `${identity}-default.png`) });
  const metrics = await roster.evaluate((node) => {
    const caption = node.querySelector('caption'); const header = node.querySelector('th'); const cell = node.querySelector('td'); const help = node.querySelector('[data-group-help]');
    const type = (target) => { const style = getComputedStyle(target); return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight, color: style.color, background: style.backgroundColor }; };
    const rect = node.getBoundingClientRect(); const dialogRect = node.closest('[role="dialog"]').getBoundingClientRect();
    const remove = node.querySelector('[data-group-delete] button'); const explanation = remove.nextElementSibling;
    return { caption: type(caption), header: type(header), cell: type(cell), help: type(help), rect: rect.toJSON(), dialog: dialogRect.toJSON(), removeHeight: remove.getBoundingClientRect().height, explanationOutsideButton: !remove.contains(explanation), horizontalViewportOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, forcedColors: matchMedia('(forced-colors: active)').matches, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } };
  });
  assert.deepEqual([metrics.caption.fontSize, metrics.caption.lineHeight, metrics.caption.fontWeight], ['18px', '26px', '600']);
  assert.deepEqual([metrics.header.fontSize, metrics.header.lineHeight, metrics.header.fontWeight], ['13px', '20px', '600']);
  assert.deepEqual([metrics.cell.fontSize, metrics.cell.lineHeight], ['14px', '22px']);
  assert.deepEqual([metrics.help.fontSize, metrics.help.lineHeight], ['12px', '18px']);
  assert(/sans/i.test(metrics.caption.fontFamily));
  assert.equal(metrics.horizontalViewportOverflow, false);
  assert(metrics.rect.right <= metrics.dialog.right + 1, 'roster widened settings dialog');
  assert(metrics.removeHeight >= 36, `disabled control below 36px: ${metrics.removeHeight}`);
  assert.equal(metrics.explanationOutsideButton, true, 'disabled explanation depends on the button');
  const last = rows.last();
  await last.scrollIntoViewIfNeeded();
  assert.equal(await last.isVisible(), true, 'last group row unreachable');
  await rows.first().scrollIntoViewIfNeeded();
  assert.equal(await rows.first().isVisible(), true, 'first group row unreachable');
  const scroll = roster.locator('[data-group-table-scroll]');
  const horizontal = await scroll.evaluate((node) => { node.scrollLeft = node.scrollWidth; return { left: node.scrollLeft, max: node.scrollWidth - node.clientWidth }; });
  if (horizontal.max > 0) assert(Math.abs(horizontal.left - horizontal.max) <= 1, `horizontal end not reached: ${JSON.stringify(horizontal)}`);
  else assert.equal(horizontal.left, 0, 'non-overflowing table acquired a scroll offset');
  const rightmost = roster.getByText('시스템 그룹은 삭제하거나 이름을 바꿀 수 없습니다.');
  await rightmost.scrollIntoViewIfNeeded();
  const rightmostBounds = await rightmost.evaluate((node) => { const rect = node.getBoundingClientRect(); const clip = node.closest('[data-group-table-scroll]').getBoundingClientRect(); return { rect: rect.toJSON(), clip: clip.toJSON() }; });
  assert(rightmostBounds.rect.left >= rightmostBounds.clip.left && rightmostBounds.rect.right <= rightmostBounds.clip.right + 1, 'rightmost delete explanation clipped horizontally');
  assert(rightmostBounds.rect.top >= 0 && rightmostBounds.rect.bottom <= metrics.viewport.height, 'rightmost delete explanation clipped vertically');
  await page.screenshot({ path: path.join(screenshots, `${identity}-horizontal-end.png`) });
  await scroll.evaluate((node) => { node.scrollLeft = 0; });

  let interactions = { detailed: false };
  if (detailed) {
    const input = roster.getByLabel('사용자·그룹 검색').first();
    await input.fill('로딩');
    await roster.getByRole('status').waitFor();
    await roster.getByText('후보 0').waitFor();
    await input.fill('없음'); await roster.getByText('검색 결과가 없습니다.').waitFor();
    await input.fill('오류'); await roster.getByRole('alert').waitFor();
    await roster.getByRole('button', { name: '검색 다시 시도' }).click();
    await roster.getByText('후보 0').waitFor();
    const retryUrls = page.__issue68SearchRequests.filter((url) => new URL(url).searchParams.get('q') === '오류');
    assert.equal(retryUrls.length, 2, 'error retry did not issue a second read');
    assert(retryUrls.every((url) => new URL(url).searchParams.get('for') === 'group:system-superusers'), 'retry lost exact group scope');
    await input.fill('후보');
    const items = roster.locator('[cmdk-item]'); await items.first().waitFor();
    assert.equal(await items.count(), 20, 'shared picker result cap');
    await input.press('ArrowDown');
    assert.equal(await items.nth(1).getAttribute('aria-selected'), 'true');
    await input.press('End');
    assert.equal(await items.last().getAttribute('aria-selected'), 'true');
    await input.press('Home');
    assert.equal(await items.first().getAttribute('aria-selected'), 'true');
    const middleBefore = await items.nth(10).evaluate((node) => ({ rect: node.getBoundingClientRect().toJSON(), background: getComputedStyle(node).backgroundColor }));
    await items.nth(10).hover();
    const middleAfter = await items.nth(10).evaluate((node) => ({ rect: node.getBoundingClientRect().toJSON(), background: getComputedStyle(node).backgroundColor }));
    assert.equal(middleAfter.rect.width, middleBefore.rect.width, 'hover changed middle option width');
    assert.equal(middleAfter.rect.height, middleBefore.rect.height, 'hover changed middle option height');
    assert(middleAfter.rect.top >= 0 && middleAfter.rect.bottom <= metrics.viewport.height, 'hovered middle option is clipped');
    assert.notEqual(middleAfter.background, middleBefore.background, 'hovered middle option has no appearance change');
    await input.press('Home');
    assert.equal(await items.first().getAttribute('aria-selected'), 'true');
    await input.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.__issue68.added), [['system-superusers', 'user-target']]);
    await input.fill('후보'); await roster.getByText('같은 이름 후보', { exact: true }).last().click();
    assert.deepEqual(await page.evaluate(() => window.__issue68.added), [['system-superusers', 'user-target']]);
    await roster.getByText('그룹은 멤버로 추가할 수 없습니다.').waitFor();
    const beforeComposition = await page.evaluate(() => window.__issue68.added.length);
    await input.evaluate((node) => {
      node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '한' }));
      node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '한글' }));
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, isComposing: true }));
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '한글' }));
    });
    assert.equal(await page.evaluate(() => window.__issue68.added.length), beforeComposition, 'composition Enter dispatched add');
    await input.focus();
    const focus = await input.evaluate((node) => { const style = getComputedStyle(node); const rect = node.getBoundingClientRect(); const clip = node.closest('[data-group-table-scroll]').getBoundingClientRect(); return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor, background: style.backgroundColor, border: style.borderColor, rect: rect.toJSON(), clip: clip.toJSON() }; });
    assert.equal(focus.width, '2px'); assert.equal(focus.offset, '2px');
    assert(focus.rect.left >= focus.clip.left + 3 && focus.rect.right <= focus.clip.right - 3, 'focus ring clipped horizontally');
    assert(focus.rect.top >= focus.clip.top + 3 && focus.rect.bottom <= focus.clip.bottom - 3, 'focus ring clipped vertically');
    if (!metrics.forcedColors) {
      assert(contrast(focus.color, focus.background) >= 3, 'focus contrast');
      assert(contrast(focus.border, focus.background) >= 3, 'input boundary contrast');
    }
    const hoverBefore = await input.evaluate((node) => getComputedStyle(node).borderColor);
    await input.hover(); const hoverAfter = await input.evaluate((node) => getComputedStyle(node).borderColor);
    assert.notEqual(hoverAfter, hoverBefore, 'input hover has no computed distinction');
    await input.focus(); await page.keyboard.press('Tab');
    assert.equal(await input.evaluate((node) => node === document.activeElement), false, 'Tab did not leave picker input');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await input.evaluate((node) => node === document.activeElement), true, 'Shift+Tab did not return to picker input');
    const member = roster.getByRole('listitem').first();
    const selected = await member.evaluate((node) => { const selection = getSelection(); const range = document.createRange(); range.selectNodeContents(node); selection.removeAllRanges(); selection.addRange(range); return { text: selection.toString(), userSelect: getComputedStyle(node).userSelect }; });
    assert(selected.text.includes('구성원 1')); assert.notEqual(selected.userSelect, 'none');
    await page.keyboard.press('Control+C');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), selected.text);
    const colors = await roster.evaluate((node) => { const cell = node.querySelector('td'); const style = getComputedStyle(cell); const surface = getComputedStyle(node.closest('[role="dialog"]')).backgroundColor; return { text: style.color, surface }; });
    assert(contrast(colors.text, colors.surface) >= 4.5, 'body text contrast');
    const lastInput = roster.getByLabel('사용자·그룹 검색').last(); await lastInput.fill('마지막');
    await roster.getByText('후보 0').last().waitFor();
    assert(page.__issue68SearchRequests.some((url) => new URL(url).searchParams.get('for') === 'group:group-12'), 'last group search scope absent');
    await page.evaluate(() => window.__issue68Configure({ role: 'superuser', empty: true, noCallbacks: false }));
    await page.getByRole('button', { name: '설정' }).click(); await page.getByRole('dialog').getByRole('tab', { name: '그룹 관리' }).click();
    await page.getByText('표시할 그룹 항목이 없습니다.').waitFor();
    await page.evaluate(() => window.__issue68Configure({ role: 'superuser', empty: false, noCallbacks: true }));
    await page.getByRole('button', { name: '설정' }).click(); await page.getByRole('dialog').getByRole('tab', { name: '그룹 관리' }).click();
    await page.getByText('멤버 추가 기능을 사용할 수 없습니다.').first().waitFor();
    assert.equal(await page.getByRole('dialog').getByLabel('사용자·그룹 검색').count(), 0, 'missing callback still renders picker');
    interactions = { detailed: true, default: true, hover: { before: hoverBefore, after: hoverAfter, middleBefore, middleAfter }, focus, tabAndShiftTab: true, loading: true, emptySearch: true, emptyGroups: true, missingCallbacks: true, errorRetry: { requests: 2, exactScope: 'group:system-superusers' }, selected: { arrowDown: true, end: true, home: true }, firstAndLastGroupScope: true, userCallback: ['system-superusers', 'user-target'], groupCallbackBlocked: true, compositionEnterBlocked: true, clipboard: true };
  }
  return { identity, theme, metrics, interactions, deletionCallbackCount: 0 };
}

async function regularMatrix() {
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  try {
    for (const theme of ['light', 'dark']) for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, permissions: ['clipboard-read', 'clipboard-write'] });
      try {
        const page = await context.newPage(); await mount(page, theme);
        const gates = await assertRoleGates(page, theme);
        const dialog = await openRole(page, 'superuser', theme);
        await dialog.waitFor();
        rows.push({ width, height, zoom: 100, gates, ...(await inspect(page, `${theme}-${width}x${height}-100`, theme, width === 1280) ) });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return rows;
}

async function zoomMatrix(forcedColors = 'none') {
  const rows = [];
  const sets = forcedColors === 'active' ? [['forced', 1280, 720]] : ['light', 'dark'].flatMap((theme) => viewports.map(([width, height]) => [theme, width, height]));
  for (const [theme, width, height] of sets) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue68-'));
    let context;
    try {
      const extension = extensionAt(temp);
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme === 'forced' ? 'light' : theme, forcedColors, permissions: ['clipboard-read', 'clipboard-write'], args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage(); await mount(page, theme === 'forced' ? 'light' : theme);
      const gates = await assertRoleGates(page, theme === 'forced' ? 'light' : theme);
      const dialog = await openRole(page, 'superuser', theme === 'forced' ? 'light' : theme); await dialog.getByRole('tab', { name: '그룹 관리' }).click();
      const input = dialog.getByLabel('사용자·그룹 검색').first(); await input.fill('후보'); await dialog.getByText('후보 0').waitFor(); await input.focus();
      const targetId = await input.evaluate((node) => node.closest('tr').getAttribute('data-group-id'));
      await page.setViewportSize({ width: width - 1, height: height - 1 }); await page.setViewportSize({ width, height });
      const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((item) => item.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
      const getZoom = () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((item) => item.url === target); if (!tab || tab.id === undefined) throw new Error('fixture tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
      await setZoom(1); const initialZoom = await getZoom(); assert.equal(initialZoom, 1);
      const beforeZoom = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, selectedId: document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute('data-value'), callbacks: { added: window.__issue68.added.length, removed: window.__issue68.removed.length } }));
      assert.equal(beforeZoom.selectedId, 'user-target');
      await setZoom(2); const zoom = await getZoom(); assert.equal(zoom, 2); await page.waitForTimeout(120);
      const preservedAt200 = await page.evaluate(() => ({ category: document.querySelector('[role="dialog"] [role="tab"][aria-selected="true"]')?.textContent, query: document.querySelector('[aria-label="사용자·그룹 검색"]')?.value, focused: document.activeElement?.getAttribute('aria-label'), target: document.activeElement?.closest('tr')?.getAttribute('data-group-id'), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, selectedId: document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute('data-value'), callbacks: { added: window.__issue68.added.length, removed: window.__issue68.removed.length } }));
      assert.deepEqual({ category: preservedAt200.category, query: preservedAt200.query, focused: preservedAt200.focused, target: preservedAt200.target, selectedId: preservedAt200.selectedId, callbacks: preservedAt200.callbacks }, { category: '그룹 관리', query: '후보', focused: '사용자·그룹 검색', target: targetId, selectedId: 'user-target', callbacks: beforeZoom.callbacks });
      const zoomFocus = await input.evaluate((node) => { const rect = node.getBoundingClientRect(); const clipNode = node.closest('[data-group-table-scroll]'); const clip = clipNode.getBoundingClientRect(); return { rect: rect.toJSON(), clip: clip.toJSON(), scrollLeft: clipNode.scrollLeft, max: clipNode.scrollWidth - clipNode.clientWidth, tabIndex: clipNode.getAttribute('tabindex') }; });
      assert(zoomFocus.rect.left >= zoomFocus.clip.left + 3 && zoomFocus.rect.right <= zoomFocus.clip.right - 3 && zoomFocus.rect.top >= zoomFocus.clip.top + 3 && zoomFocus.rect.bottom <= zoomFocus.clip.bottom - 3, `200% focus ring clipped: ${JSON.stringify(zoomFocus)}`);
      const overflow = dialog.locator('[data-group-table-scroll]');
      if (zoomFocus.max > 0) {
        assert.equal(zoomFocus.tabIndex, '0', 'overflowing table is not keyboard reachable');
        await overflow.focus();
        for (let step = 0; step < 12; step += 1) await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(120);
        assert(await overflow.evaluate((node) => node.scrollLeft > 0), 'ArrowRight did not move horizontal overflow');
        await page.keyboard.press('Tab'); assert.equal(await input.evaluate((node) => node === document.activeElement), true, 'Tab did not reach picker from overflow container');
        await page.keyboard.press('Shift+Tab'); assert.equal(await overflow.evaluate((node) => node === document.activeElement), true, 'Shift+Tab did not return to overflow container');
        await input.focus();
      } else {
        assert.equal(zoomFocus.tabIndex, null, 'non-overflowing table added a keyboard stop');
        await page.keyboard.press('Tab'); assert.equal(await input.evaluate((node) => node === document.activeElement), false);
        await page.keyboard.press('Shift+Tab'); assert.equal(await input.evaluate((node) => node === document.activeElement), true);
      }
      const inspected = await inspect(page, `${theme}-${width}x${height}-200`, theme, false);
      await input.focus(); await setZoom(1); const reset = await getZoom(); assert.equal(reset, 1);
      const preservedAt100 = await page.evaluate(() => ({ category: document.querySelector('[role="dialog"] [role="tab"][aria-selected="true"]')?.textContent, query: document.querySelector('[aria-label="사용자·그룹 검색"]')?.value, focused: document.activeElement?.getAttribute('aria-label'), target: document.activeElement?.closest('tr')?.getAttribute('data-group-id'), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, selectedId: document.querySelector('[cmdk-item][aria-selected="true"]')?.getAttribute('data-value'), callbacks: { added: window.__issue68.added.length, removed: window.__issue68.removed.length } }));
      assert.deepEqual({ category: preservedAt100.category, query: preservedAt100.query, focused: preservedAt100.focused, target: preservedAt100.target, selectedId: preservedAt100.selectedId, callbacks: preservedAt100.callbacks }, { category: '그룹 관리', query: '후보', focused: '사용자·그룹 검색', target: targetId, selectedId: 'user-target', callbacks: beforeZoom.callbacks });
      rows.push({ width, height, zoom: 200, gates, initialZoom, independentlyReadZoom: zoom, independentlyReadResetZoom: reset, sameMountResize: true, beforeZoom, preservedAt200, preservedAt100, ...inspected });
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return rows;
}

async function forced100() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, forcedColors: 'active', permissions: ['clipboard-read', 'clipboard-write'] });
  try { const page = await context.newPage(); await mount(page, 'light'); const gates = await assertRoleGates(page, 'light'); await openRole(page, 'superuser', 'light'); const row = await inspect(page, 'forced-1280x720-100', 'forced', true); assert.equal(row.metrics.forcedColors, true); return { ...row, gates }; }
  finally { await context.close(); await browser.close(); }
}

(async () => {
  try {
    await startServer();
    const regular = await regularMatrix(); const zoomed = await zoomMatrix(); const forcedAt100 = await forced100(); const forcedAt200 = (await zoomMatrix('active'))[0];
    assert.equal(regular.length + zoomed.length, 12);
    assert.equal(forcedAt200.metrics.forcedColors, true);
    fs.writeFileSync(path.join(evidence, 'browser.json'), JSON.stringify({ timestamp: new Date().toISOString(), harness: 'actual production AppShell/settings trigger and GroupRoster component bundle; simulated principal read responses; no backend mutation/query integration claim', environments: 12, regular, zoomed, forcedColors: { at100: forcedAt100, at200: forcedAt200 }, limitations: { nativeWindowsImeCandidateUi: 'nonblocking untested', passwordManagerAutofillUi: 'nonblocking untested', osNativeInput: 'not used' } }, null, 2));
    process.stdout.write('PASS issue68 GroupRoster: 12 environments + forced colors 100/200\n');
  } finally { await server?.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
