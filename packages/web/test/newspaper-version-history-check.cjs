const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const out = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue56');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3423/test/newspaper-version-history-fixture.html';
fs.mkdirSync(out, { recursive: true });
const server = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3423', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const waitServer = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw Error('server timeout'); };
const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value) => { const channels = rgb(value).map((one) => { const normalized = one / 255; return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4; }); return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722; };
const contrast = (a, b) => { const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (lighter + 0.05) / (darker + 0.05); };

async function openHistory(page, target = url) {
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '긴 문서 이름.md 문서 메뉴' }).click();
  await page.getByRole('menuitem', { name: '버전 기록' }).click();
  await page.locator('[data-version-history]').waitFor();
}

async function inspect(page, theme, label) {
  await openHistory(page);
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  const shellBefore = await page.locator('[data-shell="root"]').evaluate((shell) => [...shell.children].slice(0, 3).map((one) => one.getBoundingClientRect().width));
  const list = page.locator('[data-version-list]');
  const listMetrics = await list.evaluate((element) => { const box = element.getBoundingClientRect(); return { height: box.height, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY }; });
  assert.equal(listMetrics.overflowY, 'auto');
  assert(listMetrics.height <= Math.min(240, page.viewportSize().height * 0.3) + 1);
  assert(listMetrics.scrollHeight > listMetrics.clientHeight);
  const compareButton = page.getByRole('button', { name: '26판 비교' });
  await page.locator('[data-version-row]').first().hover();
  const hoverStyle = await page.locator('[data-version-row]').first().evaluate((row) => { const probe = document.createElement('span'); probe.style.backgroundColor = 'var(--surface-control)'; document.body.append(probe); const expected = getComputedStyle(probe).backgroundColor; probe.remove(); return { actual: getComputedStyle(row).backgroundColor, expected }; });
  assert.equal(hoverStyle.actual, hoverStyle.expected);
  const rowMetrics = await page.locator('[data-version-row]').first().evaluate((row) => {
    const actions = [...row.querySelectorAll('button')]; const style = getComputedStyle(row); const marker = getComputedStyle(row, '::before'); const box = row.getBoundingClientRect(); const meta = row.querySelector('[data-version-meta]').getBoundingClientRect(); const actionBox = row.querySelector('[data-version-actions]').getBoundingClientRect();
    return { width: box.width, height: box.height, metaBottom: meta.bottom, actionsTop: actionBox.top, actionHeights: actions.map((one) => one.getBoundingClientRect().height), variants: actions.map((one) => one.dataset.variant), background: getComputedStyle(row.closest('[data-version-history]')).backgroundColor, textColor: getComputedStyle(row.querySelector('strong')).color, markerWidth: marker.width, markerBackground: marker.backgroundColor };
  });
  assert(rowMetrics.height >= 56); assert(rowMetrics.actionHeights.every((height) => height >= 36)); assert.deepEqual(rowMetrics.variants, ['secondary', 'ghost']);
  assert(contrast(rowMetrics.textColor, rowMetrics.background) >= 4.5);
  await compareButton.focus();
  const focusStyle = await compareButton.evaluate((element) => { const style = getComputedStyle(element); return { outlineStyle: style.outlineStyle, outlineColor: style.outlineColor, surrounding: getComputedStyle(element.closest('[data-version-history]')).backgroundColor }; });
  assert.equal(focusStyle.outlineStyle, 'solid'); assert(contrast(focusStyle.outlineColor, focusStyle.surrounding) >= 3);
  const focusExtent = await compareButton.evaluate((element) => { const box = element.getBoundingClientRect(); const list = element.closest('[data-version-list]').getBoundingClientRect(); const style = getComputedStyle(element); const extent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset); return { inside: box.left - extent >= list.left && box.right + extent <= list.right && box.top - extent >= list.top && box.bottom + extent <= list.bottom, extent }; }); assert(focusExtent.inside);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '26판 복원');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '26판 비교');
  await compareButton.press('Space');
  const merge = page.getByRole('region', { name: '버전 비교' });
  await merge.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), '26판 비교');
  const paneMetrics = await merge.evaluate((element) => {
    const viewport = element.querySelector('[data-merge-viewport]');
    const panes = [...element.querySelectorAll('.cm-mergeViewEditor')].map((one) => one.getBoundingClientRect().width);
    const editable = [...element.querySelectorAll('[contenteditable]')].map((one) => one.getAttribute('contenteditable'));
    return { panes, editable, clientWidth: viewport.clientWidth, scrollWidth: viewport.scrollWidth, overflowX: getComputedStyle(viewport).overflowX };
  });
  assert.deepEqual(paneMetrics.editable, ['false', 'false']);
  assert(paneMetrics.panes.every((width) => width >= 240));
  assert.equal(paneMetrics.overflowX, 'auto');
  assert(paneMetrics.scrollWidth >= 480);
  const cssViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  const listWidth = await list.evaluate((element) => element.clientWidth);
  assert(rowMetrics.width <= listWidth + 1);
  if (cssViewport.width < 1080) assert(rowMetrics.actionsTop >= rowMetrics.metaBottom - 1);
  if (cssViewport.width < 1080) {
    assert(paneMetrics.scrollWidth > paneMetrics.clientWidth);
  }
  const shellAfter = await page.locator('[data-shell="root"]').evaluate((shell) => [...shell.children].slice(0, 3).map((one) => one.getBoundingClientRect().width));
  assert.deepEqual(shellAfter, shellBefore);
  assert.equal(await merge.getByLabel('보관된 26판 전체 원문').count(), 1);
  assert.equal(await merge.getByLabel('현재 본문 전체 원문').count(), 1);
  const hiddenSources = await merge.locator('.dl-visually-hidden-source').evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return { width: box.width, height: box.height, pointerEvents: getComputedStyle(element).pointerEvents }; }));
  assert(hiddenSources.every((one) => one.width <= 1 && one.height <= 1 && one.pointerEvents === 'none'));
  const selected = await page.locator('[data-version-row][data-selected="true"]').evaluate((row) => { const marker = getComputedStyle(row, '::before'); return { markerWidth: marker.width, markerBackground: marker.backgroundColor, background: getComputedStyle(row).backgroundColor }; });
  assert.equal(selected.markerWidth, '2px'); assert.notEqual(selected.markerBackground, selected.background);
  const footer = page.locator('[data-version-restore-footer]');
  assert(await footer.getByText('현재 본문을 26판으로 바꿉니다.').isVisible());
  assert.equal(await footer.getByRole('button', { name: '이 버전으로 복원' }).getAttribute('data-variant'), 'primary');
  const primaryColors = await footer.getByRole('button', { name: '이 버전으로 복원' }).evaluate((element) => { const style = getComputedStyle(element); return { color: style.color, background: style.backgroundColor }; }); assert(contrast(primaryColors.color, primaryColors.background) >= 4.5);
  const traversal = { lastRow: false, viewport: false, leftPane: false, rightPane: false, footer: false };
  for (let index = 0; index < 80 && !traversal.footer; index += 1) {
    await page.keyboard.press('Tab');
    const active = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), viewport: document.activeElement?.hasAttribute('data-merge-viewport'), pane: document.activeElement?.getAttribute('data-merge-pane'), footer: document.activeElement?.closest('[data-version-restore-footer]') !== null }));
    if (active.text === '1판 복원') traversal.lastRow = true;
    if (active.viewport) { traversal.viewport = true; if (cssViewport.width < 1080) { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); } }
    if (active.pane === 'left') traversal.leftPane = true;
    if (active.pane === 'right') traversal.rightPane = true;
    if (active.footer) traversal.footer = true;
  }
  assert.deepEqual(traversal, { lastRow: true, viewport: true, leftPane: true, rightPane: true, footer: true });
  if (cssViewport.width < 1080) await page.waitForFunction(() => document.querySelector('[data-merge-viewport]')?.scrollLeft > 0);
  await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-merge-pane')), 'right'); await page.keyboard.press('Tab');
  await list.evaluate((element) => { element.scrollTop = 0; });
  await page.locator('[data-version-history]').screenshot({ path: path.join(out, `green-version-${label}-${theme}.png`) });
  await footer.getByRole('button', { name: '이 버전으로 복원' }).press('Enter');
  await page.waitForFunction(() => document.body.dataset.persistedSeq === '26');
  assert.equal(await page.locator('[data-version-history]').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '긴 문서 이름.md 문서 메뉴');
  return { listMetrics, rowMetrics, hoverStyle, focusStyle, focusExtent, primaryColors, paneMetrics, hiddenSources, selected, shellBefore, shellAfter, cssViewport };
}

