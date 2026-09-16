import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const webRoot = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const server = await createServer({ configFile: false, root: webRoot, server: { host: '127.0.0.1', port: 0 }, appType: 'mpa' });
const failures = [];
const check = (name, pass, details) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${details}`);
  if (!pass) failures.push(name);
};

await server.listen();
const address = server.httpServer.address();
if (address === null || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
const browser = await chromium.launch({ headless: true });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${address.port}/test/newspaper-data-display-fixture.html`, { waitUntil: 'networkidle' });

  const measured = await page.evaluate(() => {
    const styleOf = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        height: rect.height,
        width: rect.width,
        textAlign: style.textAlign,
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        borderLeftWidth: style.borderLeftWidth,
        borderRadius: style.borderRadius,
        background: style.backgroundColor,
      };
    };
    const path = document.querySelector('#full-path');
    if (!(path instanceof HTMLElement)) throw new Error('Missing full path');
    return {
      rows: [...document.querySelectorAll('[data-slot="table-row"]')].map((row) => row.getBoundingClientRect().height),
      selected: styleOf('[data-slot="table-body"] [data-state="selected"] [data-slot="table-cell"]'),
      numeric: styleOf('[data-slot="table-cell"][data-numeric="true"]'),
      path: { ...styleOf('#full-path'), scrollWidth: path.scrollWidth, clientWidth: path.clientWidth, text: path.textContent },
      badge: styleOf('[data-slot="badge"]'),
      loadingMarker: styleOf('[data-slot="loading-state-marker"]'),
      states: [...document.querySelectorAll('[data-slot="loading-state"], [data-slot="empty-state"], [data-slot="inline-notice"]')]
        .map((node) => ({ slot: node.getAttribute('data-slot'), height: node.getBoundingClientRect().height })),
    };
  });

  check('table rows are at least 40px and numeric cells align right',
    measured.rows.every((height) => height >= 40) && measured.numeric.textAlign === 'right',
    JSON.stringify({ rows: measured.rows, numeric: measured.numeric.textAlign }));
  check('long path wraps fully and selected row has a non-color edge marker',
    measured.path.whiteSpace !== 'nowrap' && measured.path.scrollWidth <= measured.path.clientWidth &&
      Number.parseFloat(measured.selected.borderLeftWidth) >= 3,
    JSON.stringify({ path: measured.path, selected: measured.selected }));
  check('badge and common states have visible presentation',
    Number.parseFloat(measured.badge.borderRadius) === 3 && measured.loadingMarker.width > 0 &&
      measured.loadingMarker.height > 0 && measured.states.every(({ height }) => height > 0),
    JSON.stringify({ badge: measured.badge, loadingMarker: measured.loadingMarker, states: measured.states }));

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Tab');
  const pathFocus = await page.evaluate(() => ({ id: document.activeElement?.id, text: document.activeElement?.textContent }));
  check('keyboard reaches the complete path value',
    pathFocus.id === 'full-path' && pathFocus.text === measured.path.text,
    JSON.stringify(pathFocus));

  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}: ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
