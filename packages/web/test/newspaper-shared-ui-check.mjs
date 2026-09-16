import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const webRoot = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const repositoryRoot = path.resolve(webRoot, '..', '..');
const evidenceDir = path.join(repositoryRoot, '.kiwi', 'sessions', 'newspaper-20260916', 'evidence', 'shared-ui', 'browser');
const viewports = [
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
];
const assertions = [];
const record = (viewport, fixture, name, passed, details) => {
  assertions.push({ viewport, fixture, name, passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'} [${viewport}] ${fixture} ${name}: ${JSON.stringify(details)}`);
};

await mkdir(evidenceDir, { recursive: true });
const server = await createServer({ configFile: false, root: webRoot, logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, appType: 'mpa' });
await server.listen();
const address = server.httpServer.address();
if (address === null || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });

    await page.goto(`${origin}/test/newspaper-shared-controls-fixture.html`, { waitUntil: 'networkidle' });
    const controls = await page.evaluate(() => {
      const measure = (selector) => {
        const node = document.querySelector(selector);
        if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, radius: style.borderRadius, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset };
      };
      const help = document.querySelector('[data-slot="field-description"]');
      if (!(help instanceof HTMLElement)) throw new Error('Missing help');
      return {
        input: measure('#shared-name'), select: measure('#shared-select'), checkboxTarget: measure('label[for="shared-checkbox"]'),
        radioTarget: measure('label[for="shared-radio"]'), loading: measure('#loading-action'),
        help: { scrollWidth: help.scrollWidth, clientWidth: help.clientWidth, scrollHeight: help.scrollHeight },
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    record(viewport.name, 'controls', 'geometry and long Korean wrapping',
      controls.input.height >= 36 && controls.select.height >= 36 && controls.checkboxTarget.height >= 36 && controls.radioTarget.height >= 36 &&
      controls.loading.height >= 36 && Number.parseFloat(controls.input.radius) === 4 && controls.help.scrollWidth <= controls.help.clientWidth && !controls.overflow,
      controls);
    await page.locator('#shared-name').focus();
    await page.locator('#shared-name').dispatchEvent('compositionstart', { data: '한' });
    await page.keyboard.press('Enter');
    const ime = await page.evaluate(() => ({ active: document.activeElement?.id, submits: document.querySelector('#submit-count')?.textContent }));
    await page.locator('#shared-name').dispatchEvent('compositionend', { data: '한' });
    record(viewport.name, 'controls', 'IME Enter separation', ime.active === 'shared-name' && ime.submits === '0', ime);
    await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}-controls.png`), fullPage: true });

    await page.goto(`${origin}/test/newspaper-data-display-fixture.html`, { waitUntil: 'networkidle' });
    const dataDisplay = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('[data-slot="table-row"]')].map((row) => row.getBoundingClientRect().height),
      numeric: getComputedStyle(document.querySelector('[data-slot="table-cell"][data-numeric="true"]')).textAlign,
      selectedEdge: getComputedStyle(document.querySelector('[data-state="selected"] [data-slot="table-cell"]')).borderLeftWidth,
      pathText: document.querySelector('#full-path')?.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Tab');
    const pathFocus = await page.evaluate(() => ({ id: document.activeElement?.id, text: document.activeElement?.textContent }));
    record(viewport.name, 'data-display', 'rows, alignment, selection and complete path reachability',
      dataDisplay.rows.every((height) => height >= 40) && dataDisplay.numeric === 'right' && Number.parseFloat(dataDisplay.selectedEdge) >= 3 &&
      pathFocus.id === 'full-path' && pathFocus.text === dataDisplay.pathText && !dataDisplay.overflow,
      { ...dataDisplay, pathFocus });
    await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}-data-display.png`), fullPage: true });

    await page.goto(`${origin}/test/newspaper-overlays-fixture.html`, { waitUntil: 'networkidle' });
    await page.locator('#dialog-trigger').click();
    const overlay = await page.locator('[data-slot="dialog-content"]').evaluate((node) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, right: innerWidth - rect.right, top: rect.top, bottom: innerHeight - rect.bottom, padding: style.padding, radius: style.borderRadius };
    });
    record(viewport.name, 'overlays', 'dialog viewport geometry',
      overlay.width <= 560 && overlay.left >= 24 && overlay.right >= 24 && overlay.top >= 24 && overlay.bottom >= 24 &&
      Number.parseFloat(overlay.padding) === 24 && Number.parseFloat(overlay.radius) === 6,
      overlay);
    await page.screenshot({ path: path.join(evidenceDir, `${viewport.name}-overlay.png`), fullPage: false });
    await page.keyboard.press('Escape');
    await page.close();
  }
} finally {
  await browser.close();
}

