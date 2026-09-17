import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const { chromium } = createRequire(new URL('../../editor/package.json', import.meta.url))('playwright');
const webUrl = process.env.WEB_URL ?? 'http://127.0.0.1:3399/';
const user = process.env.DOCULIGHT_E2E_USER;
const password = process.env.DOCULIGHT_E2E_PASS;
if (!user || !password) throw new Error('authenticated disposable account is required');
const dataDir = process.env.DOCULIGHT_FIXTURE_DATA_DIR;
if (!dataDir) throw new Error('disposable data directory is required');
const evidenceDir = resolve('../../.kiwi/sessions/newspaper-20260916/evidence/issue58');
const zoomExtension = resolve('test/zoom-extension');
const binaryBytes = Buffer.from([0, 37, 80, 68, 70, 255, 12, 0]);
const markdownBytes = Buffer.from('# 교체된 본문\n', 'utf8');
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XG3pAAAAAElFTkSuQmCC', 'base64');
const hash = (value) => createHash('sha256').update(value).digest('hex');

const persistentContext = async (label, viewport, zoom = 1) => {
  const profile = await mkdtemp(join(tmpdir(), `doculight-issue58-${label}-`));
  const args = zoom === 2 ? [
    `--window-size=${viewport.width},${viewport.height}`,
    '--window-position=-32000,-32000',
    `--disable-extensions-except=${zoomExtension}`,
    `--load-extension=${zoomExtension}`,
  ] : [];
  const context = await chromium.launchPersistentContext(profile, { headless: zoom === 1, viewport, args });
  if (zoom === 2 && context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  return { context, profile, worker: context.serviceWorkers()[0] };
};

const closePersistent = async ({ context, profile }) => {
  await context.close();
  await rm(profile, { recursive: true, force: true });
};

const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

const login = async (page, name, pass) => {
  await page.goto(webUrl, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async ([loginName, loginPassword]) => {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: loginName, password: loginPassword }) });
    return { ok: response.ok, status: response.status };
  }, [name, pass]);
  assert.equal(result.ok, true, `login failed (${result.status})`);
};

const openNewVersion = async (page, name) => {
  const row = page.getByRole('treeitem', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: '새 버전 올리기' }).click();
  return page.locator('[data-new-version-prompt]');
};