async function regular(browser) {
  const results = [];
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height } }); const page = await context.newPage();
    results.push({ theme, width, height, zoom: 1, measurements: await inspect(page, theme, `${width}x${height}-100`) }); await context.close();
  }
  return results;
}

async function zoomed() {
  const results = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'version-zoom-')); const extension = path.join(temp, 'ext'); fs.mkdirSync(extension);
    fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'sw.js' } })); fs.writeFileSync(path.join(extension, 'sw.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
    let context;
    try {
      context = await chromium.launchPersistentContext(path.join(temp, 'profile'), { headless: false, viewport: { width, height }, args: [`--window-size=${width},${height}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker'); const worker = context.serviceWorkers()[0]; const page = context.pages()[0] || await context.newPage(); await page.goto(url, { waitUntil: 'networkidle' });
      const zoom = await worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); await chrome.tabs.setZoom(tab.id, 2); return chrome.tabs.getZoom(tab.id); }, url); assert.equal(zoom, 2);
      for (const theme of ['light', 'dark']) results.push({ theme, width, height, zoom, measurements: await inspect(page, theme, `${width}x${height}-200`) });
    } finally { await context?.close(); fs.rmSync(temp, { recursive: true, force: true }); }
  }
  return results;
}

async function states(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } }); const page = await context.newPage();
  await openHistory(page, `${url}?state=list-error`); const listRetry = page.getByRole('alert', { name: '버전 기록 오류' }).getByRole('button', { name: '다시 시도' }); await listRetry.press('Enter'); await page.locator('[data-version-list]').waitFor();
  await openHistory(page, `${url}?state=empty`); assert(await page.getByText('보관된 버전이 없습니다.').isVisible());
  await openHistory(page, `${url}?state=compare-error`); await page.getByRole('button', { name: '26판 비교' }).click(); const compareRetry = page.getByRole('alert', { name: '버전 비교 오류' }).getByRole('button', { name: '다시 시도' }); await compareRetry.press('Enter'); await page.getByRole('region', { name: '버전 비교' }).waitFor();
  await openHistory(page, `${url}?state=restore-pending`); await page.getByRole('button', { name: '26판 복원' }).click(); const pending = page.getByRole('button', { name: /복원 중/ }).first(); await pending.waitFor(); assert.equal(await pending.isDisabled(), true); assert.equal(await pending.getAttribute('aria-busy'), 'true');
  await openHistory(page, `${url}?state=restore-error`); await page.getByRole('button', { name: '26판 복원' }).click(); const restoreRetry = page.getByRole('alert').getByRole('button', { name: '다시 시도' }); await restoreRetry.waitFor(); assert.equal(await page.locator('[data-version-history]').count(), 1); assert(await page.evaluate(() => document.activeElement?.closest('[data-version-history]') !== null)); await restoreRetry.press('Enter'); await page.waitForFunction(() => document.body.dataset.persistedSeq === '26'); assert.equal(await page.locator('[data-version-history]').count(), 0);
  const shapeBodies = { empty: ['', ''], equal: ['# 같은 본문', '# 같은 본문'], insertion: ['', '# 새로 추가된 본문'], deletion: ['# 삭제될 본문', ''] };
  for (const shape of Object.keys(shapeBodies)) {
    await openHistory(page, `${url}?shape=${shape}`);
    await page.getByRole('button', { name: '26판 비교' }).click();
    const region = page.getByRole('region', { name: '버전 비교' });
    await region.waitFor();
    assert.equal(await region.locator('.cm-mergeViewEditor').count(), 2);
    const [expectedLeft, expectedRight] = shapeBodies[shape];
    assert.equal(await region.getByLabel('보관된 26판 전체 원문').textContent(), expectedLeft);
    assert.equal(await region.getByLabel('현재 본문 전체 원문').textContent(), expectedRight);
    const cues = await region.evaluate((element) => {
      const changed = [...element.querySelectorAll('.cm-changedLine')];
      const left = [...element.querySelectorAll('.cm-merge-a .dl-diff-cue')].map((cue) => ({ text: cue.textContent, label: cue.getAttribute('aria-label'), role: cue.getAttribute('role') }));
      const right = [...element.querySelectorAll('.cm-merge-b .dl-diff-cue')].map((cue) => ({ text: cue.textContent, label: cue.getAttribute('aria-label'), role: cue.getAttribute('role') }));
      return {
        inserted: element.querySelectorAll('.cm-insertedLine').length,
        deleted: element.querySelectorAll('.cm-deletedLine').length,
        chunks: changed.length,
        left,
        right,
        placed: changed.every((line) => {
          const box = line.getBoundingClientRect();
          const editor = line.closest('.cm-editor').getBoundingClientRect();
          return box.left >= editor.left && box.right <= editor.right && box.top >= editor.top && box.bottom <= editor.bottom;
        }),
      };
    });
    assert(cues.placed);
    if (shape === 'empty' || shape === 'equal') {
      assert.equal(cues.chunks, 0);
      assert.deepEqual(cues.left, []);
      assert.deepEqual(cues.right, []);
    }
    if (shape === 'insertion') {
      assert(cues.inserted > 0);
      assert.equal(cues.deleted, 0);
      assert.deepEqual(cues.left, []);
      assert.deepEqual(cues.right, [{ text: '+ 추가', label: '+ 추가', role: 'note' }]);
    }
    if (shape === 'deletion') {
      assert(cues.deleted > 0);
      assert.equal(cues.inserted, 0);
      assert.deepEqual(cues.left, [{ text: '− 삭제', label: '− 삭제', role: 'note' }]);
      assert.deepEqual(cues.right, []);
    }
    await region.screenshot({ path: path.join(out, `green-version-shape-${shape}.png`) });
  }
  await page.goto(`${url}?conflict=1`, { waitUntil: 'networkidle' }); const conflict = page.getByRole('region', { name: '충돌 병합' }); const draft = conflict.locator('.cm-merge-b .cm-content'); await draft.click(); await draft.press('End'); await draft.pressSequentially(' 수정'); assert((await conflict.getByLabel('오른쪽', { exact: true }).textContent()).endsWith(' 수정')); assert.equal(await draft.getAttribute('contenteditable'), 'true');
  await context.close();
}

(async () => { const child = server(); let browser; try { await waitServer(); browser = await chromium.launch({ headless: true }); const regularResults = await regular(browser); await states(browser); await browser.close(); browser = undefined; const zoomResults = await zoomed(); fs.writeFileSync(path.join(out, 'green-version-measurements.json'), JSON.stringify({ regular: regularResults, zoom: zoomResults }, null, 2)); console.log('PASS newspaper version history 12-environment checks'); } finally { await browser?.close(); child.kill(); } })().catch((error) => { console.error(error); process.exitCode = 1; });