const profilePath = await mkdtemp(path.join(os.tmpdir(), 'doculight-shared-ui-zoom-'));
const extensionPath = path.join(webRoot, 'test', 'zoom-extension');
let zoomContext;
let zoomEvidence;
try {
  zoomContext = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    viewport: null,
    args: [
      '--window-size=1440,900',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const serviceWorker = zoomContext.serviceWorkers()[0] || await zoomContext.waitForEvent('serviceworker');
  const zoomPage = zoomContext.pages()[0] || await zoomContext.newPage();
  await zoomPage.goto(`${origin}/test/newspaper-overlays-fixture.html`, { waitUntil: 'networkidle' });
  const baseline = await zoomPage.evaluate(() => ({ innerWidth, innerHeight, cssZoom: getComputedStyle(document.documentElement).zoom, visualScale: visualViewport?.scale }));
  await serviceWorker.evaluate(async ({ pageOrigin }) => {
    await new Promise((resolve, reject) => {
      chrome.tabs.query({}, (tabs) => {
        const tab = tabs.find(({ url }) => url?.startsWith(pageOrigin));
        if (!tab?.id) return reject(new Error(`Fixture tab not found for ${pageOrigin}`));
        chrome.tabs.setZoom(tab.id, 2, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve());
      });
    });
  }, { pageOrigin: origin });
  await zoomPage.waitForFunction((baselineWidth) => innerWidth <= baselineWidth / 1.9, baseline.innerWidth);
  await zoomPage.locator('#dialog-trigger').click();
  const zoomed = await zoomPage.evaluate(() => ({
    innerWidth, innerHeight, cssZoom: getComputedStyle(document.documentElement).zoom,
    visualScale: visualViewport?.scale,
    overflow: document.documentElement.scrollWidth > innerWidth,
    dialog: (() => { const rect = document.querySelector('[data-slot="dialog-content"]').getBoundingClientRect(); return { left: rect.left, right: innerWidth - rect.right, top: rect.top, bottom: innerHeight - rect.bottom, width: rect.width, height: rect.height }; })(),
  }));
  await zoomPage.screenshot({ path: path.join(evidenceDir, '200pct-true-browser-zoom-overlay.png'), fullPage: false });
  zoomEvidence = {
    method: 'Playwright persistent Chromium with an isolated extension calling chrome.tabs.setZoom(tabId, 2)',
    usedCssZoom: false,
    usedCdpEmulation: false,
    baseline,
    zoomed,
    widthRatio: baseline.innerWidth / zoomed.innerWidth,
    heightRatio: baseline.innerHeight / zoomed.innerHeight,
  };
  const genuine = Math.abs(zoomEvidence.widthRatio - 2) < 0.02 && Math.abs(zoomEvidence.heightRatio - 2) < 0.02 && zoomed.cssZoom === '1' && zoomed.visualScale === 1;
  const reachable = !zoomed.overflow && zoomed.dialog.left >= 24 && zoomed.dialog.right >= 24 && zoomed.dialog.top >= 24 && zoomed.dialog.bottom >= 24;
  record('200% browser zoom', 'overlays', 'genuine zoom and reachable geometry', genuine && reachable, zoomEvidence);
} finally {
  if (zoomContext) await zoomContext.close();
  await rm(profilePath, { recursive: true, force: true });
  await server.close();
}

const report = { browser: 'Chromium', viewports, zoomEvidence, assertions };
await writeFile(path.join(evidenceDir, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const failed = assertions.filter(({ passed }) => !passed);
console.log(`${failed.length === 0 ? 'PASS' : 'FAIL'}: ${assertions.length} assertions; ${failed.length} failed`);
process.exitCode = failed.length === 0 ? 0 : 1;
