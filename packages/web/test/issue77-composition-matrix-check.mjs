import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { chromium } = createRequire(new URL('../../editor/package.json', import.meta.url))('playwright');

export const COMPOSITION_MATRIX = Object.freeze(
  ['live-preview', 'source'].flatMap((mode) =>
    ['light', 'dark'].flatMap((theme) => [1, 2].map((zoom) => ({ mode, theme, zoom }))),
  ),
);

export const REQUIRED_CELL_FIELDS = Object.freeze([
  'productEntry', 'mountedIdentity', 'preState', 'events', 'composingEnter',
  'cancellationCorrection', 'exactResult', 'undo', 'autosave', 'ctrlSReadback',
  'themeTransition', 'zoomTransition', 'resizeTransition', 'nativeLimitation',
]);

export const REQUIRED_CONSUMERS = Object.freeze(['form', 'principalPicker', 'l2', 'l3']);

export function validateCompositionEvidence(evidence) {
  assert.equal(evidence.schemaVersion, 1, 'schemaVersion must be 1');
  assert.equal(evidence.cells?.length, 8, 'composition evidence must contain exactly 8 cells');
  const keys = evidence.cells.map(({ mode, theme, zoom }) => `${mode}/${theme}/${zoom}`).sort();
  assert.deepEqual(keys, COMPOSITION_MATRIX.map(({ mode, theme, zoom }) => `${mode}/${theme}/${zoom}`).sort());
  for (const cell of evidence.cells) {
    for (const field of REQUIRED_CELL_FIELDS) assert.notEqual(cell[field], undefined, `${cell.mode}/${cell.theme}/${cell.zoom} missing ${field}`);
    assert.equal(cell.productEntry, 'built App + owned server/database/storage');
    if (cell.verdict === 'PASS') assert.equal(cell.exactResult.persistedBody, cell.exactResult.expectedBody);
    assert(['PASS', 'FAIL'].includes(cell.verdict), `${cell.mode}/${cell.theme}/${cell.zoom} missing verdict`);
    if (cell.verdict === 'PASS') assert.equal(cell.exactResult.selectionPreserved, true);
    if (cell.verdict === 'FAIL') assert(cell.findings.length > 0);
    if (cell.verdict === 'PASS') assert.equal(cell.composingEnter.unintendedMutation, false);
    if (cell.verdict === 'PASS') {
      assert.equal(cell.undo.removed, true);
      assert.equal(cell.undo.restored, true);
      assert.equal(cell.autosave.readbackMatched, true);
      assert.equal(cell.ctrlSReadback.readbackMatched, true);
    }
    assert.deepEqual(cell.zoomTransition.sequence, [1, 2, 1]);
    assert.equal(cell.zoomTransition.independentRead200, 2);
    assert.equal(cell.zoomTransition.independentReadReset, 1);
    assert.match(cell.nativeLimitation, /not exercised/i);
    assert(cell.events.some((event) => event.type === 'compositionstart' && event.constructor === 'CompositionEvent' && event.isTrusted === false));
    assert(cell.events.some((event) => event.type === 'compositionupdate' && event.constructor === 'CompositionEvent' && event.isTrusted === false));
    assert(cell.events.some((event) => event.type === 'input' && event.constructor === 'InputEvent' && event.isComposing === true));
    assert(cell.events.some((event) => event.type === 'compositionend' && event.constructor === 'CompositionEvent' && event.isTrusted === false));
    assert.equal(cell.cancellationCorrection.cancelledValueUnchanged, true);
    assert.equal(cell.mountedIdentity.before, cell.mountedIdentity.after);
    assert.equal(cell.resizeTransition.sameMounted, true);
    assert.equal(cell.themeTransition.systemDark, 'dark');
    assert.equal(cell.themeTransition.systemLight, 'light');
    assert(cell.exactResult.bytes > 0);
  }
  for (const consumer of REQUIRED_CONSUMERS) {
    const disposition = evidence.consumers?.[consumer];
    assert(disposition, `missing ${consumer} consumer disposition`);
    assert(['PASS', 'BLOCKED'].includes(disposition.verdict), `${consumer} has invalid verdict`);
    if (disposition.verdict === 'BLOCKED') assert.match(disposition.blocker ?? '', /(missing|unavailable|no actual product|not exposed)/i);
  }
  assert.equal(evidence.method.cdpInput, false);
  assert.equal(evidence.method.osAutomation, false);
  assert.match(evidence.method.nativeLimitation, /candidate-window.*not exercised/i);
  return evidence;
}

