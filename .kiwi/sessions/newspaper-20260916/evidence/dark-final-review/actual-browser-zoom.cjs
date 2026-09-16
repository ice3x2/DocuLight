const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '../../../../..');
const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'));
const { chromium } = requireFromEditor('playwright');
const artifact = path.join(root, 'docs/decision/newspaper-theme-dark.html');
const lightArtifact = path.join(root, 'docs/decision/newspaper-theme.html');
const output = __dirname;

const expectedPalette = {
  '--surface-app': '#20221F', '--surface-document': '#292C27', '--surface-sidebar': '#1A1D19',
  '--surface-control': '#30352E', '--text-primary': '#E9E7DF', '--text-secondary': '#B5B8AE',
  '--text-sidebar-secondary': '#B5B8AE', '--border-subtle': '#484D44', '--border-control': '#87917F',
  '--action-primary': '#A8C4D3', '--action-primary-hover': '#BBD1DC', '--action-primary-active': '#CADBE3',
  '--text-on-primary': '#19231F', '--surface-selected': '#344650', '--focus-ring': '#A8C4D3',
  '--status-danger': '#F0ABA3', '--surface-danger': '#482C29', '--status-warning': '#E2C084',
  '--surface-warning': '#423720', '--status-success': '#A8CFB0', '--surface-success': '#293D2E',
  '--surface-disabled': '#353A32', '--text-disabled': '#939B8A', '--overlay': 'rgb(0 0 0 / 60%)',
};

