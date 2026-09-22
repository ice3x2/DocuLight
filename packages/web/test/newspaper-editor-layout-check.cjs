const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const evidence = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue54');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3422/test/newspaper-editor-fixture.html';
fs.mkdirSync(evidence, { recursive: true });
const server = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3422', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const runProcess = (command,args,options) => new Promise((resolve,reject) => { const child=spawn(command,args,{...options,stdio:['ignore','pipe','pipe'],windowsHide:true}); let output=''; child.stdout.on('data',chunk=>{output+=chunk}); child.stderr.on('data',chunk=>{output+=chunk}); child.on('error',reject); child.on('exit',code=>code===0?resolve(output):reject(new Error(`${command} exited ${code}\n${output}`))); });
const wait = async () => { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise(r => setTimeout(r, 250)); } throw new Error('fixture server timeout'); };
const waitForUrl = async target => { for (let i = 0; i < 80; i += 1) { try { if ((await fetch(target)).ok) return; } catch {} await new Promise(r => setTimeout(r, 250)); } throw new Error(`server timeout: ${target}`); };
const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const contrast = (a, b) => { const lum = value => { const [r,g,b] = rgb(value).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126*r + .7152*g + .0722*b; }; const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
const style = (page, selector, pseudo) => page.locator(selector).first().evaluate((el, p) => { const s=getComputedStyle(el,p); return { color:s.color, background:s.backgroundColor, border:s.borderColor, outline:s.outlineColor, outlineStyle:s.outlineStyle, boxShadow:s.boxShadow, fontSize:s.fontSize, lineHeight:s.lineHeight, paddingLeft:s.paddingLeft, content:s.content }; }, pseudo);

async function setTheme(page, value) {
  await page.evaluate(v => window.__issue54.setTheme(v), value);
  await page.waitForFunction(v => document.querySelector('.atomic-cm-editor')?.getAttribute('data-editor-theme') === v, value);
}

async function matrixCase(page, theme, shot) {
  await page.goto(`${url}?theme=${theme}`, { waitUntil: 'networkidle' });
  const metrics = await page.evaluate(() => { const c=document.querySelector('.cm-content'); const r=c.getBoundingClientRect(); const s=getComputedStyle(c); const line=q=>{const x=document.querySelector(q),y=getComputedStyle(x);return [y.fontSize,y.lineHeight]}; return { width:r.width, padding:parseFloat(s.paddingLeft), body:[s.fontSize,s.lineHeight], h1:line('.cm-atomic-h1'), h2:line('.cm-atomic-h2'), h3:line('.cm-atomic-h3'), h4:line('.cm-atomic-h4'), h5:line('.cm-atomic-h5'), h6:line('.cm-atomic-h6'), quote:line('.cm-atomic-blockquote'), overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth }; });
  assert.deepEqual(metrics.body,['16px','28px']); assert.deepEqual(metrics.h1,['36px','50px']); assert.deepEqual(metrics.h2,['24px','36px']); assert.deepEqual(metrics.h3,['20px','30px']); assert.deepEqual(metrics.h4,['18px','28px']); assert.deepEqual(metrics.h5,['16px','28px']); assert.deepEqual(metrics.h6,['16px','28px']); assert.deepEqual(metrics.quote,['18px','30px']);
  assert(metrics.width <= 800.5); assert([24,40].includes(metrics.padding)); assert(metrics.overflow <= 1);
  await page.getByRole('button',{name:'편집'}).click(); assert.equal((await style(page,'.cm-content')).fontSize,'16px');
  await page.getByRole('button',{name:'소스'}).click(); const src=page.getByRole('textbox',{name:'원문'}); const sourceStyle=await style(page,'[data-source-editor]'); assert.equal(sourceStyle.fontSize,'14px'); assert.equal(sourceStyle.lineHeight,'22px'); assert.equal(await src.inputValue(),await page.evaluate(()=>window.__issue54.markdown));
  await page.getByRole('button',{name:'라이브 프리뷰'}).click(); assert.equal((await style(page,'.cm-atomic-h2')).fontSize,'24px'); assert.equal((await style(page,'.cm-atomic-h3')).fontSize,'20px'); await page.getByRole('button',{name:'보기'}).click(); const title=page.locator('.cm-atomic-h1'); assert((await title.textContent()).includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789')); const titleBox=await title.evaluate(e=>{const s=getComputedStyle(e);return {scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,overflow:s.overflow,textOverflow:s.textOverflow,lineClamp:s.webkitLineClamp}}); assert(titleBox.scrollWidth<=titleBox.clientWidth+1); assert.notEqual(titleBox.overflow,'hidden'); assert.equal(titleBox.lineClamp,'none'); await page.screenshot({path:shot,fullPage:true}); return metrics;
}

async function dynamic(page) {
  await page.goto(`${url}?theme=light`,{waitUntil:'networkidle'}); await page.getByRole('button',{name:'편집'}).click();
  const shell=page.locator('[data-product-shell]'); await shell.evaluate(e=>e.style.width='799px'); assert.equal(parseFloat((await style(page,'.cm-content')).paddingLeft),24); await shell.evaluate(e=>e.style.width='800px'); assert.equal(parseFloat((await style(page,'.cm-content')).paddingLeft),40); await shell.evaluate(e=>e.style.width='100vw');
  const host=page.locator('.atomic-cm-editor'); const content=page.locator('.atomic-cm-editor .cm-content'); await host.evaluate(e=>{e.dataset.testIdentity='stable-host'});
  await content.click(); await page.keyboard.press('End'); await page.keyboard.type('Z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Home'); await page.keyboard.press('Shift+ArrowRight');
  const selectedBefore=await page.evaluate(()=>getSelection()?.toString()); assert(selectedBefore);
  const light=await style(page,'.cm-content'); const lightHost=await style(page,'.atomic-cm-editor'); const lightCaret=await style(page,'.cm-cursor'); const lightSelection=await style(page,'.cm-selectionBackground'); const lightVars=await host.evaluate(e=>{const s=getComputedStyle(e),r=getComputedStyle(document.documentElement);return [s.getPropertyValue('--atomic-editor-fg').trim(),r.getPropertyValue('--text-primary').trim(),s.getPropertyValue('--atomic-editor-accent').trim(),r.getPropertyValue('--action-primary').trim()]}); assert.equal(lightVars[0],lightVars[1]); assert.equal(lightVars[2],lightVars[3]); await setTheme(page,'dark'); const dark=await style(page,'.cm-content'); const darkHost=await style(page,'.atomic-cm-editor'); const darkCaret=await style(page,'.cm-cursor'); const darkSelection=await style(page,'.cm-selectionBackground'); assert.notEqual(light.color,dark.color); assert.notEqual(lightHost.background,darkHost.background); assert.notEqual(lightCaret.border,darkCaret.border); assert.notEqual(lightSelection.background,darkSelection.background); assert.equal(await page.evaluate(()=>getSelection()?.toString()),selectedBefore);
  await page.keyboard.press('Control+f'); const search=page.locator('.cm-atomic-search-input'); await search.fill('본문'); await page.keyboard.press('Enter'); const searchBefore=await style(page,'.cm-searchMatch-selected'); await setTheme(page,'light'); assert.notEqual(searchBefore.background,(await style(page,'.cm-searchMatch-selected')).background);
  assert.equal(await host.getAttribute('data-test-identity'),'stable-host'); assert.equal(await page.evaluate(()=>window.__issue54.saves.length),0);
  await page.evaluate(()=>window.__issue54.setTheme('system')); await page.waitForFunction(()=>['light','dark'].includes(document.querySelector('.atomic-cm-editor')?.getAttribute('data-editor-theme'))); await page.emulateMedia({colorScheme:'dark'}); await page.waitForFunction(()=>document.querySelector('.atomic-cm-editor')?.getAttribute('data-editor-theme')==='dark');
  await page.keyboard.press('Escape'); await content.dispatchEvent('compositionstart',{data:'한'}); await page.evaluate(()=>window.__issue54.setTheme('light')); assert.equal(await host.getAttribute('data-editor-theme'),'dark'); await content.dispatchEvent('compositionend',{data:'한'}); await page.waitForFunction(()=>document.querySelector('.atomic-cm-editor')?.getAttribute('data-editor-theme')==='light');
  await page.getByRole('button',{name:'소스'}).click(); const source=page.getByRole('textbox',{name:'원문'}); await source.evaluate(e=>{e.dataset.testIdentity='source';e.focus();e.setSelectionRange(3,9)}); await page.evaluate(()=>window.__issue54.setTheme('dark')); assert.equal(await source.getAttribute('data-test-identity'),'source'); assert.deepEqual(await source.evaluate(e=>[e.selectionStart,e.selectionEnd]),[3,9]);
  await page.getByRole('button',{name:'라이브 프리뷰'}).click(); const checked=page.locator('.cm-atomic-task-checkbox:checked'); const unchecked=page.locator('.cm-atomic-task-checkbox:not(:checked)');
  for (const theme of ['light','dark']) { await setTheme(page,theme); for (const box of [unchecked,checked]) { const base=await box.evaluate(e=>{const s=getComputedStyle(e),a=getComputedStyle(e,'::after'),b=getComputedStyle(e,'::before'),surface=getComputedStyle(e.closest('.atomic-cm-editor'));return {fill:s.backgroundColor,border:s.borderTopColor,glyph:a.borderRightColor,opacity:a.opacity,after:a.content,before:b.content,surface:surface.backgroundColor}}); assert.equal(base.before,'none'); assert.notEqual(base.after,'none'); assert.equal(base.opacity,(await box.isChecked())?'1':'0'); if(await box.isChecked()) assert(contrast(base.glyph,base.fill)>=3); else assert(contrast(base.border,base.surface)>=3); await box.hover(); const hover=await box.evaluate(e=>{const s=getComputedStyle(e),a=getComputedStyle(e,'::after'),surface=getComputedStyle(e.closest('.atomic-cm-editor'));return {fill:s.backgroundColor,border:s.borderTopColor,glyph:a.borderRightColor,surface:surface.backgroundColor}}); if(await box.isChecked()) assert(contrast(hover.glyph,hover.fill)>=3); else assert(contrast(hover.border,hover.fill==='rgba(0, 0, 0, 0)'?hover.surface:hover.fill)>=3); await box.evaluate(e=>e.focus({focusVisible:true})); const f=await box.evaluate(e=>{const s=getComputedStyle(e),surface=getComputedStyle(e.closest('.atomic-cm-editor'));return {style:s.outlineStyle,color:s.outlineColor,background:surface.backgroundColor,shadow:s.boxShadow}}); assert(f.style!=='none'||f.shadow!=='none'); assert(contrast(f.color,f.background)>=3); } }
  const original=await page.evaluate(()=>window.__issue54.markdown); await checked.click(); await page.getByRole('button',{name:'소스'}).click(); const toggled=await source.inputValue(); assert.equal(toggled,original.replace('- [x] 완료한 일','- [ ] 완료한 일'));
  await page.getByRole('button',{name:'라이브 프리뷰'}).click(); const merge=page.locator('[data-merge-case="theme-transition"] .cm-mergeView'); assert.equal(await merge.count(),1,'theme-transition MergeView fixture identity must be unique'); await merge.evaluate(e=>e.dataset.testIdentity='merge'); const draft=merge.locator('.cm-content').last(); await draft.click(); await draft.press('End'); await draft.type('X'); await setTheme(page,'light'); assert.equal(await merge.getAttribute('data-test-identity'),'merge'); assert((await draft.textContent()).includes('X'));
  await content.click(); await content.press('End'); await content.type('저장'); await content.press('Control+s'); await page.waitForFunction(()=>window.__issue54.saves.length===1); assert.equal(await page.evaluate(()=>window.__issue54.saves.length),1);
}

async function regular(browser){const out=[];for(const theme of ['light','dark'])for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]){const c=await browser.newContext({viewport:{width,height}}),p=await c.newPage();out.push({theme,width,height,zoom:1,metrics:await matrixCase(p,theme,path.join(evidence,`green-editor-${theme}-${width}x${height}-100.png`))});await c.close();}return out;}
async function productionSmoke(browser) {
  const target='http://127.0.0.1:3423/';
  await runProcess(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'build'],{cwd:path.join(root,'packages/web')});
  const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port','3423','--strictPort'],{cwd:path.join(root,'packages/web'),stdio:['ignore','pipe','pipe'],windowsHide:true});
  try {
    await waitForUrl(target);
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.stack||error.message));
    await page.route('**/api/**',async route=>{
      const request=route.request(),pathname=new URL(request.url()).pathname; requests.push(pathname); let body=[];
      if(pathname==='/api/session')body={superuser:false,workspaceCount:1,adminWorkspaceCount:0};
      else if(pathname==='/api/auth/me')body={userId:'issue54-user'};
      else if(pathname==='/api/personal-settings')body={theme:'light'};
      else if(pathname==='/api/instance/signup-mode')body={mode:'closed'};
      else if(pathname==='/api/tree')body=[{workspace:{id:'ws-1',name:'기획팀'},visibility:'full',roots:[{id:'n1',name:'회의록.md',kind:'file',visibility:'full',level:'edit',parentLevel:'edit',children:[]}]}];
      else if(pathname==='/api/documents/n1')body={body:'# 제품 경로 제목\n\n본문',hash:'h1'};
      else if(pathname==='/api/documents/n1/links')body={outgoing:[],backlinks:[]};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.goto(target,{waitUntil:'networkidle'});
    const button=page.getByRole('button',{name:/회의록\.md/});
    if(await button.count()===0)throw new Error(`built App did not expose document; errors=${errors.join('|')}; requests=${requests.join(',')}; html=${await page.locator('body').innerHTML()}`);
    await button.first().click(); await page.locator('.atomic-cm-editor').waitFor();
    assert.equal(await page.locator('.cm-atomic-h1').textContent(),'제품 경로 제목');
    assert(['light','dark'].includes(await page.locator('.atomic-cm-editor').getAttribute('data-editor-theme')));
    await page.screenshot({path:path.join(evidence,'green-editor-production-app.png'),fullPage:true}); await page.close();
    return {builtApp:true,documentOpened:true};
  } finally { child.kill(); }
}
async function zoom(){const out=[];for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'doculight-editor-zoom-')),ext=path.join(tmp,'ext');fs.mkdirSync(ext);fs.writeFileSync(path.join(ext,'manifest.json'),JSON.stringify({manifest_version:3,name:'zoom',version:'1',permissions:['tabs'],background:{service_worker:'sw.js'}}));fs.writeFileSync(path.join(ext,'sw.js'),'chrome.runtime.onInstalled.addListener(()=>{});');let c;try{c=await chromium.launchPersistentContext(path.join(tmp,'profile'),{headless:false,viewport:{width,height},args:[`--window-size=${width},${height}`,`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});if(!c.serviceWorkers().length)await c.waitForEvent('serviceworker');const w=c.serviceWorkers()[0],p=c.pages()[0]||await c.newPage();await p.goto(url,{waitUntil:'networkidle'});const before=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));const z=await w.evaluate(async target=>{const tab=(await chrome.tabs.query({})).find(x=>x.url===target);await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);},url);assert.equal(z,2);for(const theme of ['light','dark']){const metrics=await matrixCase(p,theme,path.join(evidence,`green-editor-${theme}-${width}x${height}-200.png`));const after=await p.evaluate(()=>({width:innerWidth,height:innerHeight}));assert(after.width<before.width);out.push({theme,width,height,zoom:z,before,after,metrics});}}finally{await c?.close();fs.rmSync(tmp,{recursive:true,force:true});}}return out;}
const productionOnly=process.argv.includes('--production-smoke');
(async()=>{if(productionOnly){const browser=await chromium.launch({headless:true});try{await productionSmoke(browser);console.log('PASS fresh-build production App smoke');}finally{await browser.close();}return;}const child=server();let browser;try{await wait();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720}});await dynamic(page);await page.close();const regularResults=await regular(browser);const production=await productionSmoke(browser);await browser.close();browser=null;const zoomResults=await zoom();fs.writeFileSync(path.join(evidence,'green-measurements.json'),JSON.stringify({regular:regularResults,production,zoom:zoomResults},null,2));console.log('PASS newspaper editor production App smoke, dynamic state, and 12 environments');}finally{await browser?.close();child.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
