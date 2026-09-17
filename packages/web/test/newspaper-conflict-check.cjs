const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const out = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue57');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3424/test/newspaper-conflict-fixture.html';
fs.mkdirSync(out, { recursive: true });
const server = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3424', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const waitServer = async () => { for (let i = 0; i < 80; i++) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw Error('server timeout'); };
const rgb = (value) => {
  const match = value.match(/rgba?\((?:[^ ]+\s+){2}[^ )]+|rgba?\(([^)]+)\)/);
  const parts = (match?.[1] ?? value.slice(value.indexOf('(') + 1, value.indexOf(')'))).split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error(`unsupported color ${value}`);
  return parts;
};
const luminance = (value) => rgb(value).map((part) => part / 255).map((part) => part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };

async function inspect(page, theme, label) {
  await page.goto(`${url}?state=conflict`, { waitUntil: 'networkidle' });
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  const alert = page.getByRole('alert');
  assert.equal(await alert.textContent(), '저장 중 원본이 바뀌어 병합이 필요합니다. 편집 내용은 유지됩니다.');
  const merge = page.getByRole('region', { name: '병합' });
  const metrics = await merge.evaluate((element) => {
    const viewport = element.querySelector('[data-merge-viewport]');
    const panes = [...element.querySelectorAll('.cm-mergeViewEditor')].map((pane) => pane.getBoundingClientRect());
    const warning = element.previousElementSibling.getBoundingClientRect();
    const warningStyle = getComputedStyle(element.previousElementSibling);
    const action = element.querySelector('button');
    return { paneWidths: panes.map((box) => box.width), editable: ['.cm-merge-a .cm-content', '.cm-merge-b .cm-content'].map((selector) => element.querySelector(selector)?.getAttribute('contenteditable')), overflowX: getComputedStyle(viewport).overflowX, scrollWidth: viewport.scrollWidth, clientWidth: viewport.clientWidth, warningHeight: warning.height, warningPadding: warningStyle.padding, warningBorder: warningStyle.borderTopWidth, warningColor: warningStyle.color, warningBackground: warningStyle.backgroundColor, warningBorderColor: warningStyle.borderTopColor, actionVariant: action?.dataset.variant, actionHeight: action?.getBoundingClientRect().height };
  });
  assert.deepEqual(metrics.editable, ['false', 'true']);
  assert(metrics.paneWidths.every((width) => width >= 240));
  assert.equal(metrics.overflowX, 'auto');
  assert.equal(metrics.warningPadding, '12px');
  assert(parseFloat(metrics.warningBorder) >= 0.75);
  assert.equal(metrics.actionVariant, 'primary');
  assert(metrics.actionHeight >= 36);
  assert(contrast(metrics.warningColor, metrics.warningBackground) >= 4.5);
  assert(contrast(metrics.warningBorderColor, metrics.warningBackground) >= 3);
  assert(await merge.getByText('오른쪽 내용을 확인한 뒤 저장하세요.').isVisible());
  await page.screenshot({ path: path.join(out, `green-conflict-state-${label}-${theme}.png`), fullPage: true });
  const right = merge.locator('.cm-merge-b .cm-content');
  await right.click(); await right.press('Control+End'); await right.pressSequentially('\n추가한 병합 줄');
  assert((await merge.getByLabel('내 편집 내용', { exact: true }).textContent()).endsWith('추가한 병합 줄'));
  await merge.getByRole('button', { name: '이 내용으로 저장' }).click();
  await page.waitForFunction(() => document.body.dataset.savedBody?.includes('추가한 병합 줄'));

  await page.goto(`${url}?state=rejected`, { waitUntil: 'networkidle' });
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  const rejected = page.getByRole('alert');
  assert((await rejected.textContent()).includes('저장하지 못했습니다. 편집 내용은 그대로 남아 있습니다. 본문을 내려받아 보관할 수 있습니다.'));
  const downloadButton = page.getByRole('button', { name: '편집 중인 본문 내려받기' });
  assert.equal(await downloadButton.textContent(), '내려받기');
  const rejectMetrics = await rejected.evaluate((element) => { const style = getComputedStyle(element); return { padding: style.padding, radius: style.borderRadius, shadow: style.boxShadow, color: style.color, background: style.backgroundColor, borderColor: style.borderTopColor, variant: element.querySelector('button')?.dataset.variant, height: element.querySelector('button')?.getBoundingClientRect().height }; });
  assert.equal(rejectMetrics.padding, '12px'); assert.equal(rejectMetrics.radius, '4px'); assert.equal(rejectMetrics.shadow, 'none'); assert.equal(rejectMetrics.variant, 'secondary'); assert(rejectMetrics.height >= 36);
  assert(contrast(rejectMetrics.color, rejectMetrics.background) >= 4.5); assert(contrast(rejectMetrics.borderColor, rejectMetrics.background) >= 3);
  await page.screenshot({ path: path.join(out, `green-rejected-state-${label}-${theme}.png`), fullPage: true });
  await page.getByRole('button', { name: '편집', exact: true }).click(); await page.getByRole('button', { name: '소스', exact: true }).click();
  const rescuedBody = '# 거부 뒤 최신 본문\n한글 😀\n후행 공백  \n'; await page.getByLabel('원문').fill(rescuedBody);
  const downloadPromise = page.waitForEvent('download'); await downloadButton.click(); const download = await downloadPromise; assert.equal(await fs.promises.readFile(await download.path(), 'utf8'), rescuedBody);

  await page.goto(`${url}?state=confirm`, { waitUntil: 'networkidle' });
  await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
  const dialog = page.getByRole('alertdialog', { name: '편집 중인 문서' });
  const cancel = dialog.getByRole('button', { name: '머무르기' }); const accept = dialog.getByRole('button', { name: '그래도 열기' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '머무르기');
  const dialogMetrics = await dialog.evaluate((element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); const buttons = [...element.querySelectorAll('button')]; const focused = document.activeElement; const focusStyle = getComputedStyle(focused); const focusBox = focused.getBoundingClientRect(); const extent = parseFloat(focusStyle.outlineWidth) + parseFloat(focusStyle.outlineOffset); return { width: box.width, left: box.left, right: box.right, top: box.top, bottom: box.bottom, radius: style.borderRadius, padding: style.padding, color: style.color, background: style.backgroundColor, variants: buttons.map((button) => button.dataset.variant), heights: buttons.map((button) => button.getBoundingClientRect().height), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, focus: { width: focusStyle.outlineWidth, color: focusStyle.outlineColor, left: focusBox.left - extent, right: focusBox.right + extent, top: focusBox.top - extent, bottom: focusBox.bottom + extent } }; });
  assert(dialogMetrics.width <= 560); assert(dialogMetrics.left >= 24); assert(dialogMetrics.right <= (await page.evaluate(() => innerWidth)) - 24 + 1); assert.equal(dialogMetrics.radius, '6px'); assert.equal(dialogMetrics.padding, '24px'); assert.deepEqual(dialogMetrics.variants, ['secondary', 'destructive']); assert(dialogMetrics.heights.every((height) => height >= 36));
  assert(contrast(dialogMetrics.color, dialogMetrics.background) >= 4.5); assert.equal(dialogMetrics.focus.width, '2px'); assert(contrast(dialogMetrics.focus.color, dialogMetrics.background) >= 3); assert(dialogMetrics.focus.left >= dialogMetrics.left && dialogMetrics.focus.right <= dialogMetrics.right && dialogMetrics.focus.top >= dialogMetrics.top && dialogMetrics.focus.bottom <= dialogMetrics.bottom);
  await page.screenshot({ path: path.join(out, `green-confirm-state-${label}-${theme}.png`), fullPage: true });
  await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '그래도 열기'); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.textContent), '머무르기'); await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => document.body.dataset.cancelled), '1'); assert.equal(await page.evaluate(() => document.body.dataset.accepted), undefined);
  await page.goto(`${url}?state=confirm`, { waitUntil: 'networkidle' }); const inertDialog = page.getByRole('alertdialog'); await page.mouse.click(2, 2); assert.equal(await page.evaluate(() => document.body.dataset.cancelled), undefined); assert.equal(await page.evaluate(() => document.body.dataset.accepted), undefined);
  const guardedAccept = inertDialog.getByRole('button', { name: '그래도 열기' }); await guardedAccept.focus(); await guardedAccept.dispatchEvent('compositionstart', { data: '한' }); await guardedAccept.dispatchEvent('compositionupdate', { data: '한글' }); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.body.dataset.accepted), undefined); await guardedAccept.dispatchEvent('compositionend', { data: '한글' }); await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.body.dataset.accepted), '1'); await page.keyboard.press('Enter'); await guardedAccept.click(); assert.equal(await page.evaluate(() => document.body.dataset.accepted), '1');
  await page.screenshot({ path: path.join(out, `green-conflict-${label}-${theme}.png`), fullPage: true });
  return { label, theme, metrics, rejectMetrics, dialogMetrics, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) };
}