function extensionAt(root) {
  const extension = path.join(root, 'zoom-extension');
  fs.mkdirSync(extension);
  fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'issue77 composition zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
  return extension;
}

async function login(page, origin, user, password) {
  await page.goto(origin, { waitUntil: 'networkidle' });
  const ok = await page.evaluate(async ([name, pass]) => (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: pass }) })).ok, [user, password]);
  assert.equal(ok, true, 'owned account login failed');
}

async function createDocument(page) {
  return page.evaluate(async (stamp) => {
    const tree = await (await fetch('/api/tree')).json();
    const workspace = tree[0]?.workspace;
    if (!workspace) return { error: 'GET /api/tree exposed no owned workspace' };
    const directoryResponse = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'directory', name: `issue77-composition-directory-${stamp}` }) });
    if (!directoryResponse.ok) return { error: `POST directory /api/nodes returned ${directoryResponse.status}` };
    const directory = await directoryResponse.json();
    const created = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name: `issue77-composition-matrix-${stamp}.md` }) });
    if (!created.ok) return { error: `POST /api/nodes returned ${created.status}` };
    const node = await created.json();
    const current = await (await fetch(`/api/documents/${node.id}`)).json();
    const initial = '# 조합 행렬\n\n시작 본문';
    const saved = await fetch(`/api/documents/${node.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: initial, baseHash: current.hash }) });
    return saved.ok ? { node, directory, initial } : { error: `PUT seed returned ${saved.status}` };
  }, Date.now());
}

async function setProductTheme(page, preference) {
  const gear = page.getByRole('button', { name: '설정', exact: true });
  await gear.click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.waitFor();
  await dialog.getByRole('tab', { name: '외모(테마)', exact: true }).click();
  await dialog.locator('[role="tabpanel"]:visible select').selectOption(preference);
  await dialog.locator('[data-settings-header] button').click();
  await dialog.waitFor({ state: 'detached' });
}

async function getBody(page, nodeId) {
  return page.evaluate(async (id) => await (await fetch(`/api/documents/${id}`)).json(), nodeId);
}

async function selectionOf(locator, mode) {
  if (mode === 'source') return locator.evaluate((node) => ({ start: node.selectionStart, end: node.selectionEnd, direction: node.selectionDirection }));
  return locator.evaluate((node) => {
    const selection = getSelection();
    return { text: selection?.toString() ?? '', anchorInside: !!selection?.anchorNode && node.contains(selection.anchorNode), focusInside: !!selection?.focusNode && node.contains(selection.focusNode) };
  });
}

async function eventsOn(locator) {
  return locator.evaluate((node) => {
    const events = [];
    const record = (event) => events.push({ type: event.type, constructor: event.constructor.name, isTrusted: event.isTrusted, isComposing: event.isComposing ?? null, data: event.data ?? null, inputType: event.inputType ?? null, defaultPrevented: event.defaultPrevented });
    for (const type of ['compositionstart', 'compositionupdate', 'beforeinput', 'input', 'compositionend', 'keydown']) node.addEventListener(type, record);
    node.__issue77CompositionEvents = events;
    return events;
  });
}

async function inputValue(locator, mode) {
  return mode === 'source' ? locator.inputValue() : locator.textContent();
}

async function dispatchComposition(locator, type, data) {
  await locator.evaluate((node, event) => node.dispatchEvent(new CompositionEvent(event.type, { bubbles: true, cancelable: true, composed: true, data: event.data })), { type, data });
}

async function runCell({ page, worker, nodeId, cell, index, writes }) {
  const modeLabel = cell.mode === 'source' ? '소스' : '라이브 프리뷰';
  await page.getByRole('button', { name: modeLabel, exact: true }).click();
  await setProductTheme(page, cell.theme);
  const editor = cell.mode === 'source'
    ? page.getByRole('textbox', { name: '원문' })
    : page.locator('[data-document-body] .cm-content');
  await editor.waitFor();
  const bodyBefore = await getBody(page, nodeId);
  const writesBefore = writes.length;
  await editor.evaluate((node, id) => { node.dataset.issue77CompositionIdentity = id; }, `cell-${index}`);
  await editor.focus();
  await page.keyboard.press('Control+End');
  if (cell.mode === 'source') await editor.evaluate((node) => node.setSelectionRange(node.value.length - 2, node.value.length, 'backward'));
  else await page.keyboard.press('Shift+ArrowLeft');
  const selection = await selectionOf(editor, cell.mode);
  const preState = { value: await inputValue(editor, cell.mode), selection };
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+End');
  await eventsOn(editor);

  const correction = `한글${index}정정`;
  await dispatchComposition(editor, 'compositionstart', 'ㅎ');
  await dispatchComposition(editor, 'compositionupdate', `한글${index}오타`);
  const beforeCancel = await inputValue(editor, cell.mode);
  await dispatchComposition(editor, 'compositionend', '');
  const afterCancel = await inputValue(editor, cell.mode);
  assert.equal(afterCancel, beforeCancel, 'cancelled composition changed product text');
  await dispatchComposition(editor, 'compositionstart', 'ㅎ');
  await dispatchComposition(editor, 'compositionupdate', correction);
  await editor.evaluate((node, data) => node.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false, composed: true, data, inputType: 'insertCompositionText', isComposing: true })), correction);
  const beforeEnter = await inputValue(editor, cell.mode);
  const composingEnter = await editor.evaluate((node) => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, cancelable: true, isComposing: true });
    const dispatched = node.dispatchEvent(event);
    return { dispatched, defaultPrevented: event.defaultPrevented, isTrusted: event.isTrusted };
  });
  const afterEnter = await inputValue(editor, cell.mode);
  await page.keyboard.insertText(correction);
  await dispatchComposition(editor, 'compositionend', correction);
  await page.keyboard.insertText('!');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText(`후속${index}`);
  const afterEdit = await inputValue(editor, cell.mode);
  assert(afterEdit.includes(`${correction}!`));
  assert(afterEdit.includes(`후속${index}`));

  await page.keyboard.press('Control+z');
  const afterUndo = await inputValue(editor, cell.mode);
  await page.keyboard.press('Control+y');
  const afterRedo = await inputValue(editor, cell.mode);
  assert(!afterUndo.includes(`후속${index}`));
  assert(afterRedo.includes(`후속${index}`));

  // Live-preview places text typed at the visual end into a new Markdown block and
  // keeps the following visual line as a plain Markdown paragraph. Source mode edits the
  // textarea bytes directly at EOF.
  const expectedBody = cell.mode === 'live-preview'
    ? `${bodyBefore.body}\n${correction}!\n후속${index}`
    : `${bodyBefore.body}${correction}!\n후속${index}`;
  // The product debounce is 2,000 ms. Use an explicit Playwright wait here: an
  // async waitForFunction callback can reject before polling and would make a
  // swallowed timeout look like an autosave failure.
  await page.waitForTimeout(2_600);
  const autosaved = await getBody(page, nodeId);
  const autosaveWrites = writes.slice(writesBefore);
  await editor.focus();
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(300);
  const readback = await getBody(page, nodeId);
  assert(readback.body.includes(`${correction}!`));
  assert(readback.body.includes(`후속${index}`));

  await editor.focus();
  if (cell.mode === 'source') await editor.evaluate((node) => node.setSelectionRange(2, 7, 'backward'));
  else { await page.keyboard.press('Control+Home'); await page.keyboard.press('Shift+ArrowRight'); }
  const transitionSelection = await selectionOf(editor, cell.mode);
  const themeBefore = await page.locator('html').getAttribute('data-theme');
  await setProductTheme(page, 'system');
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(50);
  const systemDark = await page.locator('html').getAttribute('data-theme');
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(50);
  const systemLight = await page.locator('html').getAttribute('data-theme');
  await setProductTheme(page, cell.theme);

  const tabId = await worker.evaluate(async (target) => (await chrome.tabs.query({})).find((tab) => tab.url === target)?.id, page.url());
  assert.notEqual(tabId, undefined);
  const setZoom = (value) => worker.evaluate(
    ({ id, value }) => new Promise((resolve, reject) => chrome.tabs.setZoom(id, value, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve())),
    { id: tabId, value },
  );
  const getZoom = () => worker.evaluate((id) => chrome.tabs.getZoom(id), tabId);
  await setZoom(1); const independentRead100 = await getZoom();
  await setZoom(2); const independentRead200 = await getZoom();
  const zoom200Viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  await page.setViewportSize({ width: 1280, height: 720 });
  const resized = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  await setZoom(1); const independentReadReset = await getZoom();
  await page.setViewportSize({ width: 1440, height: 900 });
  if (cell.zoom === 2) { await setZoom(2); assert.equal(await getZoom(), 2); }
  const identityAfter = await editor.getAttribute('data-issue77-composition-identity');
  await editor.focus();
  await page.waitForTimeout(100);
  const selectionAfterTransitions = await selectionOf(editor, cell.mode);
  assert.equal(identityAfter, `cell-${index}`);
  const selectionPreserved = JSON.stringify(selectionAfterTransitions) === JSON.stringify(transitionSelection);
  const events = await editor.evaluate((node) => node.__issue77CompositionEvents);
  const findings = [];
  if (!selectionPreserved) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: selectionAfterTransitions, expected: transitionSelection, reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: select editor text, perform mounted system dark/light and fixed-theme transitions, then inspect selection` });
  if (afterEnter !== beforeEnter) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: afterEnter, expected: beforeEnter, reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: dispatch composing Enter after compositionstart/update and InputEvent` });
  if (readback.body !== expectedBody) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: readback.body, expected: expectedBody, reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: compare exact saved source bytes after correction, punctuation and newline` });
  if (afterUndo.includes(`후속${index}`) || !afterRedo.includes(`후속${index}`)) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: { afterUndo, afterRedo }, expected: 'undo removes and redo restores the deliberate edit', reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: Control+Z then Control+Y` });
  if (!autosaved.body.includes(`${correction}!`) || !autosaved.body.includes(`후속${index}`)) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: autosaved.body, expected: 'normal debounce persists exact composition and deliberate edit before Ctrl+S', reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: wait for normal autosave readback` });
  if (readback.body !== expectedBody) findings.push({ severity: 'HIGH', contract: 'IR-EDITOR-002 AC-5', observed: readback.body, expected: expectedBody, reproduction: `${cell.mode}/${cell.theme}/${cell.zoom}: Ctrl+S followed by exact server readback` });
  return {
    ...cell,
    productEntry: 'built App + owned server/database/storage',
    mountedIdentity: { before: `cell-${index}`, after: identityAfter },
    preState: { ...preState, selection: transitionSelection },
    events,
    composingEnter: { ...composingEnter, before: beforeEnter, after: afterEnter, unintendedMutation: afterEnter !== beforeEnter },
    cancellationCorrection: { cancelledValueUnchanged: beforeCancel === afterCancel, correctedText: correction },
    verdict: findings.length === 0 ? 'PASS' : 'FAIL',
    findings,
    exactResult: { expectedBody, persistedBody: readback.body, bytes: Buffer.byteLength(readback.body), selectionAfterTransitions, selectionPreserved },
    undo: { removed: !afterUndo.includes(`후속${index}`), restored: afterRedo.includes(`후속${index}`) },
    autosave: { readbackMatched: autosaved.body.includes(`${correction}!`) && autosaved.body.includes(`후속${index}`), exactBody: autosaved.body, writesBeforeCtrlS: autosaveWrites, documentedBehavior: 'normal debounce readback captured before Ctrl+S' },
    ctrlSReadback: { readbackMatched: readback.body === expectedBody, exactBody: readback.body, hash: readback.hash },
    themeTransition: { before: themeBefore, systemDark, systemLight, restoredPreference: cell.theme },
    zoomTransition: { sequence: [1, 2, 1], independentRead100, independentRead200, independentReadReset, finalRequested: cell.zoom, zoom200Viewport },
    resizeTransition: { sameMounted: identityAfter === `cell-${index}`, resized, restored: { width: 1440, height: 900 } },
    nativeLimitation: 'Native Windows IME/candidate-window input was not exercised; synthetic DOM composition only.',
  };
}

