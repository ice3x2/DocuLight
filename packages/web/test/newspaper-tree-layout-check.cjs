const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue51');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3418/test/newspaper-tree-fixture.html';
fs.mkdirSync(output, { recursive: true });
const start = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3418', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: ['ignore','pipe','pipe'], windowsHide: true });
const wait = async () => { for(let i=0;i<80;i++){ try { if((await fetch(url)).ok)return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw new Error('server timeout'); };
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
async function matrix(browser){ const out=[]; for(const theme of ['light','dark']) for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) { const c=await browser.newContext({viewport:{width,height}}); const p=await c.newPage(); await p.goto(url,{waitUntil:'networkidle'}); await p.evaluate(t=>document.documentElement.dataset.theme=t,theme); out.push({theme,...await inspect(p)}); await p.getByRole('textbox').waitFor({state:'detached'}); const treeRows=p.getByRole('treeitem'); await treeRows.nth(2).waitFor({state:'visible'}); await treeRows.nth(2).click({force:true}); await treeRows.nth(1).focus(); await p.screenshot({path:path.join(output,`green-tree-selected-focus-${theme}-${width}x${height}.png`),fullPage:true}); await p.getByRole('tab',{name:'즐겨찾기'}).click(); await p.screenshot({path:path.join(output,`green-favorites-rows-${theme}-${width}x${height}.png`),fullPage:true}); let removes=p.getByRole('button',{name:/즐겨찾기 해제/}); await removes.first().click(); await p.waitForTimeout(160); removes=p.getByRole('button',{name:/즐겨찾기 해제/}); assert.equal(await removes.first().evaluate(e=>e===document.activeElement),true,'delayed removal did not focus the next remove control'); await removes.first().click(); await p.waitForTimeout(160); assert.equal(await p.getByRole('tab',{name:'즐겨찾기'}).evaluate(e=>e===document.activeElement),true,'delayed final removal did not focus Favorites tab'); assert.notEqual(await p.evaluate(()=>document.activeElement?.tagName),'BODY'); assert.equal(await p.getByText('즐겨찾기한 항목이 없습니다.').count(),1); await p.screenshot({path:path.join(output,`green-favorites-empty-${theme}-${width}x${height}.png`),fullPage:true}); await c.close(); } return out; }
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
  const row = page.getByRole('treeitem').nth(2);
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
async function zoom(){ const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doculight-tree-')); const ext=path.join(tmp,'ext'); fs.mkdirSync(ext); fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'zoom',version:'1',permissions:['tabs'],background:{service_worker:'sw.js'}})); fs.writeFileSync(path.join(ext,'sw.js'),'chrome.runtime.onInstalled.addListener(()=>{});'); let c; try { c=await chromium.launchPersistentContext(path.join(tmp,'profile'),{headless:false,viewport:null,args:['--window-size=1440,900','--window-position=-32000,-32000',`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]}); if(!c.serviceWorkers().length)await c.waitForEvent('serviceworker'); const w=c.serviceWorkers()[0],p=c.pages()[0]||await c.newPage(); await p.goto(url,{waitUntil:'networkidle'}); const z=await w.evaluate(async u=>{const t=(await chrome.tabs.query({})).find(x=>x.url===u); await chrome.tabs.setZoom(t.id,2); return chrome.tabs.getZoom(t.id)},url); assert.equal(z,2); await p.waitForTimeout(400); const settings=p.getByRole('button',{name:'설정'}); await settings.scrollIntoViewIfNeeded(); assert(await settings.isVisible()); await p.getByRole('button',{name:/업로드 디렉토리 펼치기/}).click(); const tree=p.getByRole('tree',{name:'문서 트리'}); await tree.focus(); await p.keyboard.press('End'); assert(await p.getByRole('treeitem',{name:/읽기 전용 문서/}).isVisible(),'last tree row is unreachable at 200%'); await p.getByRole('tab',{name:'즐겨찾기'}).click(); assert(await p.getByRole('button',{name:/즐겨찾기 해제/}).last().isVisible()); await p.screenshot({path:path.join(output,'green-actual-zoom-200.png'),fullPage:true}); return {method:'isolated persistent Chromium + extension chrome.tabs.setZoom(2)',zoom:z,viewport:await p.evaluate(()=>({width:innerWidth,height:innerHeight}))}; } finally {await c?.close();fs.rmSync(tmp,{recursive:true,force:true});}}
(async()=>{const server=start();let browser;try{await wait();browser=await chromium.launch({headless:true});const results=await matrix(browser);await stateEvidence(browser);await browser.close();browser=undefined;const actualZoom=await zoom();fs.writeFileSync(path.join(output,'green-measurements.json'),JSON.stringify({results,actualZoom},null,2));console.log('PASS newspaper tree layout, state, and interaction checks');}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
