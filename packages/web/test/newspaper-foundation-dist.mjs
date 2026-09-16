import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

import { chromium } from '../../editor/node_modules/playwright/index.mjs';

const webRoot = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const repoRoot = resolve(webRoot, '..', '..');
const distRoot = join(webRoot, 'dist');
const failures = [];

const check = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`);
  if (!pass) failures.push(name);
};

const exists = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

const requiredLicenses = [
  ['class-variance-authority', 'LICENSE'],
  ['clsx', 'license'],
  ['tailwind-merge', 'LICENSE.md'],
  ['tailwindcss', 'LICENSE'],
  ['@tailwindcss/vite', 'LICENSE'],
];

// Exact package/LICENSE.md bytes from the official shadcn@4.21.0 npm tarball.
const expectedShadcnLicense = Buffer.from(`MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`, 'utf8');
const expectedShadcnLicenseSha256 = '1564074e13439397221ffd522e2e504d56561994a23d371aa5e3ad43e4f5423f';
check('frozen shadcn@4.21.0 license fixture matches official tarball hash',
  createHash('sha256').update(expectedShadcnLicense).digest('hex') === expectedShadcnLicenseSha256,
  `bytes=${expectedShadcnLicense.length}, sha256=${createHash('sha256').update(expectedShadcnLicense).digest('hex')}, expected-sha256=${expectedShadcnLicenseSha256}`);

const packageJson = JSON.parse(await readFile(join(webRoot, 'package.json'), 'utf8'));
const requiredPins = {
  dependencies: {
    'class-variance-authority': '0.7.1',
    clsx: '2.1.1',
    'tailwind-merge': '3.7.0',
  },
  devDependencies: {
    '@tailwindcss/vite': '4.3.3',
    tailwindcss: '4.3.3',
  },
};
for (const [section, pins] of Object.entries(requiredPins)) {
  for (const [packageName, version] of Object.entries(pins)) {
    check(`exact dependency pin: ${packageName}`,
      packageJson[section]?.[packageName] === version,
      `expected=${version}, actual=${packageJson[section]?.[packageName] ?? '(missing)'}`);
  }
}

for (const [packageName, sourceName] of requiredLicenses) {
  const source = join(repoRoot, 'node_modules', ...packageName.split('/'), sourceName);
  const packaged = join(distRoot, 'licenses', ...packageName.split('/'), 'LICENSE');
  const sourcePresent = await exists(source);
  const packagedPresent = await exists(packaged);
  let equal = false;
  if (sourcePresent && packagedPresent) {
    const [sourceBytes, packagedBytes] = await Promise.all([readFile(source), readFile(packaged)]);
    equal = sourceBytes.equals(packagedBytes) && sourceBytes.length > 0;
  }
  check(`complete installed license: ${packageName}`,
    sourcePresent && packagedPresent && equal,
    `source=${sourcePresent}, dist=${packagedPresent}, exact-bytes=${equal}`);

  const packageDirectory = join(repoRoot, 'node_modules', ...packageName.split('/'));
  const upstreamNotice = (await readdir(packageDirectory)).find((name) => /^NOTICE(?:\.|$)/i.test(name));
  if (upstreamNotice !== undefined) {
    const sourceNotice = join(packageDirectory, upstreamNotice);
    const packagedNotice = join(distRoot, 'licenses', ...packageName.split('/'), 'NOTICE');
    const noticePresent = await exists(packagedNotice);
    const noticeEqual = noticePresent && (await readFile(sourceNotice)).equals(await readFile(packagedNotice));
    check(`installed NOTICE: ${packageName}`, noticePresent && noticeEqual,
      `dist=${noticePresent}, exact-bytes=${noticeEqual}`);
  }
}

const noticePath = join(distRoot, 'THIRD_PARTY_NOTICES.md');
const noticePresent = await exists(noticePath);
const notice = noticePresent ? await readFile(noticePath, 'utf8') : '';
for (const [packageName] of requiredLicenses) {
  const installedPackage = JSON.parse(await readFile(join(repoRoot, 'node_modules', ...packageName.split('/'), 'package.json'), 'utf8'));
  const provenance = `${packageName}@${installedPackage.version}`;
  check(`human-readable notice names ${packageName}`,
    noticePresent && notice.includes(provenance) && notice.includes(installedPackage.license),
    `notice=${noticePresent}, provenance=${provenance}, license=${installedPackage.license}, recorded=${notice.includes(provenance) && notice.includes(installedPackage.license)}`);
}
const shadcnLicense = join(distRoot, 'licenses', 'shadcn', 'LICENSE');
const shadcnLicensePresent = await exists(shadcnLicense);
const shadcnLicenseBytes = shadcnLicensePresent ? await readFile(shadcnLicense) : Buffer.alloc(0);
const shadcnLicenseSha256 = createHash('sha256').update(shadcnLicenseBytes).digest('hex');
check('copied official shadcn@4.21.0 license bytes and provenance',
  shadcnLicensePresent &&
    shadcnLicenseBytes.equals(expectedShadcnLicense) &&
    shadcnLicenseSha256 === expectedShadcnLicenseSha256 &&
    notice.includes('shadcn@4.21.0') && notice.includes('MIT'),
  `license=${shadcnLicensePresent}, bytes=${shadcnLicenseBytes.length}/${expectedShadcnLicense.length}, sha256=${shadcnLicenseSha256}, expected-sha256=${expectedShadcnLicenseSha256}, provenance=${notice.includes('shadcn@4.21.0')}, MIT=${notice.includes('MIT')}`);

const indexPath = join(distRoot, 'index.html');
const indexPresent = await exists(indexPath);
const indexHtml = indexPresent ? await readFile(indexPath, 'utf8') : '';
const stylesheetLinks = [...indexHtml.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
  .map((match) => match[1]);
const connectedCss = [];
for (const href of stylesheetLinks) {
  const relative = href.replace(/^\/+/, '');
  const cssPath = normalize(join(distRoot, relative));
  if (cssPath.startsWith(distRoot + sep) && await exists(cssPath)) connectedCss.push(relative);
}
check('production HTML connects generated CSS',
  indexPresent && connectedCss.length > 0,
  `index=${indexPresent}, css=${connectedCss.join(', ') || '(none)'}`);

if (indexPresent) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    let target = normalize(join(distRoot, relative));
    if (!target.startsWith(distRoot + sep) || !(await exists(target))) target = indexPath;
    response.writeHead(200, { 'content-type': mime[extname(target)] ?? 'application/octet-stream' });
    response.end(await readFile(target));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Artifact server did not expose a port');

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'networkidle' });
    const computed = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      const fixture = document.createElement('div');
      fixture.innerHTML = `
        <button data-slot="button" data-variant="primary">저장</button>
        <input data-slot="input" aria-label="문서 이름" />
        <div data-slot="row" data-state="selected">선택됨</div>
        <div data-slot="popover-content">포털</div>`;
      document.body.append(fixture);
      const style = (selector) => {
        const element = fixture.querySelector(selector);
        const css = getComputedStyle(element);
        return { background: css.backgroundColor, border: css.borderColor, minHeight: css.minHeight };
      };
      return {
        button: style('[data-slot="button"]'),
        input: style('[data-slot="input"]'),
        selected: style('[data-slot="row"]'),
        portal: style('[data-slot="popover-content"]'),
      };
    });
    check('built CSS produces the light control contract',
      computed.button.background === 'rgb(54, 91, 112)' &&
        Number.parseFloat(computed.button.minHeight) >= 36 &&
        computed.input.border === 'rgb(122, 123, 113)' &&
        computed.selected.background === 'rgb(223, 231, 233)' &&
        computed.portal.background === 'rgb(250, 249, 245)',
      JSON.stringify(computed));
  } finally {
    await browser.close();
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