async function openShareFromTree(page, nodeId) {
  const row = page.locator(`[data-node-id="${nodeId}"]`);
  await row.waitFor();
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem').filter({ hasText: '공유' }).click();
  const share = page.locator('[data-share-dialog]');
  await share.waitFor();
  return share;
}

async function guardedEnter(target) {
  return target.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'ㅎ' }));
    node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '한' }));
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, cancelable: true, isComposing: true });
    const dispatched = node.dispatchEvent(event);
    node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    return { dispatched, defaultPrevented: event.defaultPrevented };
  });
}

async function inspectConsumers(page, nodeId, directoryId, targetPrincipal) {
  const result = {};
  const passwordRequests = [];
  const mutations = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') mutations.push({ method: request.method(), pathname });
    if (request.method() === 'POST' && pathname === '/api/auth/password') passwordRequests.push(request.postData());
  });
  try {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '설정' });
    await dialog.getByRole('tab', { name: '계정', exact: true }).click();
    const panel = dialog.locator('[role="tabpanel"]:visible');
    await panel.locator('button').first().click();
    const form = panel.locator('form[data-password-change-form]');
    const input = form.locator('input[name="current"]');
    await input.dispatchEvent('compositionstart', { data: 'ㅎ' });
    await input.dispatchEvent('compositionupdate', { data: '한' });
    const enter = await input.evaluate((node) => { const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, bubbles: true, cancelable: true, isComposing: true }); const dispatched = node.dispatchEvent(event); return { dispatched, defaultPrevented: event.defaultPrevented }; });
    await input.dispatchEvent('compositionend', { data: '' });
    assert.equal(enter.defaultPrevented, true);
    assert.equal(passwordRequests.length, 0);
    result.form = { verdict: 'PASS', surface: 'actual PasswordChangeForm in built App settings', composingEnter: enter, requests: 0 };
    await dialog.locator('[data-settings-header] button').click();
  } catch (error) {
    result.form = { verdict: 'BLOCKED', blocker: `actual product form unavailable: ${error.message}` };
  }

  try {
    const share = await openShareFromTree(page, nodeId);
    const picker = page.locator('[cmdk-input]').first();
    await picker.waitFor();
    const enter = await guardedEnter(picker);
    assert.equal(enter.defaultPrevented, true);
    result.principalPicker = { verdict: 'PASS', surface: 'actual ShareModal PrincipalPicker', composingEnter: enter };
    await picker.fill(targetPrincipal);
    const option = share.locator('[cmdk-item]').filter({ hasText: targetPrincipal });
    await option.waitFor();
    await option.click();
    const writesBeforeL2 = mutations.length;
    await share.locator('[data-share-grant] button').click();
    const l2 = page.getByRole('alertdialog');
    await l2.waitFor();
    const l2Enter = await guardedEnter(l2);
    assert.equal(l2Enter.defaultPrevented, true);
    assert.equal(mutations.length, writesBeforeL2);
    result.l2 = { verdict: 'PASS', surface: 'actual ShareModal suspended-principal L2 ConfirmGate', composingEnter: l2Enter, mutations: 0 };
    await l2.getByRole('button', { name: '취소' }).click();
    await share.getByRole('button', { name: '공유 닫기' }).click();

    const directoryShare = await openShareFromTree(page, directoryId);
    await directoryShare.getByTestId('break-inheritance').click();
    const l3 = page.getByRole('alertdialog');
    await l3.waitFor();
    const writesBeforeL3 = mutations.length;
    const l3Enter = await guardedEnter(l3.locator('input'));
    assert.equal(l3Enter.defaultPrevented, true);
    assert.equal(mutations.length, writesBeforeL3);
    result.l3 = { verdict: 'PASS', surface: 'actual directory ShareModal break-inheritance L3 ConfirmGate', composingEnter: l3Enter, mutations: 0 };
    await l3.getByRole('button', { name: '취소' }).click();
    await directoryShare.getByRole('button', { name: '공유 닫기' }).click();
  } catch (error) {
    result.principalPicker = { verdict: 'BLOCKED', blocker: `actual product PrincipalPicker unavailable: ${error.message}` };
    result.l2 = { verdict: 'BLOCKED', blocker: 'actual product L2 entry unavailable after PrincipalPicker discovery failed' };
    result.l3 = { verdict: 'BLOCKED', blocker: 'actual product L3 entry unavailable after PrincipalPicker discovery failed' };
  }
  return result;
}

