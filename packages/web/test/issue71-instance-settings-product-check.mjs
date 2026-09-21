import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { login, loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.resolve(process.env.DOCULIGHT_ISSUE71_OUTPUT_DIR ?? path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue71/closure-remediation'));
fs.mkdirSync(output, { recursive: true });
const temporaryRoot = process.env.DOCULIGHT_ISSUE71_BROWSER_ROOT
  ? path.resolve(process.env.DOCULIGHT_ISSUE71_BROWSER_ROOT)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue71-browser-'));
fs.mkdirSync(temporaryRoot, { recursive: true });
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'Issue 71 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' },
}));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');

let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false,
    viewport: { width: 1280, height: 720 },
    colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const settingsRequests = [];
  const guardedRequests = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/settings' || pathname === '/api/settings/retention-impact') guardedRequests.push({ method: request.method(), pathname });
    if (pathname === '/api/settings') {
      settingsRequests.push({ method: request.method(), body: request.postDataJSON() });
    }
  });
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정' }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  const form = dialog.getByRole('form', { name: '인스턴스 설정' });
  await form.waitFor();
  assert.equal(await form.getByRole('combobox').count(), 1);
  assert.equal(await form.getByRole('textbox').count(), 4);
  assert.deepEqual(await form.locator('label').allTextContents(), ['가입 모드', '업로드 크기 제한', '보관 버전 개수', '휴지통 보존 일수', '감사 로그 보존 기간']);

  const signup = form.getByLabel('가입 모드');
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  const initialFlow = settingsRequests.map((request) => request.method);
  assert.deepEqual(initialFlow, ['GET', 'GET', 'PUT', 'GET']);
  assert.deepEqual(settingsRequests[2].body, { 'signup-mode': 'open' });
  assert.equal(await signup.inputValue(), 'open');

  let releasePreflight;
  const preflightGate = new Promise((resolve) => { releasePreflight = resolve; });
  let delayedPreflight = false;
  const pendingRoute = async (route) => {
    if (!delayedPreflight && route.request().method() === 'GET') {
      delayedPreflight = true;
      await preflightGate;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', pendingRoute);
  await signup.selectOption('invite-only');
  await form.getByRole('button', { name: '저장' }).click();
  await page.waitForTimeout(50);
  const pendingDisabledObserved=await signup.isDisabled();
  assert.equal(pendingDisabledObserved, true);
  releasePreflight();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  await page.unroute('**/api/settings', pendingRoute);

  let abortedPut = false;
  const uncertainRoute = async (route) => {
    if (!abortedPut && route.request().method() === 'PUT') {
      abortedPut = true;
      await route.abort('connectionfailed');
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', uncertainRoute);
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByRole('button', { name: '저장 상태 확인' }).waitFor();
  await page.unroute('**/api/settings', uncertainRoute);
  await form.getByRole('button', { name: '저장 상태 확인' }).click();
  await form.getByText('저장 여부를 확인했습니다. 다시 저장할 수 있습니다.').waitFor();
  await form.getByRole('button', { name: '되돌리기' }).click();

  const beforeBlocked = settingsRequests.length;
  const trash = form.getByLabel('휴지통 보존 일수');
  await trash.fill('7');
  await form.getByRole('button', { name: '저장' }).click();
  const retentionConfirmation = page.getByRole('alertdialog');
  await retentionConfirmation.waitFor();
  assert.equal(await retentionConfirmation.getByTestId('retention-impact-token').count(),0);
  assert.match(await retentionConfirmation.getByTestId('retention-impact-total').textContent(),/0/);
  assert.match(await retentionConfirmation.innerText(), /보존 기간 축소/);
  assert.equal(settingsRequests.length, beforeBlocked + 1);
  assert.equal(settingsRequests.at(-1).method, 'GET');
  assert.equal(await trash.inputValue(), '7');
  await retentionConfirmation.getByTestId('retention-impact-cancel').click();
  await form.getByRole('button', { name: '되돌리기' }).click();

  const upload = form.getByLabel('업로드 크기 제한');
  await upload.fill('104857601');
  await upload.focus();
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await upload.inputValue(), '104857601');
  assert.equal(await upload.evaluate((node) => document.activeElement === node), true);

  async function setZoom(value) {
    return worker.evaluate(async ({ target, value }) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
      if (!tab?.id) throw new Error('product tab missing');
      await chrome.tabs.setZoom(tab.id, value);
      return chrome.tabs.getZoom(tab.id);
    }, { target: page.url(), value });
  }

  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      const resetZoom = await setZoom(1);
      assert.equal(resetZoom, 1);
      await page.waitForTimeout(80);
      for (const zoom of [100, 200]) {
        const observedZoom = zoom === 100 ? await setZoom(1) : await setZoom(2);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(100);
        await form.getByRole('button', { name: '저장' }).scrollIntoViewIfNeeded();
        const metrics = await form.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          const action = node.querySelector('[data-instance-settings-action]').getBoundingClientRect();
          const controls = [...node.querySelectorAll('input, select, button')].map((item) => item.getBoundingClientRect().height);
          const note = node.querySelector('[data-instance-retention-note]').getBoundingClientRect();
          return {
            viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
            form: { width: rect.width, right: rect.right },
            action: { top: action.top, bottom: action.bottom },
            controls,
            note: { height: note.height, scrollWidth: node.querySelector('[data-instance-retention-note]').scrollWidth, clientWidth: node.querySelector('[data-instance-retention-note]').clientWidth },
            fieldGap: getComputedStyle(node.querySelector('[data-instance-settings-fields]')).rowGap,
          };
        });
        assert(metrics.form.width <= 640.5);
        assert(metrics.controls.every((heightValue) => heightValue >= 36));
        assert(metrics.action.bottom <= metrics.viewport.height + 1);
        assert(metrics.note.scrollWidth <= metrics.note.clientWidth + 1);
        assert.equal(metrics.fieldGap, '32px');
        const file = `instance-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, file), fullPage: true });
        environments.push({ theme, width, height, zoom, observedZoom, resetZoom, metrics, screenshot: file });
      }
    }
  }
  assert.equal(environments.length, 12);
  assert.equal(await upload.inputValue(), '104857601');
  await setZoom(1);
  assert.equal(await setZoom(1), 1);
  await form.getByRole('button', { name: '되돌리기' }).click();

  await upload.fill('-');
  await upload.blur();
  await form.locator('[data-instance-setting-error]').waitFor();
  assert.equal(await upload.getAttribute('aria-invalid'), 'true');
  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const theme of ['light', 'dark']) for (const zoom of [100, 200]) {
    await page.emulateMedia({ forcedColors: 'active', colorScheme: theme });
    const observedZoom = await setZoom(zoom / 100);
    assert.equal(observedZoom, zoom / 100);
    await page.waitForTimeout(80);
    const file = `instance-forced-colors-${theme}-${zoom}.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: true });
    const state = await form.evaluate((node) => ({
      forced: matchMedia('(forced-colors: active)').matches,
      invalidStyle: getComputedStyle(node.querySelector('input')).borderStyle,
      actionVisible: node.querySelector('[data-instance-settings-action]').getBoundingClientRect().bottom <= innerHeight + 1,
    }));
    assert(state.forced && state.actionVisible);
    assert.notEqual(state.invalidStyle, 'none');
    forcedColors.push({ theme, zoom, observedZoom, state, screenshot: file });
  }
  await page.emulateMedia({ forcedColors: 'none' });
  await setZoom(1);
  await form.getByRole('button', { name: '되돌리기' }).click();

  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  let failedLoad = false;
  const loadErrorRoute = async (route) => {
    if (!failedLoad && route.request().method() === 'GET') {
      failedLoad = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', loadErrorRoute);
  await page.getByRole('button', { name: '설정' }).click();
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  await dialog.getByRole('alert').filter({ hasText: '설정을 불러오지 못했습니다.' }).waitFor();
  assert.equal(await form.count(), 0);
  await page.unroute('**/api/settings', loadErrorRoute);
  await dialog.getByRole('button', { name: '다시 불러오기' }).click();
  await form.waitFor();

  const roleLossRoute = async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/settings', roleLossRoute);
  await signup.selectOption('open');
  await form.getByRole('button', { name: '저장' }).click();
  await dialog.getByRole('alert').filter({ hasText: '편집을 중단했습니다.' }).waitFor();
  assert.equal(await form.count(), 0);
  await page.unroute('**/api/settings', roleLossRoute);
  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByRole('button', { name: '설정' }).click();
  await dialog.getByRole('tab', { name: '인스턴스 설정' }).click();
  await form.waitFor();

  await signup.selectOption('approval');
  await form.getByRole('button', { name: '저장' }).click();
  await form.getByText('설정을 저장했습니다.', { exact: true }).waitFor();
  assert.equal(await signup.inputValue(), 'approval');

  await form.evaluate((node)=>{globalThis.__issue71MountedSettings=node;});
  let acceptedPutSeen=false, failedAcceptedReadback=false;
  const acceptedReadbackRoute=async(route)=>{
    if(route.request().method()==='PUT'){acceptedPutSeen=true;await route.fallback();return;}
    if(route.request().method()==='GET'&&acceptedPutSeen&&!failedAcceptedReadback){failedAcceptedReadback=true;await route.abort('failed');return;}
    await route.fallback();
  };
  await page.route('**/api/settings',acceptedReadbackRoute);
  await signup.selectOption('open'); const acceptedPutBefore=settingsRequests.filter((request)=>request.method==='PUT').length; const acceptedGetBefore=settingsRequests.filter((request)=>request.method==='GET').length;
  await form.getByRole('button',{name:'저장'}).click(); const readbackRetry=form.getByTestId('retention-impact-readback-retry'); await readbackRetry.waitFor();
  const draftDuringReadback=await signup.inputValue(); const sameMountedDuringFailure=await form.evaluate((node)=>node===globalThis.__issue71MountedSettings); const retryPutBefore=settingsRequests.filter((request)=>request.method==='PUT').length; const retryGetBefore=settingsRequests.filter((request)=>request.method==='GET').length;
  await readbackRetry.focus(); await readbackRetry.press('Enter'); await form.getByText('설정을 저장했습니다.',{exact:true}).waitFor(); await page.unroute('**/api/settings',acceptedReadbackRoute);
  const acceptedReadbackObservation={acceptedPutDelta:settingsRequests.filter((request)=>request.method==='PUT').length-acceptedPutBefore,acceptedGetDelta:settingsRequests.filter((request)=>request.method==='GET').length-acceptedGetBefore,retryPutDelta:settingsRequests.filter((request)=>request.method==='PUT').length-retryPutBefore,retryGetDelta:settingsRequests.filter((request)=>request.method==='GET').length-retryGetBefore,draftDuringReadback,sameMountedDuringFailure,sameMountedAfterRetry:await form.evaluate((node)=>node===globalThis.__issue71MountedSettings),readbackValue:await signup.inputValue()};
  assert.deepEqual({put:acceptedReadbackObservation.acceptedPutDelta,retryPut:acceptedReadbackObservation.retryPutDelta,retryGet:acceptedReadbackObservation.retryGetDelta,draft:acceptedReadbackObservation.draftDuringReadback,sameFailure:acceptedReadbackObservation.sameMountedDuringFailure,sameAfter:acceptedReadbackObservation.sameMountedAfterRetry},{put:1,retryPut:0,retryGet:1,draft:'open',sameFailure:true,sameAfter:true});
  await signup.selectOption('approval'); await form.getByRole('button',{name:'저장'}).click(); await form.getByText('설정을 저장했습니다.',{exact:true}).waitFor();

  const roleObservations = [];
  const fieldObservations = [];
  const authoritativeBefore = await page.evaluate(async () => (await fetch('/api/settings')).json());
  const roleFixtures = [
    { role: 'superuser', name: process.env.DOCULIGHT_E2E_USER, password: process.env.DOCULIGHT_E2E_PASS, privileged: true },
    { role: 'ordinary', name: process.env.DOCULIGHT_E2E_ORDINARY, password: process.env.DOCULIGHT_E2E_ORDINARY_PASS, privileged: false },
    { role: 'workspace-admin', name: process.env.DOCULIGHT_E2E_MANAGER, password: process.env.DOCULIGHT_E2E_MANAGER_PASS, privileged: false },
  ];
  const roleContexts = [];
  for (const fixture of roleFixtures) {
    const roleContext = fixture.role === 'superuser' ? context : await chromium.launchPersistentContext(path.join(temporaryRoot, `profile-${fixture.role}`), {
      headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light',
      args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    if (fixture.role !== 'superuser') roleContexts.push(roleContext);
    if (roleContext.serviceWorkers().length === 0) await roleContext.waitForEvent('serviceworker');
    const roleWorker = roleContext.serviceWorkers()[0];
    const rolePage = fixture.role === 'superuser' ? page : (roleContext.pages()[0] ?? await roleContext.newPage());
    if (fixture.role !== 'superuser') { await loginAs(rolePage, fixture.name, fixture.password); await rolePage.goto(WEB_URL, { waitUntil: 'networkidle' }); }
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) for (const theme of ['light', 'dark']) for (const zoom of [100, 200]) {
      await rolePage.setViewportSize({ width, height });
      await rolePage.emulateMedia({ colorScheme: theme, forcedColors: 'none' });
      await roleWorker.evaluate(async ({ target, value }) => { const tab=(await chrome.tabs.query({})).find((one)=>one.url===target); await chrome.tabs.setZoom(tab.id,value); }, { target: rolePage.url(), value: zoom / 100 });
      const observedZoom = await roleWorker.evaluate(async (target) => { const tab=(await chrome.tabs.query({})).find((one)=>one.url===target); return chrome.tabs.getZoom(tab.id); }, rolePage.url());
      assert.equal(observedZoom, zoom / 100);
      if (fixture.role !== 'superuser') await rolePage.getByRole('button', { name: '설정' }).click();
      const roleDialog = rolePage.getByRole('dialog', { name: '설정' });
      const instanceTabCount = await roleDialog.getByRole('tab', { name: '인스턴스 설정' }).count();
      const direct = await rolePage.evaluate(async () => ({
        get: (await fetch('/api/settings')).status,
        put: (await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ 'signup-mode': 'approval' }) })).status,
      }));
      if (fixture.privileged) assert.equal(instanceTabCount, 1); else { assert.equal(instanceTabCount, 0); assert.equal(direct.get, 403); assert.equal(direct.put, 403); }
      roleObservations.push({ role: fixture.role, width, height, theme, zoom, observedZoom, instanceTabCount, direct });
      if (fixture.privileged) {
        for (const label of ['가입 모드', '업로드 크기 제한', '보관 버전 개수', '휴지통 보존 일수', '감사 로그 보존 기간']) {
          const control = form.getByLabel(label); await control.hover(); await control.focus();
          const row = await control.evaluate((node) => {
            const rect=node.getBoundingClientRect(), style=getComputedStyle(node), field=node.closest('[data-instance-setting-field]'), labelNode=field.querySelector('label'), helpNode=field.querySelector('[data-instance-setting-help]'), errorNode=field.querySelector('[data-instance-setting-error]'), action=node.closest('form').querySelector('[data-instance-settings-action] button[type=submit]'), described=node.getAttribute('aria-describedby')?.split(' ').map((id)=>document.getElementById(id)?.textContent).filter(Boolean) ?? [];
            const rgb=(value)=>{const match=value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);return match?.slice(1,4).map(Number)??[0,0,0];};
            const lum=(value)=>rgb(value).map((part)=>part/255).map((part)=>part<=.04045?part/12.92:((part+.055)/1.055)**2.4).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0);
            const ratio=(a,b)=>{const values=[lum(a),lum(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
            const compositedBackground=(element)=>{let current=element;while(current){const color=getComputedStyle(current).backgroundColor;if(!/rgba\([^)]*,\s*0\)/.test(color)&&color!=='transparent')return color;current=current.parentElement;}return 'rgb(255, 255, 255)';};
            const background=compositedBackground(node), labelBackground=compositedBackground(labelNode), helpBackground=compositedBackground(helpNode), errorBackground=errorNode?compositedBackground(errorNode):null, buttonBackground=compositedBackground(action);
            const labelStyle=getComputedStyle(labelNode), helpStyle=getComputedStyle(helpNode), errorStyle=errorNode?getComputedStyle(errorNode):null, actionStyle=getComputedStyle(action), fieldRect=field.getBoundingClientRect();
            return { accessibleLabel:labelNode.textContent, value: node.value, tag: node.tagName, help: described.join(' '), unit:helpNode.textContent, error:errorNode?.textContent??null, geometry: { left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,height:rect.height }, fieldGeometry:{left:fieldRect.left,right:fieldRect.right,top:fieldRect.top,bottom:fieldRect.bottom}, color:style.color, background, labelBackground, helpBackground, errorBackground, buttonBackground, contrastRatio:ratio(style.color,background), labelContrast:ratio(labelStyle.color,labelBackground), helpContrast:ratio(helpStyle.color,helpBackground), errorContrast:errorStyle?ratio(errorStyle.color,errorBackground):null, borderContrast:ratio(style.borderColor,background), focusContrast:ratio(style.outlineColor,background), buttonContrast:ratio(actionStyle.color,buttonBackground), focusOutlineWidth:style.outlineWidth, focusOutlineOffset:style.outlineOffset, clipped:rect.left<fieldRect.left||rect.right>fieldRect.right, adjacentSeparation:Math.min(rect.left-fieldRect.left,fieldRect.right-rect.right), buttonDisabled:action.disabled, dpr:devicePixelRatio, hoverObserved:node.matches(':hover') };
          });
          assert(row.help.length > 0, JSON.stringify({ label, row, check:'help' }));
          assert(row.geometry.height >= 36, JSON.stringify({ label, row, check:'target-height' }));
          assert(row.contrastRatio >= 4.5, JSON.stringify({ label, row, check:'composited-contrast' }));
          assert(row.labelContrast >= 4.5 && row.helpContrast >= 4.5 && row.borderContrast >= 3 && row.focusContrast >= 3 && row.buttonContrast >= 4.5, JSON.stringify({label,row,check:'linked-contrast'}));
          assert(!row.clipped && row.adjacentSeparation >= 0, JSON.stringify({label,row,check:'clipping-separation'}));
          assert(parseFloat(row.focusOutlineWidth)+parseFloat(row.focusOutlineOffset)>=2, JSON.stringify({label,row,check:'focus-separation'}));
          const selection = await control.evaluate((node) => { if (node instanceof HTMLInputElement) { node.setSelectionRange(0, node.value.length); return { start:node.selectionStart,end:node.selectionEnd }; } return null; });
          fieldObservations.push({ width, height, theme, zoom, label, unit: row.help, keyboardFocus: true, textSelection: selection, ...row });
        }
        const signupControl=form.getByLabel('가입 모드');
        const originalSignup=await signupControl.inputValue(); await signupControl.focus(); await signupControl.press('ArrowDown'); const arrowValue=await signupControl.inputValue(); const arrowChanged=arrowValue!==originalSignup;
        const forwardOrder=[]; await signupControl.focus(); for(let index=0;index<6;index+=1){forwardOrder.push(await page.evaluate(()=>document.activeElement?.getAttribute('id')||document.activeElement?.textContent?.trim()));await page.keyboard.press('Tab');} forwardOrder.push(await page.evaluate(()=>document.activeElement?.getAttribute('id')||document.activeElement?.textContent?.trim()));
        const saveAction=form.getByRole('button',{name:'저장'}); await saveAction.focus(); const reverseOrder=[]; for(let index=0;index<6;index+=1){reverseOrder.push(await page.evaluate(()=>document.activeElement?.getAttribute('id')||document.activeElement?.textContent?.trim()));await page.keyboard.press('Shift+Tab');} reverseOrder.push(await page.evaluate(()=>document.activeElement?.getAttribute('id')||document.activeElement?.textContent?.trim()));
        assert(arrowChanged); assert.equal(forwardOrder.filter(Boolean).length,7); assert.equal(reverseOrder.filter(Boolean).length,7); await signupControl.selectOption(originalSignup);
        roleObservations.at(-1).keyboardTraversal={ arrowValue, selectedValueObserved:arrowValue, forwardOrder, reverseOrder };
      }
      if (fixture.role !== 'superuser') await roleDialog.getByRole('button', { name: '설정 닫기' }).click();
    }
    await roleWorker.evaluate(async (target) => { const tab=(await chrome.tabs.query({})).find((one)=>one.url===target); await chrome.tabs.setZoom(tab.id,1); }, rolePage.url());
    assert.equal(await roleWorker.evaluate(async (target) => { const tab=(await chrome.tabs.query({})).find((one)=>one.url===target); return chrome.tabs.getZoom(tab.id); }, rolePage.url()), 1);
  }
  assert.equal(roleObservations.length, 36);
  assert.equal(fieldObservations.length, 60);
  const authoritativeAfter = await page.evaluate(async () => (await fetch('/api/settings')).json());
  assert.deepEqual(authoritativeAfter, authoritativeBefore);

  const errorObservations=[];
  for(const label of ['업로드 크기 제한','보관 버전 개수','휴지통 보존 일수','감사 로그 보존 기간']){
    const control=form.getByLabel(label);const baseline=await control.inputValue();await control.fill('-');await control.blur();const field=control.locator('..');const error=field.locator('[data-instance-setting-error]');await error.waitFor();const measured=await error.evaluate((node)=>{const compositedBackground=(element)=>{let current=element;while(current){const color=getComputedStyle(current).backgroundColor;if(!/rgba\([^)]*,\s*0\)/.test(color)&&color!=='transparent')return color;current=current.parentElement;}return 'rgb(255, 255, 255)';};const rgb=(value)=>value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/).slice(1,4).map(Number),lum=(value)=>rgb(value).map((part)=>part/255).map((part)=>part<=.04045?part/12.92:((part+.055)/1.055)**2.4).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0),style=getComputedStyle(node),errorBackground=compositedBackground(node),values=[lum(style.color),lum(errorBackground)].sort((a,b)=>b-a);return {text:node.textContent,color:style.color,errorBackground,contrastRatio:(values[0]+.05)/(values[1]+.05)};});assert(measured.contrastRatio>=4.5);errorObservations.push({kind:'numeric',label,...measured});await control.fill(baseline);
  }
  const crossTrash=form.getByLabel('휴지통 보존 일수'),crossAudit=form.getByLabel('감사 로그 보존 기간'),crossTrashBaseline=await crossTrash.inputValue(),crossAuditBaseline=await crossAudit.inputValue();await crossTrash.fill(String(Number(crossAuditBaseline)+1));await form.getByRole('button',{name:'저장'}).click();const crossError=form.locator('[data-instance-setting-error]').filter({hasText:'감사 로그'});await crossError.waitFor();const crossMeasured=await crossError.evaluate((node)=>{const compositedBackground=(element)=>{let current=element;while(current){const color=getComputedStyle(current).backgroundColor;if(!/rgba\([^)]*,\s*0\)/.test(color)&&color!=='transparent')return color;current=current.parentElement;}return 'rgb(255, 255, 255)';},rgb=(value)=>value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/).slice(1,4).map(Number),lum=(value)=>rgb(value).map((part)=>part/255).map((part)=>part<=.04045?part/12.92:((part+.055)/1.055)**2.4).reduce((sum,part,index)=>sum+part*[.2126,.7152,.0722][index],0),style=getComputedStyle(node),errorBackground=compositedBackground(node),values=[lum(style.color),lum(errorBackground)].sort((a,b)=>b-a);return {text:node.textContent,color:style.color,errorBackground,contrastRatio:(values[0]+.05)/(values[1]+.05)};});assert(crossMeasured.contrastRatio>=4.5);errorObservations.push({kind:'cross-field',label:'감사 로그 보존 기간',...crossMeasured});await crossTrash.fill(crossTrashBaseline);await crossAudit.fill(crossAuditBaseline);
  const compositionObservations = [];
  const compositionEnvironments = [[1280,720,'light',100],[1280,720,'dark',200],[1440,900,'dark',100],[1920,1080,'light',200]];
  for (const [width,height,theme,zoom] of compositionEnvironments) {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ colorScheme: theme }); assert.equal(await setZoom(zoom / 100), zoom / 100);
    for (const label of ['업로드 크기 제한', '보관 버전 개수', '휴지통 보존 일수', '감사 로그 보존 기간']) {
      const control = form.getByLabel(label); const guardedTraffic=()=>guardedRequests.filter((request)=>(request.pathname==='/api/settings'&&request.method==='PUT')||(request.pathname==='/api/settings/retention-impact'&&request.method==='POST')).length; const trafficBeforeComposition=guardedTraffic();
      const baselineValue = await control.inputValue();
      const outcome = await control.evaluate((node) => {
        node.focus();
        node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ㅎ'}));
        node.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'한'}));
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'한');
        node.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,data:'한',inputType:'insertCompositionText',isComposing:true}));
        const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true});
        const dispatched=node.dispatchEvent(event);
        node.blur();
        const activeBlur={value:node.value,invalid:node.getAttribute('aria-invalid'),focused:document.activeElement===node};
        node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));
        return { defaultPrevented:event.defaultPrevented, dispatched, focused:document.activeElement===node, value:node.value, isTrusted:event.isTrusted, activeBlur };
      });
      await control.focus();
      await control.blur();
      await control.waitFor();
      assert.equal(await control.getAttribute('aria-invalid'),'true');
      const trafficAfterValidation=guardedTraffic(); assert.equal(trafficAfterValidation-trafficBeforeComposition,0);
      const validValue=String(Number(baselineValue)+1);
      await control.fill(validValue);
      const putBefore=settingsRequests.filter((request)=>request.method==='PUT').length;
      const save=form.getByRole('button',{name:'저장'}); await save.focus(); await save.press('Enter');
      await form.getByText('설정을 저장했습니다.',{exact:true}).waitFor();
      const putAfter=settingsRequests.filter((request)=>request.method==='PUT').length;
      assert.equal(putAfter-putBefore,1);
      assert(outcome.defaultPrevented);
      compositionObservations.push({ surface:'base-field', width,height,theme,zoom,label,baselineValue,invalidValue:'한',correctedValue:validValue,...outcome,postEndInvalid:true,putOrPreviewDelta:trafficAfterValidation-trafficBeforeComposition,putDelta:putAfter-putBefore,deliberatePostCompositionAction:{kind:'keyboard-save',key:'Enter',observedPut:putAfter-putBefore,readback:validValue} });
    }
    const trashControl=form.getByLabel('휴지통 보존 일수'), auditControl=form.getByLabel('감사 로그 보존 기간');
    const retentionBaseline={trash:await trashControl.inputValue(),audit:await auditControl.inputValue()};
    await trashControl.fill('0.000001');
    await auditControl.fill('0.000001');
    await form.getByRole('button',{name:'저장'}).click();
    const retention=page.getByRole('alertdialog'); await retention.waitFor();
    assert.equal(await retention.getByTestId('retention-impact-token').count(),1);
    const token=retention.getByTestId('retention-impact-token'); const beforeRetention=guardedRequests.length;
    const retentionOutcome=await token.evaluate((node)=>{node.focus();node.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ㅎ'}));node.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'한'}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,'한');node.dispatchEvent(new InputEvent('input',{bubbles:true,cancelable:true,data:'한',inputType:'insertCompositionText',isComposing:true}));const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true});node.dispatchEvent(event);node.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));return {defaultPrevented:event.defaultPrevented,focused:document.activeElement===node,value:node.value,isTrusted:event.isTrusted};});
    assert(retentionOutcome.defaultPrevented && retentionOutcome.focused); assert.equal(guardedRequests.length,beforeRetention);
    const tokenLabel=await token.getAttribute('aria-label'); const authoritativeToken=tokenLabel.match(/^영향 건수 (.+) 입력$/)?.[1]; assert(authoritativeToken);
    await token.fill(authoritativeToken); const retentionPutBefore=settingsRequests.filter((request)=>request.method==='PUT').length; const retentionGetBefore=settingsRequests.filter((request)=>request.method==='GET').length;
    const retentionConfirm=retention.getByTestId('retention-impact-confirm'); assert.equal(await retentionConfirm.isEnabled(),true); await retentionConfirm.focus(); await retentionConfirm.press('Enter'); await retention.waitFor({state:'detached'});
    const retentionPutAfter=settingsRequests.filter((request)=>request.method==='PUT').length; const retentionGetAfter=settingsRequests.filter((request)=>request.method==='GET').length;
    assert.equal(retentionPutAfter-retentionPutBefore,1); assert(retentionGetAfter-retentionGetBefore>=1); assert.equal(await trashControl.inputValue(),'0.000001');
    compositionObservations.push({surface:'issue87-L3',width,height,theme,zoom,...retentionOutcome,putOrPreviewDelta:0,tokenMatched:true,tokenLength:authoritativeToken.length,deliberatePostCompositionAction:{kind:'keyboard-confirm',putDelta:retentionPutAfter-retentionPutBefore,readbackDelta:retentionGetAfter-retentionGetBefore,readbackValue:await trashControl.inputValue()}});
    await trashControl.fill(retentionBaseline.trash); await auditControl.fill(retentionBaseline.audit); const restoreSave=form.getByRole('button',{name:'저장'}); await restoreSave.focus(); await restoreSave.press('Enter'); await form.getByText('설정을 저장했습니다.',{exact:true}).waitFor();
    const leaveFieldForComposition=form.getByLabel('업로드 크기 제한'); const leaveDraftValue=String(Number(await leaveFieldForComposition.inputValue())+1); await leaveFieldForComposition.fill(leaveDraftValue); await leaveFieldForComposition.focus(); await dialog.getByRole('tab',{name:'에디터'}).click();
    const leave=page.getByRole('alertdialog'); await leave.waitFor(); const discard=leave.getByRole('button',{name:'변경 버리고 나가기'}); await discard.focus(); const beforeLeave=guardedRequests.length;
    const leaveOutcome=await discard.evaluate((node)=>{const root=node.closest('[role=alertdialog]');root.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'ㅎ'}));const event=new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true,isComposing:true});node.dispatchEvent(event);root.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));return {defaultPrevented:event.defaultPrevented,focused:document.activeElement===node,isTrusted:event.isTrusted};});
    assert(leaveOutcome.defaultPrevented); assert.equal(guardedRequests.length,beforeLeave);
    await leave.getByRole('button',{name:'계속 편집'}).click(); const retainedDraft=await leaveFieldForComposition.inputValue(); const retainedFocus=await leaveFieldForComposition.evaluate((node)=>document.activeElement===node); assert.equal(retainedDraft,leaveDraftValue); assert.equal(retainedFocus,true);
    await dialog.getByRole('tab',{name:'에디터'}).click(); const deliberateLeave=page.getByRole('alertdialog'); await deliberateLeave.waitFor(); await deliberateLeave.getByRole('button',{name:'변경 버리고 나가기'}).click(); await dialog.getByRole('tab',{name:'인스턴스 설정'}).click(); await form.waitFor();
    compositionObservations.push({surface:'issue88-leave',width,height,theme,zoom,...leaveOutcome,putOrPreviewDelta:0,retainedDraft,retainedFocus,deliberatePostCompositionAction:{kind:'discard-category-leave',destinationObserved:await dialog.getByRole('tab',{name:'인스턴스 설정'}).getAttribute('aria-selected')}});
  }
  assert.equal(compositionObservations.length,24);
  const leaveRouteObservations=[];
  const invokeLeaveRoute=async(route)=>{
    if(route==='category') await dialog.getByRole('tab',{name:'에디터'}).click();
    else if(route==='header-close') await dialog.getByRole('button',{name:'설정 닫기'}).click();
    else if(route==='escape') await page.keyboard.press('Escape');
    else await page.mouse.click(2,2);
  };
  for(const route of ['category','header-close','escape','outside-click']){
    if(await dialog.count()===0||!await dialog.isVisible()){await page.getByRole('button',{name:'설정'}).click();}
    if(await form.count()===0||!await form.isVisible()){await dialog.getByRole('tab',{name:'인스턴스 설정'}).click();await form.waitFor();}
    const leaveField=form.getByLabel('업로드 크기 제한'); const exactDraft=`1048576${route.length}`; await leaveField.fill(exactDraft); await leaveField.focus(); const putBefore=settingsRequests.filter((request)=>request.method==='PUT').length;
    await invokeLeaveRoute(route); const warning=page.getByRole('alertdialog'); await warning.waitFor(); await warning.getByRole('button',{name:'계속 편집'}).click(); await page.waitForTimeout(50);
    const retainedDraft=await leaveField.inputValue(); const retainedFocus=await leaveField.evaluate((node)=>document.activeElement===node); assert.equal(retainedDraft,exactDraft); assert.equal(retainedFocus,true,route); assert.equal(settingsRequests.filter((request)=>request.method==='PUT').length,putBefore);
    await invokeLeaveRoute(route); const followup=page.getByRole('alertdialog'); await followup.waitFor(); await followup.getByRole('button',{name:'변경 버리고 나가기'}).click();
    const destinationObserved=route==='category'?await dialog.getByRole('tab',{name:'에디터'}).getAttribute('aria-selected'):!await dialog.isVisible(); assert(destinationObserved==='true'||destinationObserved===true); assert.equal(settingsRequests.filter((request)=>request.method==='PUT').length,putBefore);
    leaveRouteObservations.push({route,exactDraft,retainedDraft,retainedFocus,putDelta:0,followup:'discard',destinationObserved});
  }
  const readonlyCount=await form.locator('input[readonly],select[readonly]').count(); const emptySuccessCount=await form.locator('[data-empty]').count();
  const stateApplicability = [
    { state:'default', applicable:fieldObservations.length===60, evidence:{observedRows:fieldObservations.length} },
    { state:'hover', applicable:fieldObservations.every((row)=>row.hoverObserved), evidence:{hoverRows:fieldObservations.filter((row)=>row.hoverObserved).length} },
    { state:'focus', applicable:fieldObservations.every((row)=>parseFloat(row.focusOutlineWidth)>0&&row.focusContrast>=3), evidence:{measuredRows:fieldObservations.length} },
    { state:'selected', applicable:roleObservations.filter((row)=>row.role==='superuser').every((row)=>row.keyboardTraversal?.selectedValueObserved===row.keyboardTraversal?.arrowValue), evidence:{keyboardRows:roleObservations.filter((row)=>row.keyboardTraversal).length} },
    { state:'disabled', applicable:pendingDisabledObserved, evidence:{pendingDisabledObserved} },
    { state:'readonly', applicable:readonlyCount>0, reason:readonlyCount===0?'no readonly state in the five-field contract':undefined, evidence:{readonlyCount} },
    { state:'invalid', applicable:compositionObservations.filter((row)=>row.surface==='base-field').every((row)=>row.postEndInvalid), evidence:{invalidRows:compositionObservations.filter((row)=>row.postEndInvalid).length} },
    { state:'loading', applicable:delayedPreflight, evidence:{delayedPreflight} },
    { state:'empty', applicable:emptySuccessCount>0, reason:emptySuccessCount===0?'empty numeric input is invalid, not successful-empty':undefined, evidence:{emptySuccessCount} },
    { state:'error', applicable:failedLoad&&abortedPut, evidence:{failedLoad,abortedPut} },
  ];
  const combinedSmoke = {
    issue87Retention: compositionObservations.filter((row)=>row.surface==='issue87-L3'),
    issue88Leave: leaveRouteObservations,
    acceptedReadback: acceptedReadbackObservation,
  };
  const nativeImeLimitations = 'Native Windows IME candidate window, physical keyboard commit path, password-manager UI, and OS dialogs were not performed. This is nonblocking synthetic composition evidence only.';
  for (const roleContext of roleContexts) await roleContext.close();

  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'isolated Playwright-owned persistent Chromium with extension chrome.tabs.setZoom/getZoom',
    actualAppShell: true,
    actualSettingsApi: true,
    stateChecks: ['pending-lock', 'transport-uncertain-reconciliation', 'load-error-retry', 'role-loss-stop', 'invalid', 'retention-blocked'],
    environments,
    forcedColors,
    requestMethods: settingsRequests.map((request) => request.method),
    roleObservations, fieldObservations, errorObservations, stateApplicability, compositionObservations, leaveRouteObservations, combinedSmoke, nativeImeLimitations,
  }, null, 2));
  console.log('PASS issue71 actual AppShell/settings API and 12-environment browser matrix');
} finally {
  await context?.close();
}