async function regular(browser) { const all=[]; for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) { const context=await browser.newContext({viewport:{width,height}}); const page=await context.newPage(); for(const theme of ['light','dark']) all.push(await inspect(page,theme,`${width}x${height}-100`)); await context.close(); } return all; }
async function zoomed() { const all=[]; for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) { const temp=fs.mkdtempSync(path.join(os.tmpdir(),'conflict-zoom-')); const extension=path.join(temp,'ext'); fs.mkdirSync(extension); fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify({manifest_version:3,name:'zoom',version:'1',permissions:['tabs'],background:{service_worker:'sw.js'}})); fs.writeFileSync(path.join(extension,'sw.js'),'chrome.runtime.onInstalled.addListener(()=>{});'); let context; try { context=await chromium.launchPersistentContext(path.join(temp,'profile'),{headless:false,viewport:{width,height},args:[`--window-size=${width},${height}`,`--window-position=-32000,-32000`,`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]}); if(!context.serviceWorkers().length) await context.waitForEvent('serviceworker'); const worker=context.serviceWorkers()[0]; const page=context.pages()[0]||await context.newPage(); await page.goto(url,{waitUntil:'networkidle'}); const before=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})); const zoom=await worker.evaluate(async(target)=>{const tab=(await chrome.tabs.query({})).find((one)=>one.url===target); await chrome.tabs.setZoom(tab.id,2); return chrome.tabs.getZoom(tab.id);},url); assert.equal(zoom,2); for(const theme of ['light','dark']) all.push({...await inspect(page,theme,`${width}x${height}-200`),zoom,before}); } finally {await context?.close();fs.rmSync(temp,{recursive:true,force:true});} } return all; }
(async()=>{const child=server();let browser;try{await waitServer();browser=await chromium.launch({headless:true});const regularResults=await regular(browser);await browser.close();browser=undefined;const zoomResults=await zoomed();fs.writeFileSync(path.join(out,'green-conflict-measurements.json'),JSON.stringify({regular:regularResults,zoom:zoomResults},null,2));console.log('PASS newspaper conflict 12-environment checks');}finally{await browser?.close();child.kill();}})().catch((error)=>{console.error(error);process.exitCode=1;});
