const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const base = 'http://127.0.0.1:3420/test/newspaper-tree-fixture.html';
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue51');
fs.mkdirSync(output, { recursive: true });
const start = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3420', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: 'ignore', windowsHide: true });
const wait = async () => { for (let index = 0; index < 80; index += 1) { try { if ((await fetch(base)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error('server timeout'); };

async function openNaming(page, item) {
  const row = page.getByRole('treeitem').nth(2);
  await row.waitFor({ state: 'visible' });
  if (item === '새 문서') await row.getByRole('button', { name: /펼치기/ }).click();
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await menu.waitFor({ state: 'visible' });
  await menu.getByRole('menuitem', { name: item }).click();
  return page.getByRole('textbox', { name: /이름/ });
}

async function run() {
  const server = start();
  let browser;
  try {
    await wait();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const only = process.env.NAMING_CASE;

    if (only === undefined || only === 'rename') {
    await page.goto(`${base}?state=rename-pending`, { waitUntil: 'networkidle' });
    let input = await openNaming(page, '이름 변경');
    await input.fill('한번만.md');
    await input.press('Enter');
    await input.press('Enter');
    assert.equal(await page.locator('body').getAttribute('data-rename-calls'), '1', 'pending rename submitted more than once');
    assert.equal(await input.isDisabled(), true, 'pending rename input is not disabled');
    assert.equal(await input.getAttribute('aria-busy'), 'true');
    await page.screenshot({ path: path.join(output, 'green-state-rename-pending.png'), fullPage: true });
    }

    if (only === undefined || only === 'create') {
    await page.goto(`${base}?state=create-pending`, { waitUntil: 'networkidle' });
    let input = await openNaming(page, '새 문서');
    await input.fill('한번만-새문서.md');
    await input.press('Enter');
    await input.press('Enter');
    assert.equal(await page.locator('body').getAttribute('data-create-calls'), '1', 'pending create submitted more than once');
    assert.equal(await input.isDisabled(), true, 'pending create input is not disabled');
    assert.equal(await input.getAttribute('aria-busy'), 'true');
    await page.screenshot({ path: path.join(output, 'green-state-create-pending.png'), fullPage: true });
    }

    if (only === undefined || only === 'empty') {
    await page.goto(`${base}?state=naming-error`, { waitUntil: 'networkidle' });
    let input = await openNaming(page, '이름 변경');
    await input.fill('   ');
    await input.press('Enter');
    assert.equal(await input.getAttribute('aria-invalid'), 'true', 'empty name is not exposed as invalid');
    const describedBy = await input.getAttribute('aria-describedby');
    assert(describedBy, 'empty name has no described error region');
    const help = page.locator(`#${describedBy}`);
    assert(await help.getByRole('alert').isVisible(), 'empty name error is not visible');
    await page.screenshot({ path: path.join(output, 'green-state-empty-name-invalid.png'), fullPage: true });
    await input.fill('다시 입력.md');
    assert.equal(await input.getAttribute('aria-invalid'), null, 'local empty error did not clear after valid text');
    assert.equal(await help.getByRole('alert').count(), 0, 'local empty error remained after valid text');
    }
    console.log('PASS naming pending and empty-invalid checks');
  } finally {
    await browser?.close();
    server.kill();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