export async function runCompositionMatrix({ origin, user, password, targetPrincipal, output }) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue77-composition-matrix-browser-'));
  const extension = extensionAt(temporaryRoot);
  fs.mkdirSync(output, { recursive: true });
  let context;
  const nodeIds = [];
  try {
    context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), { headless: false, viewport: { width: 1440, height: 900 }, colorScheme: 'light', args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
    if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
    const worker = context.serviceWorkers()[0];
    const page = context.pages()[0] ?? await context.newPage();
    const writes = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && /\/api\/documents\//.test(new URL(request.url()).pathname)) writes.push({ at: new Date().toISOString(), body: request.postDataJSON() });
    });
    await login(page, origin, user, password);
    const fixture = await createDocument(page);
    assert.equal(fixture.error, undefined, fixture.error);
    nodeIds.push(fixture.node.id, fixture.directory.id);
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: fixture.node.name }).first().click();
    await page.locator('[data-document-surface]').waitFor();
    await page.getByRole('button', { name: '편집', exact: true }).click();

    const cells = [];
    for (const [index, cell] of COMPOSITION_MATRIX.entries()) cells.push(await runCell({ page, worker, nodeId: fixture.node.id, cell, index, writes }));
    if (await worker.evaluate(async (target) => chrome.tabs.getZoom((await chrome.tabs.query({})).find((tab) => tab.url === target).id), page.url()) !== 1) {
      await worker.evaluate(async (target) => chrome.tabs.setZoom((await chrome.tabs.query({})).find((tab) => tab.url === target).id, 1), page.url());
    }
    const consumers = await inspectConsumers(page, fixture.node.id, fixture.directory.id, targetPrincipal);
    const evidence = validateCompositionEvidence({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      source: { revision: process.env.DOCULIGHT_ISSUE77_REVISION ?? 'unrecorded-by-caller', browser: await context.browser()?.version?.() },
      method: { playwrightOwnedPersistentChromium: true, cdpInput: false, osAutomation: false, nativeLimitation: 'Native Windows IME candidate-window and physical keyboard behavior were not exercised.' },
      cells,
      consumers,
    });
    evidence.overallVerdict = cells.every((cell) => cell.verdict === 'PASS') ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(output, 'issue77-composition-matrix-result.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    return evidence;
  } finally {
    if (nodeIds.length > 0 && context) await context.pages()[0]?.evaluate(async (ids) => { for (const id of ids) await fetch(`/api/nodes/${id}`, { method: 'DELETE' }); }, nodeIds).catch(() => undefined);
    await context?.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const origin = process.env.WEB_URL;
  const user = process.env.DOCULIGHT_E2E_USER;
  const password = process.env.DOCULIGHT_E2E_PASS;
  const targetPrincipal = process.env.DOCULIGHT_ISSUE77_TARGET_PRINCIPAL;
  const output = process.env.DOCULIGHT_ISSUE77_COMPOSITION_OUTPUT_DIR;
  if (!origin || !user || !password || !targetPrincipal || !output) throw new Error('WEB_URL, account, target principal and output directory are required');
  const evidence = await runCompositionMatrix({ origin, user, password, targetPrincipal, output });
  if (evidence.overallVerdict === 'FAIL') {
    console.error(`FAIL issue77 actual-product composition matrix; evidence retained: ${output}`);
    process.exitCode = 1;
  } else console.log(`PASS issue77 actual-product composition matrix: ${output}`);
}
