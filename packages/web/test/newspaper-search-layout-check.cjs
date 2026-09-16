const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue52');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3419/test/newspaper-search-fixture.html';
fs.mkdirSync(evidence, { recursive: true });
const server = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3419', '--strictPort'], {
  cwd: path.join(root, 'packages/web'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
const wait = async () => { for (let i=0;i<80;i+=1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r=>setTimeout(r,250)); } throw new Error('fixture server timeout'); };
async function inspect(page, theme) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
  await page.getByRole('tab', { name: '검색' }).click();
  const input = page.getByRole('combobox', { name: '검색' });
  const filter = page.getByRole('button', { name: '검색 대상' });
  const region = page.getByRole('region', { name: '검색 결과' });
  const before = await page.evaluate(() => {
    const i=document.querySelector('[data-search=query-row] input').getBoundingClientRect();
    const b=document.querySelector('[aria-label="검색 대상"]').getBoundingClientRect();
    const r=document.querySelector('[aria-label="검색 결과"]');
    return { input:i.toJSON(), filter:b.toJSON(), top:i.top, overflow:getComputedStyle(r).overflowY, horizontal:r.scrollWidth-r.clientWidth };
  });
  assert(Math.abs(before.input.height - 36) <= 1, `input height ${before.input.height}`);
  assert(Math.abs(before.filter.height - 36) <= 1, `filter height ${before.filter.height}`);
  assert(Math.abs(before.filter.width - 48) <= 1, `filter width ${before.filter.width}`);
  assert(Math.abs(before.filter.x - before.input.right - 8) <= 1, 'input/filter gap is not 8px');
  assert(before.horizontal <= 1, `results horizontal overflow ${before.horizontal}`);
  assert.equal(before.overflow, 'auto');
  await input.focus();
  const resultCount=await page.locator('[data-search-result]').count();
  const inspectSelected=async label=>{
    const selected=page.locator('[data-search-result][aria-selected=true]');
    const measured=await selected.evaluate(element => {
      const style=getComputedStyle(element), box=element.getBoundingClientRect(), host=element.closest('[aria-label="검색 결과"]'), region=host.getBoundingClientRect();
      const extent=parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);
      const viewport={left:region.left+host.clientLeft,top:region.top+host.clientTop,right:region.left+host.clientLeft+host.clientWidth,bottom:region.top+host.clientTop+host.clientHeight};
      return {activeTag:document.activeElement?.tagName,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth,outlineOffset:style.outlineOffset,box:box.toJSON(),viewport,extent,inside:box.left-extent>=viewport.left && box.right+extent<=viewport.right && box.top-extent>=viewport.top && box.bottom+extent<=viewport.bottom};
    });
    assert(measured.inside,`${label} keyboard-selected result 4px outline extent is clipped: ${JSON.stringify(measured)}`);
    return {selected,measured};
  };
  await page.keyboard.press('Home');
  const first=await inspectSelected('first');
  for(let at=1;at<Math.floor(resultCount/2);at+=1) await page.keyboard.press('ArrowDown');
  await inspectSelected('middle');
  await page.keyboard.press('End');
  const {selected:keyboardSelected,measured:focusStyle}=await inspectSelected('last');
  assert.equal(focusStyle.activeTag,'INPUT','cmdk virtual focus moved DOM focus away from input');
  assert.equal(focusStyle.outlineStyle,'solid','keyboard-selected result has no non-color focus outline');
  assert.equal(focusStyle.outlineWidth,'2px','keyboard-selected result focus outline is not 2px');
  assert.equal(focusStyle.outlineOffset,'2px','keyboard-selected result focus separation is not 2px');
  await page.screenshot({path:path.join(evidence,`green-search-keyboard-focus-${theme}-${await page.evaluate(()=>innerWidth)}x${await page.evaluate(()=>innerHeight)}.png`)});
  const keyboardSelectedId=await keyboardSelected.getAttribute('data-value');
  await page.keyboard.press('Tab');
  const afterTab=await keyboardSelected.evaluate(element=>({activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label'),nav:element.closest('[data-search=panel]')?.getAttribute('data-keyboard-navigation'),outline:getComputedStyle(element).outlineStyle}));
  assert.equal(afterTab.activeTag,'BUTTON','Tab did not move DOM focus to the filter control');
  assert.equal(afterTab.activeLabel,'검색 대상','Tab did not focus the filter control');
  assert.equal(afterTab.nav,null,'keyboard result focus mode remained after DOM focus left cmdk input');
  assert.equal(afterTab.outline,'none','keyboard-selected result outline remained after DOM focus left cmdk input');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('End');
  await region.evaluate(e=>{e.scrollTop=e.scrollHeight;});
  assert((await region.evaluate(e=>e.scrollTop)) > 0, 'results do not scroll');
  assert(Math.abs((await input.boundingBox()).y - before.top) <= 1, 'fixed query row moved with results');
  await filter.click();
  const popover = page.locator('[data-search-filter-popover]');
  const box = await popover.boundingBox();
  assert(box && Math.abs(box.width - 240) <= 1, `popover width ${box?.width}`);
  assert.equal(await page.getByRole('checkbox').count(), 4);
  const bodyOption=page.getByRole('checkbox',{name:'본문'}).locator('..');
  await bodyOption.hover();
  const hover=await bodyOption.evaluate(element=>{const probe=document.createElement('div');probe.style.cssText='position:absolute;background:var(--surface-control)';document.body.append(probe);const control=getComputedStyle(probe).backgroundColor;probe.style.background='var(--surface-selected)';const selected=getComputedStyle(probe).backgroundColor;probe.remove();return {background:getComputedStyle(element).backgroundColor,control,selected,checked:element.querySelector('input').getAttribute('aria-checked')};});
  assert.equal(hover.background,hover.control,'filter option hover does not use surface-control');
  assert.notEqual(hover.background,hover.selected,'filter option hover incorrectly looks selected');
  assert.equal(hover.checked,'false','hover changed checkbox state');
  const nameOption=page.getByRole('checkbox',{name:'이름',exact:true}).locator('..');
  await nameOption.hover();
  const checkedHover=await nameOption.evaluate(element=>({checked:element.querySelector('input').checked,aria:element.querySelector('input').getAttribute('aria-checked')}));
  assert.equal(checkedHover.checked,true,'hover hid the native checked state');
  assert.equal(checkedHover.aria,'true','hover changed the accessible checked state');
  assert.equal(await keyboardSelected.evaluate(element=>getComputedStyle(element).outlineStyle),'none','pointer hover was confused with keyboard result focus');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '검색 대상');
  assert(await filter.evaluate(e=>e===document.activeElement), 'Escape did not restore trigger focus');
  await input.dispatchEvent('compositionstart');
  await input.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-opened'), null, 'composition Enter opened a result');
  await input.dispatchEvent('compositionend');
  await input.press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-opened'), keyboardSelectedId, 'post-composition Enter did not open the selected result');
  assert.equal(await page.locator('body').getAttribute('data-open-calls'), '1', 'post-composition Enter did not open exactly once');
  return before;
}
async function regularMatrix(browser) {
  const found = [];
  for (const theme of ['light', 'dark']) for (const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    found.push({ theme, width, height, zoom: 1, measurement: await inspect(page, theme), viewport: await page.evaluate(()=>({width:innerWidth,height:innerHeight})) });
    await page.screenshot({ path: path.join(evidence, `green-search-${theme}-${width}x${height}-100.png`), fullPage: true });
    await context.close();
  }
  return found;
}
async function zoomMatrix() {
  const found = [];
  for (const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-search-zoom-'));
    const ext = path.join(tmp, 'ext'); fs.mkdirSync(ext);
    fs.writeFileSync(path.join(ext,'manifest.json'), JSON.stringify({manifest_version:3,name:'zoom',version:'1',permissions:['tabs'],background:{service_worker:'sw.js'}}));
    fs.writeFileSync(path.join(ext,'sw.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
    let context;
    try {
      context = await chromium.launchPersistentContext(path.join(tmp,'profile'), { headless:false, viewport:{width,height}, args:[`--window-size=${width},${height}`,`--disable-extensions-except=${ext}`,`--load-extension=${ext}`] });
      if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
      const worker=context.serviceWorkers()[0], page=context.pages()[0]||await context.newPage();
      await page.goto(url,{waitUntil:'networkidle'});
      const before=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
      const zoom=await worker.evaluate(async target=>{const tab=(await chrome.tabs.query({})).find(one=>one.url===target);await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},url);
      assert.equal(zoom,2);
      for (const theme of ['light','dark']) {
        const measurement=await inspect(page,theme);
        const after=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
        assert(after.width < before.width,'genuine zoom did not reduce CSS viewport');
        found.push({theme,width,height,zoom,before,after,measurement,method:'isolated persistent Chromium + chrome.tabs.setZoom(2)'});
        await page.screenshot({path:path.join(evidence,`green-search-${theme}-${width}x${height}-200.png`),fullPage:true});
      }
    } finally { await context?.close(); fs.rmSync(tmp,{recursive:true,force:true}); }
  }
  return found;
}
async function states(browser) {
  const context=await browser.newContext({viewport:{width:1280,height:720}}), page=await context.newPage();
  for(const state of ['idle','loading','empty','error']){
    await page.goto(`${url}?state=${state}`,{waitUntil:'networkidle'}); await page.getByRole('tab',{name:'검색'}).click();
    if(state==='idle') assert(await page.getByText('검색어를 입력하세요.').isVisible());
    if(state==='loading'){assert(await page.getByRole('status',{name:'검색 중…'}).isVisible());assert.equal(await page.getByRole('region',{name:'검색 결과'}).getAttribute('aria-busy'),'true');}
    if(state==='empty') assert(await page.getByText('검색 결과가 없습니다.').isVisible());
    if(state==='error'){const alert=page.getByRole('alert',{name:'검색 오류'});assert(await alert.isVisible());await alert.getByRole('button',{name:'다시 시도'}).click();assert.equal(await page.locator('body').getAttribute('data-retried'),'true');}
    await page.screenshot({path:path.join(evidence,`green-search-state-${state}.png`),fullPage:true});
  }
  await context.close();
}
(async()=>{const child=server();let browser;try{await wait();browser=await chromium.launch({headless:true});const regular=await regularMatrix(browser);await states(browser);await browser.close();browser=undefined;const actualZoom=await zoomMatrix();fs.writeFileSync(path.join(evidence,'green-measurements.json'),JSON.stringify({regular,actualZoom},null,2));console.log('PASS newspaper search 12-environment geometry, state, and interaction checks');}finally{await browser?.close();child.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
