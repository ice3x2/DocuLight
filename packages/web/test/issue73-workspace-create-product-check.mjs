import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, loginAs, openInEditor, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue73/browser-matrix');
fs.mkdirSync(output, { recursive: true });
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const managerName = required('DOCULIGHT_E2E_MANAGER');
const managerPassword = required('DOCULIGHT_E2E_MANAGER_PASS');
const viewerName = required('DOCULIGHT_E2E_VIEWER');
const viewerPassword = required('DOCULIGHT_E2E_VIEWER_PASS');
const colorChannels = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const colorLuminance = (value) => {
  const channels = colorChannels(value).map((channel) => channel / 255)
    .map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
};
const contrastRatio = (first, second) => {
  const [light, dark] = [colorLuminance(first), colorLuminance(second)].sort((a, b) => b - a);
  return (light + .05) / (dark + .05);
};
const compositeColor = (foreground, background, opacity) => {
  const fg = colorChannels(foreground); const bg = colorChannels(background);
  return `rgb(${fg.map((channel, index) => Math.round(channel * opacity + bg[index] * (1 - opacity))).join(', ')})`;
};

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue73-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 73 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
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
  const posts = [];
  let editorSaveCount = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/workspaces' && request.method() === 'POST') posts.push(request.postDataJSON());
    if (url.pathname.startsWith('/api/documents/') && request.method() === 'PUT') editorSaveCount += 1;
  });
  const logout = async () => {
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }); });
    await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  };
  const openAll = async () => {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '설정' });
    await dialog.getByRole('tab', { name: '전체 워크스페이스', exact: true }).click();
    return { dialog, all: dialog.locator('[data-workspace-management="all"]') };
  };
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, { target: page.url(), value });

  await loginAs(page, viewerName, viewerPassword);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  let direct = await page.evaluate(async () => (await fetch('/api/workspaces', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '거부', administratorId: 'x', defaultGroupLevel: 'none' }) })).status);
  assert.equal(direct, 403);
  const viewerSettings = await page.getByRole('button', { name: '설정', exact: true });
  await viewerSettings.click();
  assert.equal(await page.getByRole('dialog', { name: '설정' }).getByRole('tab', { name: '전체 워크스페이스', exact: true }).count(), 0);
  await logout();
  posts.length = 0;

  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const editorFixture = await page.evaluate(async () => {
    const tree = await (await fetch('/api/tree')).json();
    const workspaceId = tree[0]?.workspace?.id;
    if (!workspaceId) throw new Error('workspace unavailable for editor invariant');
    const response = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name: 'issue73-editor-invariant.md' }) });
    if (!response.ok) throw new Error(`editor fixture ${response.status}`);
    return response.json();
  });
  await page.reload({ waitUntil: 'networkidle' });
  await openInEditor(page, editorFixture.id, editorFixture.name);
  if (await page.getByRole('button', { name: '소스' }).count() === 0) await page.getByRole('button', { name: '편집' }).click();
  await page.getByRole('button', { name: '소스' }).click();
  const sourceEditor = page.locator('[data-document-content][data-state="active"] [data-source-editor]');
  await sourceEditor.waitFor();
  const saveResponse = page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/documents/${editorFixture.id}`);
  await sourceEditor.fill('# issue73 editor draft\n');
  await saveResponse;
  const editorBefore = { nodeId: await sourceEditor.evaluate((node) => node.closest('[data-document-body]').dataset.node), draft: await sourceEditor.inputValue(), saveCount: editorSaveCount };
  await sourceEditor.evaluate((node) => { window.__issue73EditorNode = node; });
  const assertEditorInvariant = async (stage) => {
    const current = page.locator('[data-document-content][data-state="active"] [data-source-editor]');
    const observed = {
      sameIdentity: await current.evaluate((node) => window.__issue73EditorNode === node),
      nodeId: await current.evaluate((node) => node.closest('[data-document-body]').dataset.node),
      draft: await current.inputValue(), saveCount: editorSaveCount,
    };
    assert.deepEqual(observed, { sameIdentity: true, ...editorBefore }, `${stage}: ${JSON.stringify(observed)}`);
    return observed;
  };
  const { dialog, all } = await openAll();
  const editorInvariants = { opened: await assertEditorInvariant('settings-open') };
  const navigation = dialog.locator('[data-settings-navigation]');
  const content = dialog.locator('[data-settings-content]');
  const list = all.getByRole('list', { name: '전체 워크스페이스' });
  await list.waitFor();
  const entry = all.getByRole('button', { name: '새 워크스페이스' });
  const selectedBefore = await list.locator('[data-selected]').getAttribute('data-workspace-id');
  let scrollBefore = await content.evaluate((node) => {
    node.scrollTop = Math.min(72, Math.max(0, node.scrollHeight - node.clientHeight));
    return node.scrollTop;
  });
  const independentScroll = await dialog.evaluate((node) => {
    const nav = node.querySelector('[data-settings-navigation]');
    const body = node.querySelector('[data-settings-content]');
    const navBefore = nav.scrollTop;
    const bodyBefore = body.scrollTop;
    nav.scrollTop = Math.min(24, Math.max(0, nav.scrollHeight - nav.clientHeight));
    return {
      navigationOverflow: getComputedStyle(nav).overflowY,
      contentOverflow: getComputedStyle(body).overflowY,
      navMoved: nav.scrollTop !== navBefore,
      contentStayed: body.scrollTop === bodyBefore,
    };
  });
  assert.equal(independentScroll.navigationOverflow, 'auto');
  assert.equal(independentScroll.contentOverflow, 'auto');
  assert.equal(independentScroll.contentStayed, true);
  await page.mouse.move(0, 0);
  const hoverBefore = await entry.evaluate((node) => getComputedStyle(node).backgroundColor);
  await entry.hover();
  const hoverAfter = await entry.evaluate((node) => getComputedStyle(node).backgroundColor);
  scrollBefore = await content.evaluate((node) => node.scrollTop);
  await entry.click();
  assert.equal(await list.count(), 0);
  let form = all.getByRole('form', { name: '새 워크스페이스' });
  await form.waitFor();
  assert.equal(await form.locator('[data-workspace-create-field]').count(), 3);
  assert.equal(await form.getByRole('combobox', { name: '기본 그룹 초기 권한' }).inputValue(), 'none');
  await form.getByRole('button', { name: '취소' }).click();
  editorInvariants.cancelled = await assertEditorInvariant('creation-cancel');
  assert.equal(await list.count(), 1);
  assert.equal(await list.locator('[data-selected]').getAttribute('data-workspace-id'), selectedBefore);
  assert.equal(await content.evaluate((node) => node.scrollTop), scrollBefore);
  assert.equal(await entry.evaluate((node) => node === document.activeElement), true);

  await entry.click();
  form = all.getByRole('form', { name: '새 워크스페이스' });
  const name = form.getByRole('textbox', { name: '이름 (필수)' });
  await name.dispatchEvent('compositionstart', { data: '한' });
  await name.fill('한글 입력 보존');
  await name.dispatchEvent('compositionupdate', { data: '한글 입력 보존' });
  await name.press('Enter');
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  assert.equal(await name.inputValue(), '한글 입력 보존');
  await name.dispatchEvent('compositionend', { data: '한글 입력 보존' });
  await name.fill('긴 한글 워크스페이스 '.repeat(10));
  const controlContrast = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await name.focus();
    const colors = await name.evaluate((node) => {
      const style = getComputedStyle(node);
      const outside = getComputedStyle(node.closest('[data-workspace-create]')).backgroundColor;
      return { border: style.borderColor, controlBackground: style.backgroundColor, outside,
        outline: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    const measured = { theme, ...colors, normalBoundaryRatio: contrastRatio(colors.border, colors.outside), focusRingRatio: contrastRatio(colors.outline, colors.outside) };
    assert(measured.normalBoundaryRatio >= 3, JSON.stringify(measured));
    assert(measured.focusRingRatio >= 3 && measured.outlineStyle !== 'none' && parseFloat(measured.outlineWidth) >= 2, JSON.stringify(measured));
    controlContrast.push(measured);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const picker = form.getByRole('combobox', { name: '워크스페이스 관리자 (필수)' });
  await page.route('**/api/principals?**', async (route) => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ id: `synthetic-${index}`, name: `조합 관리자 ${String(index).padStart(2, '0')}`, kind: index % 2 ? 'group' : 'user', status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'suspended' : 'active' }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  });
  await picker.dispatchEvent('compositionstart', { data: '조' });
  await picker.fill('조합');
  await picker.dispatchEvent('compositionupdate', { data: '조합' });
  await form.getByText('조합 관리자 00', { exact: true }).waitFor();
  await picker.press('Enter');
  assert.equal(await form.locator('[data-selected-principal]').count(), 0);
  assert.equal(await picker.inputValue(), '조합');
  await picker.dispatchEvent('compositionend', { data: '조합' });
  await picker.press('ArrowDown');
  const pickerSelectedContrast = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const colors = await form.locator('[cmdk-item][aria-selected="true"]').evaluate((node) => {
      const style = getComputedStyle(node);
      return { color: style.color, background: style.backgroundColor, outline: style.outlineColor };
    });
    const measured = { theme, ...colors, textRatio: contrastRatio(colors.color, colors.background) };
    assert(measured.textRatio >= 4.5, JSON.stringify(measured));
    pickerSelectedContrast.push(measured);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const pickerContainment = await form.evaluate((node) => {
    const root = node.querySelector('[cmdk-root]').getBoundingClientRect();
    const field = node.querySelectorAll('[data-workspace-create-field]')[1].getBoundingClientRect();
    const listbox = node.querySelector('[cmdk-list]').getBoundingClientRect();
    return {
      rootWithinField: root.left >= field.left - 1 && root.right <= field.right + 1,
      listWithinField: listbox.left >= field.left - 1 && listbox.right <= field.right + 1,
      root, field, listbox,
    };
  });
  assert(pickerContainment.rootWithinField && pickerContainment.listWithinField, JSON.stringify(pickerContainment));
  const livePickerStates = [];
  for (const step of [{ zoom: 1, width: 1280, height: 720 }, { zoom: 2, width: 1440, height: 900 }, { zoom: 1, width: 1280, height: 720 }]) {
    assert.equal(await setZoom(step.zoom), step.zoom);
    await page.setViewportSize({ width: step.width, height: step.height });
    await page.waitForTimeout(80);
    await picker.evaluate((node) => node.closest('[data-workspace-create-field]').scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(40);
    const measured = await form.evaluate((node) => {
      const list = node.querySelector('[cmdk-list]');
      const field = node.querySelectorAll('[data-workspace-create-field]')[1].getBoundingClientRect();
      const box = list.getBoundingClientRect();
      list.scrollTop = list.scrollHeight;
      const selected = node.querySelector('[cmdk-item][aria-selected="true"]');
      const selectedStyle = selected ? getComputedStyle(selected) : null;
      return {
        viewport: { width: innerWidth, height: innerHeight }, field: field.toJSON(), popup: box.toJSON(),
        contained: box.left >= field.left - 1 && box.right <= field.right + 1 && box.bottom <= innerHeight + 1,
        scroll: { top: list.scrollTop, max: list.scrollHeight - list.clientHeight, reachable: list.scrollTop === list.scrollHeight - list.clientHeight },
        selected: selectedStyle === null ? null : { color: selectedStyle.color, background: selectedStyle.backgroundColor },
      };
    });
    assert(measured.contained, JSON.stringify(measured));
    assert(measured.scroll.max > 0 && measured.scroll.reachable, JSON.stringify(measured.scroll));
    assert(measured.selected !== null);
    measured.selected.ratio = contrastRatio(measured.selected.color, measured.selected.background);
    assert(measured.selected.ratio >= 4.5, JSON.stringify(measured.selected));
    livePickerStates.push({ ...step, measured });
  }
  await page.unroute('**/api/principals?**');
  await picker.fill('');
  await picker.fill(managerName);
  await form.getByText(managerName, { exact: true }).click();
  await form.getByRole('combobox', { name: '기본 그룹 초기 권한' }).selectOption('edit');

  await name.fill('');
  await form.getByRole('button', { name: '만들기' }).click();
  const invalidState = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const colors = await name.evaluate((node) => {
      const style = getComputedStyle(node);
      return { invalid: node.getAttribute('aria-invalid'), border: style.borderColor,
        outside: getComputedStyle(node.closest('[data-workspace-create]')).backgroundColor };
    });
    const measured = { theme, ...colors, boundaryRatio: contrastRatio(colors.border, colors.outside) };
    assert.equal(measured.invalid, 'true');
    assert(measured.boundaryRatio >= 3, JSON.stringify(measured));
    invalidState.push(measured);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await name.fill('긴 한글 워크스페이스 '.repeat(10));

  let releaseStaleWarning;
  const staleWarningHeld = new Promise((resolve) => { releaseStaleWarning = resolve; });
  await page.route('**/api/grant-warnings**', async (route) => {
    await staleWarningHeld;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await form.getByRole('button', { name: '만들기' }).click();
  await form.getByRole('status').filter({ hasText: '권한 부여 내용을 확인하는 중입니다' }).waitFor();
  const backButton = all.locator('[data-workspace-create]').locator('button[type="button"]').filter({ hasText: '전체 워크스페이스로 돌아가기' });
  const cancelButton = form.locator('button[type="button"]').filter({ hasText: '취소' });
  const pendingNavigation = {
    backEnabled: await backButton.isEnabled(),
    cancelEnabled: await cancelButton.isEnabled(),
  };
  assert(pendingNavigation.backEnabled && pendingNavigation.cancelEnabled);
  await form.getByRole('combobox', { name: '기본 그룹 초기 권한' }).selectOption('none');
  releaseStaleWarning();
  await page.waitForTimeout(150);
  assert.equal(await page.getByRole('alertdialog').count(), 0);
  await page.unroute('**/api/grant-warnings**');
  await form.getByRole('combobox', { name: '기본 그룹 초기 권한' }).selectOption('edit');

  let failWarningOnce = true;
  await page.route('**/api/grant-warnings**', async (route) => {
    if (!failWarningOnce) { await route.continue(); return; }
    failWarningOnce = false;
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.abort();
  });
  await form.getByRole('button', { name: '만들기' }).click();
  const warningLoading = form.getByRole('status', { name: '' }).filter({ hasText: '권한 부여 내용을 확인하는 중입니다' });
  await warningLoading.waitFor();
  const loadingState = await warningLoading.evaluate((node) => {
    const button = node.closest('form').querySelector('button[type="submit"]');
    const style = getComputedStyle(button);
    return { text: node.textContent, color: getComputedStyle(node).color, disabled: button.disabled,
      disabledButton: { color: style.color, background: style.backgroundColor, border: style.borderColor } };
  });
  assert.equal(loadingState.text, '권한 부여 내용을 확인하는 중입니다');
  assert.equal(loadingState.disabled, true);
  const disabledStateContrast = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    const colors = await form.getByRole('button', { name: '만들기' }).evaluate((node) => {
      const style = getComputedStyle(node);
      return { disabled: node.disabled, opacity: Number(style.opacity), color: style.color, background: style.backgroundColor,
        outside: getComputedStyle(node.closest('[data-workspace-create]')).backgroundColor };
    });
    const visibleBackground = compositeColor(colors.background, colors.outside, colors.opacity);
    const visibleText = compositeColor(colors.color, visibleBackground, colors.opacity);
    const measured = { theme, ...colors, visibleBackground, visibleText, identificationRatio: contrastRatio(visibleText, visibleBackground) };
    assert(measured.disabled && measured.opacity === .65, JSON.stringify(measured));
    assert(measured.identificationRatio >= 3, JSON.stringify(measured));
    disabledStateContrast.push(measured);
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const warningError = form.getByRole('alert').filter({ hasText: '확인 정보를 불러오지 못했습니다.' });
  await warningError.waitFor();
  const errorState = await warningError.evaluate((node) => ({ text: node.textContent, color: getComputedStyle(node).color }));
  const contrast = await form.evaluate((node) => {
    const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (value) => {
      const channels = rgb(value).map((channel) => channel / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
      return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
    };
    const ratio = (foreground, background) => {
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (light + .05) / (dark + .05);
    };
    const backgroundOf = (element) => {
      let current = element;
      while (current) {
        const background = getComputedStyle(current).backgroundColor;
        if (!background.endsWith(', 0)') && background !== 'rgba(0, 0, 0, 0)') return background;
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };
    const measure = (element) => {
      const foreground = getComputedStyle(element).color;
      const background = backgroundOf(element);
      return { foreground, background, ratio: ratio(foreground, background) };
    };
    return {
      label: measure(node.querySelector('[data-workspace-create-field] > label')),
      error: measure(node.querySelector('[role="alert"]')),
    };
  });
  assert(contrast.label.ratio >= 4.5, JSON.stringify(contrast));
  assert(contrast.error.ratio >= 4.5, JSON.stringify(contrast));
  assert.notEqual(hoverBefore, hoverAfter);
  await name.evaluate((node) => node.setSelectionRange(2, 5));
  await form.getByRole('button', { name: '확인 정보 다시 불러오기' }).click();
  const gate = page.getByRole('alertdialog');
  await gate.waitFor();
  const frozenSummary = gate.getByTestId('grant-summary');
  assert.equal(await frozenSummary.getAttribute('aria-readonly'), 'true');
  assert.equal(await frozenSummary.getAttribute('aria-label'), '확정된 워크스페이스 생성 내용');
  const frozenSummaryColors = await frozenSummary.evaluate((node) => {
    const style = getComputedStyle(node);
    const surface = getComputedStyle(node.closest('[role="alertdialog"]'));
    return { foreground: style.color, background: surface.backgroundColor };
  });
  frozenSummaryColors.ratio = contrastRatio(frozenSummaryColors.foreground, frozenSummaryColors.background);
  assert(frozenSummaryColors.ratio >= 4.5, JSON.stringify(frozenSummaryColors));
  assert.match(await gate.innerText(), /자유 가입/);
  assert.match(await gate.innerText(), /앞으로 만드는 문서/);
  assert.doesNotMatch(await gate.innerText(), /적용 하위 노드/);
  assert.equal(posts.length, 0);
  await page.keyboard.press('Escape');
  await gate.waitFor({ state: 'hidden' });
  const escapeCancel = {
    createFocus: await form.getByRole('button', { name: '만들기' }).evaluate((node) => node === document.activeElement),
    draft: await name.inputValue(),
    selection: await name.evaluate((node) => [node.selectionStart, node.selectionEnd]),
    administratorPreserved: await form.locator('[data-selected-principal]').count() === 1,
  };
  assert(escapeCancel.createFocus && escapeCancel.administratorPreserved);
  assert.equal(escapeCancel.draft, '긴 한글 워크스페이스 '.repeat(10));
  assert.deepEqual(escapeCancel.selection, [2, 5]);
  await form.getByRole('button', { name: '만들기' }).click();
  await gate.waitFor();
  await gate.getByRole('button', { name: '취소' }).click();
  await gate.waitFor({ state: 'hidden' });
  assert.equal(await form.getByRole('button', { name: '만들기' }).evaluate((node) => node === document.activeElement), true);
  assert.equal(await name.inputValue(), '긴 한글 워크스페이스 '.repeat(10));
  await form.getByRole('button', { name: '만들기' }).click();
  await gate.waitFor();

  const environments = [];
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      for (const zoom of [100, 200]) {
        const observedZoom = await setZoom(zoom / 100);
        assert.equal(observedZoom, zoom / 100);
        await page.waitForTimeout(60);
        await gate.getByRole('button', { name: '취소' }).focus();
        const geometry = await gate.evaluate((node) => ({
          cssViewport: { width: innerWidth, height: innerHeight }, devicePixelRatio,
          horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          dialog: node.getBoundingClientRect().toJSON(),
          controls: [...node.querySelectorAll('button')].map((control) => control.getBoundingClientRect().height),
          bodyFocused: document.activeElement === document.body,
          popupWithinViewport: (() => { const r = node.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })(),
          popupScrollable: node.scrollHeight >= node.clientHeight,
          scrollReachability: (() => { node.scrollTop = node.scrollHeight; return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight, reachable: node.scrollTop === node.scrollHeight - node.clientHeight }; })(),
          form: document.querySelector('[data-workspace-create]')?.getBoundingClientRect().toJSON(),
          states: (() => {
            const surface = getComputedStyle(node);
            const summary = getComputedStyle(node.querySelector('[data-testid="grant-summary"]'));
            const warning = getComputedStyle(node.querySelector('[data-testid="grant-warning"]'));
            const focused = getComputedStyle(document.activeElement);
            const execute = getComputedStyle([...node.querySelectorAll('button')].find((button) => button.textContent.includes('실행')));
            return {
              surface: { background: surface.backgroundColor, border: surface.borderColor },
              summary: { color: summary.color }, warning: { color: warning.color },
              focused: { outlineColor: focused.outlineColor, outlineStyle: focused.outlineStyle, outlineWidth: focused.outlineWidth },
              execute: { color: execute.color, background: execute.backgroundColor, border: execute.borderColor },
            };
          })(),
          typography: {
            heading: (() => { const s = getComputedStyle(document.querySelector('[data-workspace-create-header] h3')); return { fontSize: s.fontSize, lineHeight: s.lineHeight }; })(),
            label: (() => { const s = getComputedStyle(document.querySelector('[data-workspace-create-field] > label')); return { fontSize: s.fontSize, lineHeight: s.lineHeight }; })(),
            input: (() => { const s = getComputedStyle(document.querySelector('[data-workspace-create-field] > input')); return { fontSize: s.fontSize, lineHeight: s.lineHeight, paddingLeft: s.paddingLeft }; })(),
            formGap: getComputedStyle(document.querySelector('[data-workspace-create] form')).gap,
            actionGap: getComputedStyle(document.querySelector('[data-workspace-create-actions]')).gap,
          },
        }));
        assert.equal(geometry.horizontalOverflow, false, JSON.stringify({ width, height, theme, zoom, geometry }));
        assert(geometry.controls.every((heightValue) => heightValue >= 36));
        assert.equal(geometry.bodyFocused, false);
        assert.equal(geometry.popupWithinViewport, true);
        assert(geometry.scrollReachability.reachable, JSON.stringify(geometry.scrollReachability));
        assert(geometry.form.width <= 560.5);
        const summaryRatio = contrastRatio(geometry.states.summary.color, geometry.states.surface.background);
        const warningRatio = contrastRatio(geometry.states.warning.color, geometry.states.surface.background);
        const executeRatio = contrastRatio(geometry.states.execute.color, geometry.states.execute.background);
        assert(summaryRatio >= 4.5 && warningRatio >= 4.5 && executeRatio >= 4.5, JSON.stringify({ summaryRatio, warningRatio, executeRatio, states: geometry.states }));
        assert.deepEqual(geometry.typography, { heading: { fontSize: '20px', lineHeight: '28px' }, label: { fontSize: '13px', lineHeight: '20px' }, input: { fontSize: '14px', lineHeight: '22px', paddingLeft: '12px' }, formGap: '20px', actionGap: '8px' });
        const screenshot = `create-${theme}-${width}x${height}-${zoom}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        environments.push({ requestedViewport: { width, height }, theme, zoom, observedZoom, geometry, screenshot });
      }
    }
  }
  assert.equal(environments.length, 12);

  const forcedColors = [];
  await page.emulateMedia({ forcedColors: 'active' });
  for (const zoom of [100, 200]) {
    const observedZoom = await setZoom(zoom / 100);
    await page.keyboard.press('Tab');
    const computed = await gate.evaluate((node) => {
      const style = getComputedStyle(node);
      const active = document.activeElement;
      return { color: style.color, backgroundColor: style.backgroundColor, borderColor: style.borderColor,
        keyboardFocusInside: node.contains(active), focusOutline: active === null ? '' : getComputedStyle(active).outlineStyle };
    });
    const screenshot = `create-forced-colors-${zoom}.png`;
    await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
    forcedColors.push({ zoom, observedZoom, active: await page.evaluate(() => matchMedia('(forced-colors: active)').matches), computed, screenshot });
  }
  assert(forcedColors.every((entry) => entry.active));
  assert(forcedColors.every((entry) => entry.computed.keyboardFocusInside));
  assert(forcedColors.every((entry) => entry.computed.focusOutline !== 'none'));
  await page.emulateMedia({ forcedColors: 'none' });
  const resetZoom = await setZoom(1);
  assert.equal(resetZoom, 1);

  let failAllRefreshOnce = true;
  await page.route('**/api/workspaces?scope=all', async (route) => {
    if (failAllRefreshOnce) { failAllRefreshOnce = false; await route.abort(); return; }
    await route.continue();
  });
  let releasePost;
  let observeHeldPost;
  const heldPostSeen = new Promise((resolve) => { observeHeldPost = resolve; });
  const heldPost = new Promise((resolve) => { releasePost = resolve; });
  await page.route('**/api/workspaces', async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    observeHeldPost();
    await heldPost;
    await route.continue();
  });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/workspaces') && response.request().method() === 'POST');
  await gate.getByRole('button', { name: '실행' }).click();
  await heldPostSeen;
  const postPending = {
    cancelDisabled: await gate.getByRole('button', { name: '취소' }).isDisabled(),
    executeDisabled: await gate.getByRole('button', { name: /만드는 중|실행/ }).isDisabled(),
  };
  assert(postPending.cancelDisabled && postPending.executeDisabled);
  await page.keyboard.press('Escape');
  assert.equal(await gate.count(), 1);
  releasePost();
  const creationResponse = await responsePromise;
  await page.unroute('**/api/workspaces');
  assert.equal(creationResponse.status(), 201);
  const created = await creationResponse.json();
  const refreshRetry = all.getByRole('button', { name: '목록 다시 불러오기' });
  await refreshRetry.waitFor();
  try {
    await page.waitForFunction((node) => node === document.activeElement, await refreshRetry.elementHandle());
  } catch (error) {
    console.error('refresh fallback focus diagnostic', await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName,
      activeText: document.activeElement?.textContent,
      activeAriaLabel: document.activeElement?.getAttribute('aria-label'),
      activeSlot: document.activeElement?.getAttribute('data-slot'),
      dialogs: document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length,
    })));
    throw error;
  }
  const refreshFailure = {
    acceptedMessage: await all.getByRole('alert', { name: '워크스페이스 생성 결과' }).innerText(),
    fallbackFocus: await refreshRetry.evaluate((node) => node === document.activeElement),
    postCount: posts.length,
  };
  assert.match(refreshFailure.acceptedMessage, /워크스페이스를 만들었습니다/);
  assert(refreshFailure.fallbackFocus);
  assert.equal(refreshFailure.postCount, 1);
  await page.unroute('**/api/workspaces?scope=all');
  await refreshRetry.click();
  await all.getByRole('status', { name: '워크스페이스 생성 결과' }).waitFor();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], { name: '긴 한글 워크스페이스 '.repeat(10).trim(), administratorId: posts[0].administratorId, defaultGroupLevel: 'edit' });
  const authoritative = await page.evaluate(async () => (await fetch('/api/workspaces?scope=all')).json());
  assert(authoritative.some((row) => row.id === created.workspace.id));
  editorInvariants.completed = await assertEditorInvariant('creation-complete');

  await logout();
  await loginAs(page, managerName, managerPassword);
  const managerVisible = await page.evaluate(async () => (await fetch('/api/workspaces')).json());
  assert(managerVisible.some((row) => row.id === created.workspace.id));
  await logout();
  await loginAs(page, viewerName, viewerPassword);
  const defaultVisible = await page.evaluate(async () => (await fetch('/api/workspaces')).json());
  assert(defaultVisible.some((row) => row.id === created.workspace.id));

  fs.writeFileSync(path.join(output, 'browser-matrix.json'), JSON.stringify({
    runner: 'Playwright-owned isolated persistent Chromium/profile with temporary extension chrome.tabs.setZoom/getZoom',
    posts, createdWorkspaceId: created.workspace.id, environments, forcedColors,
    zoomReset: resetZoom,
    transition: { selectedBefore, scrollBefore, cancelRestored: true, refreshFailure },
    measuredStates: { independentScroll, pickerContainment, controlContrast, pickerSelectedContrast, livePickerStates, hoverBefore, hoverAfter, invalidState, loadingState, disabledStateContrast, errorState, contrast, pendingNavigation, escapeCancel, frozenSummaryColors, postPending, editorInvariants },
    roles: { nonSuperuserUiHidden: true, directPostRejected: direct, selectedAdministratorAccess: true, defaultGroupEditAccess: true },
    ime: { playwrightCompositionStartUpdateEndInputPreservation: true, pickerSelectionSuppressedDuringComposition: true, nativeWindowsIme: 'unverified: OS automation is prohibited for this issue' },
    coverageLimits: {
      nativeIme: 'unverified because OS automation is prohibited',
      droppedResponseBoundary: 'component contract only; browser routing cannot prove whether an aborted response crossed the server commit boundary',
      liveAuthorityLoss: 'not mutated during the accepted creation; non-superuser HTTP and hidden-UI paths are measured separately',
      readonlySummary: 'frozen L2 summary exposes aria-readonly semantics and its text contrast is measured',
    },
  }, null, 2));
  console.log('PASS issue73 creation and 12-environment browser matrix');
} finally {
  await context?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
