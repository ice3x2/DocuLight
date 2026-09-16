const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '../../../../..');
const webRoot = path.join(root, 'packages/web');
const output = __dirname;
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');

const expected = {
  app: 'rgb(233, 231, 226)',
  document: 'rgb(245, 244, 239)',
  sidebar: 'rgb(222, 221, 214)',
  control: 'rgb(250, 249, 245)',
  primary: 'rgb(54, 91, 112)',
  border: 'rgb(122, 123, 113)',
  danger: 'rgb(150, 63, 56)',
};
const viewports = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function pngDimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function measure(page) {
  return page.evaluate(() => {
    const read = (selector) => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        background: style.backgroundColor,
        color: style.color,
        border: style.borderColor,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        minHeight: style.minHeight,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
      };
    };
    return {
      viewport: {
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        devicePixelRatio,
        visualWidth: visualViewport.width,
        visualHeight: visualViewport.height,
        visualScale: visualViewport.scale,
      },
      cssZoom: {
        html: getComputedStyle(document.documentElement).zoom,
        body: getComputedStyle(document.body).zoom,
      },
      body: read('body'),
      document: read('#document'),
      sidebar: read('#sidebar'),
      input: read('#normal-name'),
      invalidInput: read('#name'),
      button: read('#primary-action'),
      portal: read('#portal'),
      help: read('#name-help'),
      selected: read('#selected-row'),
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

function contractPass(value) {
  return value.body.background === expected.app
    && value.document.background === expected.document
    && value.sidebar.background === expected.sidebar
    && value.portal.background === expected.control
    && value.button.background === expected.primary
    && value.input.border === expected.border
    && value.invalidInput.border === expected.danger
    && value.button.rect.height >= 36
    && value.input.rect.height >= 36
    && value.help.scrollWidth <= value.help.clientWidth
    && value.selected.scrollWidth <= value.selected.clientWidth;
}

async function runMatrix(browser, label, url) {
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#name').focus();
    const screenshot = path.join(output, `${label}-${viewport.width}x${viewport.height}.png`);
    await page.screenshot({ path: screenshot });
    const value = await measure(page);
    results.push({
      viewport,
      screenshot: path.basename(screenshot),
      screenshotPixels: pngDimensions(screenshot),
      measurements: value,
      pass: contractPass(value)
        && Number.parseFloat(value.invalidInput.outlineWidth) >= 2
        && Number.parseFloat(value.invalidInput.outlineOffset) >= 2,
    });
    await page.close();
  }
  return results;
}

(async () => {
  const viteModuleUrl = pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href;
  const { createServer: createViteServer } = await import(viteModuleUrl);
  const vite = await createViteServer({
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.ts'),
    server: { host: '127.0.0.1', port: 0 },
  });
  await vite.listen();
  const viteAddress = vite.httpServer.address();
  const devUrl = `http://127.0.0.1:${viteAddress.port}/test/newspaper-foundation-fixture.html`;

  const distRoot = path.join(webRoot, 'dist');
  const builtIndex = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8');
  const cssHref = builtIndex.match(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)/i)?.[1];
  if (!cssHref) throw new Error('Built CSS link not found');
  const fixture = fs.readFileSync(path.join(webRoot, 'test/newspaper-foundation-fixture.html'), 'utf8')
    .replace('/src/styles/index.css', cssHref);
  const production = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/fixture.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixture);
      return;
    }
    const target = path.resolve(distRoot, pathname.replace(/^\/+/, ''));
    if (!target.startsWith(`${distRoot}${path.sep}`) || !fs.existsSync(target)) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/octet-stream' });
    response.end(fs.readFileSync(target));
  });
  await listen(production);
  const productionUrl = `http://127.0.0.1:${production.address().port}/fixture.html`;

  let browser;
  let persistent;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-foundation-zoom-'));
  try {
    browser = await chromium.launch({ headless: true });
    const dev = await runMatrix(browser, 'dev', devUrl);
    const built = await runMatrix(browser, 'production', productionUrl);
    await browser.close();
    browser = undefined;

    const extensionPath = path.join(temporaryRoot, 'extension');
    fs.mkdirSync(extensionPath, { recursive: true });
    fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify({
      manifest_version: 3,
      name: 'DocuLight foundation zoom verifier',
      version: '1.0.0',
      permissions: ['tabs'],
      background: { service_worker: 'service-worker.js' },
    }));
    fs.writeFileSync(path.join(extensionPath, 'service-worker.js'), "chrome.runtime.onInstalled.addListener(() => {});\n");

    persistent = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), {
      headless: false,
      viewport: null,
      args: [
        '--window-size=1440,900',
        '--window-position=-32000,-32000',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    if (persistent.serviceWorkers().length === 0) await persistent.waitForEvent('serviceworker', { timeout: 10000 });
    const worker = persistent.serviceWorkers()[0];
    const page = persistent.pages()[0] || await persistent.newPage();
    await page.goto(devUrl, { waitUntil: 'networkidle' });
    await page.locator('#name').focus();
    const screenshot100 = path.join(output, 'actual-zoom-100.png');
    await page.screenshot({ path: screenshot100 });
    const baseline = await measure(page);
    const baselineZoom = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      return chrome.tabs.getZoom(tab.id);
    }, devUrl);
    const requestedZoom = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, devUrl);
    await page.waitForTimeout(500);
    const screenshot200 = path.join(output, 'actual-zoom-200.png');
    await page.screenshot({ path: screenshot200 });
    const zoomed = await measure(page);
    const finalZoom = await worker.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === url);
      return chrome.tabs.getZoom(tab.id);
    }, devUrl);

    const actualZoom = {
      technique: 'isolated full Chromium temporary profile and extension chrome.tabs.setZoom=2',
      cssZoomUsed: false,
      viewportEmulationUsed: false,
      baselineZoom,
      requestedZoom,
      finalZoom,
      baseline,
      zoomed,
      widthRatio: baseline.viewport.innerWidth / zoomed.viewport.innerWidth,
      heightRatio: baseline.viewport.innerHeight / zoomed.viewport.innerHeight,
      dprRatio: zoomed.viewport.devicePixelRatio / baseline.viewport.devicePixelRatio,
      outerWidthUnchanged: baseline.viewport.outerWidth === zoomed.viewport.outerWidth,
      outerHeightUnchanged: baseline.viewport.outerHeight === zoomed.viewport.outerHeight,
      screenshots: {
        baseline: { file: path.basename(screenshot100), pixels: pngDimensions(screenshot100) },
        zoomed: { file: path.basename(screenshot200), pixels: pngDimensions(screenshot200) },
      },
    };
    actualZoom.pass = finalZoom === 2
      && Math.abs(actualZoom.widthRatio - 2) < 0.02
      && Math.abs(actualZoom.heightRatio - 2) < 0.02
      && Math.abs(actualZoom.dprRatio - 2) < 0.02
      && actualZoom.outerWidthUnchanged
      && actualZoom.outerHeightUnchanged
      && zoomed.cssZoom.html === '1'
      && zoomed.cssZoom.body === '1'
      && contractPass(zoomed);

    const result = {
      scope: 'unauthenticated foundation fixture; not an authenticated product-screen claim',
      dev,
      production: built,
      actualZoom,
      pass: dev.every((entry) => entry.pass) && built.every((entry) => entry.pass) && actualZoom.pass,
    };
    fs.writeFileSync(path.join(output, 'actual-browser-foundation.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`DEV_CASES=${dev.filter((entry) => entry.pass).length}/${dev.length}`);
    console.log(`PRODUCTION_CASES=${built.filter((entry) => entry.pass).length}/${built.length}`);
    console.log(`ACTUAL_ZOOM_200=${actualZoom.pass}`);
    console.log(`WIDTH_RATIO=${actualZoom.widthRatio} DPR_RATIO=${actualZoom.dprRatio} CSS_ZOOM=${zoomed.cssZoom.html}/${zoomed.cssZoom.body}`);
    if (!result.pass) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (persistent) await persistent.close();
    await vite.close();
    await close(production);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.writeFileSync(path.join(output, 'actual-browser-foundation-error.txt'), `${error.stack || error}\n`);
  process.exitCode = 1;
});