const runProductMatrix = async (prepared, sessionCookies) => {
  const results = [];
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    for (const theme of ['light', 'dark']) {
      for (const zoom of [1, 2]) {
        const owned = await persistentContext(`matrix-${viewport.width}-${theme}-${zoom}`, viewport, zoom);
        try {
          await owned.context.addCookies(sessionCookies);
          const page = owned.context.pages()[0] ?? await owned.context.newPage();
          await page.goto(webUrl, { waitUntil: 'networkidle' });
          if (zoom === 2) {
            const actual = await owned.worker.evaluate(async (target) => {
              const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
              if (!tab?.id) throw new Error('product tab was not found');
              await chrome.tabs.setZoom(tab.id, 2);
              return chrome.tabs.getZoom(tab.id);
            }, webUrl);
            assert.equal(actual, 2);
          }
          await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
          await page.route(`**/d/${prepared.image.id}`, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: imageBytes }));
          const imageRow = page.getByRole('treeitem', { name: new RegExp(prepared.image.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
          await imageRow.click();
          await page.locator('[data-image-preview][data-image-state="loaded"]').waitFor();
          const shell = await page.evaluate(() => {
            const root = document.querySelector('[data-shell="root"]');
            const left = document.querySelector('[data-side="left"]');
            const main = document.querySelector('main');
            const right = document.querySelector('[data-side="right"]');
            const image = document.querySelector('[data-image-preview] img');
            const rect = (element) => element?.getBoundingClientRect().toJSON();
            return { viewport: { width: innerWidth, height: innerHeight }, root: { clientWidth: root?.clientWidth, scrollWidth: root?.scrollWidth }, left: rect(left), main: rect(main), right: rect(right), image: rect(image) };
          });
          assert(shell.left?.width > 0 && shell.main?.width > 0 && shell.right?.width > 0, 'all three product shell panels must remain reachable');
          assert(shell.image.width > 0 && shell.image.height > 0, 'product image preview must render');

          const prompt = await openNewVersion(page, prepared.binary.name);
          const upload = prompt.getByRole('button', { name: '새 버전 올리기' });
          assert.equal(await upload.isDisabled(), true);
          await prompt.locator('input[type=file]').setInputFiles({ name: '긴 한글 📎 교체.bin', mimeType: 'application/octet-stream', buffer: binaryBytes });
          await upload.hover();
          const presentation = await prompt.evaluate((element) => {
            const warning = element.querySelector('[data-slot="inline-notice"]');
            const action = [...element.querySelectorAll('button')].find((button) => button.textContent === '새 버전 올리기');
            const dialogStyle = getComputedStyle(element);
            const warningStyle = getComputedStyle(warning);
            const actionStyle = getComputedStyle(action);
            return { dialogColor: dialogStyle.color, dialogBackground: dialogStyle.backgroundColor, warningColor: warningStyle.color, warningBackground: warningStyle.backgroundColor, hoverBackground: actionStyle.backgroundColor };
          });
          assert(contrast(presentation.dialogColor, presentation.dialogBackground) >= 4.5, 'dialog text contrast');
          assert(contrast(presentation.warningColor, presentation.warningBackground) >= 4.5, 'warning text contrast');
          assert(contrast(presentation.hoverBackground, presentation.dialogBackground) >= 3, 'active action contrast');
          await upload.click();
          const alert = page.getByRole('alertdialog');
          const cancel = alert.getByRole('button', { name: '돌아가기' });
          await cancel.waitFor();
          const focusPresentation = await cancel.evaluate((element) => ({ outline: getComputedStyle(element).outlineColor, surrounding: getComputedStyle(element.closest('[role="alertdialog"]')).backgroundColor }));
          assert(contrast(focusPresentation.outline, focusPresentation.surrounding) >= 3, 'focus-ring contrast');
          await page.screenshot({ path: join(evidenceDir, `product-matrix-${viewport.width}-${theme}-${zoom}x.png`), fullPage: true });
          await cancel.scrollIntoViewIfNeeded();
          const cancelReachable = await cancel.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const owner = element.closest('[role="alertdialog"]').getBoundingClientRect();
            return box.top >= owner.top && box.bottom <= owner.bottom && box.top >= 0 && box.bottom <= innerHeight;
          });
          assert.equal(cancelReachable, true, 'product L2 cancel must remain reachable after internal scrolling');
          await page.screenshot({ path: join(evidenceDir, `product-actions-${viewport.width}-${theme}-${zoom}x.png`), fullPage: true });
          await cancel.click();
          await alert.waitFor({ state: 'detached' });
          results.push({ viewport, theme, zoom, shell, presentation, focusPresentation });
        } finally {
          await closePersistent(owned);
        }
      }
    }
  }
  await writeFile(join(evidenceDir, 'product-matrix.json'), JSON.stringify(results, null, 2));
  return results.length;
};

