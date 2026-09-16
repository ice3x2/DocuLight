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
  await page.goto(`http://127.0.0.1:${address.port}/test/newspaper-shared-controls-fixture.html`, { waitUntil: 'networkidle' });

  const geometry = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return { width: rect.width, height: rect.height, borderRadius: style.borderRadius, accentColor: style.accentColor };
    };
    return {
      checkbox: measure('#shared-checkbox'),
      checkboxTarget: measure('label[for="shared-checkbox"]'),
      radio: measure('#shared-radio'),
      radioTarget: measure('label[for="shared-radio"]'),
      loading: measure('#loading-action'),
      spinner: measure('[data-slot="button-spinner"]'),
    };
  });

  check('selection targets and native indicators have shared geometry',
    geometry.checkboxTarget.height >= 36 && geometry.radioTarget.height >= 36 &&
      geometry.checkbox.width >= 18 && geometry.checkbox.height >= 18 &&
      geometry.radio.width >= 18 && geometry.radio.height >= 18,
    JSON.stringify(geometry));
  check('loading state keeps control geometry and a visible progress marker',
    geometry.loading.height >= 36 && geometry.spinner.width > 0 && geometry.spinner.height > 0,
    JSON.stringify({ loading: geometry.loading, spinner: geometry.spinner }));

  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab');
  const focus = await page.locator('#shared-checkbox').evaluate((node) => {
    const style = getComputedStyle(node);
    return { active: document.activeElement?.id, width: style.outlineWidth, offset: style.outlineOffset, kind: style.outlineStyle };
  });
  check('keyboard reaches selection controls with separated focus',
    focus.active === 'shared-checkbox' && Number.parseFloat(focus.width) >= 2 && Number.parseFloat(focus.offset) >= 2 && focus.kind !== 'none',
    JSON.stringify(focus));

  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}: ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
