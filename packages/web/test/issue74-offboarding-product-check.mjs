import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue74/browser-matrix');
fs.mkdirSync(output, { recursive: true });
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const targetName = required('DOCULIGHT_E2E_MANAGER');
const targetId = required('DOCULIGHT_E2E_TARGET_ID');
const superuserId = required('DOCULIGHT_E2E_SUPERUSER_ID');
const viewerName = required('DOCULIGHT_E2E_VIEWER');
const viewerPassword = required('DOCULIGHT_E2E_VIEWER_PASS');
const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue74-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 74 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
let context;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, { target: page.url(), value });

  await loginAs(page, viewerName, viewerPassword);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const offboardingRequests = [];
  page.on('request', (request) => { if (request.url().includes('/offboarding')) offboardingRequests.push(request.url()); });
  const forbidden = await page.evaluate(async (id) => (await fetch(`/api/principals/${encodeURIComponent(id)}/offboarding`)).status, targetId);
  assert.equal(forbidden, 404);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const managerDialog = page.getByRole('dialog', { name: '설정' });
  await managerDialog.getByRole('tab', { name: '권한 감사', exact: true }).click();
  assert.equal(await managerDialog.getByRole('button', { name: '오프보딩 열기' }).count(), 0);
  assert.equal(offboardingRequests.length, 1, 'workspace admin UI must not issue an offboarding GET');
  await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });

  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.getByRole('tab', { name: '사용자 관리', exact: true }).click();
  const targetRow = dialog.getByRole('row').filter({ hasText: targetName });
  const entry = targetRow.getByRole('button', { name: '오프보딩 열기' });
  await entry.focus();
  await entry.press('Enter');
  const surface = dialog.locator('[data-offboarding-surface]');
  const heading = surface.getByRole('heading', { name: `${targetName} 오프보딩` });
  await heading.waitFor();
  assert.equal(await heading.evaluate((node) => node === document.activeElement), true);
  assert.equal(await surface.getByTestId('offboarding-step').count(), 4);
  assert.deepEqual(await surface.getByTestId('offboarding-step').evaluateAll((rows) => rows.map((row) => row.dataset.step)), ['suspend', 'tokens', 'memberships', 'acl']);
  assert.equal(await surface.getByText('활성 계정 · 비활성화 필요', { exact: true }).count(), 1);

  const suspend = surface.getByRole('button', { name: '계정 비활성화' });
  await page.route(`**/api/principals/${targetId}/offboarding`, async (route) => { await new Promise((resolve) => setTimeout(resolve, 250)); await route.continue(); }, { times: 1 });
  await suspend.click();
  await page.waitForFunction(() => document.querySelector("[data-step='suspend'] button")?.disabled === true);
  const pendingStyles = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const measured = await surface.locator("[data-step='suspend'] button").evaluate((node) => { const style = getComputedStyle(node); return { disabled: node.disabled, opacity: Number(style.opacity), color: style.color, background: style.backgroundColor }; });
    measured.ratio = contrast(measured.color, measured.background);
    assert(measured.disabled && measured.opacity >= .5 && measured.ratio >= 3, JSON.stringify(measured));
    pendingStyles.push({ theme, measured });
  }
  const gate = page.getByRole('alertdialog');
  await gate.waitFor();
  assert.equal(await gate.getAttribute('data-grade'), 'L2');
  const cancel = gate.getByRole('button', { name: '취소' });
  assert.equal(await cancel.evaluate((node) => node === document.activeElement), true);
  await cancel.press('Escape');
  await gate.waitFor({ state: 'detached' });
  assert.equal(await suspend.evaluate((node) => node === document.activeElement), true);
  const hoverStyles = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await suspend.hover();
    const measured = await suspend.evaluate((node) => { const style = getComputedStyle(node); return { color: style.color, background: style.backgroundColor }; });
    measured.ratio = contrast(measured.color, measured.background);
    assert(measured.ratio >= 4.5, JSON.stringify(measured));
    hoverStyles.push({ theme, measured });
  }

  const membership = surface.getByRole('button', { name: '그룹 멤버십 제거' });
  await membership.click();
  const membershipGate = page.getByRole('alertdialog');
  await membershipGate.waitFor();
  assert.equal(await membershipGate.locator('[data-testid="offboarding-groups"] li').count(), 3);
  const readonlyStyle = await membershipGate.locator('[data-testid="offboarding-groups"]').evaluate((node) => { const style = getComputedStyle(node); return { editable: node.matches('input,textarea,[contenteditable=true]'), color: style.color, background: getComputedStyle(node.closest('[role=alertdialog]')).backgroundColor }; });
  readonlyStyle.ratio = contrast(readonlyStyle.color, readonlyStyle.background);
  assert(!readonlyStyle.editable && readonlyStyle.ratio >= 4.5, JSON.stringify(readonlyStyle));
  await page.setViewportSize({ width: 1440, height: 900 }); assert.equal(await setZoom(1), 1);
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await setZoom(2), 2);
  const popup = await membershipGate.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.scrollTop = node.scrollHeight;
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    return { contained: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1, scrollTop: node.scrollTop, scrollMax: max, reachable: Math.abs(node.scrollTop - max) <= 1 };
  });
  assert(popup.contained && popup.reachable, JSON.stringify(popup));
  let deletes = 0;
  await page.route('**/api/roster/groups/*/members/*', async (route) => {
    deletes += 1;
    if (deletes === 2) await route.abort('failed');
    else await route.continue();
  });
  await membershipGate.getByRole('button', { name: '실행' }).click();
  await membershipGate.waitFor({ state: 'detached' });
  await surface.locator('[data-offboarding-outcomes]').waitFor();
  const outcomeStates = await surface.locator('[data-offboarding-outcomes] li').evaluateAll((rows) => rows.map((row) => row.dataset.outcomeState));
  assert.deepEqual(outcomeStates, ['accepted', 'unconfirmed', 'not-run']);
  const membershipAudit = await page.evaluate(async () => (await fetch('/api/audit-log?operation=principal.member-remove')).json());
  assert(membershipAudit.groups.some((group) => group.operation === 'principal.member-remove' && group.rows.some((row) => row.subject === targetName)));
  await page.unroute('**/api/roster/groups/*/members/*');
  assert.equal(await setZoom(1), 1);

  const viewports = [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
  const normal = [];
  for (const viewport of viewports) for (const theme of ['light', 'dark']) for (const zoom of [1, 2]) {
    await page.setViewportSize(viewport);
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    assert.equal(await setZoom(zoom), zoom);
    await suspend.focus();
    await page.keyboard.press('Tab');
    const measured = await surface.evaluate((node) => {
      const card = node.querySelector('[data-offboarding-card]');
      const button = document.activeElement;
      const row = node.querySelector('[data-testid="offboarding-step"]');
      const style = getComputedStyle(button); const rowStyle = getComputedStyle(row);
      const scroller = node.closest('[data-settings-content]');
      const navigation = document.querySelector('[data-settings-navigation]');
      const bodyBeforeMenuScroll = scroller.scrollTop;
      navigation.scrollTop = navigation.scrollHeight;
      const menuMax = Math.max(0, navigation.scrollHeight - navigation.clientHeight);
      const menuReachable = Math.abs(navigation.scrollTop - menuMax) <= 1;
      const bodyStableDuringMenuScroll = scroller.scrollTop === bodyBeforeMenuScroll;
      scroller.scrollTop = scroller.scrollHeight;
      const scrollMax = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        cardContained: card.getBoundingClientRect().right <= scroller.getBoundingClientRect().right + 1,
        scroll: { top: scroller.scrollTop, max: scrollMax, reachable: Math.abs(scroller.scrollTop - scrollMax) <= 1 },
        independentScroll: { menuMax, menuReachable, bodyStableDuringMenuScroll },
        rowMinHeight: rowStyle.minHeight, rowPaddingTop: rowStyle.paddingTop,
        focus: { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, background: getComputedStyle(scroller).backgroundColor },
        text: { color: style.color, background: style.backgroundColor },
      };
    });
    measured.focus.ratio = contrast(measured.focus.outlineColor, measured.focus.background);
    measured.text.ratio = contrast(measured.text.color, measured.text.background);
    assert.equal(measured.documentHorizontalOverflow, false, JSON.stringify(measured));
    assert(measured.cardContained && measured.scroll.reachable && measured.independentScroll.menuReachable && measured.independentScroll.bodyStableDuringMenuScroll, JSON.stringify(measured));
    assert.equal(measured.rowMinHeight, '64px');
    assert.equal(measured.rowPaddingTop, '16px');
    assert(measured.focus.outlineStyle !== 'none' && parseFloat(measured.focus.outlineWidth) >= 2 && measured.focus.ratio >= 3, JSON.stringify(measured.focus));
    assert(measured.text.ratio >= 4.5, JSON.stringify(measured.text));
    normal.push({ viewport, theme, zoom, measured });
    await page.screenshot({ path: path.join(output, `normal-${viewport.width}x${viewport.height}-${theme}-z${zoom * 100}.png`) });
  }

  const forced = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const viewport of viewports) for (const zoom of [1, 2]) {
    await page.setViewportSize(viewport); assert.equal(await setZoom(zoom), zoom); await suspend.focus(); await page.keyboard.press('Tab');
    const measured = await page.evaluate(() => { const node = document.activeElement; const style = getComputedStyle(node); const predicate = document.querySelector("[data-step='tokens'] [aria-label]"); const predicateStyle = getComputedStyle(predicate); return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineColor: style.outlineColor, visible: node.getBoundingClientRect().width >= 36 && node.getBoundingClientRect().height >= 36, control: { color: style.color, background: style.backgroundColor }, predicate: { visible: predicate.getBoundingClientRect().width > 0 && predicate.getBoundingClientRect().height > 0, color: predicateStyle.color, background: getComputedStyle(predicate.closest('[data-testid=offboarding-step]')).backgroundColor } }; });
    measured.control.ratio = contrast(measured.control.color, measured.control.background);
    measured.predicate.ratio = contrast(measured.predicate.color, measured.predicate.background);
    assert(measured.visible && measured.outlineStyle !== 'none' && parseFloat(measured.outlineWidth) >= 2 && measured.control.ratio >= 3 && measured.predicate.visible && measured.predicate.ratio >= 3, JSON.stringify(measured));
    forced.push({ viewport, zoom, measured });
    await page.screenshot({ path: path.join(output, `forced-${viewport.width}x${viewport.height}-z${zoom * 100}.png`) });
  }
  await page.emulateMedia({ forcedColors: 'none' });
  assert.equal(await setZoom(1), 1);

  const back = surface.getByRole('button', { name: '사용자 목록으로' });
  await back.click();
  const restored = dialog.getByRole('row').filter({ hasText: targetName }).getByRole('button', { name: '오프보딩 열기' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '오프보딩 열기');
  assert.equal(await restored.evaluate((node) => node === document.activeElement), true);

  await restored.click();
  const handoffSurface = dialog.locator('[data-offboarding-surface]');
  await handoffSurface.getByRole('button', { name: /권한 일괄 회수/ }).click();
  await dialog.getByRole('tab', { name: '권한 감사', exact: true }).waitFor();
  const selected = dialog.getByTestId('revocation-subjects');
  assert.equal(await selected.locator('li').count(), 1);
  assert((await selected.textContent()).includes(targetName));
  const aclEntry = selected.getByRole('button', { name: '오프보딩 열기' });
  await aclEntry.click();
  const aclSurface = dialog.locator('[data-offboarding-surface]');
  await aclSurface.getByRole('heading', { name: `${targetName} 오프보딩` }).waitFor();
  await aclSurface.getByRole('button', { name: '사용자 목록으로' }).click();
  await page.waitForFunction((id) => document.activeElement?.getAttribute('data-offboarding-principal-id') === id, targetId);

  await page.route(`**/api/principals/${targetId}/offboarding`, async (route) => route.fulfill({ status: 500, body: '{}' }), { times: 1 });
  await aclEntry.click();
  const refreshFailure = dialog.getByRole('alert').filter({ hasText: '오프보딩 상태를 확인하지 못했습니다' });
  await refreshFailure.waitFor();
  const errorStyles = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const measured = await refreshFailure.evaluate((node) => { const style = getComputedStyle(node); let backgroundNode = node; let background = style.backgroundColor; while (backgroundNode.parentElement !== null && /rgba\([^)]*,\s*0\)/.test(background)) { backgroundNode = backgroundNode.parentElement; background = getComputedStyle(backgroundNode).backgroundColor; } return { color: style.color, background }; });
    measured.ratio = contrast(measured.color, measured.background);
    assert(measured.ratio >= 4.5, JSON.stringify(measured));
    errorStyles.push({ theme, measured });
  }
  const refreshRetry = refreshFailure.getByRole('button', { name: '다시 시도' });
  await refreshRetry.click();
  await aclSurface.getByRole('button', { name: '계정 비활성화' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: '실행' }).click();
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-step') === 'suspend');
  const mutated = await page.evaluate(async (id) => (await fetch(`/api/principals/${encodeURIComponent(id)}/offboarding`)).json(), targetId);
  assert.equal(mutated.principalStatus, 'suspended');
  assert.equal(mutated.steps[0].done, true);
  assert.equal(mutated.steps[1].done, true);
  const floor = await page.evaluate(async (id) => {
    const response = await fetch(`/api/roster/users/${encodeURIComponent(id)}/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'suspended' }) });
    return { status: response.status, body: await response.json() };
  }, superuserId);
  assert.deepEqual(floor, { status: 409, body: { rule: 'last-active-superuser' } });
  const audit = await page.evaluate(async () => (await fetch('/api/audit-log?operation=principal.status')).json());
  assert(audit.groups.some((group) => group.operation === 'principal.status' && group.rows.some((row) => row.beforeValue === 'active' && row.afterValue === 'suspended')));

  const openRevocationGate = async () => {
    await aclSurface.getByRole('button', { name: /권한 일괄 회수/ }).click();
    await selected.waitFor();
    await dialog.getByRole('button', { name: '권한 전부 회수', exact: true }).click();
    const l3 = page.getByRole('alertdialog');
    await l3.waitFor();
    assert.equal(await l3.getAttribute('data-grade'), 'L3');
    return l3;
  };
  const beforeCancelReads = offboardingRequests.length;
  const cancelL3 = await openRevocationGate();
  await cancelL3.getByRole('button', { name: '취소' }).click();
  await aclSurface.getByRole('heading', { name: `${targetName} 오프보딩` }).waitFor();
  assert(offboardingRequests.length > beforeCancelReads, 'L3 cancel must remount and re-read the card');

  let droppedRevocation = false;
  await page.route(`**/api/principals/${targetId}/revocation`, async (route) => {
    if (route.request().method() === 'POST' && !droppedRevocation) { droppedRevocation = true; await route.abort('failed'); }
    else await route.continue();
  });
  const beforePartialReads = offboardingRequests.length;
  const partialL3 = await openRevocationGate();
  await partialL3.locator('input').fill('1');
  await partialL3.getByRole('button', { name: '실행' }).click();
  await aclSurface.getByRole('heading', { name: `${targetName} 오프보딩` }).waitFor();
  assert(droppedRevocation && offboardingRequests.length > beforePartialReads, 'partial completion must return and re-read');
  await page.unroute(`**/api/principals/${targetId}/revocation`);

  const beforeAcceptedReads = offboardingRequests.length;
  const acceptedL3 = await openRevocationGate();
  await acceptedL3.locator('input').fill('1');
  await acceptedL3.getByRole('button', { name: '실행' }).click();
  await aclSurface.getByRole('heading', { name: `${targetName} 오프보딩` }).waitFor();
  assert(offboardingRequests.length > beforeAcceptedReads, 'accepted completion must return and re-read');
  await aclSurface.getByTestId('offboarding-acl-done').waitFor();
  const aclAudit = await page.evaluate(async () => (await fetch('/api/audit-log?operation=acl.revoke')).json());
  assert(aclAudit.groups.some((group) => group.operation === 'acl.revoke'));

  await page.route('**/api/roster/groups', async (route) => route.fulfill({ status: 401, body: '{}' }), { times: 1 });
  const membershipAfterAcl = aclSurface.getByRole('button', { name: '그룹 멤버십 제거' });
  await membershipAfterAcl.click();
  await page.waitForFunction(() => document.querySelector('[data-offboarding-card]') === null);
  assert.equal(await aclSurface.locator('[data-offboarding-card]').count(), 0);

  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ forbidden, normal, forced, finalZoom: 1, states: { pending: pendingStyles, hover: hoverStyles, error: errorStyles, readonlySummary: readonlyStyle, refreshFailureRetry: true }, stage3: { popup, outcomeStates, deleteAttempts: deletes, runtimeResizeAndZoom: true, auditOperation: 'principal.member-remove' }, handoff: { exactSelection: 1, aclEntry: true, returnFocus: true, cancelReturn: true, partialReturn: true, acceptedReturn: true, acceptedAudit: 'acl.revoke' }, authorityLoss: { staleCardCount: 0 }, mutation: { status: mutated.principalStatus, floor, auditOperation: 'principal.status' }, composition: { applicable: false, reason: 'The frozen offboarding flow has no editable text control; keyboard activation and Escape dismissal were measured instead.' } }, null, 2));
  console.log(`issue74 offboarding product checks passed (${normal.length} normal + ${forced.length} forced-color states)`);
} finally {
  if (context) await context.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
