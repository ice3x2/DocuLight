import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDir, '..');
const repositoryRoot = path.resolve(webRoot, '..', '..');
const phaseArgument = process.argv.find((argument) => argument.startsWith('--phase='));
const phase = phaseArgument?.slice('--phase='.length) || 'check';
const evidenceDir = path.join(
  repositoryRoot,
  '.kiwi',
  'sessions',
  'newspaper-20260916',
  'evidence',
  'foundation-field-fix',
);

await mkdir(evidenceDir, { recursive: true });

const server = await createServer({
  configFile: path.join(webRoot, 'vite.config.ts'),
  logLevel: 'error',
  root: webRoot,
  server: { host: '127.0.0.1', port: 0 },
});

let browser;
const assertions = [];
const record = (name, passed, details) => {
  assertions.push({ name, passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${details}`);
};

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP address.');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(
    `http://127.0.0.1:${address.port}/test/newspaper-field-component-fixture.html`,
    { waitUntil: 'networkidle' },
  );

  const input = page.locator('#actual-field-input');
  const marker = page.locator('[data-slot="field-error-icon"]');
  const importedControl = await input.evaluate((node) => ({
    slot: node.getAttribute('data-slot'),
    value: node.value,
  }));
  record(
    'fixture renders the shipped Input component',
    importedControl.slot === 'input' && importedControl.value === 'Kept value',
    `slot=${importedControl.slot}, value=${importedControl.value}`,
  );

  const markerCount = await marker.count();
  const markerVisible = markerCount === 1 && await marker.isVisible();
  const markerAriaHidden = markerCount === 1
    ? await marker.getAttribute('aria-hidden')
    : null;
  record(
    'invalid Field has one visible non-color marker hidden from accessibility APIs',
    markerVisible && markerAriaHidden === 'true',
    `count=${markerCount}, visible=${markerVisible}, aria-hidden=${markerAriaHidden}`,
  );

  const description = await input.evaluate((node) => {
    const ids = (node.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    return {
      invalid: node.getAttribute('aria-invalid'),
      ids,
      texts: ids.map((id) => document.getElementById(id)?.textContent),
      errorContainsMarker: ids.some((id) => {
        const describedNode = document.getElementById(id);
        const markerNode = document.querySelector('[data-slot="field-error-icon"]');
        return describedNode !== null && markerNode !== null && describedNode.contains(markerNode);
      }),
    };
  });
  record(
    'help and error remain the exact accessible description without marker text',
    description.invalid === 'true'
      && description.texts.join(' ') === 'Use a name that distinguishes this document. Enter a document name.'
      && !description.errorContainsMarker,
    `invalid=${description.invalid}, texts=${JSON.stringify(description.texts)}, marker-inside-description=${description.errorContainsMarker}`,
  );

  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  const focus = await input.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      activeId: document.activeElement?.id,
      outlineOffset: style.outlineOffset,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    };
  });
  record(
    'keyboard focus reaches the invalid input with a separated visible outline',
    focus.activeId === 'actual-field-input'
      && Number.parseFloat(focus.outlineWidth) >= 2
      && Number.parseFloat(focus.outlineOffset) >= 2
      && focus.outlineStyle !== 'none',
    `active=${focus.activeId}, outline=${focus.outlineWidth}/${focus.outlineOffset}/${focus.outlineStyle}`,
  );

  await page.screenshot({
    path: path.join(evidenceDir, `${phase}-actual-field.png`),
    fullPage: true,
  });
} catch (error) {
  record('runner completed', false, error instanceof Error ? error.stack || error.message : String(error));
} finally {
  if (browser) await browser.close();
  await server.close();
}

const failed = assertions.filter(({ passed }) => !passed);
const report = {
  phase,
  result: failed.length === 0 ? 'PASS' : 'FAIL',
  requirement: 'IR-SHELL-006 AC-7',
  fixture: 'packages/web/test/newspaper-field-component-fixture.tsx',
  assertions,
  liveHandlesAfterCleanup: 'none owned by this runner',
};
await writeFile(
  path.join(evidenceDir, `${phase}-actual-field.log`),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);

console.log(`${report.result}: ${assertions.length} assertions; ${failed.length} failed`);
process.exitCode = failed.length === 0 ? 0 : 1;
