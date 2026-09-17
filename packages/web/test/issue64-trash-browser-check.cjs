const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue64');
const stage = path.join(output, `.browser-stage-${process.pid}-${Date.now()}`);
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3429/test/issue64-trash-fixture.html';
const quickViewport = process.env.ISSUE64_ZOOM_WIDTH === '1440' ? [1440, 900] : process.env.ISSUE64_ZOOM_WIDTH === '1920' ? [1920, 1080] : [1280, 720];
const viewports = process.env.ISSUE64_ZOOM_ONLY ? [quickViewport] : [[1280, 720], [1440, 900], [1920, 1080]];
const themes = process.env.ISSUE64_ZOOM_ONLY ? ['light'] : ['light', 'dark'];
fs.mkdirSync(stage, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3429', '--strictPort'], {
  cwd: webRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
server.stdout.resume(); server.stderr.resume();
const exited = new Promise((resolve) => server.once('exit', resolve));
async function waitServer() {
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error(`owned Vite exited ${server.exitCode}`);
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('owned Vite did not start');
}

const lum = (value) => {
  const parts = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map((part) => {
    const x = part / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
  });
  return .2126 * parts[0] + .7152 * parts[1] + .0722 * parts[2];
};
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);

async function focusAudit(locator, label) {
  const intended = await locator.evaluate((node) => ({ tag: node.tagName, aria: node.getAttribute('aria-label'), nodeId: node.dataset.trashNodeId }));
  await locator.scrollIntoViewIfNeeded(); await locator.focus(); await locator.page().waitForTimeout(30);
  const result = await locator.page().evaluate((wanted) => {
    const node = document.activeElement;
    const style = getComputedStyle(node); const rect = node.getBoundingClientRect();
    let bg = style.backgroundColor; let parent = node.parentElement;
    while ((bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') && parent) { bg = getComputedStyle(parent).backgroundColor; parent = parent.parentElement; }
    return { active: node.tagName === wanted.tag && (wanted.aria === null || node.getAttribute('aria-label') === wanted.aria) && (wanted.nodeId === undefined || node.dataset.trashNodeId === wanted.nodeId), width: Number.parseFloat(style.outlineWidth), offset: Number.parseFloat(style.outlineOffset), color: style.outlineColor, bg, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight } };
  }, intended);
  assert(result.active, `${label}: focus`); assert(result.width >= 2, `${label}: outline ${result.width}`); assert(result.offset >= 2, `${label}: gap ${result.offset}`);
  assert(contrast(result.color, result.bg) >= 3, `${label}: contrast`);
  assert(result.rect.width > 0 && result.rect.height >= 36, `${label}: target`);
  assert(result.rect.left >= 0 && result.rect.top >= 0 && result.rect.right <= result.viewport.width && result.rect.bottom <= result.viewport.height, `${label}: bounds ${JSON.stringify(result.rect)} viewport ${JSON.stringify(result.viewport)}`);
  return result;
}

async function openTrash(page, theme) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.locator('[data-settings-dialog]');
  await dialog.getByRole('tab', { name: '휴지통' }).click();
  return { dialog, panel: dialog.locator('[data-panel="trash"]') };
}

async function visibleAnchor(panel) {
  return panel.evaluate((node) => {
    const viewport = node.querySelector('[data-trash-results]').getBoundingClientRect();
    const visibleTop = Math.max(viewport.top, node.querySelector('thead').getBoundingClientRect().bottom);
    const rows = [...node.querySelectorAll('tbody tr[aria-rowindex]')].filter((row) => row.getBoundingClientRect().top >= visibleTop && row.getBoundingClientRect().top < viewport.bottom);
    const first = rows[0];
    return { nodeId: first.querySelector('[data-trash-node-id]').dataset.trashNodeId, offset: first.getBoundingClientRect().top - visibleTop, rendered: rows.length };
  });
}

async function inViewportRestore(panel) {
  await panel.locator('[data-trash-results]').scrollIntoViewIfNeeded();
  const nodeId = await panel.evaluate((node) => {
    const viewport = node.querySelector('[data-trash-results]').getBoundingClientRect();
    const button = [...node.querySelectorAll('[data-trash-action="restore"]')].find((candidate) => {
      const rect = candidate.getBoundingClientRect(); return rect.top >= Math.max(0, viewport.top) && rect.bottom <= Math.min(innerHeight, viewport.bottom);
    });
    return button.dataset.trashNodeId;
  });
  return panel.locator(`[data-trash-action="restore"][data-trash-node-id="${nodeId}"]`);
}