function dimensions(filePath) {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not PNG: ${filePath}`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function measure(page) {
  const dom = await page.evaluate(() => {
    const box = (selector) => {
      const value = document.querySelector(selector).getBoundingClientRect();
      return { x: value.x, y: value.y, width: value.width, height: value.height };
    };
    return {
      innerWidth,
      innerHeight,
      outerWidth,
      outerHeight,
      devicePixelRatio,
      visualViewport: {
        width: visualViewport.width,
        height: visualViewport.height,
        scale: visualViewport.scale,
      },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        htmlComputedZoom: getComputedStyle(document.documentElement).zoom,
        bodyComputedZoom: getComputedStyle(document.body).zoom,
        htmlInlineStyle: document.documentElement.getAttribute('style'),
        bodyInlineStyle: document.body.getAttribute('style'),
      },
      responsiveState: {
        sidebarDisplay: getComputedStyle(document.querySelector('.sidebar')).display,
        inspectorDisplay: getComputedStyle(document.querySelector('.inspector')).display,
        specimenGridColumns: getComputedStyle(document.querySelector('.specimen-grid')).gridTemplateColumns,
      },
      geometry: {
        frame: box('.frame'),
        main: box('.main'),
        article: box('.article-body'),
      },
    };
  });
  const cdp = await page.context().newCDPSession(page);
  const metrics = await cdp.send('Page.getLayoutMetrics');
  await cdp.detach();
  return {
    ...dom,
    cdpReadOnly: {
      layoutViewport: metrics.layoutViewport,
      cssLayoutViewport: metrics.cssLayoutViewport,
      contentSize: metrics.contentSize,
      cssContentSize: metrics.cssContentSize,
    },
  };
}

async function verifyAnchors(page) {
  const snapshot = async (locator) => locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const value = element.getBoundingClientRect();
    return {
      text: element.textContent.trim(),
      className: element.className,
      rect: { x: value.x, y: value.y, width: value.width, height: value.height },
      color: style.color,
      textDecorationLine: style.textDecorationLine,
      textDecorationColor: style.textDecorationColor,
      textDecorationThickness: style.textDecorationThickness,
      textUnderlineOffset: style.textUnderlineOffset,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      outlineOffset: style.outlineOffset,
    };
  });
  const anchors = page.locator('.outline a');
  const runs = [];
  for (let index = 0; index < await anchors.count(); index += 1) {
    const anchor = anchors.nth(index);
    const before = await snapshot(anchor);
    await anchor.hover();
    const hovered = await snapshot(anchor);
    if (index === 0) {
      await anchor.focus();
      await page.screenshot({ path: path.join(output, 'actual-anchor-hover-focus.png') });
    }
    await page.mouse.move(5, 5);
    const restored = await snapshot(anchor);
    runs.push({
      index, before, hovered, restored,
      hoverDecorationExact: hovered.textDecorationLine.split(' ').includes('underline')
        && hovered.textDecorationColor === hovered.color
        && hovered.textDecorationThickness === '1px'
        && hovered.textUnderlineOffset === '3px',
      geometryUnchanged: JSON.stringify(before.rect) === JSON.stringify(hovered.rect),
      defaultRestored: before.color === restored.color
        && before.textDecorationLine === restored.textDecorationLine
        && before.textDecorationColor === restored.textDecorationColor
        && before.textDecorationThickness === restored.textDecorationThickness
        && before.textUnderlineOffset === restored.textUnderlineOffset,
    });
  }
  await page.locator('.outline a').first().focus();
  const focus = await snapshot(page.locator('.outline a').first());
  const focusOutlinePhysicalPixels = Number.parseFloat(focus.outline) * await page.evaluate(() => devicePixelRatio);
  return {
    runs,
    focus,
    focusOutlinePhysicalPixels,
    pass: runs.every((run) => run.hoverDecorationExact && run.geometryUnchanged && run.defaultRestored)
      && focus.outline.includes('solid rgb(168, 196, 211)')
      && focusOutlinePhysicalPixels >= 2
      && focus.outlineOffset === '4px',
  };
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  fs.rmSync(path.join(output, 'actual-browser-zoom-error.txt'), { force: true });
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-actual-zoom-'));
  const profilePath = path.join(temporaryRoot, 'profile');
  const extensionPath = path.join(temporaryRoot, 'extension');
  fs.mkdirSync(extensionPath, { recursive: true });
  fs.writeFileSync(path.join(extensionPath, 'manifest.json'), JSON.stringify({
    manifest_version: 3,
    name: 'DocuLight isolated zoom verifier',
    version: '1.0.0',
    permissions: ['tabs'],
    background: { service_worker: 'service-worker.js' },
  }, null, 2));
  fs.writeFileSync(path.join(extensionPath, 'service-worker.js'), "chrome.runtime.onInstalled.addListener(() => {});\n");

  const html = fs.readFileSync(artifact);
  const server = http.createServer((request, response) => {
    if (request.url === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-store',
    });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/newspaper-theme-dark.html`;

  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, {
      headless: false,
      viewport: null,
      args: [
        '--window-size=1440,900',
        '--window-position=-32000,-32000',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    let workers = context.serviceWorkers();
    if (workers.length === 0) {
      await context.waitForEvent('serviceworker', { timeout: 10000 });
      workers = context.serviceWorkers();
    }
    const worker = workers[0];
    const page = context.pages()[0] || await context.newPage();
    await page.goto(url, { waitUntil: 'load' });

    const screenshot100 = path.join(output, 'actual-browser-zoom-100.png');
    await page.screenshot({ path: screenshot100 });
    const baseline = await measure(page);
    const anchors = await verifyAnchors(page);
    const computedPalette = await page.evaluate((names) => {
      const style = getComputedStyle(document.documentElement);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
    }, Object.keys(expectedPalette));
    const palette = {
      expected: expectedPalette,
      computed: computedPalette,
      exactMatch: Object.entries(expectedPalette).every(([name, value]) => computedPalette[name] === value),
    };
    const baselineZoom = await worker.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === pageUrl);
      if (!tab || tab.id === undefined) throw new Error(`Artifact tab not found: ${pageUrl}`);
      return chrome.tabs.getZoom(tab.id);
    }, url);

    const requestedZoom = await worker.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === pageUrl);
      if (!tab || tab.id === undefined) throw new Error(`Artifact tab not found: ${pageUrl}`);
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, url);
    await page.waitForTimeout(500);

    const screenshot200 = path.join(output, 'actual-browser-zoom-200.png');
    await page.screenshot({ path: screenshot200 });
    const zoomed = await measure(page);
    const finalZoom = await worker.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === pageUrl);
      if (!tab || tab.id === undefined) throw new Error(`Artifact tab not found: ${pageUrl}`);
      return chrome.tabs.getZoom(tab.id);
    }, url);

    const result = {
      artifact: 'docs/decision/newspaper-theme-dark.html',
      artifactSha256: crypto.createHash('sha256').update(html).digest('hex'),
      lightArtifactSha256: crypto.createHash('sha256').update(fs.readFileSync(lightArtifact)).digest('hex'),
      browser: await context.browser().version(),
      method: {
        type: 'Full Chromium extension chrome.tabs.setZoom in isolated temporary profile with off-screen browser window',
        temporaryProfile: true,
        extensionTemporary: true,
        localFixture: { host: '127.0.0.1', port, credentials: false },
        physicalWindowRequest: { width: 1440, height: 900 },
        usedCssZoom: false,
        usedCdpPageScale: false,
        usedManualViewportHalving: false,
        usedManualDeviceScaleFactor: false,
        note: 'CDP Page.getLayoutMetrics was read only after rendering; no Emulation command was sent.',
      },
      browserZoom: { baseline: baselineZoom, requested: 2, returnedAfterSet: requestedZoom, final: finalZoom },
      palette,
      anchors,
      baseline100Percent: baseline,
      zoom200Percent: zoomed,
      screenshots: {
        baseline100Percent: { file: path.basename(screenshot100), pixels: dimensions(screenshot100) },
        zoom200Percent: { file: path.basename(screenshot200), pixels: dimensions(screenshot200) },
      },
      independentEffect: {
        widthRatio: baseline.innerWidth / zoomed.innerWidth,
        heightRatio: baseline.innerHeight / zoomed.innerHeight,
        frameWidthRatio: baseline.geometry.frame.width / zoomed.geometry.frame.width,
        outerWidthUnchanged: baseline.outerWidth === zoomed.outerWidth,
        outerHeightUnchanged: baseline.outerHeight === zoomed.outerHeight,
        screenshotPhysicalSizeUnchanged: JSON.stringify(dimensions(screenshot100)) === JSON.stringify(dimensions(screenshot200)),
        screenshotCaptureNote: 'Playwright page screenshots capture the zoomed content surface, not browser chrome; the 200% PNG pixel dimensions are therefore smaller even though outerWidth/outerHeight are unchanged.',
      },
    };
    result.actualBrowserZoom200Confirmed = finalZoom === 2
      && Math.abs(result.independentEffect.widthRatio - 2) < 0.02
      && Math.abs(result.independentEffect.heightRatio - 2) < 0.02
      && result.independentEffect.outerWidthUnchanged
      && result.independentEffect.outerHeightUnchanged
      && zoomed.document.htmlComputedZoom === '1'
      && zoomed.document.bodyComputedZoom === '1';
    fs.writeFileSync(path.join(output, 'actual-browser-zoom.json'), `${JSON.stringify(result, null, 2)}\n`);
    if (!result.actualBrowserZoom200Confirmed || !anchors.pass || !palette.exactMatch) process.exitCode = 1;
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  fs.writeFileSync(path.join(output, 'actual-browser-zoom-error.txt'), `${error.stack || error}\n`);
  process.exitCode = 1;
});
