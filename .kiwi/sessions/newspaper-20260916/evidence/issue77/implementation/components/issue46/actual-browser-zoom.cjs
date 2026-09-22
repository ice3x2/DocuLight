const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '../../../../..');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const output = __dirname;

async function measure(page) {
  return page.evaluate(() => ({
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    devicePixelRatio,
    theme: document.documentElement.dataset.theme,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    htmlZoom: getComputedStyle(document.documentElement).zoom,
    bodyZoom: getComputedStyle(document.body).zoom,
    portal: getComputedStyle(document.querySelector('#portal')).backgroundColor,
    document: getComputedStyle(document.querySelector('#document')).backgroundColor,
    editorMounts: window.editorMounts,
  }));
}

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root: path.join(root, 'packages/web'),
    server: { host: '127.0.0.1', port: 0 },
    appType: 'mpa',
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
  const url = `http://127.0.0.1:${address.port}/test/theme-runtime-browser-fixture.html?preference=dark`;

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-theme-zoom-'));
  const profilePath = path.join(temporaryRoot, 'profile');
  const extensionPath = path.join(temporaryRoot, 'extension');
  fs.mkdirSync(extensionPath, { recursive: true });
  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'DocuLight theme zoom verifier',
    version: '1.0.0',
    permissions: ['tabs'],
    background: { service_worker: 'service-worker.js' },
  }));
  fs.writeFileSync(path.join(extensionPath, 'service-worker.js'), "chrome.runtime.onInstalled.addListener(() => {});\n");

  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      viewport: null,
      colorScheme: 'light',
      args: [
        '--window-size=1440,900',
        '--window-position=-32000,-32000',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker', { timeout: 10000 });
    const worker = context.serviceWorkers()[0];
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const baseline = await measure(page);
    await page.screenshot({ path: path.join(output, 'actual-browser-zoom-100.png') });
    const requested = await worker.evaluate(async (pageUrl) => {
      const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === pageUrl);
      if (!tab || tab.id === undefined) throw new Error('Fixture tab not found');
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, url);
    await page.waitForTimeout(500);
    const zoomed = await measure(page);
    await page.screenshot({ path: path.join(output, 'actual-browser-zoom-200.png') });
    const result = {
      method: 'Full Chromium extension chrome.tabs.setZoom in isolated temporary profile with off-screen browser window',
      browserZoom: requested,
      baseline,
      zoomed,
      widthRatio: baseline.innerWidth / zoomed.innerWidth,
      heightRatio: baseline.innerHeight / zoomed.innerHeight,
    };
    result.pass = requested === 2 && Math.abs(result.widthRatio - 2) < 0.02 &&
      Math.abs(result.heightRatio - 2) < 0.02 && baseline.outerWidth === zoomed.outerWidth &&
      baseline.outerHeight === zoomed.outerHeight && zoomed.htmlZoom === '1' && zoomed.bodyZoom === '1' &&
      zoomed.theme === 'dark' && zoomed.scheme === 'dark' && zoomed.portal === 'rgb(48, 53, 46)' &&
      zoomed.document === 'rgb(41, 44, 39)' && zoomed.editorMounts === 1;
    fs.writeFileSync(path.join(output, 'actual-browser-zoom.json'), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`${result.pass ? 'PASS' : 'FAIL'} actual browser 200% theme runtime — ${JSON.stringify(result)}`);
    if (!result.pass) process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await server.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.writeFileSync(path.join(output, 'actual-browser-zoom-error.txt'), `${error.stack || error}\n`);
  process.exitCode = 1;
});