async function mountedZoomTransition(page, theme, setZoom) {
  assert.equal(await setZoom(1), 1);
  const { panel } = await openTrash(page, theme); const results = panel.locator('[data-trash-results]'); await results.waitFor();
  await results.evaluate((node) => { node.scrollTop = Math.floor(node.scrollHeight * .55); node.dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(100);
  await page.emulateMedia({ forcedColors: 'active' });
  const forced100 = await focusAudit(await inViewportRestore(panel), 'forced 100 restore');
  await page.screenshot({ path: path.join(stage, 'trash-forced-colors-100.png') });
  await page.emulateMedia({ forcedColors: 'none' });
  const at100 = await visibleAnchor(panel);
  assert.equal(await setZoom(2), 2); await page.waitForTimeout(500);
  const at200 = await visibleAnchor(panel);
  assert.equal(at200.nodeId, at100.nodeId, 'mounted zoom preserves anchor identity');
  assert(Math.abs(at200.offset - at100.offset) <= 12, 'mounted zoom preserves relative anchor');
  await page.emulateMedia({ forcedColors: 'active' });
  const forced200 = await focusAudit(await inViewportRestore(panel), 'forced 200 restore');
  await page.screenshot({ path: path.join(stage, 'trash-forced-colors-200.png') });
  await page.emulateMedia({ forcedColors: 'none' });
  assert.equal(await setZoom(1), 1); await page.waitForTimeout(500);
  const reset = await visibleAnchor(panel);
  assert.equal(reset.nodeId, at100.nodeId, 'zoom reset preserves anchor identity');
  return { transitions: [1, 2, 1], at100, at200, reset, forced100, forced200, finalZoom: 1 };
}

async function exercise(page, theme, screenshot, environment) {
  console.log(`checking ${theme} ${environment.requestedViewport.width}x${environment.requestedViewport.height} at ${environment.zoom}x`);
  let { dialog, panel } = await openTrash(page, theme);
  let result = panel.locator('[data-trash-results]');
  await result.waitFor();
  const baseline = await panel.evaluate((node) => {
    const rows = [...node.querySelectorAll('tbody tr:not([aria-hidden="true"])')];
    const first = rows[0]; const firstCell = first.querySelector('td');
    const rect = (element) => element.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      columns: [...node.querySelectorAll('th')].map((one) => one.textContent),
      renderedRows: rows.length,
      logicalRows: Number(node.querySelector('table').getAttribute('aria-rowcount')),
      totalSize: Number(node.querySelector('[data-testid="trash-virtual-spacer"]').dataset.totalSize),
      firstHeight: rect(first).height,
      wraps: rect(firstCell).height > 40,
      scrollOverflow: getComputedStyle(node.querySelector('[data-trash-results]')).overflow,
      tableRight: rect(node.querySelector('table')).right,
      resultsRight: rect(node.querySelector('[data-trash-results]')).right,
      textColor: getComputedStyle(firstCell).color,
      textBackground: getComputedStyle(firstCell).backgroundColor,
      noPurgeForSecond: !rows.find((row) => row.textContent.includes('휴지통 항목-1.md'))?.querySelector('[aria-label$="영구 삭제"]'),
    };
  });
  assert.deepEqual(baseline.columns, ['경로', '워크스페이스', '삭제자', '삭제 시각', '조작']);
  assert(baseline.renderedRows < 80); assert.equal(baseline.logicalRows, 1001); assert(baseline.totalSize >= 40000);
  assert(baseline.firstHeight >= 40); assert(baseline.wraps); assert(['auto', 'scroll'].includes(baseline.scrollOverflow));
  assert(contrast(baseline.textColor, baseline.textBackground) >= 4.5); assert(baseline.noPurgeForSecond);

  const select = panel.getByLabel('워크스페이스 필터');
  const filterFocus = await focusAudit(select, 'filter');
  await select.press('End'); assert.equal(await select.inputValue(), 'ws-2');
  const toggle = panel.getByRole('button', { name: '전체 보기' });
  await toggle.press('Enter');
  assert.equal(await select.inputValue(), 'ws-2');
  await panel.getByText('현재 범위: 전체').waitFor();

  await page.evaluate(() => window.__issue64SetQuery('loading'));
  await panel.getByText('휴지통을 불러오는 중입니다.').waitFor();
  assert.equal(await panel.getByText('표시할 휴지통 항목이 없습니다.').count(), 0);
  await page.evaluate(() => window.__issue64SetQuery('error'));
  await panel.getByText('휴지통을 불러오지 못했습니다.').waitFor();
  assert.equal(await panel.locator('tbody tr:not([aria-hidden="true"])').count(), 0);
  await panel.getByRole('button', { name: '다시 불러오기' }).click();
  await result.waitFor();

  await result.evaluate((node) => { node.scrollTop = Math.floor(node.scrollHeight / 2); node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);
  const middle = await panel.evaluate((node) => ({ count: node.querySelectorAll('tbody tr:not([aria-hidden="true"])').length, indices: [...node.querySelectorAll('tbody tr[aria-rowindex]')].map((row) => Number(row.getAttribute('aria-rowindex'))) }));
  assert(middle.count < 80); assert(Math.max(...middle.indices) > 100);
  const forwardBoundary = await panel.evaluate((node) => {
    const rows = [...node.querySelectorAll('tbody tr[aria-rowindex]')];
    const row = rows.at(-1); const button = row.querySelector('[data-trash-actions] button:last-of-type');
    button.focus();
    return { nodeId: button.dataset.trashNodeId, index: Number(row.dataset.index) };
  });
  await page.keyboard.press('Tab'); await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.trashNodeId), `trash-${forwardBoundary.index + 1}`);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.trashAction), 'restore');
  const pinnedNode = await page.evaluate(() => document.activeElement?.dataset.trashNodeId);
  await result.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(80);
  assert.equal(await panel.locator(`[data-trash-node-id="${pinnedNode}"]`).count() > 0, true, 'focused virtual row stays mounted');
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.trashNodeId), forwardBoundary.nodeId);
  await result.evaluate((node) => { node.scrollTop = node.scrollHeight; node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);
  const last = await panel.evaluate((node) => Math.max(...[...node.querySelectorAll('tbody tr[aria-rowindex]')].map((row) => Number(row.getAttribute('aria-rowindex')))));
  assert(last >= 990, `last logical row ${last}`);
  await result.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);

  await result.evaluate((node) => { node.scrollTop = Math.floor(node.scrollHeight * .55); node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);
  const anchorBeforeResize = await panel.evaluate((node) => {
    const viewport = node.querySelector('[data-trash-results]').getBoundingClientRect();
    const visibleTop = Math.max(viewport.top, node.querySelector('thead').getBoundingClientRect().bottom);
    const rows = [...node.querySelectorAll('tbody tr[aria-rowindex]')].filter((row) => row.getBoundingClientRect().top >= visibleTop);
    const first = rows[0];
    return { nodeId: first.querySelector('[data-trash-node-id]').dataset.trashNodeId, offset: first.getBoundingClientRect().top - visibleTop };
  });
  await result.dispatchEvent('scroll');

  for (const width of [899, 900, 901]) {
    const requested = environment.requestedViewport;
    await page.setViewportSize({ width, height: Math.min(requested.height, 720) });
    await page.waitForTimeout(800);
    const geometry = await panel.evaluate((node) => {
      const dialog = node.closest('[data-settings-dialog]').getBoundingClientRect();
      const list = node.querySelector('[data-trash-results]').getBoundingClientRect();
      const rows = [...node.querySelectorAll('tbody tr[aria-rowindex]')].filter((row) => row.getBoundingClientRect().bottom > list.top && row.getBoundingClientRect().top < list.bottom);
      const visibleTop = Math.max(list.top, node.querySelector('thead').getBoundingClientRect().bottom);
      const first = rows.find((row) => row.getBoundingClientRect().top >= visibleTop) ?? rows[0];
      const gaps = rows.slice(1).map((row, index) => row.getBoundingClientRect().top - rows[index].getBoundingClientRect().bottom);
      return { dialog: { left: dialog.left, right: dialog.right }, list: { left: list.left, right: list.right }, count: node.querySelectorAll('tbody tr:not([aria-hidden="true"])').length, anchor: { nodeId: first.querySelector('[data-trash-node-id]').dataset.trashNodeId, offset: first.getBoundingClientRect().top - visibleTop }, maxGap: Math.max(0, ...gaps.map(Math.abs)) };
    });
    assert(geometry.list.left >= geometry.dialog.left && geometry.list.right <= geometry.dialog.right + 1); assert(geometry.count < 80);
    assert.equal(geometry.anchor.nodeId, anchorBeforeResize.nodeId, `resize ${width} anchor identity`);
    assert(Math.abs(geometry.anchor.offset - anchorBeforeResize.offset) <= 8, `resize ${width} anchor offset ${geometry.anchor.offset} vs ${anchorBeforeResize.offset}`);
    assert(geometry.maxGap <= 1, `resize ${width} row gap/overlap ${geometry.maxGap}`);
  }
  await page.setViewportSize(environment.requestedViewport);
  await page.waitForTimeout(50);
  await result.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);

  const restore = panel.getByRole('button', { name: /아주 긴 한글 원본 경로.* 복구/ });
  const restoreFocus = await focusAudit(restore, 'restore');
  await page.keyboard.press('Enter');
  await panel.getByText('복구 중…').waitFor();
  await panel.getByText('항목을 복구하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.').waitFor();
  await restore.press('Enter');
  await panel.locator(':scope > p[role="status"]').filter({ hasText: '항목을 복구했습니다.' }).waitFor();
  const restoreRequests = await page.evaluate(() => window.__issue64Counts.restore);
  assert.equal(restoreRequests, 2);
  assert.deepEqual(await page.evaluate(() => window.__issue64LastAction), { kind: 'restore', nodeId: 'trash-0' });
  ({ dialog, panel } = await openTrash(page, theme));
  result = panel.locator('[data-trash-results]');
  await result.waitFor();
  await result.evaluate((node) => { node.scrollTop = 0; node.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(80);

  const purgeTarget = await panel.evaluate((node) => {
    const button = node.querySelector('[data-trash-actions] button:nth-child(2)');
    button.focus();
    return button.getAttribute('aria-label');
  });
  assert(purgeTarget && purgeTarget.endsWith('영구 삭제'));
  const purgeFocus = await focusAudit(page.locator(':focus'), 'purge');
  await page.keyboard.press('Enter');
  let gate = page.getByRole('alertdialog');
  assert.equal(await gate.getAttribute('data-grade'), 'L2');
  const cancel = gate.getByRole('button', { name: '취소' });
  const l2Focus = await focusAudit(cancel, 'L2 cancel');
  if (environment.zoom === 1 && environment.requestedViewport.width === 1280) await page.keyboard.press('Escape');
  else await page.keyboard.press('Enter');
  await gate.waitFor({ state: 'detached' });
  await page.waitForFunction((label) => document.activeElement?.getAttribute('aria-label') === label, purgeTarget);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), purgeTarget);
  await page.keyboard.press('Enter'); gate = page.getByRole('alertdialog');
  await page.mouse.click(2, 2); assert.equal(await gate.count(), 1);
  await cancel.click(); await gate.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => window.__issue64Counts.purge), 0);

  await panel.evaluate((node) => node.querySelector('[data-trash-actions] button:nth-child(2)').focus());
  await page.keyboard.press('Enter'); gate = page.getByRole('alertdialog');
  await page.keyboard.press('Tab');
  const affirmative = gate.getByRole('button', { name: '영구 삭제' });
  assert(await affirmative.evaluate((node) => document.activeElement === node));
  await page.keyboard.press('Enter');
  await panel.getByText('영구 삭제 중…').waitFor();
  await panel.getByText('항목을 영구 삭제하지 못했습니다. 목록을 확인한 뒤 다시 시도하십시오.').waitFor();
  await panel.evaluate((node) => node.querySelector('[data-trash-actions] button:nth-child(2)').focus());
  await page.keyboard.press('Enter'); gate = page.getByRole('alertdialog');
  await gate.getByRole('button', { name: '영구 삭제' }).click();
  await panel.locator(':scope > p[role="status"]').filter({ hasText: '항목을 영구 삭제했습니다.' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-trash-node-id') === 'trash-1');
  assert.deepEqual(await page.evaluate(() => ({
    nodeId: document.activeElement?.getAttribute('data-trash-node-id'),
    action: document.activeElement?.getAttribute('data-trash-action'),
  })), { nodeId: 'trash-1', action: 'restore' });
  assert.equal(await page.evaluate(() => window.__issue64Counts.purge), 2);
  assert.equal((await page.evaluate(() => window.__issue64LastAction)).nodeId, purgeTarget.match(/(?:^|\/)(?:휴지통-)?(\d+)\.md/)?.[1] ? `trash-${purgeTarget.match(/(\d+)\.md/)?.[1]}` : 'trash-0');
  assert.equal(await page.locator('[data-panel="trash"] input').count(), 0);
  assert.equal(await page.getByRole('button', { name: /휴지통 항목-1.md 영구 삭제/ }).count(), 0);

  await page.screenshot({ path: screenshot });
  return { environment, baseline, purgeTarget, stages: { filterFocus, restoreFocus, purgeFocus, l2Focus, queryLoadingErrorRetry: true, nativeSelectKeys: true, lensPreserved: true, bounded1000: true, middleLastReached: true, runtimeResize899900901: true, restoreFailureRetry: true, l2EscapeOutsideCancelNoDelete: true, purgeFailureRetry: true, purgeSuccessFocus: true }, requestCounts: { restore: restoreRequests, purge: await page.evaluate(() => window.__issue64Counts.purge) } };
}

function extensionAt(dir) {
  const extension = path.join(dir, 'extension'); fs.mkdirSync(extension, { recursive: true });
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue64 isolated zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});\n');
  return extension;
}

