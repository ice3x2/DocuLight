import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_URL } from './_web-harness.mjs';

const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; };
const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue86/browser-matrix');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue86-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension');
const captureRoot = path.join(temporaryRoot, 'captures');
fs.mkdirSync(extension);
fs.mkdirSync(captureRoot);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue 86 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const owner = [required('DOCULIGHT_ISSUE86_OWNER_USER'), required('DOCULIGHT_ISSUE86_OWNER_PASS')];
const zero = [required('DOCULIGHT_ISSUE86_ZERO_USER'), required('DOCULIGHT_ISSUE86_ZERO_PASS')];
const manager = [required('DOCULIGHT_ISSUE86_MANAGER_USER'), required('DOCULIGHT_ISSUE86_MANAGER_PASS')];
const ordinary = [required('DOCULIGHT_ISSUE86_ORDINARY_USER'), required('DOCULIGHT_ISSUE86_ORDINARY_PASS')];
const managedUrl = required('DOCULIGHT_ISSUE86_MANAGED_URL');
const calls = [];
const captures = [];
const badgeStateCaptures = [];
const roleSnapshots = [];
let activeRole = 'none';
let tabFocus;
let context;

const hashFile = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const hashLfText = (file) => createHash('sha256')
  .update(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'))
  .digest('hex');
const reviewPath = '.kiwi/sessions/newspaper-20260916/evidence/issue86/final-independent-review.md';
const closureEvidence = [
  { path: 'docs/spec/08.app-shell.srs.md', sha256: hashLfText(path.join(root, 'docs/spec/08.app-shell.srs.md')), normalization: 'LF' },
  { path: reviewPath, sha256: hashLfText(path.join(root, reviewPath)), normalization: 'LF' },
];
assert.equal(
  closureEvidence[1].sha256,
  '8f7078d32637e8a61c44587030c47d26693bcd14fc64b17ac7278ece3fec2aed',
  'independent review changed after approval',
);
const loginThroughUi = async (page, url, [name, password]) => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).first().waitFor();
};
const logout = async (page) => {
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
  await context.clearCookies();
};
const snapshotAuditAndQueue = async (page) => page.evaluate(async () => {
  const [auditResponse, queueResponse] = await Promise.all([fetch('/api/audit-log'), fetch('/api/reconciliation-queue')]);
  if (!auditResponse.ok || !queueResponse.ok) throw new Error(`snapshot failed: ${auditResponse.status}/${queueResponse.status}`);
  const audit = await auditResponse.json();
  const queue = await queueResponse.json();
  return {
    auditRows: audit.groups.reduce((sum, group) => sum + group.rows.length, 0),
    queueItems: queue.items.length,
  };
});

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
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/audit-log' || url.pathname === '/api/reconciliation-queue') calls.push({ role: activeRole, method: request.method(), path: url.pathname, search: url.search });
  });

  activeRole = 'managed-superuser';
  await loginThroughUi(page, managedUrl, owner);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const ownerDialog = page.getByRole('dialog', { name: '설정' });
  assert.equal(await ownerDialog.getByRole('tab', { name: '감사 로그' }).count(), 1);
  assert.equal(await ownerDialog.getByRole('tab', { name: '권한 감사' }).count(), 1);
  roleSnapshots.push({ role: 'managed-superuser', positiveWorkspace: true, auditVisible: true, aclAuditVisible: true });
  await ownerDialog.getByRole('button', { name: '설정 닫기' }).click();
  await logout(page);

  activeRole = 'zero-workspace-superuser';
  await loginThroughUi(page, WEB_URL, zero);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  const auditTab = dialog.getByRole('tab', { name: '감사 로그' });
  await auditTab.waitFor();
  assert.equal(await dialog.getByRole('tab', { name: '워크스페이스', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('tab', { name: '권한 감사' }).count(), 0);
  assert.equal(await dialog.getByRole('tab', { name: '휴지통' }).count(), 0);
  assert.equal(await dialog.getByRole('heading', { name: '워크스페이스 관리' }).count(), 1);
  await auditTab.click();
  await dialog.getByRole('region', { name: '감사 로그 결과' }).waitFor();
  await dialog.locator('[data-audit-disclosure]').first().click();
  assert.match(await dialog.innerText(), /settings\.audit-retention-days/);
  assert.equal(await auditTab.getByTestId('queue-badge').textContent(), '1');
  await dialog.getByRole('button', { name: '재조정 대기열' }).click();
  await dialog.getByRole('region', { name: '재조정 대기열 결과' }).waitFor();
  assert.equal(await dialog.getByTestId('queue-item').count(), 1);
  await dialog.getByRole('button', { name: '감사 로그' }).click();
  const disclosure = dialog.locator('[data-audit-disclosure]').first();
  await disclosure.focus();
  await page.keyboard.press('Tab');
  tabFocus = await dialog.evaluate((node) => ({
    inside: node.contains(document.activeElement),
    tag: document.activeElement?.tagName ?? null,
    label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? null,
  }));
  assert.equal(tabFocus.inside, true);
  assert.notEqual(tabFocus.label, await disclosure.textContent());
  await disclosure.focus();

  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => {
    const tab = (await chrome.tabs.query({})).find((candidate) => candidate.url === target);
    if (!tab?.id) throw new Error('owned product tab missing');
    await chrome.tabs.setZoom(tab.id, value);
    return chrome.tabs.getZoom(tab.id);
  }, { target: page.url(), value });
  const capture = async ({ width, height, theme, zoom, forcedColors }) => {
    await page.setViewportSize({ width, height });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.style.colorScheme = value; }, theme);
    await page.emulateMedia({ colorScheme: theme, forcedColors });
    const observedZoom = await setZoom(zoom / 100);
    assert.equal(observedZoom, zoom / 100);
    await page.waitForTimeout(80);
    const metrics = await dialog.evaluate((node) => {
      const nav = node.querySelector('[data-settings-navigation]');
      const content = node.querySelector('[data-settings-content]');
      const close = node.querySelector('[aria-label="설정 닫기"]');
      const groupHeading = [...node.querySelectorAll('h2')].find((item) => item.textContent === '워크스페이스 관리');
      const auditRows = node.querySelectorAll('[data-audit-row]');
      const badge = node.querySelector('[data-testid="queue-badge"]');
      const focused = document.activeElement;
      const focusStyle = focused instanceof HTMLElement ? getComputedStyle(focused) : null;
      const ordinaryText = node.querySelector('[data-audit-filter] > label');
      const longRow = [...node.querySelectorAll('[data-audit-row] dd')].find((item) => item.textContent?.includes('긴 한글 감사 행 대비 측정 대상'));
      const largeText = node.querySelector('[data-settings-header] h2');
      const nonFocusBoundary = node.querySelector('[data-audit-filter] > select');
      const rgb = (value) => {
        const values = value.match(/[\d.]+/g)?.map(Number) ?? [];
        return values.slice(0, 3);
      };
      const luminance = (value) => rgb(value).reduce((sum, channel, index) => {
        const normalized = channel / 255;
        const linear = normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
      const ratio = (first, second) => {
        const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const backgroundOf = (element) => {
        for (let current = element; current instanceof HTMLElement; current = current.parentElement) {
          const background = getComputedStyle(current).backgroundColor;
          if (!background.endsWith(', 0)') && background !== 'rgba(0, 0, 0, 0)') return background;
        }
        return getComputedStyle(document.documentElement).backgroundColor;
      };
      const badgeStyle = badge instanceof HTMLElement ? getComputedStyle(badge) : null;
      const badgeBackground = badge instanceof HTMLElement ? backgroundOf(badge) : 'rgb(255, 255, 255)';
      const focusBackground = focused instanceof HTMLElement ? backgroundOf(focused) : 'rgb(255, 255, 255)';
      const textMetric = (element, name, normalMinimum = 4.5, largeMinimum = 3) => {
        if (!(element instanceof HTMLElement)) return { target: name, present: false, ratio: 0, minimum: normalMinimum };
        const style = getComputedStyle(element);
        const size = parseFloat(style.fontSize);
        const weight = Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400);
        const large = size >= 24 || (size >= 18.6667 && weight >= 600);
        const background = backgroundOf(element);
        return { target: name, present: true, foreground: style.color, background, fontSize: size, fontWeight: weight, large, ratio: ratio(style.color, background), minimum: large ? largeMinimum : normalMinimum };
      };
      const boundaryMetric = (element, name, colorProperty) => {
        if (!(element instanceof HTMLElement)) return { target: name, present: false, ratio: 0, minimum: 3 };
        const style = getComputedStyle(element);
        const background = backgroundOf(element);
        const color = style[colorProperty];
        return { target: name, present: true, color, background, ratio: ratio(color, background), minimum: 3 };
      };
      return {
        cssViewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        forced: matchMedia('(forced-colors: active)').matches,
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        navigationScrollable: nav ? nav.scrollHeight >= nav.clientHeight : false,
        contentScrollable: content ? content.scrollHeight >= content.clientHeight : false,
        closeReachable: close instanceof HTMLElement && close.getBoundingClientRect().bottom <= innerHeight + 1,
        groupHeadingVisible: groupHeading instanceof HTMLElement && groupHeading.getBoundingClientRect().height > 0,
        lastResultPresent: auditRows.length > 0,
        focusVisible: focusStyle ? focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 1 : false,
        contrast: {
          badgeText: badgeStyle ? ratio(badgeStyle.color, badgeBackground) : 0,
          focusIndicator: focusStyle ? ratio(focusStyle.outlineColor, focusBackground) : 0,
          targets: {
            ordinaryText: textMetric(ordinaryText, '[data-audit-filter] > label'),
            longKoreanAuditRow: textMetric(longRow, '[data-audit-row] dd containing long Korean seed'),
            largeText: textMetric(largeText, '[data-settings-header] h2'),
            groupHeading: textMetric(groupHeading, '[data-settings-navigation] h2:워크스페이스 관리'),
            focusBoundary: boundaryMetric(focused, 'focused [data-audit-disclosure]', 'outlineColor'),
            nonFocusBoundary: boundaryMetric(nonFocusBoundary, '[data-audit-filter] > select', 'borderTopColor'),
          },
        },
      };
    });
    assert.equal(metrics.forced, forcedColors === 'active');
    assert.equal(metrics.pageOverflowX, false);
    assert.equal(metrics.closeReachable, true);
    assert.equal(metrics.groupHeadingVisible, true);
    assert.equal(metrics.lastResultPresent, true);
    assert.equal(metrics.focusVisible, true);
    assert.ok(metrics.contrast.badgeText >= 4.5, JSON.stringify(metrics.contrast));
    assert.ok(metrics.contrast.focusIndicator >= 3, JSON.stringify(metrics.contrast));
    for (const measurement of Object.values(metrics.contrast.targets)) {
      assert.equal(measurement.present, true, JSON.stringify(measurement));
      assert.ok(measurement.ratio >= measurement.minimum, JSON.stringify(measurement));
    }
    const name = `audit-${theme}-${width}x${height}-${zoom}-${forcedColors}.png`;
    const file = path.join(captureRoot, name);
    await page.screenshot({ path: file, fullPage: true });
    captures.push({ width, height, theme, zoom, forcedColors, observedZoom, metrics, name, sha256: hashFile(file) });
  };

  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    for (const theme of ['light', 'dark']) {
      await capture({ width, height, theme, zoom: 100, forcedColors: 'none' });
      await capture({ width, height, theme, zoom: 200, forcedColors: 'none' });
    }
  }
  await capture({ width: 1280, height: 720, theme: 'light', zoom: 100, forcedColors: 'active' });
  await capture({ width: 1280, height: 720, theme: 'light', zoom: 200, forcedColors: 'active' });
  const resetZoom = await setZoom(1);
  assert.equal(resetZoom, 1);

  const captureBadgeState = async (state, routeHandler, expectedText, expectedLabel, beforeUnroute) => {
    await page.route('**/api/reconciliation-queue', routeHandler);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '설정', exact: true }).first().click();
    const stateDialog = page.getByRole('dialog', { name: '설정' });
    const badge = stateDialog.getByRole('tab', { name: '감사 로그' }).getByTestId('queue-badge');
    await badge.waitFor();
    assert.equal(await badge.textContent(), expectedText);
    assert.equal(await badge.getAttribute('aria-label'), expectedLabel);
    const name = `audit-badge-${state}.png`;
    const file = path.join(captureRoot, name);
    await page.screenshot({ path: file, fullPage: true });
    badgeStateCaptures.push({ state, text: expectedText, ariaLabel: expectedLabel, name, sha256: hashFile(file) });
    await beforeUnroute?.();
    await page.unroute('**/api/reconciliation-queue', routeHandler);
  };
  let releaseLoading;
  let finishLoading;
  const loadingGate = new Promise((resolve) => { releaseLoading = resolve; });
  const loadingComplete = new Promise((resolve) => { finishLoading = resolve; });
  const loadingHandler = async (route) => { await loadingGate; await route.continue(); finishLoading(); };
  await captureBadgeState('loading', loadingHandler, '…', '미해소 항목 불러오는 중', async () => { releaseLoading(); await loadingComplete; });
  const errorHandler = (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'owned product probe' }) });
  await captureBadgeState('error', errorHandler, '!', '미해소 항목을 불러오지 못함');
  const zeroHandler = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) });
  await captureBadgeState('zero', zeroHandler, '0', '미해소 항목 0개');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const keyboardDialog = page.getByRole('dialog', { name: '설정' });
  const keyboardAuditTab = keyboardDialog.getByRole('tab', { name: '감사 로그' });
  await keyboardAuditTab.getByTestId('queue-badge').waitFor();
  await keyboardAuditTab.focus();
  await page.keyboard.press('Home');
  assert.equal(await keyboardDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '에디터');
  await page.keyboard.press('ArrowDown');
  assert.equal(await keyboardDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '외모(테마)');
  await page.keyboard.press('End');
  assert.equal(await keyboardDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '색인 대기열');

  await keyboardDialog.getByRole('button', { name: '설정 닫기' }).click();
  await logout(page);

  roleSnapshots.push({ role: 'ordinary-user', auditVisible: false, aclAuditVisible: false });
  activeRole = 'ordinary-user-transition';
  await loginThroughUi(page, managedUrl, ordinary);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  let ordinaryDialog = page.getByRole('dialog', { name: '설정' });
  assert.equal(await ordinaryDialog.getByRole('tab', { name: '감사 로그' }).count(), 0);
  assert.equal(await ordinaryDialog.getByRole('tab', { name: '권한 감사' }).count(), 0);
  assert.equal(await ordinaryDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '에디터');
  roleSnapshots.at(-1).initialFocus = '에디터';
  await ordinaryDialog.getByRole('button', { name: '설정 닫기' }).click();
  await logout(page);

  activeRole = 'zero-workspace-superuser-return';
  await loginThroughUi(page, WEB_URL, zero);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const returnedZeroDialog = page.getByRole('dialog', { name: '설정' });
  assert.equal(await returnedZeroDialog.getByRole('tab', { name: '감사 로그' }).count(), 1);
  assert.equal(await returnedZeroDialog.getByRole('tab', { name: '권한 감사' }).count(), 0);
  await returnedZeroDialog.getByRole('button', { name: '설정 닫기' }).click();
  await logout(page);

  roleSnapshots.push({ role: 'workspace-manager', auditVisible: true, aclAuditVisible: true, instanceSettingsVisible: false });
  activeRole = 'workspace-manager';
  await loginThroughUi(page, managedUrl, manager);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  const managerDialog = page.getByRole('dialog', { name: '설정' });
  assert.equal(await managerDialog.getByRole('tab', { name: '감사 로그' }).count(), 1);
  assert.equal(await managerDialog.getByRole('tab', { name: '권한 감사' }).count(), 1);
  assert.equal(await managerDialog.getByRole('tab', { name: '사용자 관리' }).count(), 0);
  assert.equal(await managerDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '에디터');
  roleSnapshots.at(-1).initialFocus = '에디터';
  await managerDialog.getByRole('button', { name: '설정 닫기' }).click();
  const beforeOrdinaryLogin = await snapshotAuditAndQueue(page);

  await logout(page);
  const ordinaryCallStart = calls.length;
  activeRole = 'ordinary-user-isolation';
  await loginThroughUi(page, managedUrl, ordinary);
  await page.getByRole('button', { name: '설정', exact: true }).first().click();
  ordinaryDialog = page.getByRole('dialog', { name: '설정' });
  assert.equal(await ordinaryDialog.getByRole('tab', { name: '감사 로그' }).count(), 0);
  assert.equal(await ordinaryDialog.getByRole('tab', { name: '권한 감사' }).count(), 0);
  assert.equal(await ordinaryDialog.locator('[role="tab"]:focus').getAttribute('aria-label'), '에디터');
  const ordinaryCalls = calls.slice(ordinaryCallStart);
  assert.equal(ordinaryCalls.length, 0, JSON.stringify(ordinaryCalls));
  await ordinaryDialog.getByRole('button', { name: '설정 닫기' }).click();
  await logout(page);

  activeRole = 'workspace-manager-after-ordinary';
  await loginThroughUi(page, managedUrl, manager);
  const afterOrdinaryLogin = await snapshotAuditAndQueue(page);
  assert.deepEqual(afterOrdinaryLogin, beforeOrdinaryLogin);
  assert.equal(calls.every(({ method }) => method === 'GET'), true, JSON.stringify(calls));
  assert.equal(calls.every(({ search }) => !search.includes('workspace')), true, JSON.stringify(calls));

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  for (const capture of [...captures, ...badgeStateCaptures]) fs.copyFileSync(path.join(captureRoot, capture.name), path.join(output, capture.name));
  const expectedArtifacts = [...captures, ...badgeStateCaptures].map(({ name }) => name).sort();
  const observedArtifacts = fs.readdirSync(output).sort();
  assert.deepEqual(observedArtifacts, expectedArtifacts);
  const manifest = {
    requirement: 'IR-SHELL-012',
    runner: 'owned isolated persistent Chromium and temporary seeded product server',
    roles: ['managed-superuser', 'zero-workspace-superuser', 'workspace-manager', 'ordinary-user'],
    matrix: { viewports: ['1280x720', '1440x900', '1920x1080'], themes: ['light', 'dark'], zoom: [100, 200], normalCaptures: 12, forcedColorsCaptures: 2 },
    contrastContract: {
      targets: ['ordinary text', 'long Korean audit row', 'large text', 'workspace group heading', 'focused boundary', 'non-focused boundary'],
      thresholds: { ordinaryText: 4.5, longKoreanAuditRow: 4.5, largeText: 3, groupHeading: '4.5 unless computed as large, then 3', focusBoundary: 3, nonFocusBoundary: 3 },
      measuredInEveryCapture: true,
      forcedColorsIncluded: true,
    },
    zoomContract: { mechanism: 'chrome.tabs.setZoom/getZoom', transitions: [100, 200], resetZoom },
    requests: calls,
    ordinaryIsolation: { beforeOrdinaryLogin, afterOrdinaryLogin, auditIncrement: 0, queueIncrement: 0, privilegedRequestsDuringOrdinary: ordinaryCalls },
    authorityTransition: {
      mode: 'same mounted App, same open settings modal, React Query session cache update',
      coverage: [
        'managed superuser adminWorkspaceCount 1 -> 0 keeps and reloads focused audit-log',
        'superuser -> ordinary removes selected audit-log and focuses live neutral continuation',
        'superuser -> workspace-manager removes selected instance settings and focuses live neutral continuation',
      ],
      integrationTest: 'packages/web/test/issue86-audit-entry.test.tsx',
      integrationSourceSha256: hashFile(path.join(root, 'packages/web/test/issue86-audit-entry.test.tsx')),
      logoutOrNewModalUsedByTransitionTests: false,
    },
    closureEvidence,
    roleSnapshots,
    keyboard: { keys: ['ArrowDown', 'Home', 'End', 'Tab'], tabFocus },
    captures,
    badgeStateCaptures,
    artifactSet: { expectedArtifacts, observedArtifacts, exact: true, manifestWrittenLast: true },
    ime: 'N/A: no new text input',
  };
  const temporaryManifest = path.join(output, 'capture-manifest.json.tmp');
  fs.writeFileSync(temporaryManifest, JSON.stringify(manifest, null, 2));
  fs.renameSync(temporaryManifest, path.join(output, 'capture-manifest.json'));
  process.stdout.write('PASS issue86 product: role/privacy path + 12 normal and 2 forced-color captures\n');
} finally {
  if (context) await context.close();
  await new Promise((resolve) => setTimeout(resolve, 250));
  fs.rmSync(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