const ownerOwned = await persistentContext('owner', { width: 1440, height: 900 });
const ownerContext = ownerOwned.context;
const owner = await ownerContext.newPage();
let prepared;
try {
  await login(owner, user, password);
  prepared = await owner.evaluate(async ([stamp, imageValues]) => {
    const tree = await (await fetch('/api/tree')).json();
    const workspace = tree[0]?.workspace;
    if (!workspace) return { error: 'workspace missing' };
    const make = async (name) => {
      const response = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name }) });
      return response.ok ? response.json() : { error: `create ${name} failed ${response.status}` };
    };
    const markdown = await make(`issue58-${stamp}.md`);
    const binary = await make(`issue58-${stamp}.pdf`);
    const image = await make(`issue58-${stamp}-매우-긴-투명-이미지.png`);
    if (markdown.error || binary.error || image.error) return { error: markdown.error ?? binary.error ?? image.error };
    const imageForm = new FormData();
    imageForm.append('file', new Blob([new Uint8Array(imageValues)], { type: 'image/png' }), '다른-이미지-이름.png');
    const imageUploaded = await fetch(`/api/nodes/${image.id}/new-version`, { method: 'POST', body: imageForm });
    if (!imageUploaded.ok) return { error: `image upload failed ${imageUploaded.status}` };
    const initial = await (await fetch(`/api/documents/${markdown.id}`)).json();
    const saved = await fetch(`/api/documents/${markdown.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '# 이전 본문\n', baseHash: initial.hash }) });
    if (!saved.ok) return { error: `initial save failed ${saved.status}` };
    const viewerAccount = { name: `issue58-view-${stamp}`, password: `Issue58-${stamp}-pass` };
    const registered = await fetch('/api/roster/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(viewerAccount) });
    if (!registered.ok) return { error: `viewer registration failed ${registered.status}` };
    const principal = await registered.json();
    const shared = await fetch(`/api/nodes/${binary.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId: principal.id, level: 'view' }) });
    if (!shared.ok) return { error: `share failed ${shared.status}` };
    return { workspaceId: workspace.id, markdown, binary, image, viewerAccount };
  }, [Date.now(), [...imageBytes]]);
  assert.equal(prepared.error, undefined, prepared.error);
  await owner.goto(webUrl, { waitUntil: 'networkidle' });

  let requests = 0;
  owner.on('request', (request) => { if (request.url().includes('/new-version') && request.method() === 'POST') requests += 1; });
  let prompt = await openNewVersion(owner, prepared.binary.name);
  await prompt.locator('input[type=file]').setInputFiles({ name: '선택 📎.bin', mimeType: 'application/octet-stream', buffer: binaryBytes });
  await prompt.locator('[data-selected-file-name]').waitFor();
  assert.equal(requests, 0, 'binary selection uploaded before L2 consent');
  await prompt.getByRole('button', { name: '새 버전 올리기' }).click();
  let failTreeRefresh = true;
  await owner.route('**/api/tree', async (route) => {
    if (failTreeRefresh) {
      failTreeRefresh = false;
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    } else await route.continue();
  });
  const responsePromise = owner.waitForResponse((response) => response.url().includes(`/nodes/${prepared.binary.id}/new-version`) && response.request().method() === 'POST');
  await owner.getByRole('alertdialog').getByRole('button', { name: '교체하기' }).click();
  assert.equal((await responsePromise).status(), 204);
  assert.equal(requests, 1);
  const refreshError = prompt.getByRole('alert', { name: '새 버전 업로드 오류' });
  await refreshError.waitFor();
  assert.match(await refreshError.textContent(), /새 버전은 올라갔지만 화면을 새로 고치지 못했습니다/);
  const requestsBeforeRefreshRetry = requests;
  await refreshError.getByRole('button', { name: '화면 새로고침 다시 시도' }).click();
  await prompt.getByRole('status', { name: '새 버전 업로드 상태' }).filter({ hasText: '새 버전을 올렸습니다.' }).waitFor();
  assert.equal(requests, requestsBeforeRefreshRetry, 'refresh retry repeated upload POST');
  assert.equal(await owner.getByRole('alertdialog').count(), 0, 'refresh retry opened a new L2');
  const closeResult = prompt.getByRole('button', { name: '닫기' });
  assert.equal(await closeResult.evaluate((element) => element === document.activeElement), true, 'refresh retry success must focus close');
  await closeResult.click();
  await prompt.waitFor({ state: 'detached' });
  await owner.waitForTimeout(500);
  const focusAfterClose = await owner.evaluate((id) => {
    const named = [...document.querySelectorAll('[aria-describedby]')]
      .find((element) => element.getAttribute('aria-describedby') === `tree-name-${id}`);
    const expected = named?.closest('[role="treeitem"]')
      ?? document.querySelector('[role="treeitem"][aria-selected="true"]')
      ?? document.querySelector('[role="tree"]')
      ?? document.querySelector('[role="tab"][aria-controls$="-content-tree"]');
    return {
      matches: expected !== null && document.activeElement === expected,
      active: document.activeElement?.outerHTML,
      expected: expected?.outerHTML,
      named: named?.outerHTML,
    };
  }, prepared.binary.id);
  assert.equal(focusAfterClose.matches, true, `new-version close focus: ${JSON.stringify(focusAfterClose)}`);
  await owner.unroute('**/api/tree');
  const refreshedBinaryRow = owner.getByRole('treeitem', { name: new RegExp(prepared.binary.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await refreshedBinaryRow.click();
  await owner.getByRole('link', { name: `${prepared.binary.name} 내려받기` }).waitFor();
  const binaryResult = await owner.evaluate(async () => ({ tree: await (await fetch('/api/tree')).json() }));
  const stored = (await readdir(dataDir, { recursive: true, withFileTypes: true })).find((entry) => entry.isFile() && entry.name === prepared.binary.name);
  assert(stored, 'stored binary was not found in the disposable product data directory');
  assert.equal(hash(await readFile(join(stored.parentPath, stored.name))), hash(binaryBytes));
  const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children ?? [])]);
  const retained = binaryResult.tree.flatMap((workspace) => flatten(workspace.roots ?? [])).find((entry) => entry.id === prepared.binary.id);
  assert.equal(retained.name, prepared.binary.name);

  prompt = await openNewVersion(owner, prepared.markdown.name);
  const markdownResponse = owner.waitForResponse((response) => response.url().includes(`/nodes/${prepared.markdown.id}/new-version`) && response.request().method() === 'POST');
  await prompt.locator('input[type=file]').setInputFiles({ name: '다른 이름.md', mimeType: 'text/markdown', buffer: markdownBytes });
  assert.equal((await markdownResponse).status(), 204);
  assert.equal(await owner.getByRole('alertdialog').count(), 0);
  await prompt.getByRole('status', { name: '새 버전 업로드 상태' }).filter({ hasText: '새 버전을 올렸습니다.' }).waitFor();
  await prompt.getByRole('button', { name: '닫기' }).click();
  await prompt.waitFor({ state: 'detached' });
  const refreshedMarkdownRow = owner.getByRole('treeitem', { name: new RegExp(prepared.markdown.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await refreshedMarkdownRow.click();
  await owner.locator('.cm-content').filter({ hasText: '교체된 본문' }).waitFor();
  const markdownResult = await owner.evaluate(async (id) => ({ document: await (await fetch(`/api/documents/${id}`)).json(), versions: await (await fetch(`/api/documents/${id}/versions`)).json() }), prepared.markdown.id);
  assert.equal(markdownResult.document.body, markdownBytes.toString('utf8'));
  assert(markdownResult.versions.length >= 1, 'Markdown prior version was not retained');

  const exerciseObservedRefresh = async ({ label, failTree, failDocument }) => {
    let treeGets = 0;
    let documentGets = 0;
    await owner.route('**/api/tree', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      treeGets += 1;
      if (failTree && treeGets === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await owner.route(`**/api/documents/${prepared.markdown.id}`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      documentGets += 1;
      if (failDocument && documentGets === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    try {
      const beforePost = requests;
      const refreshPrompt = await openNewVersion(owner, prepared.markdown.name);
      const response = owner.waitForResponse((candidate) => candidate.url().includes(`/nodes/${prepared.markdown.id}/new-version`) && candidate.request().method() === 'POST');
      await refreshPrompt.locator('input[type=file]').setInputFiles({ name: `${label}.md`, mimeType: 'text/markdown', buffer: Buffer.from(`# ${label}\n`, 'utf8') });
      assert.equal((await response).status(), 204);
      assert.equal(requests, beforePost + 1, `${label}: upload POST count`);

      if (failTree || failDocument) {
        const error = refreshPrompt.getByRole('alert', { name: '새 버전 업로드 오류' });
        await error.waitFor();
        await error.getByRole('button', { name: '화면 새로고침 다시 시도' }).click();
        await refreshPrompt.getByRole('status', { name: '새 버전 업로드 상태' }).filter({ hasText: '새 버전을 올렸습니다.' }).waitFor();
      } else {
        await refreshPrompt.getByRole('status', { name: '새 버전 업로드 상태' }).filter({ hasText: '새 버전을 올렸습니다.' }).waitFor();
        assert.equal(await refreshPrompt.getByRole('button', { name: '화면 새로고침 다시 시도' }).count(), 0, `${label}: successful GET exposed retry`);
      }

      assert.equal(requests, beforePost + 1, `${label}: refresh repeated upload POST`);
      assert.equal(await owner.getByRole('alertdialog').count(), 0, `${label}: refresh opened a new L2`);
      assert.equal(treeGets, failTree ? 2 : 1, `${label}: tree GET cardinality`);
      assert.equal(documentGets, failDocument ? 2 : 1, `${label}: document GET cardinality`);
      await refreshPrompt.getByRole('button', { name: '닫기' }).click();
      await refreshPrompt.waitFor({ state: 'detached' });
      return { treeGets, documentGets };
    } finally {
      await owner.unroute('**/api/tree');
      await owner.unroute(`**/api/documents/${prepared.markdown.id}`);
    }
  };

  const documentOnlyRefresh = await exerciseObservedRefresh({ label: 'document-only-failure', failTree: false, failDocument: true });
  const bothRefresh = await exerciseObservedRefresh({ label: 'tree-and-document-failure', failTree: true, failDocument: true });
  const successfulRefresh = await exerciseObservedRefresh({ label: 'successful-refresh', failTree: false, failDocument: false });

  const viewerOwned = await persistentContext('viewer', { width: 1280, height: 720 });
  const viewerContext = viewerOwned.context;
  const viewer = await viewerContext.newPage();
  try {
    await login(viewer, prepared.viewerAccount.name, prepared.viewerAccount.password);
    await viewer.goto(webUrl, { waitUntil: 'networkidle' });
    const row = viewer.getByRole('treeitem', { name: new RegExp(prepared.binary.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
    await row.click({ button: 'right' });
    const blockedItem = viewer.getByRole('menuitem', { name: '새 버전 올리기' });
    assert.equal(await blockedItem.getAttribute('data-disabled'), '');
    const denied = await viewer.evaluate(async ([id, values]) => { const form = new FormData(); form.append('file', new Blob([new Uint8Array(values)]), 'denied.bin'); const response = await fetch(`/api/nodes/${id}/new-version`, { method: 'POST', body: form }); return response.status; }, [prepared.binary.id, [...binaryBytes]]);
    assert.equal(denied, 403);
  } finally { await closePersistent(viewerOwned); }

  const productMatrixCount = await runProductMatrix(prepared, await ownerContext.cookies());
  console.log(JSON.stringify({ pass: true, requirement: 'IR-SHELL-010', exactBinaryBytes: true, targetIdentityRetained: true, binarySurfaceRefreshed: true, markdownSurfaceRefreshed: true, markdownVersionRetained: true, failedTreeRefreshRetriedWithoutPost: true, documentOnlyRefresh, bothRefresh, successfulRefresh, successfulGetNotRepeated: true, totalNewVersionRequestCount: requests, viewOnlyActionDisabled: true, serverDenied403: true, productMatrixCount }));
} finally {
  if (prepared?.markdown?.id) await owner.evaluate(async (ids) => { for (const id of ids) await fetch(`/api/nodes/${id}`, { method: 'DELETE' }); }, [prepared.markdown.id, prepared.binary.id, prepared.image.id]).catch(() => {});
  await closePersistent(ownerOwned);
}
