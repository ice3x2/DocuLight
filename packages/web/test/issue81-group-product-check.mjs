import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginAs, WEB_URL } from './_web-harness.mjs';
import { assertEnvironmentEvidence, assertSameMountedTransition } from './issue81-product-assertions.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} required`); return value; };
const output = required('DOCULIGHT_ISSUE81_OUTPUT');
const browserRoot = required('DOCULIGHT_ISSUE81_BROWSER_ROOT');
fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(browserRoot, { recursive: true });
const credentials = {
  superuser: [required('DOCULIGHT_ISSUE81_SUPER_NAME'), required('DOCULIGHT_ISSUE81_SUPER_PASS')],
  ordinary: [required('DOCULIGHT_ISSUE81_ORDINARY_NAME'), required('DOCULIGHT_ISSUE81_ORDINARY_PASS')],
  manager: [required('DOCULIGHT_ISSUE81_MANAGER_NAME'), required('DOCULIGHT_ISSUE81_MANAGER_PASS')],
};
const fixture = Object.fromEntries(['GROUP_ID','GROUP_NAME','EXISTING_ID','CANDIDATE_ID','FOCUS_ID','FIRST_RESULT_ID','LAST_RESULT_ID','UNCERTAIN_ID','STALE_ID','REJECTED_ID'].map((key) => [key.toLowerCase(), required(`DOCULIGHT_ISSUE81_${key}`)]));
const extension = path.join(browserRoot, 'zoom-extension'); fs.mkdirSync(extension, { recursive: true });
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 81 zoom', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const requests = []; const observations = []; const denials = [];
const sameMountedState = { resize: [], zoomReads: [] };
let context;
try {
  context = await chromium.launchPersistentContext(path.join(browserRoot, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); }, { target: page.url(), value });
  const getZoom = async () => worker.evaluate(async (target) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); return chrome.tabs.getZoom(tab.id); }, page.url());
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname.includes('/api/roster/groups') || url.pathname === '/api/principals') requests.push({ method: request.method(), path: url.pathname, search: url.search }); });
  const cookies = {};
  for (const role of ['ordinary','manager','superuser']) { await context.clearCookies(); await loginAs(page, ...credentials[role]); cookies[role] = await context.cookies(); }
  const useRole = async (role) => { await context.clearCookies(); await context.addCookies(cookies[role]); await page.goto(WEB_URL, { waitUntil: 'networkidle' }); };
  const settings = async () => { await page.getByRole('button', { name: '설정', exact: true }).click(); const dialog = page.locator('[data-settings-dialog]'); await dialog.waitFor(); return dialog; };
  const deny = async (role) => {
    const result = await page.evaluate(async ({ groupId, candidateId }) => ({
      read: (await fetch('/api/roster/groups')).status,
      write: (await fetch(`/api/roster/groups/${encodeURIComponent(groupId)}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: candidateId }) })).status,
    }), { groupId: fixture.group_id, candidateId: fixture.candidate_id });
    assert.deepEqual(result, { read: 404, write: 404 }); denials.push({ role, ...result });
  };

  await useRole('superuser');
  await setZoom(1);
  const transitionDialog = await settings();
  await transitionDialog.getByRole('tab', { name: '그룹 관리', exact: true }).click();
  const transitionRow = transitionDialog.locator(`[data-group-id="${fixture.group_id}"]`);
  const transitionSearch = transitionRow.getByRole('combobox');
  const mountId = `issue81-mount-${Date.now()}`;
  await transitionDialog.locator('[data-group-roster]').evaluate((node, id) => { node.dataset.issue81Mount = id; }, mountId);
  await transitionSearch.fill('Issue81 상태보존');
  const transitionCandidate = transitionRow.getByRole('option').filter({ hasText: fixture.first_result_id });
  await transitionCandidate.waitFor();
  await transitionRow.getByRole('option').filter({ hasText: fixture.last_result_id }).waitFor();
  await transitionSearch.focus();
  const selectedCandidate = transitionRow.locator('[role="option"][aria-selected="true"]');
  await selectedCandidate.waitFor();
  assert((await selectedCandidate.innerText()).includes(fixture.first_result_id));
  const writesBeforeTransition = requests.filter((one) => one.method === 'POST').length;
  const transitionBefore = {
    mountIdBefore: await transitionDialog.locator('[data-group-roster]').getAttribute('data-issue81-mount'),
    queryBefore: await transitionSearch.inputValue(), candidateIdBefore: fixture.first_result_id,
    groupIdBefore: await transitionRow.getAttribute('data-group-id'),
    focusedIdBefore: await transitionSearch.evaluate((node) => document.activeElement === node ? `search:${node.closest('[data-group-id]')?.getAttribute('data-group-id')}` : ''),
    writesBefore: writesBeforeTransition,
  };
  for (const [width, height] of [[1280,720],[1440,900],[1920,1080]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await transitionSearch.inputValue(), 'Issue81 상태보존');
    assert.equal(await transitionSearch.evaluate((node) => document.activeElement === node), true);
    assert((await selectedCandidate.innerText()).includes(fixture.first_result_id));
    sameMountedState.resize.push({ width, height, query: await transitionSearch.inputValue(), focusedId: fixture.first_result_id });
  }
  for (const zoom of [100, 200, 100]) {
    await setZoom(zoom / 100);
    const observed = await getZoom();
    assert.equal(observed, zoom / 100);
    sameMountedState.zoomReads.push(observed);
    assert.equal(await transitionSearch.inputValue(), 'Issue81 상태보존');
    assert.equal(await transitionSearch.evaluate((node) => document.activeElement === node), true);
    assert((await selectedCandidate.innerText()).includes(fixture.first_result_id));
  }
  const transitionAfter = {
    mountIdAfter: await transitionDialog.locator('[data-group-roster]').getAttribute('data-issue81-mount'),
    queryAfter: await transitionSearch.inputValue(), candidateIdAfter: fixture.first_result_id,
    groupIdAfter: await transitionRow.getAttribute('data-group-id'),
    focusedIdAfter: await transitionSearch.evaluate((node) => document.activeElement === node ? `search:${node.closest('[data-group-id]')?.getAttribute('data-group-id')}` : ''),
    writesAfter: requests.filter((one) => one.method === 'POST').length,
    zoomReads: sameMountedState.zoomReads,
  };
  const transitionEvidence = { ...transitionBefore, ...transitionAfter };
  assertSameMountedTransition(transitionEvidence);
  sameMountedState.transition = transitionEvidence;
  assert.equal(await transitionDialog.getByRole('tab', { name: '그룹 관리', exact: true }).getAttribute('data-state'), 'active');

  for (const [width, height] of [[1280,720],[1440,900],[1920,1080]]) for (const theme of ['light','dark']) for (const zoom of [100,200]) {
    await page.setViewportSize({ width, height });
    for (const role of ['ordinary','manager']) { await useRole(role); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme); await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100); const dialog = await settings(); assert.equal(await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).count(), 0); await deny(role); }
    await useRole('superuser'); await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme); await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100);
    const dialog = await settings(); await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click(); const roster = dialog.locator('[data-group-roster]'); await roster.getByText(fixture.group_name, { exact: true }).waitFor();
    const matrixRow = roster.locator(`[data-group-id="${fixture.group_id}"]`);
    const matrixSearch = matrixRow.getByRole('combobox');
    await matrixSearch.fill('Issue81 상태보존');
    await matrixRow.getByRole('option').filter({ hasText: fixture.first_result_id }).waitFor();
    await matrixRow.getByRole('option').filter({ hasText: fixture.last_result_id }).waitFor();
    await matrixSearch.click(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    const geometry = await roster.evaluate((node, ids) => {
      const parse = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value) => parse(value).map((part) => { const channel = part / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126,0.7152,0.0722][index], 0);
      const contrastRatio = (first, second) => { const values = [luminance(first), luminance(second)].sort((a,b) => b-a); return (values[0]+0.05)/(values[1]+0.05); };
      const backgroundOf = (element) => { for (let current = element; current instanceof HTMLElement; current = current.parentElement) { const value = getComputedStyle(current).backgroundColor; if (value !== 'rgba(0, 0, 0, 0)' && !value.endsWith(', 0)')) return value; } return getComputedStyle(document.documentElement).backgroundColor; };
      const scroll = node.querySelector('[data-group-table-scroll]');
      const rows = node.querySelectorAll('[data-group-id]');
      const last = rows.item(rows.length - 1);
      const rightmost = last instanceof HTMLElement ? last.querySelector('td:last-child') : null;
      last instanceof HTMLElement && last.scrollIntoView({ block: 'nearest' });
      rightmost instanceof HTMLElement && rightmost.scrollIntoView({ inline: 'nearest' });
      const text = node.querySelector('[data-group-name] span');
      const caption = node.querySelector('caption');
      const input = node.querySelector(`[data-group-id="${ids.groupId}"] input`);
      const table = node.querySelector('table');
      const options = [...node.querySelectorAll('[role="option"]')];
      const firstResult = options.find((option) => option.textContent?.includes(ids.firstResultId));
      const lastResult = options.find((option) => option.textContent?.includes(ids.lastResultId));
      const resultList = firstResult?.parentElement;
      const visibleAfterScroll = (element, container) => {
        if (!(element instanceof HTMLElement) || !(container instanceof HTMLElement)) return false;
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        const item = element.getBoundingClientRect(); const bounds = container.getBoundingClientRect();
        return item.top >= bounds.top - 1 && item.bottom <= bounds.bottom + 1 && item.left >= bounds.left - 1 && item.right <= bounds.right + 1;
      };
      const firstResultReachable = visibleAfterScroll(firstResult, resultList);
      const lastResultReachable = visibleAfterScroll(lastResult, resultList);
      const manyMemberLastReachable = visibleAfterScroll(node.querySelector(`[data-group-id="${ids.groupId}"] [data-group-members] li:last-child`), scroll);
      const longName = node.querySelector(`[data-group-id="${ids.groupId}"] [data-group-name] span:first-child`);
      const longNameCell = longName?.closest('[data-group-name]');
      const longNameRect = longName instanceof HTMLElement ? longName.getBoundingClientRect() : null;
      const longNameCellRect = longNameCell instanceof HTMLElement ? longNameCell.getBoundingClientRect() : null;
      const longNameReachable = Boolean(longNameRect && longNameCellRect && longNameRect.left >= longNameCellRect.left - 1 && longNameRect.right <= longNameCellRect.right + 1 && longNameRect.height > 0);
      const textStyle = text instanceof HTMLElement ? getComputedStyle(text) : null;
      const captionStyle = caption instanceof HTMLElement ? getComputedStyle(caption) : null;
      const inputStyle = input instanceof HTMLElement ? getComputedStyle(input) : null;
      const tableStyle = table instanceof HTMLElement ? getComputedStyle(table) : null;
      const scrollRect = scroll instanceof HTMLElement ? scroll.getBoundingClientRect() : null;
      if (scroll instanceof HTMLElement) scroll.scrollLeft = scroll.scrollWidth;
      last instanceof HTMLElement && last.scrollIntoView({ block: 'nearest' });
      const lastRect = last instanceof HTMLElement ? last.getBoundingClientRect() : null;
      const rightRect = rightmost instanceof HTMLElement ? rightmost.getBoundingClientRect() : null;
      return { viewport: { width: innerWidth, height: innerHeight }, rect: node.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1,
        normalTextContrast: textStyle && text instanceof HTMLElement ? contrastRatio(textStyle.color, backgroundOf(text)) : 0,
        largeTextContrast: captionStyle && caption instanceof HTMLElement ? contrastRatio(captionStyle.color, backgroundOf(caption)) : 0,
        controlContrast: inputStyle && input instanceof HTMLElement ? contrastRatio(inputStyle.borderColor, backgroundOf(input)) : 0,
        focusContrast: inputStyle && input instanceof HTMLElement ? contrastRatio(inputStyle.outlineColor, backgroundOf(input)) : 0,
        borderContrast: tableStyle && table instanceof HTMLElement ? contrastRatio(tableStyle.borderColor, backgroundOf(table)) : 0,
        firstResultReachable, lastResultReachable, manyMemberLastReachable, longNameReachable,
        lastRowReachable: Boolean(scrollRect && lastRect && lastRect.bottom <= scrollRect.bottom + 1),
        rightmostActionReachable: Boolean(scrollRect && rightRect && rightRect.right <= scrollRect.right + 1),
      };
    }, { groupId: fixture.group_id, firstResultId: fixture.first_result_id, lastResultId: fixture.last_result_id });
    assert.equal(geometry.overflow, false, JSON.stringify(geometry)); assertEnvironmentEvidence(geometry); assert.equal(geometry.lastRowReachable, true, JSON.stringify(geometry)); assert.equal(geometry.rightmostActionReachable, true, JSON.stringify(geometry)); const screenshot = `groups-${theme}-${width}x${height}-${zoom}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }); observations.push({ width, height, theme, zoom, observedZoom: await getZoom(), screenshot, geometry });
  }
  assert.equal(observations.length, 12); assert.equal(denials.length, 24);

  await useRole('superuser'); let dialog = await settings(); await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click(); let roster = dialog.locator('[data-group-roster]');
  const projection = await page.evaluate(async () => (await fetch('/api/roster/groups')).json());
  const defaultProjection = projection.find((entry) => entry.systemType === 'default');
  const superuserProjection = projection.find((entry) => entry.systemType === 'superuser');
  const defaultActiveMembers = defaultProjection.effectiveMembers.every((member) => member.status === 'active');
  assert.equal(defaultActiveMembers, true); assert.equal(defaultProjection.effectiveMembersComplete, true);
  const defaultRow = roster.locator('[data-group-id="system-default"]'); const superuserRow = roster.locator('[data-group-id="system-superuser"]');
  const automaticGroupHasNoAdd = await defaultRow.getByRole('combobox').count() === 0; assert.equal(automaticGroupHasNoAdd, true); assert.match(await defaultRow.innerText(), /활성 사용자는 자동으로/);
  const managedSuperuserHasAdd = await superuserRow.getByRole('combobox').count() === 1; assert.equal(managedSuperuserHasAdd, true);
  const row = roster.locator(`[data-group-id="${fixture.group_id}"]`); const search = row.getByRole('combobox');
  await search.fill('Issue81 같은이름');
  const existing = row.getByRole('option').filter({ hasText: fixture.existing_id }); const candidate = row.getByRole('option').filter({ hasText: fixture.candidate_id });
  assert.equal(await existing.getAttribute('aria-disabled'), 'true'); assert((await existing.innerText()).includes('이미 멤버입니다.'));
  let failAcceptedRefresh = true;
  await page.route('**/api/roster/groups**', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'GET' && url.pathname === '/api/roster/groups' && failAcceptedRefresh) {
      failAcceptedRefresh = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"private refresh detail"}' });
      return;
    }
    await route.continue();
  });
  const postsBefore = requests.filter((one) => one.method === 'POST').length;
  await candidate.evaluate((node) => { node.focus(); node.click(); node.click(); });
  await roster.getByText('멤버 추가 요청이 수락되었습니다.').waitFor();
  await roster.getByText(/그룹 목록을 새로 불러오지 못했습니다/).waitFor();
  assert.equal(requests.filter((one) => one.method === 'POST').length, postsBefore + 1);
  assert(requests.some((one) => one.path === '/api/principals' && one.search.includes('kind=user')));
  assert.equal(await roster.getByText('private refresh detail').count(), 0);
  await roster.getByRole('button', { name: '그룹 목록 다시 불러오기' }).click();
  await row.waitFor();
  await search.fill('Issue81 상태보존'); await row.getByRole('option').filter({ hasText: fixture.focus_id }).click();
  await page.waitForFunction((label) => document.activeElement?.getAttribute('aria-label') === label, `${fixture.group_name} 멤버 검색`);
  const focusReturnedToSearch = await search.evaluate((node) => document.activeElement === node); assert.equal(focusReturnedToSearch, true);
  const rejected = await page.evaluate(async ({ groupId, userId }) => { const response = await fetch(`/api/roster/groups/${groupId}/members`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) }); return { status: response.status, body: await response.json() }; }, { groupId: fixture.group_id, userId: fixture.rejected_id });
  assert.deepEqual(rejected, { status: 409, body: { ok: false, rule: 'member-not-eligible' } });

  let abortUncertain = true;
  await page.route(`**/api/roster/groups/${fixture.group_id}/members`, async (route) => { if (route.request().method() === 'POST' && abortUncertain) { abortUncertain = false; await route.abort('failed'); } else await route.continue(); });
  await search.fill('Issue81 불명확'); await row.getByRole('option').filter({ hasText: fixture.uncertain_id }).click(); await row.getByText('처리 결과를 확인하지 못했습니다.').waitFor(); assert.equal(await search.isDisabled(), true);
  await row.getByRole('button', { name: '그룹 목록 새로 불러오기' }).click(); await page.waitForFunction((selector) => !document.querySelector(selector)?.disabled, `[data-group-id="${fixture.group_id}"] input`);

  let delayStale = true;
  await page.route(`**/api/roster/groups/${fixture.group_id}/members`, async (route) => { if (route.request().method() === 'POST' && delayStale) { delayStale = false; await new Promise((resolve) => setTimeout(resolve, 350)); } await route.continue(); });
  await search.fill('Issue81 지연'); await row.getByRole('option').filter({ hasText: fixture.stale_id }).click(); await dialog.getByRole('tab', { name: '사용자 관리', exact: true }).click(); await page.waitForTimeout(500); assert.equal(await dialog.getByText('멤버 추가 요청이 수락되었습니다.').count(), 0);

  const forced = [];
  await dialog.getByRole('tab', { name: '그룹 관리', exact: true }).click(); await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100,200]) { await setZoom(zoom / 100); assert.equal(await getZoom(), zoom / 100); const target = dialog.locator(`[data-group-id="${fixture.group_id}"]`).getByRole('combobox'); await target.click(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); const focus = await target.evaluate((node) => ({ forced: matchMedia('(forced-colors: active)').matches, active: document.activeElement === node, outline: getComputedStyle(node).outlineStyle })); assert.equal(focus.forced, true); assert.equal(focus.active, true); assert.notEqual(focus.outline, 'none'); const screenshot = `groups-forced-${zoom}.png`; await page.screenshot({ path: path.join(output, screenshot), fullPage: true }); forced.push({ zoom, observedZoom: await getZoom(), screenshot, focus }); }
  await page.emulateMedia({ forcedColors: 'none' }); await setZoom(1); assert.equal(await getZoom(), 1);
  fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify({ requirement: 'IR-PRINCIPAL-003', matrixCount: observations.length, forcedColorsCount: forced.length, sameMountedState, defaultActiveMembers, automaticGroupHasNoAdd, managedSuperuserHasAdd, focusReturnedToSearch, observations, forced, denials, requests, nativeWindowsImeCandidateUi: 'nonblocking-unverified', syntheticCompositionDom: 'covered-by-focused-component-regression' }, null, 2));
} finally { await context?.close(); }
