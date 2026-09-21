import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
for (const name of ['WEB_URL', 'DOCULIGHT_E2E_USER', 'DOCULIGHT_E2E_PASS', 'DOCULIGHT_E2E_SOURCE', 'DOCULIGHT_E2E_WORKSPACE', 'DOCULIGHT_ISSUE79_PROFILE_ROOT', 'DOCULIGHT_ISSUE79_OUTPUT_DIR']) {
  if (!process.env[name]) throw new Error(`${name} missing`);
}
const output = path.resolve(process.env.DOCULIGHT_ISSUE79_OUTPUT_DIR);
fs.mkdirSync(output, { recursive: true });
const extension = path.join(root, 'packages/web/test/zoom-extension');
const observations = [];
const relocationRequests = [];
let context;

const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value) => {
  const channels = rgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (light + 0.05) / (dark + 0.05);
};
const pngDimensions = (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

try {
  context = await chromium.launchPersistentContext(process.env.DOCULIGHT_ISSUE79_PROFILE_ROOT, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0];
  const page = context.pages()[0] ?? await context.newPage();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes('/relocation-preview') || url.pathname.endsWith('/copy') || url.pathname.endsWith('/move')) {
      relocationRequests.push({ method: request.method(), pathname: url.pathname, search: url.search, postData: request.postData() });
    }
  });
  await page.goto(process.env.WEB_URL, { waitUntil: 'networkidle' });
  const inputs = page.locator('input');
  await inputs.nth(0).fill(process.env.DOCULIGHT_E2E_USER);
  await inputs.nth(1).fill(process.env.DOCULIGHT_E2E_PASS);
  await page.locator('button[type=submit]').click();
  await page.locator('[data-shell="root"]').waitFor();

  const tabId = await worker.evaluate(async (origin) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => typeof entry.url === 'string' && entry.url.startsWith(origin));
    if (tab?.id === undefined) throw new Error('owned product tab not found');
    return tab.id;
  }, process.env.WEB_URL);
  const setZoom = (value) => worker.evaluate(async ({ tabId, value }) => { await chrome.tabs.setZoom(tabId, value); }, { tabId, value });
  const getZoom = () => worker.evaluate(async (id) => chrome.tabs.getZoom(id), tabId);
  await setZoom(1);
  assert.equal(await getZoom(), 1);

  const openCopy = async () => {
    const row = page.locator(`[data-node-id="${process.env.DOCULIGHT_E2E_SOURCE}"]`);
    await row.waitFor();
    await row.click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem').filter({ hasText: '복사' }).click();
    const dialog = page.locator('[data-relocation-dialog]');
    await dialog.waitFor();
    const destination = dialog.getByLabel('목적지');
    await destination.focus();
    await page.keyboard.press('End');
    const lastOption = await destination.locator('option').last().getAttribute('value');
    assert(lastOption, 'last destination option missing');
    assert.equal(await destination.inputValue(), lastOption);
    await destination.selectOption(process.env.DOCULIGHT_E2E_WORKSPACE);
    await dialog.locator('[data-testid="relocation-preview"]').waitFor();
    return dialog;
  };

  let dialog = await openCopy();
  const copyResponsePromise = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/copy'));
  const execute = dialog.getByRole('button', { name: '복사', exact: true });
  await execute.focus();
  await page.keyboard.press('Enter');
  let confirmation = page.getByRole('alertdialog');
  await confirmation.waitFor();
  assert.equal(await confirmation.getByRole('button', { name: '취소' }).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Escape');
  await confirmation.waitFor({ state: 'detached' });
  assert.equal(await execute.evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('Enter');
  confirmation = page.getByRole('alertdialog');
  await confirmation.waitFor();
  const accept = confirmation.getByRole('button', { name: '실행' });
  await accept.focus();
  await page.keyboard.press('Enter');
  const copyResponse = await copyResponsePromise;
  assert.equal(copyResponse.status(), 200);
  const copyReceipt = await copyResponse.json();
  assert.deepEqual(Object.keys(copyReceipt).sort(), ['copied', 'id', 'name']);
  assert.equal(copyReceipt.name, '프로젝트 자료 (2)');
  assert.equal(copyReceipt.copied, 2);
  assert.equal(relocationRequests.filter((entry) => entry.method === 'POST').length, 1);
  await page.getByText(`2개 항목을 복사했습니다. 결과 이름: ${copyReceipt.name}`).waitFor();
  await dialog.waitFor({ state: 'detached' });
  await page.locator(`[data-node-id="${process.env.DOCULIGHT_E2E_SOURCE}"]`).waitFor();

  for (const theme of ['light', 'dark']) {
    await page.evaluate((nextTheme) => { document.documentElement.dataset.theme = nextTheme; document.documentElement.style.colorScheme = nextTheme; }, theme);
    dialog = await openCopy();
    const selected = await dialog.getByLabel('목적지').inputValue();
    const dialogIdentity = await dialog.getAttribute('aria-labelledby');
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      for (const zoom of [1, 2]) {
        await setZoom(zoom);
        const observedZoom = await getZoom();
        assert.equal(observedZoom, zoom);
        assert.equal(await dialog.getAttribute('aria-labelledby'), dialogIdentity);
        assert.equal(await dialog.getByLabel('목적지').inputValue(), selected);
        const execute = dialog.getByRole('button', { name: '복사', exact: true });
        await execute.scrollIntoViewIfNeeded();
        const geometry = await dialog.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const action = element.querySelector('[data-relocation-actions]')?.getBoundingClientRect();
          const style = getComputedStyle(element);
          return { rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width }, actionBottom: action?.bottom, color: style.color, backgroundColor: style.backgroundColor, viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio };
        });
        assert(geometry.rect.left >= 0 && geometry.rect.right <= geometry.viewport.width + 1);
        assert(geometry.actionBottom !== undefined && geometry.actionBottom <= geometry.viewport.height + 1);
        const ratio = contrast(geometry.color, geometry.backgroundColor);
        assert(ratio >= 4.5, `dialog contrast ${ratio}`);
        const name = `${theme}-${viewport.width}x${viewport.height}-zoom${zoom * 100}.png`;
        await page.screenshot({ path: path.join(output, name), fullPage: true });
        observations.push({ theme, viewport, requestedZoom: zoom, getZoom: observedZoom, geometry, contrast: ratio, selected, screenshot: name });
      }
    }
    await setZoom(1);
    assert.equal(await getZoom(), 1);
    await dialog.getByRole('button', { name: '취소' }).click();
    await dialog.waitFor({ state: 'detached' });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ forcedColors: 'active' });
  dialog = await openCopy();
  for (const zoom of [1, 2]) {
    await setZoom(zoom);
    assert.equal(await getZoom(), zoom);
    const name = `forced-colors-1440x900-zoom${zoom * 100}.png`;
    const screenshot = await page.screenshot({ path: path.join(output, name) });
    const dimensions = pngDimensions(screenshot);
    assert.deepEqual(dimensions, { width: 1440, height: 900 });
    observations.push({ theme: 'forced-colors', viewport: { width: 1440, height: 900 }, requestedZoom: zoom, getZoom: await getZoom(), screenshotDimensions: dimensions, screenshot: name });
  }
  await setZoom(1);
  assert.equal(await getZoom(), 1);
  await page.emulateMedia({ forcedColors: 'none' });

  const previewResponses = [];
  const previewRequests = relocationRequests.filter((entry) => entry.method === 'GET');
  for (const request of previewRequests) {
    assert(request.search.includes('kind=copy'));
  }
  assert(previewRequests.some((request) => request.search.includes(`destinationId=${encodeURIComponent(process.env.DOCULIGHT_E2E_WORKSPACE)}`)));
  previewResponses.push({
    rosterRendered: await dialog.locator('[data-share-roster], [data-principal-row]').count(),
    administratorGuidanceVisible: await dialog.locator('[data-testid="roster-elsewhere"]').isVisible(),
    copyCaveatVisible: await dialog.locator('[data-testid="copy-notice"]').isVisible(),
  });
  assert.equal(previewResponses[0].rosterRendered, 0);
  assert.equal(previewResponses[0].administratorGuidanceVisible, false);
  assert.equal(previewResponses[0].copyCaveatVisible, true);
  fs.writeFileSync(path.join(output, 'browser-observation.json'), JSON.stringify({
    ownedPersistentContexts: 1, tabId, matrixCount: observations.filter((entry) => entry.theme !== 'forced-colors').length,
    forcedColorsCount: observations.filter((entry) => entry.theme === 'forced-colors').length,
    observations, relocationRequests, copyReceipt, previewResponses,
    nativeWindowsImeCandidateUi: 'nonblocking-unverified', syntheticCompositionBoundary: 'covered by existing web regression',
  }, null, 2));
} finally {
  await context?.close();
}
