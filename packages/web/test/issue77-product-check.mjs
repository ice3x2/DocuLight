import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(new URL('../../editor/package.json', import.meta.url))('playwright');
const origin = process.env.WEB_URL;
const user = process.env.DOCULIGHT_E2E_USER;
const password = process.env.DOCULIGHT_E2E_PASS;
const output = process.env.DOCULIGHT_ISSUE77_OUTPUT_DIR;
if (!origin || !user || !password || !output) throw new Error('owned product URL, account, and output directory are required');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue77-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'issue77 zoom', version: '1', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(()=>{});');
fs.mkdirSync(output, { recursive: true });

let context;
let nodeId;
try {
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
    headless: false,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (!context.serviceWorkers().length) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  const loggedIn = await page.evaluate(async ([name, pass]) => {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, password: pass }) });
    return response.ok;
  }, [user, password]);
  assert.equal(loggedIn, true);
  const fixture = await page.evaluate(async (stamp) => {
    const tree = await (await fetch('/api/tree')).json();
    const workspace = tree[0]?.workspace;
    if (!workspace) return { error: 'workspace missing' };
    const created = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name: `issue77-composition-${stamp}.md` }) });
    if (!created.ok) return { error: `create ${created.status}` };
    const node = await created.json();
    const read = await (await fetch(`/api/documents/${node.id}`)).json();
    const initial = '# 조합 회귀\n\n시작 본문';
    const saved = await fetch(`/api/documents/${node.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: initial, baseHash: read.hash }) });
    return saved.ok ? { node, initial } : { error: `seed ${saved.status}` };
  }, Date.now());
  assert.equal(fixture.error, undefined, fixture.error);
  nodeId = fixture.node.id;

  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: fixture.node.name }).first().click();
  await page.locator('[data-document-surface]').waitFor();
  await page.getByRole('button', { name: '편집', exact: true }).click();
  const content = page.locator('[data-document-body] .cm-content');
  await content.click();
  await page.keyboard.press('Control+End');
  const liveEvents = await content.evaluate((node) => {
    const events = [];
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input']) node.addEventListener(type, (event) => events.push({ type, isTrusted: event.isTrusted, isComposing: event.isComposing ?? null, data: event.data ?? null }));
    globalThis.__issue77LiveEvents = events;
    node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '한' }));
    node.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '한글' }));
    return events;
  });
  await page.keyboard.insertText('한글');
  const composingEnter = await content.evaluate((node) => {
    const before = node.textContent;
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    const dispatched = node.dispatchEvent(event);
    return { before, after: node.textContent, defaultPrevented: event.defaultPrevented, dispatched, isTrusted: event.isTrusted };
  });
  assert.equal(composingEnter.after, composingEnter.before);
  await content.dispatchEvent('compositionend', { data: '한글' });
  await page.keyboard.insertText('!');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('다음 줄');

  await page.getByRole('button', { name: '소스', exact: true }).click();
  const source = page.getByRole('textbox', { name: '원문' });
  await source.waitFor();
  await source.press('Control+End');
  await source.dispatchEvent('compositionstart', { data: '소' });
  await source.dispatchEvent('compositionupdate', { data: '소스조합' });
  await page.keyboard.insertText(' 소스조합');
  const sourceEnter = await source.evaluate((node) => {
    const before = node.value;
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing: true });
    const dispatched = node.dispatchEvent(event);
    return { before, after: node.value, defaultPrevented: event.defaultPrevented, dispatched, isTrusted: event.isTrusted };
  });
  assert.equal(sourceEnter.after, sourceEnter.before);
  await source.dispatchEvent('compositionend', { data: '소스조합' });
  await page.keyboard.insertText('.');
  const expected = await source.inputValue();
  assert(expected.includes('한글!'));
  assert(expected.includes('다음 줄 소스조합.'));

  await source.evaluate((node) => { node.dataset.issue77Identity = 'source'; node.focus(); node.setSelectionRange(2, 7, 'backward'); });
  const selectionBefore = await source.evaluate((node) => [node.selectionStart, node.selectionEnd, node.selectionDirection]);
  const tabId = await worker.evaluate(async (target) => (await chrome.tabs.query({})).find((tab) => tab.url === target).id, page.url());
  const setZoom = (value) => worker.evaluate(({ id, value }) => chrome.tabs.setZoom(id, value), { id: tabId, value });
  const getZoom = () => worker.evaluate((id) => chrome.tabs.getZoom(id), tabId);
  await setZoom(1); assert.equal(await getZoom(), 1);
  await setZoom(2); assert.equal(await getZoom(), 2);
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await source.getAttribute('data-issue77-identity'), 'source');
  const selectionAfterZoom = await source.evaluate((node) => [node.selectionStart, node.selectionEnd, node.selectionDirection]);
  assert.deepEqual(selectionAfterZoom, selectionBefore);
  await setZoom(1); assert.equal(await getZoom(), 1);

  const putBodies = [];
  page.on('request', (request) => { if (request.method() === 'PUT' && request.url().includes(`/api/documents/${nodeId}`)) putBodies.push(request.postData()); });
  await source.press('Control+s');
  await page.waitForFunction((id) => fetch(`/api/documents/${id}`).then((response) => response.json()).then((document) => document.body.includes('소스조합.')), nodeId);
  const persisted = await page.evaluate(async (id) => await (await fetch(`/api/documents/${id}`)).json(), nodeId);
  assert.equal(persisted.body, expected);

  await page.getByRole('button', { name: '라이브 프리뷰', exact: true }).click();
  assert((await page.locator('[data-document-body] .cm-content').textContent()).includes('다음 줄'));
  const observedLiveEvents = await page.evaluate(() => globalThis.__issue77LiveEvents);
  const result = {
    pass: true,
    product: 'built App + owned server/database/storage',
    exactBytes: Buffer.byteLength(expected),
    persistedHash: persisted.hash,
    liveComposition: { events: observedLiveEvents, composingEnter },
    sourceComposition: { composingEnter: sourceEnter },
    zoom: { sequence: [1, 2, 1], separateReadback: true, viewportAfterResize: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) },
    selectionBefore,
    selectionAfter: selectionAfterZoom,
    putCount: putBodies.length,
    nativeWindowsIme: 'not exercised; no native claim',
  };
  fs.writeFileSync(path.join(output, 'product-composition-result.json'), JSON.stringify(result, null, 2));
  console.log('PASS issue77 built-product live/source composition, save readback, selection, resize, and true zoom');
} finally {
  if (nodeId && context) {
    const page = context.pages()[0];
    await page?.evaluate((id) => fetch(`/api/nodes/${id}`, { method: 'DELETE' }), nodeId).catch(() => undefined);
  }
  await context?.close();
  fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
