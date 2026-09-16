import { chromium } from '../../editor/node_modules/playwright/index.mjs';
import { createServer } from 'vite';

const failures = [];
const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
  if (!pass) failures.push(name);
};

const server = await createServer({
  configFile: false,
  root: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
  server: { host: '127.0.0.1', port: 0 },
  appType: 'mpa',
});
await server.listen();
const address = server.httpServer.address();
if (address === null || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
const fixture = `http://127.0.0.1:${address.port}/test/theme-runtime-browser-fixture.html`;

const browser = await chromium.launch({ headless: true });
try {
  const darkContext = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1280, height: 720 } });
  const page = await darkContext.newPage();
  await page.goto(`${fixture}?preference=system`, { waitUntil: 'networkidle' });
  const dark = await page.evaluate(() => {
    const style = (selector) => {
      const css = getComputedStyle(document.querySelector(selector));
      return { background: css.backgroundColor, color: css.color, border: css.borderColor };
    };
    return {
      theme: document.documentElement.dataset.theme,
      firstTheme: window.firstTheme,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      body: style('body'),
      document: style('#document'),
      sidebar: style('#sidebar'),
      primary: style('#primary'),
      input: style('#input'),
      selected: style('#selected'),
      portal: style('#portal'),
      mounts: window.editorMounts,
    };
  });
  check('OS dark is present before the runtime fixture settles', dark.firstTheme === 'dark' && dark.theme === 'dark' && dark.scheme === 'dark', JSON.stringify(dark));
  check('dark root and controls use exact computed colors',
    dark.body.background === 'rgb(32, 34, 31)' && dark.body.color === 'rgb(233, 231, 223)' &&
    dark.document.background === 'rgb(41, 44, 39)' && dark.sidebar.background === 'rgb(26, 29, 25)' &&
    dark.primary.background === 'rgb(168, 196, 211)' && dark.primary.color === 'rgb(25, 35, 31)' &&
    dark.input.background === 'rgb(48, 53, 46)' && dark.input.border === 'rgb(135, 145, 127)' &&
    dark.selected.background === 'rgb(52, 70, 80)', JSON.stringify(dark));
  check('body portal inherits the same dark semantic map',
    dark.portal.background === 'rgb(48, 53, 46)' && dark.portal.color === 'rgb(233, 231, 223)',
    JSON.stringify(dark.portal));

  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  const afterOsChange = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    body: getComputedStyle(document.body).backgroundColor,
    mounts: window.editorMounts,
    editorValue: document.querySelector('textarea')?.value,
  }));
  check('system follows a live OS change without remounting the editor',
    afterOsChange.theme === 'light' && afterOsChange.body === 'rgb(233, 231, 226)' &&
    afterOsChange.mounts === 1 && afterOsChange.editorValue === '선택과 실행취소 이력을 가진 본문',
    JSON.stringify(afterOsChange));
  await darkContext.close();

  const fixedContext = await browser.newContext({ colorScheme: 'light', viewport: { width: 640, height: 360 } });
  const fixed = await fixedContext.newPage();
  await fixed.goto(`${fixture}?preference=dark`, { waitUntil: 'networkidle' });
  await fixed.emulateMedia({ colorScheme: 'dark' });
  await fixed.emulateMedia({ colorScheme: 'light' });
  const fixedFacts = await fixed.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    width: innerWidth,
    height: innerHeight,
    mounts: window.editorMounts,
  }));
  check('fixed dark ignores OS changes at the 200% effective viewport',
    fixedFacts.theme === 'dark' && fixedFacts.scheme === 'dark' && fixedFacts.width === 640 && fixedFacts.height === 360 && fixedFacts.mounts === 1,
    JSON.stringify(fixedFacts));
  await fixed.screenshot({ path: new URL('../../../.kiwi/sessions/newspaper-20260916/evidence/issue46/dark-runtime-200.png', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') });
  await fixedContext.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