async function normalMatrix() {
  const browser = await chromium.launch({ headless: true }); const rows = [];
  try {
    for (const theme of themes) for (const [width, height] of viewports) {
      const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme });
      try {
        const page = await context.newPage();
        rows.push(await exercise(page, theme, path.join(stage, `trash-${theme}-${width}x${height}-100.png`), { owner: 'fresh Playwright isolated Chromium', theme, zoom: 1, requestedViewport: { width, height }, preZoomViewport: { width, height, dpr: 1 }, postZoomViewport: { width, height, dpr: 1 } }));
        if (theme === 'light' && width === 1280) {
          await page.emulateMedia({ forcedColors: 'active' });
          await focusAudit(page.locator('[data-panel="trash"] [data-trash-action="restore"]').first(), 'forced colors 100 action');
          await page.screenshot({ path: path.join(stage, 'trash-forced-colors-100.png') }); await page.emulateMedia({ forcedColors: 'none' });
        }
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  return rows;
}

async function zoomMatrix() {
  const rows = [];
  for (const theme of themes) for (const [width, height] of viewports) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue64-zoom-')); const extension = extensionAt(temp); let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, colorScheme: theme, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
      const worker = context.serviceWorkers()[0]; const page = context.pages()[0] || await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      const preZoomViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const setZoom = (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); await chrome.tabs.setZoom(tab.id, value); return chrome.tabs.getZoom(tab.id); }, { target: url, value });
      const mountedTransition = theme === 'light' && width === 1280 ? await mountedZoomTransition(page, theme, setZoom) : null;
      assert.equal(await setZoom(2), 2); await page.waitForTimeout(150);
      const postZoomViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      assert(postZoomViewport.width < preZoomViewport.width && postZoomViewport.height < preZoomViewport.height);
      rows.push(await exercise(page, theme, path.join(stage, `trash-${theme}-${width}x${height}-200.png`), { owner: 'fresh Playwright persistent isolated Chromium', theme, zoom: 2, requestedViewport: { width, height }, preZoomViewport, postZoomViewport, transitions: mountedTransition?.transitions ?? [], mountedTransition }));
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return rows;
}

(async () => {
  try {
    await waitServer();
    const matrix = process.env.ISSUE64_ZOOM_ONLY ? await zoomMatrix() : [...await normalMatrix(), ...await zoomMatrix()];
    assert.equal(matrix.length, process.env.ISSUE64_ZOOM_ONLY ? 1 : 12);
    const evidence = { environments: matrix.length, forcedColors: { at100: true, at200: true }, matrix, ownedServerPid: server.pid, browserOwnership: 'fresh Playwright-owned isolated Chromium contexts; persistent disposable profiles for zoom' };
    fs.writeFileSync(path.join(stage, 'browser-matrix.json'), JSON.stringify(evidence, null, 2));
    const final = path.join(output, 'browser-matrix'); fs.rmSync(final, { recursive: true, force: true }); fs.renameSync(stage, final);
    console.log(`PASS ${matrix.length} environments plus forced colors at 100%/200%; 1000-row bounded virtualization, query/mutation/L2/lens/keyboard/resize exercised`);
  } finally {
    if (server.exitCode === null) { server.kill(); await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]); }
  }
})().catch((error) => { fs.rmSync(stage, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
