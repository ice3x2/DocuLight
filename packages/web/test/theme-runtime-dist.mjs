import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { chromium } from '../../editor/node_modules/playwright/index.mjs';

const dist = resolve(new URL('../dist', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const exists = async (path) => { try { return (await stat(path)).isFile(); } catch { return false; } };
const index = join(dist, 'index.html');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname.startsWith('/api/')) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end('null');
    return;
  }
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let target = normalize(join(dist, relative));
  if (!target.startsWith(dist + sep) || !(await exists(target))) target = index;
  response.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream' });
  response.end(await readFile(target));
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (address === null || typeof address === 'string') throw new Error('Artifact server did not expose a port');

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
  const facts = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = '<button data-slot="button" data-variant="primary">저장</button><input data-slot="input"><div data-slot="row" data-state="selected">선택</div>';
    const portal = document.createElement('div');
    portal.dataset.slot = 'popover-content';
    document.body.append(host, portal);
    const read = (element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, border: style.borderColor };
    };
    return {
      theme: document.documentElement.dataset.theme,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      body: read(document.body),
      button: read(host.querySelector('button')),
      input: read(host.querySelector('input')),
      selected: read(host.querySelector('[data-slot=row]')),
      portal: read(portal),
    };
  });
  const pass = facts.theme === 'dark' && facts.scheme === 'dark' &&
    facts.body.background === 'rgb(32, 34, 31)' && facts.body.color === 'rgb(233, 231, 223)' &&
    facts.button.background === 'rgb(168, 196, 211)' && facts.button.color === 'rgb(25, 35, 31)' &&
    facts.input.background === 'rgb(48, 53, 46)' && facts.input.border === 'rgb(135, 145, 127)' &&
    facts.selected.background === 'rgb(52, 70, 80)' && facts.portal.background === 'rgb(48, 53, 46)';
  console.log(`${pass ? 'PASS' : 'FAIL'} production dark CSS and first paint — ${JSON.stringify(facts)}`);
  if (!pass) process.exitCode = 1;
  await context.close();
} finally {
  await browser.close();
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}
