const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const output = process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR ?? path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue51');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3418/test/newspaper-tree-fixture.html';
fs.mkdirSync(output, { recursive: true });
const sourceFiles = [
  'packages/web/src/tree/DocumentTree.tsx',
  'packages/web/test/newspaper-tree-fixture.tsx',
  'packages/web/test/newspaper-tree-layout-check.cjs',
  'package-lock.json',
];
const sourceIdentity = {
  revision: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
  files: Object.fromEntries(sourceFiles.map((file) => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])),
};
sourceIdentity.aggregateSha256 = createHash('sha256').update(JSON.stringify(sourceIdentity)).digest('hex');
const start = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3418', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: ['ignore','pipe','pipe'], windowsHide: true });
const wait = async () => { for(let i=0;i<80;i++){ try { if((await fetch(url)).ok)return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw new Error('server timeout'); };
async function visibleTreeRow(page, index) {
  let row = page.getByRole('treeitem').nth(index);
  await row.waitFor({ state: 'attached' });
  if (!(await row.isVisible())) await row.scrollIntoViewIfNeeded();
  await page.waitForFunction(async (at) => {
    const findVisible = () => {
      const current = document.querySelectorAll('[role="treeitem"]')[at];
      if (!(current instanceof HTMLElement) || !current.isConnected) return null;
      const box = current.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(current).visibility !== 'hidden' ? current : null;
    };
    const current = findVisible();
    if (current === null) return false;
    await new Promise(requestAnimationFrame);
    return findVisible() === current;
  }, index);
  row = page.getByRole('treeitem').nth(index);
  await row.waitFor({ state: 'visible' });
  return row;
}
async function inspect(page) {
  const tree = page.getByRole('tree', { name: '문서 트리' });
  const rows = tree.getByRole('treeitem');
  const first = rows.first();
  const rowBox = await first.boundingBox();
  assert(rowBox && Math.abs(rowBox.height - 40) <= 1, `tree row height ${rowBox?.height}`);
  assert.equal(await tree.getAttribute('data-row-height'), '40');
  const toolbar = page.getByRole('button', { name: '새 노트' });
  assert.equal(await toolbar.getAttribute('data-variant'), 'primary');
  const long = page.getByRole('treeitem', { name: /아주긴한글이름/ });
  const editableColor = await long.locator('[data-tree-row]').evaluate(e => getComputedStyle(e).color);
  const readonlyColor = await page.getByRole('treeitem', { name: /읽기 전용 문서/ }).locator('[data-tree-row]').evaluate(e => getComputedStyle(e).color);
  assert.notEqual(readonlyColor, editableColor, 'readonly row is not visually distinct from editable rows');
  assert.equal(await long.locator('[title]').count(), 0);
  await long.hover();
  assert(await long.locator('[data-tree-name-description]').isVisible(), 'long-name description is not visible on hover');
  await long.focus();
  assert(await long.locator('[data-tree-name-description]').isVisible(), 'long-name description is not visible on focus');
  await page.getByRole('treeitem', { name: /읽기 전용 문서/ }).click({ button: 'right' });
  const menu = page.getByRole('menu');
  const mb = await menu.boundingBox();
  assert(mb && Math.abs(mb.width - 240) <= 1, `menu width ${mb?.width}`);
  assert((await menu.evaluate(e=>getComputedStyle(e).overflowY)) === 'auto', 'menu is not internally scrollable');
  const del = menu.getByRole('menuitem', { name: '삭제' });
  assert.equal(await del.getAttribute('aria-disabled'), 'true');
  const beforeKeyboard = await page.evaluate(() => document.activeElement?.textContent);
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement?.textContent), beforeKeyboard, 'menu keyboard navigation did not move');
  await page.keyboard.press('Escape');
  const upload = page.getByRole('treeitem', { name: /업로드 디렉토리/ });
  await upload.dispatchEvent('dragenter', { dataTransfer: await page.evaluateHandle(() => { const d=new DataTransfer(); d.items.add(new File(['x'],'x.pdf')); return d; }) });
  assert.equal(await upload.getAttribute('data-upload-drop'), 'active');
  await upload.dispatchEvent('dragleave');
  assert.equal(await upload.getAttribute('data-upload-drop'), null);
  await long.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '이름 변경' }).click();
  const input = page.getByRole('textbox', { name: /새 이름/ });
  assert((await input.getAttribute('aria-describedby'))?.length, 'inline naming input has no help description');
  await input.fill('조합 뒤 확정.md');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-renamed'), null, 'composition Enter confirmed the name');
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-renamed'), '조합 뒤 확정.md');
  return page.evaluate(() => ({ viewport:{width:innerWidth,height:innerHeight}, tree:document.querySelector('[aria-label="문서 트리"]')?.getBoundingClientRect().toJSON() }));
}
async function matrix(browser){ const out=[]; for(const theme of ['light','dark']) for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) { const c=await browser.newContext({viewport:{width,height}}); const p=await c.newPage(); await p.goto(url,{waitUntil:'networkidle'}); await p.evaluate(t=>document.documentElement.dataset.theme=t,theme); out.push({theme,...await inspect(p)}); await p.getByRole('textbox').waitFor({state:'detached'}); await p.getByRole('tree').focus(); await (await visibleTreeRow(p,2)).click(); await (await visibleTreeRow(p,1)).focus(); await p.screenshot({path:path.join(output,`green-tree-selected-focus-${theme}-${width}x${height}.png`),fullPage:true}); await p.getByRole('tab',{name:'즐겨찾기'}).click(); await p.screenshot({path:path.join(output,`green-favorites-rows-${theme}-${width}x${height}.png`),fullPage:true}); let removes=p.getByRole('button',{name:/즐겨찾기 해제/}); await removes.first().click(); await p.waitForTimeout(160); removes=p.getByRole('button',{name:/즐겨찾기 해제/}); assert.equal(await removes.first().evaluate(e=>e===document.activeElement),true,'delayed removal did not focus the next remove control'); await removes.first().click(); await p.waitForTimeout(160); assert.equal(await p.getByRole('tab',{name:'즐겨찾기'}).evaluate(e=>e===document.activeElement),true,'delayed final removal did not focus Favorites tab'); assert.notEqual(await p.evaluate(()=>document.activeElement?.tagName),'BODY'); assert.equal(await p.getByText('즐겨찾기한 항목이 없습니다.').count(),1); await p.screenshot({path:path.join(output,`green-favorites-empty-${theme}-${width}x${height}.png`),fullPage:true}); await c.close(); } return out; }
async function stateEvidence(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  for (const state of ['tree-loading', 'tree-error']) {
    await page.goto(`${url}?state=${state}`, { waitUntil: 'networkidle' });
    if (state === 'tree-loading') assert(await page.getByRole('status', { name: '문서 트리 불러오는 중' }).isVisible());
    else {
      const alert = page.getByRole('alert', { name: '문서 트리 오류' });
      assert(await alert.isVisible());
      await alert.getByRole('button', { name: '다시 시도' }).click();
      assert.equal(await page.locator('body').getAttribute('data-retried'), 'tree');
    }
    await page.screenshot({ path: path.join(output, `green-state-${state}.png`), fullPage: true });
  }
  for (const state of ['favorites-loading', 'favorites-error']) {
    await page.goto(`${url}?state=${state}`, { waitUntil: 'networkidle' });
    await page.getByRole('tab', { name: '즐겨찾기' }).click();
    if (state === 'favorites-loading') assert(await page.getByRole('status', { name: '즐겨찾기 불러오는 중' }).isVisible());
    else {
      const alert = page.getByRole('alert', { name: '즐겨찾기 오류' });
      assert(await alert.isVisible());
      await alert.getByRole('button', { name: '다시 시도' }).click();
      assert.equal(await page.locator('body').getAttribute('data-retried'), 'favorites');
    }
    await page.screenshot({ path: path.join(output, `green-state-${state}.png`), fullPage: true });
  }
  await page.goto(`${url}?state=naming-error`, { waitUntil: 'networkidle' });
  const row = await visibleTreeRow(page, 2);
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '이름 변경' }).click();
  let input = page.getByRole('textbox', { name: /새 이름/ });
  await input.fill('거절될이름.md');
  await input.press('Enter');
  input = page.getByRole('textbox', { name: /새 이름/ });
  assert.equal(await input.getAttribute('aria-invalid'), 'true');
  assert(await page.getByRole('alert').filter({ hasText: '같은 위치에서 사용할 수 없는 이름입니다.' }).isVisible());
  await page.screenshot({ path: path.join(output, 'green-state-naming-error.png'), fullPage: true });
  await context.close();
}
async function largeTreeEvidence(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.goto(`${url}?state=large-workspaces`, { waitUntil: 'networkidle' });
  const tree = page.getByRole('tree', { name: '문서 트리' });
  await tree.waitFor();
  const renderedAtTop = await tree.getByRole('treeitem').count();
  assert(renderedAtTop < 100, `large tree rendered ${renderedAtTop}/1000 rows at the top instead of a bounded virtual window`);
  await tree.focus();
  await page.keyboard.press('End');
  const last = page.locator('[data-tree-row][data-node-id="large-workspace-999"]');
  await last.waitFor({ state: 'visible' });
  assert.equal(await last.evaluate((node) => node.closest('[role="treeitem"]') === document.activeElement), true, 'End did not reveal and focus the final virtual row');
  const renderedAtEnd = await tree.getByRole('treeitem').count();
  assert(renderedAtEnd < 100, `large tree rendered ${renderedAtEnd}/1000 rows at the end instead of a bounded virtual window`);
  const topLevel = { total: 1_000, renderedAtTop, renderedAtEnd };

  await page.goto(`${url}?state=large-descendants`, { waitUntil: 'networkidle' });
  const descendantTree = page.getByRole('tree', { name: '문서 트리' });
  await page.locator('[data-tree-row][data-node-id="large-descendant-0"]').waitFor({ state: 'attached' });
  const expandedLogicalRows = 1_001;
  const descendantsAtTop = await descendantTree.getByRole('treeitem').count();
  assert(descendantsAtTop > 1, 'large descendant tree did not expand its workspace');
  assert(descendantsAtTop < 100, `large descendant tree rendered ${descendantsAtTop}/${expandedLogicalRows} rows at the top instead of a bounded virtual window`);
  const scrollExtent = await descendantTree.evaluate((node) => {
    const viewport = node.closest('[data-tree-viewport]') ?? node;
    const elements = [viewport, ...viewport.querySelectorAll('*')];
    return {
      scrollHeight: Math.max(...elements.map((element) => element.scrollHeight)),
      styledHeight: Math.max(...elements.map((element) => Number.parseFloat(getComputedStyle(element).height) || 0)),
      clientHeight: node.clientHeight,
    };
  });
  await descendantTree.focus();
  await page.keyboard.press('End');
  const descendantLast = page.locator('[data-tree-row][data-node-id="large-descendant-999"]');
  await descendantLast.waitFor({ state: 'visible' });
  assert.equal(await descendantLast.evaluate((node) => node.closest('[role="treeitem"]') === document.activeElement), true, 'End did not preserve the final descendant row identity');
  const endExtent = await descendantTree.evaluate((node) => {
    const viewport = node.closest('[data-tree-viewport]') ?? node;
    const elements = [viewport, ...viewport.querySelectorAll('*')];
    return {
      maxScrollTop: Math.max(...elements.map((element) => element.scrollTop)),
      maxScrollHeight: Math.max(...elements.map((element) => element.scrollHeight)),
    };
  });
  assert(endExtent.maxScrollTop >= (expandedLogicalRows - 20) * 40, `large descendant tree did not expose the full scroll extent: ${JSON.stringify({ scrollExtent, endExtent })}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  const descendantsAfterResize = await descendantTree.getByRole('treeitem').count();
  assert(descendantsAfterResize < 100, `large descendant tree rendered ${descendantsAfterResize}/${expandedLogicalRows} rows after resize`);
  await context.close();
  return { topLevel, descendants: { expandedLogicalRows, descendantsAtTop, descendantsAfterResize, scrollExtent, endExtent } };
}
async function zoom(){ const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doculight-tree-')); const ext=path.join(tmp,'ext'); fs.mkdirSync(ext); fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'zoom',version:'1',permissions:['tabs'],background:{service_worker:'sw.js'}})); fs.writeFileSync(path.join(ext,'sw.js'),'chrome.runtime.onInstalled.addListener(()=>{});'); let c; try { c=await chromium.launchPersistentContext(path.join(tmp,'profile'),{headless:false,viewport:null,args:['--window-size=1440,900','--window-position=-32000,-32000',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]}); if(!c.serviceWorkers().length)await c.waitForEvent('serviceworker'); const w=c.serviceWorkers()[0],p=c.pages()[0]||await c.newPage(); await p.goto(url,{waitUntil:'networkidle'}); const z=await w.evaluate(async u=>{const t=(await chrome.tabs.query({})).find(x=>x.url===u); await chrome.tabs.setZoom(t.id,2); return chrome.tabs.getZoom(t.id)},url); assert.equal(z,2); await p.waitForTimeout(400); const settings=p.getByRole('button',{name:'설정'}); await settings.scrollIntoViewIfNeeded(); assert(await settings.isVisible()); await p.getByRole('button',{name:/업로드 디렉토리 펼치기/}).click(); const tree=p.getByRole('tree',{name:'문서 트리'}); await tree.focus(); await p.keyboard.press('End'); assert(await p.getByRole('treeitem',{name:/읽기 전용 문서/}).isVisible(),'last tree row is unreachable at 200%'); await p.getByRole('tab',{name:'즐겨찾기'}).click(); assert(await p.getByRole('button',{name:/즐겨찾기 해제/}).last().isVisible()); await p.screenshot({path:path.join(output,'green-actual-zoom-200.png'),fullPage:true}); return {method:'isolated persistent Chromium + extension chrome.tabs.setZoom(2)',zoom:z,viewport:await p.evaluate(()=>({width:innerWidth,height:innerHeight}))}; } finally {await c?.close();fs.rmSync(tmp,{recursive:true,force:true});}}
async function largeZoomTransitions() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-large-tree-'));
  const ext = path.join(tmp, 'ext');
  fs.mkdirSync(ext);
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'sw.js' } }));
  fs.writeFileSync(path.join(ext, 'sw.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
  let context;
  try {
    context = await chromium.launchPersistentContext(path.join(tmp, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    const worker = context.serviceWorkers()[0];
    const page = context.pages()[0] || await context.newPage();
    const activeTreeId = () => page.evaluate(() => document.activeElement?.closest('[role="treeitem"]')?.querySelector('[data-tree-row]')?.getAttribute('data-node-id'));
    const waitForTreeId = (expected) => page.waitForFunction((id) => document.activeElement?.closest('[role="treeitem"]')?.querySelector('[data-tree-row]')?.getAttribute('data-node-id') === id, expected);
    const waitForStableTreeId = (expected) => page.waitForFunction(async (id) => {
      const active = () => document.activeElement?.closest('[role="treeitem"]')?.querySelector('[data-tree-row]')?.getAttribute('data-node-id');
      if (active() !== id) return false;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return active() === id;
    }, expected);
    const observations = [];
    for (const scenario of [
      { state: 'large-workspaces', total: 1_000, kind: 'workspace' },
      { state: 'large-descendants', total: 1_001, kind: 'descendant' },
    ]) {
      const target = `${url}?state=${scenario.state}`;
      await page.goto(target, { waitUntil: 'networkidle' });
      const tabId = await worker.evaluate(async (targetUrl) => (await chrome.tabs.query({})).find((tab) => tab.url === targetUrl).id, target);
      const setZoom = (value) => worker.evaluate(({ id, value }) => chrome.tabs.setZoom(id, value), { id: tabId, value });
      const getZoom = () => worker.evaluate((id) => chrome.tabs.getZoom(id), tabId);
      await setZoom(1);
      assert.equal(await getZoom(), 1);
      const tree = page.getByRole('tree', { name: '문서 트리' });
      const firstId = scenario.kind === 'workspace' ? 'large-workspace-0' : 'large-descendant-workspace';
      const lastId = scenario.kind === 'workspace' ? 'large-workspace-999' : 'large-descendant-999';
      const middleId = scenario.kind === 'workspace' ? 'large-workspace-499' : 'large-descendant-499';
      await page.evaluate(() => {
        window.__issue77ActionIds = [];
        document.querySelector('[role="tree"]')?.addEventListener('click', (event) => {
          const row = event.target instanceof Element ? event.target.closest('[data-tree-row]') : null;
          if (row) window.__issue77ActionIds.push(row.getAttribute('data-node-id'));
        });
      });
      const transitions = [];
      for (const [position, expectedId] of [['first', firstId], ['middle', middleId], ['last', lastId]]) {
        await page.setViewportSize({ width: 1280, height: 720 });
        await setZoom(1);
        assert.equal(await getZoom(), 1);
        if (scenario.kind === 'descendant' && position !== 'first') {
          await tree.focus();
          await page.keyboard.press('Home');
          const rootRow = page.locator('[data-tree-row][data-node-id="large-descendant-workspace"]');
          if (await rootRow.evaluate((row) => row.closest('[role="treeitem"]')?.getAttribute('aria-expanded')) === 'false') {
            await rootRow.getByRole('button').first().evaluate((button) => { button.focus(); button.click(); });
          }
          await page.locator('[data-tree-row][data-node-id="large-descendant-0"]').waitFor({ state: 'attached' });
        }
        await tree.focus();
        let alreadyActed = false;
        if (position === 'first') await page.keyboard.press('Home');
        else if (position === 'last') await page.keyboard.press('End');
        else {
          await page.keyboard.press('End');
          for (let step = 0; step < 510 && await activeTreeId() !== expectedId; step += 1) await page.keyboard.press('ArrowUp');
        }
        console.log(`TREE_TRANSITION_SETUP ${scenario.state} ${position} expected=${expectedId} active=${await activeTreeId()}`);
        await waitForTreeId(expectedId);
        const row = page.locator(`[data-tree-row][data-node-id="${expectedId}"]`);
        if (!alreadyActed) await row.getByRole('button').first().evaluate((button) => { button.focus(); button.click(); });
        await waitForTreeId(expectedId);
        assert.equal(await page.evaluate(() => window.__issue77ActionIds.at(-1)), expectedId, `${scenario.state} ${position} action targeted the wrong logical row`);
        if (scenario.kind === 'descendant' && position !== 'first') assert.equal(await page.locator('body').getAttribute('data-opened-node-id'), expectedId);
        const activeBeforeZoom = await activeTreeId();
        assert.equal(activeBeforeZoom, expectedId, `${scenario.state} ${position} lost identity before zoom`);
        const mountedAt100 = await tree.getByRole('treeitem').count();
        await page.evaluate(() => {
          window.__issue77ResizeEvents = { window: 0, visual: 0 };
          addEventListener('resize', () => { window.__issue77ResizeEvents.window += 1; }, { once: true });
          visualViewport?.addEventListener('resize', () => { window.__issue77ResizeEvents.visual += 1; }, { once: true });
        });
        await setZoom(2);
        assert.equal(await getZoom(), 2);
        await waitForStableTreeId(expectedId);
        const activeAt200 = await activeTreeId();
        const resizeEvents = await page.evaluate(() => window.__issue77ResizeEvents);
        const mountedAt200 = await tree.getByRole('treeitem').count();
        assert.equal(activeAt200, expectedId, `${scenario.state} ${position} changed identity at 200%; events=${JSON.stringify(resizeEvents)}`);
        assert(mountedAt200 < 100);
        const resizeRevisionBefore = Number(await page.locator('[data-tree-viewport]').getAttribute('data-resize-revision'));
        const heightBeforeResize = await page.locator('[data-tree-viewport]').evaluate((node) => node.clientHeight);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction((height) => document.querySelector('[data-tree-viewport]')?.clientHeight !== height, heightBeforeResize);
        await page.waitForFunction((revision) => Number(document.querySelector('[data-tree-viewport]')?.getAttribute('data-resize-revision')) > revision, resizeRevisionBefore);
        await waitForStableTreeId(expectedId);
        const activeAfterResize = await activeTreeId();
        assert.equal(activeAfterResize, expectedId, `${scenario.state} ${position} changed identity after resize`);
        const mountedAfterResize = await tree.getByRole('treeitem').count();
        assert(mountedAfterResize < 100);
        const resetRevisionBefore = Number(await page.locator('[data-tree-viewport]').getAttribute('data-resize-revision'));
        await setZoom(1);
        assert.equal(await getZoom(), 1);
        await page.waitForFunction((revision) => Number(document.querySelector('[data-tree-viewport]')?.getAttribute('data-resize-revision')) > revision, resetRevisionBefore);
        await waitForStableTreeId(expectedId);
        const activeAfterReset = await activeTreeId();
        assert.equal(activeAfterReset, expectedId, `${scenario.state} ${position} changed identity after reset`);
        transitions.push({ position, expectedId, actionId: expectedId, activeBeforeZoom, activeAt200, activeAfterResize, activeAfterReset, mountedAt100, mountedAt200, mountedAfterResize, resizeEvents, zoomSequence: [1, 2, 1] });
      }
      observations.push({ ...scenario, firstId, middleId, lastId, transitions, viewportAfterResize: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) });
    }
    return observations;
  } finally {
    await context?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
(async()=>{const server=start();let browser;try{console.log(`TREE_SOURCE_IDENTITY ${JSON.stringify(sourceIdentity)}`);await wait();browser=await chromium.launch({headless:true});const results=await matrix(browser);await stateEvidence(browser);const largeTree=await largeTreeEvidence(browser);await browser.close();browser=undefined;const actualZoom=await zoom();const largeTransitions=await largeZoomTransitions();fs.writeFileSync(path.join(output,'green-measurements.json'),JSON.stringify({sourceIdentity,results,largeTree,actualZoom,largeTransitions},null,2));console.log('PASS newspaper tree layout, state, interaction, and bounded virtualization checks');}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
