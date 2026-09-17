const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const webRoot = path.join(root, 'packages/web');
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue58');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const port = 3458;
const url = `http://127.0.0.1:${port}/test/issue58-file-surface-fixture.html`;
const bytes = Buffer.from([0,1,2,3,254,255]);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XG3pAAAAAElFTkSuQmCC','base64');
fs.mkdirSync(output,{recursive:true});

const server = spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--config','test/issue58-vite.config.mjs','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:webRoot,stdio:['ignore','pipe','pipe'],windowsHide:true});
async function ready(){for(let i=0;i<80;i++){try{if((await fetch(url)).ok)return}catch{} await new Promise(r=>setTimeout(r,250))}throw new Error('fixture server unavailable')}
async function contextFor(zoom, viewport){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doculight-issue58-'));
  const ext=path.join(webRoot,'test/zoom-extension');
  const args=zoom===2
    ? [`--window-size=${viewport.width},${viewport.height}`,`--window-position=-32000,-32000`,`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]
    : [];
  const context=await chromium.launchPersistentContext(dir,{headless:zoom===1,viewport,args});
  if(zoom===2&&!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
  return {context,worker:context.serviceWorkers()[0],cleanup:async()=>{await context.close();fs.rmSync(dir,{recursive:true,force:true})}};
}
async function main(){
 await ready(); const results=[];
 for(const viewport of [{width:1280,height:720},{width:1440,height:900},{width:1920,height:1080}]) for(const theme of ['light','dark']) for(const zoom of [1,2]){
  const owned=await contextFor(zoom,viewport); const page=owned.context.pages()[0]||await owned.context.newPage();
  try {
   await page.goto(url); await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   if(zoom===2){const actual=await owned.worker.evaluate(async target=>{const tab=(await chrome.tabs.query({})).find(one=>one.url===target);await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id)},url);assert.equal(actual,2);}
   const surfaces={}; for(const name of ['wide','tall','tiny']){await page.getByRole('button',{name}).click();await page.getByRole('img').waitFor();await page.locator('[data-image-preview][data-image-state="loaded"]').waitFor();const geometry=await page.locator('[data-image-preview]').evaluate(el=>{const i=el.querySelector('img');const a=el.getBoundingClientRect(),b=i.getBoundingClientRect(),s=getComputedStyle(i);return {available:{w:a.width,h:a.height},image:{w:b.width,h:b.height,left:b.left,right:b.right,top:b.top,bottom:b.bottom,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight},fit:s.objectFit,maxWidth:s.maxWidth,maxHeight:s.maxHeight,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio}}});assert.equal(geometry.fit,'contain');assert.equal(geometry.maxWidth,'100%');assert.equal(geometry.maxHeight,'100%');assert(geometry.image.w<=geometry.available.w&&geometry.image.h<=geometry.available.h);assert(geometry.image.w<=geometry.image.naturalWidth&&geometry.image.h<=geometry.image.naturalHeight);assert.equal(geometry.overflowX,0);surfaces[name]=geometry;}
   if(viewport.width===1280&&theme==='light'&&zoom===1){
    await page.getByRole('button',{name:'download'}).click();
    await page.getByRole('button',{name:'tiny'}).click();
    const cached=page.locator('[data-image-preview]');
    await cached.locator('img').waitFor();
    await cached.waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-image-preview]')?.getAttribute('data-image-state')==='loaded');
    assert.equal(await cached.getAttribute('aria-busy'),null,'cached image must not remain busy');

    await page.route('**/d/missing',route=>route.fulfill({status:404,body:'missing'}));
    await page.getByRole('button',{name:'missing'}).click();
    const missing=page.getByRole('alert',{name:'이미지 오류'});
    await missing.waitFor();
    const missingText=await missing.textContent();
    await page.route('**/d/forbidden',route=>route.fulfill({status:403,body:'forbidden'}));
    await page.getByRole('button',{name:'forbidden'}).click();
    const forbidden=page.getByRole('alert',{name:'이미지 오류'});
    await forbidden.waitFor();
    assert.equal(await forbidden.textContent(),missingText,'missing and forbidden resources must use the same safe error');

    let retryAttempts=0; let releaseRetry; const retryGate=new Promise(resolve=>{releaseRetry=resolve});
    await page.route('**/d/retry',async route=>{retryAttempts+=1;if(retryAttempts===1){await route.fulfill({status:500,body:'retry'});return}await retryGate;await route.fulfill({status:200,contentType:'image/png',body:png})});
    await page.getByRole('button',{name:'retry'}).click();
    const retryError=page.getByRole('alert',{name:'이미지 오류'});
    await retryError.waitFor();
    await retryError.getByRole('button',{name:'다시 시도'}).click();
    await page.getByRole('status',{name:'이미지를 불러오는 중입니다.'}).waitFor();
    releaseRetry();
    await page.locator('[data-image-preview][data-image-state="loaded"]').waitFor();
    assert.equal(retryAttempts,2,'retry must request the same resource again');
   }
   await page.screenshot({path:path.join(output,`surface-${viewport.width}-${theme}-${zoom}x.png`),fullPage:true});
   await page.getByRole('button',{name:'download'}).click();
   const downloadGeometry=await page.locator('[data-file-download-surface]').evaluate(element=>{const link=element.querySelector('a');const box=link.getBoundingClientRect();return {linkWidth:box.width,linkHeight:box.height,viewportWidth:innerWidth,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
   assert(downloadGeometry.linkWidth<=downloadGeometry.viewportWidth);
   assert(downloadGeometry.linkHeight>=36);
   assert.equal(downloadGeometry.overflowX,0);
   assert.equal(await page.locator('iframe,object,embed,canvas').count(),0);
   if(viewport.width===1280&&theme==='light'&&zoom===1){
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:/내려받기/}).click()]);
    const saved=path.join(output,'download.bin');
    await download.saveAs(saved);
    assert.equal(download.suggestedFilename(),'긴 이름 📎 보고서 LongUnbrokenFilenameForDownload.pdf');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(saved)).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));
   }
   await page.getByRole('button',{name:'picker'}).click();
   const matrixPrompt=page.locator('[data-new-version-prompt]');
   await matrixPrompt.locator('input[type="file"]').setInputFiles({name:'선택 📎.bin',mimeType:'application/octet-stream',buffer:bytes});
   const dialogGeometry=await matrixPrompt.evaluate(element=>{const box=element.getBoundingClientRect();const input=element.querySelector('input');const inputBox=input.getBoundingClientRect();return {width:box.width,right:box.right,viewportWidth:innerWidth,inputHeight:inputBox.height,overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
   assert(dialogGeometry.width<=Math.min(560,dialogGeometry.viewportWidth-48)+1);
   assert(dialogGeometry.right<=dialogGeometry.viewportWidth);
   assert(dialogGeometry.inputHeight>=36);
   assert.equal(dialogGeometry.overflowX,0);
   assert.equal(await page.getByLabel('pick count').textContent(),'0');
   const matrixUpload=matrixPrompt.getByRole('button',{name:'새 버전 올리기'});
   await matrixUpload.click();
   const matrixAlert=page.getByRole('alertdialog');
   assert.equal(await matrixAlert.getByRole('button',{name:'돌아가기'}).evaluate(element=>element===document.activeElement),true);
   await page.mouse.click(1,1);
   assert.equal(await matrixAlert.count(),1,'outside interaction must not dismiss the L2 alert');
   await page.screenshot({path:path.join(output,`matrix-${viewport.width}-${theme}-${zoom}x.png`),fullPage:true});
   const cancelAction=matrixAlert.getByRole('button',{name:'돌아가기'});
   await cancelAction.scrollIntoViewIfNeeded();
   assert.equal(await cancelAction.evaluate(element=>{const box=element.getBoundingClientRect(),owner=element.closest('[role="alertdialog"]').getBoundingClientRect();return box.top>=owner.top&&box.bottom<=owner.bottom&&box.top>=0&&box.bottom<=innerHeight}),true,'cancel action must be reachable inside the scrolled alert');
   await cancelAction.click();
   await matrixAlert.waitFor({state:'detached'});
   await page.waitForFunction(element=>element===document.activeElement,await matrixUpload.elementHandle());
   await matrixUpload.click();
   const affirmative=page.getByRole('alertdialog').getByRole('button',{name:'교체하기'});
   await affirmative.scrollIntoViewIfNeeded();
   assert.equal(await affirmative.evaluate(element=>{const box=element.getBoundingClientRect(),owner=element.closest('[role="alertdialog"]').getBoundingClientRect();return box.top>=owner.top&&box.bottom<=owner.bottom&&box.top>=0&&box.bottom<=innerHeight}),true,'affirmative action must be reachable inside the scrolled alert');
   await page.screenshot({path:path.join(output,`matrix-actions-${viewport.width}-${theme}-${zoom}x.png`),fullPage:true});
   await affirmative.click();
   assert.equal(await page.getByLabel('pick count').textContent(),'1');
   await matrixPrompt.getByRole('button',{name:'닫기'}).click();
   await matrixPrompt.waitFor({state:'detached'});
   results.push({viewport,theme,zoom,surfaces,download:downloadGeometry,dialog:dialogGeometry});
  } finally {
   await owned.cleanup();
  }
 }

 const forced=await contextFor(1,{width:1280,height:720});
 try {
  const page=forced.context.pages()[0]||await forced.context.newPage();
  await page.emulateMedia({forcedColors:'active'});
  await page.goto(url);
  await page.getByRole('button',{name:'picker'}).click();
  const prompt=page.locator('[data-new-version-prompt]');
  await prompt.locator('input[type="file"]').setInputFiles({name:'강제 색상 📎.bin',mimeType:'application/octet-stream',buffer:bytes});
  const upload=prompt.getByRole('button',{name:'새 버전 올리기'});
  await prompt.locator('input[type="file"]').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await upload.evaluate(element=>element===document.activeElement),true,'keyboard focus must reach the upload action');
  const forcedState=await upload.evaluate(element=>({forcedColors:matchMedia('(forced-colors: active)').matches,outlineStyle:getComputedStyle(element).outlineStyle,outlineWidth:getComputedStyle(element).outlineWidth}));
  assert.equal(forcedState.forcedColors,true);
  assert.notEqual(forcedState.outlineStyle,'none');
  await page.screenshot({path:path.join(output,'forced-colors.png'),fullPage:true});
  fs.writeFileSync(path.join(output,'forced-colors.json'),JSON.stringify(forcedState,null,2));
 } finally {
  await forced.cleanup();
 }
 fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(results,null,2)); console.log(`PASS issue58 matrix ${results.length}/12`);
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{if(server.pid&&!server.killed)server.kill()});
