const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const url = 'http://127.0.0.1:3419/test/newspaper-tree-fixture.html';
const server = () => spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '3419', '--strictPort'], { cwd: path.join(root, 'packages/web'), stdio: 'ignore', windowsHide: true });
const wait = async () => { for (let index = 0; index < 80; index += 1) { try { if ((await fetch(url)).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error('server timeout'); };

async function run() {
  const child = server();
  let browser;
  try {
    await wait();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    const failures = [];
    const check = async (name, callback) => { try { await callback(); } catch (error) { failures.push(`${name}: ${error.message}`); } };
    const rows = page.getByRole('treeitem');
    await check('tree row and affordance geometry', async () => {
      assert.equal(await page.getByRole('tree', { name: '문서 트리' }).getAttribute('data-row-height'), '40');
      assert.equal(Math.round((await rows.first().boundingBox()).height), 40);
      assert.equal(Math.round((await rows.first().getByRole('button').first().boundingBox()).width), 36);
      assert.equal(Math.round((await rows.first().locator('[data-tree-icon]').boundingBox()).width), 16);
    });
    await check('long-name accessible surface', async () => {
      const long = rows.nth(1);
      assert.equal(await long.locator('[title]').count(), 0);
      await rows.first().focus();
      await page.keyboard.press('ArrowDown');
      const focused = page.locator('[role="treeitem"]:focus');
      assert.equal(await focused.getAttribute('aria-describedby'), 'tree-name-deep-a');
      assert.equal(await focused.locator('[data-tree-name-description]').evaluate((element) => getComputedStyle(element).display), 'block');
    });    await check('selected marker', async () => {
      await rows.nth(2).evaluate((element) => element.setAttribute('aria-selected', 'true'));
      const marker = await rows.nth(2).locator('[data-tree-row]').evaluate((element) => getComputedStyle(element, '::before').width);
      assert.equal(marker, '2px');
    });
    await check('menu geometry', async () => {
      await rows.nth(3).click({ button: 'right', force: true });
      const menu = page.getByRole('menu');
      assert.equal(Math.round((await menu.boundingBox()).width), 240);
      assert.equal(await menu.evaluate((element) => getComputedStyle(element).overflowY), 'auto');
      const heights = await menu.getByRole('menuitem').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
      assert(heights.every((height) => height >= 36));
      await page.keyboard.press('Escape');
    });
    await check('remaining-height allocation', async () => {
      const viewport = await page.locator('[data-tree-viewport]').boundingBox();
      const tree = await page.getByRole('tree', { name: '문서 트리' }).boundingBox();
      const settings = await page.getByRole('button', { name: '설정' }).boundingBox();
      assert(viewport.y + viewport.height <= settings.y + 1);
      assert(Math.abs(tree.height - viewport.height) <= 1);
    });
    await check('favorite geometry and wrapping', async () => {
      await page.getByRole('tab', { name: '즐겨찾기' }).click();
      const row = page.locator('[data-favorite-row]').first();
      assert((await row.boundingBox()).height >= 52);
      const style = await row.evaluate((element) => ({ minHeight: getComputedStyle(element).minHeight, paddingTop: getComputedStyle(element).paddingTop, columns: getComputedStyle(element).gridTemplateColumns }));
      assert.equal(style.minHeight, '52px');
      assert.equal(style.paddingTop, '6px');
      assert(style.columns.endsWith(' 36px'));
      const remove = row.getByRole('button', { name: /즐겨찾기 해제/ });
      const box = await remove.boundingBox();
      assert.equal(Math.round(box.width), 36);
      assert.equal(Math.round(box.height), 36);
      assert(await row.evaluate((element) => element.scrollWidth <= element.clientWidth));
    });
    if (failures.length) throw new Error(`review replay failures\n${failures.join('\n')}`);
    console.log('PASS review replay geometry checks');
  } finally {
    await browser?.close();
    child.kill();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
