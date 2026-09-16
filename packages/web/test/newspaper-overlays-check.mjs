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
  await page.goto(`http://127.0.0.1:${address.port}/test/newspaper-overlays-fixture.html`, { waitUntil: 'networkidle' });

  await page.locator('#dialog-trigger').click();
  const dialog = await page.locator('[data-slot="dialog-content"]').evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { width: rect.width, left: rect.left, right: innerWidth - rect.right, padding: style.padding, radius: style.borderRadius, position: style.position };
  });
  check('dialog stays within 560px with 24px viewport margin and overlay radius',
    dialog.width <= 560 && dialog.left >= 24 && dialog.right >= 24 && Number.parseFloat(dialog.padding) === 24 && Number.parseFloat(dialog.radius) === 6 && dialog.position === 'fixed',
    JSON.stringify(dialog));
  await page.locator('#dialog-owned-popover-trigger').click();
  const dialogLayers = await page.evaluate(() => {
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    const dialog = document.querySelector('[data-slot="dialog-content"]');
    const nested = document.querySelector('#dialog-owned-popover-content');
    if (!(overlay instanceof HTMLElement) || !(dialog instanceof HTMLElement) || !(nested instanceof HTMLElement)) return null;
    return {
      overlay: getComputedStyle(overlay).zIndex,
      content: getComputedStyle(dialog).zIndex,
      nested: getComputedStyle(nested).zIndex,
      dialogKind: dialog.dataset.overlayOwnerKind,
      nestedKind: nested.dataset.overlayOwnerKind,
      dialogId: dialog.dataset.overlayOwnerId,
      nestedId: nested.dataset.overlayOwnerId,
    };
  });
  check('dialog-owned overlay uses the fixed 400/500/600 owner layers',
    dialogLayers?.overlay === '400' && dialogLayers.content === '500' && dialogLayers.nested === '600' && dialogLayers.dialogKind === 'dialog' && dialogLayers.nestedKind === 'dialog' && dialogLayers.dialogId === dialogLayers.nestedId,
    JSON.stringify(dialogLayers));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.id === 'dialog-owned-popover-trigger');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.id === 'dialog-trigger');
  check('dialog Escape restores trigger focus', await page.evaluate(() => document.activeElement?.id === 'dialog-trigger'), `active=${await page.evaluate(() => document.activeElement?.id)}`);

  await page.locator('#menu-trigger').click();
  const menu = await page.locator('[data-slot="dropdown-menu-content"]').evaluate((node) => {
    const style = getComputedStyle(node);
    return { height: node.getBoundingClientRect().height, maxHeight: style.maxHeight, overflowY: style.overflowY, viewport: innerHeight };
  });
  check('menu is constrained to available height and internally scrolls',
    menu.height <= menu.viewport && menu.overflowY === 'auto' && await page.locator('[data-slot="dropdown-menu-content"]').getAttribute('data-overlay-owner-kind') === 'page' && await page.locator('[data-slot="dropdown-menu-content"]').evaluate((node) => getComputedStyle(node).zIndex) === '300', JSON.stringify(menu));
  await page.keyboard.press('Escape');

  await page.locator('#confirm-dialog-trigger').click();
  await page.locator('#confirm-trigger').click();
  const initial = await page.evaluate(() => document.activeElement?.textContent?.trim());
  const sharedSecondaryLight = await page.locator('#underlying-popover-trigger').evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { height: rect.height, radius: style.borderRadius, fontSize: style.fontSize, fontWeight: style.fontWeight, background: style.backgroundColor, color: style.color };
  });
  const cancelLight = await page.getByRole('button', { name: '취소' }).evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { height: rect.height, radius: style.borderRadius, fontSize: style.fontSize, fontWeight: style.fontWeight, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, background: style.backgroundColor, color: style.color };
  });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const sharedSecondaryDark = await page.locator('#underlying-popover-trigger').evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color };
  });
  const cancelDark = await page.getByRole('button', { name: '취소' }).evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, color: style.color, outlineColor: style.outlineColor };
  });
  check('alert cancel consumes shared secondary geometry, theme, and visible focus in light and dark',
    initial === '취소' && cancelLight.height === sharedSecondaryLight.height && cancelLight.radius === sharedSecondaryLight.radius && cancelLight.fontSize === sharedSecondaryLight.fontSize && cancelLight.fontWeight === sharedSecondaryLight.fontWeight && cancelLight.background === sharedSecondaryLight.background && cancelLight.color === sharedSecondaryLight.color && cancelDark.background === sharedSecondaryDark.background && cancelDark.color === sharedSecondaryDark.color && cancelLight.outlineStyle === 'solid' && cancelLight.outlineWidth === '2px' && cancelLight.outlineOffset === '2px',
    JSON.stringify({ initial, sharedSecondaryLight, cancelLight, sharedSecondaryDark, cancelDark }));
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  const alertGeometry = await page.locator('[data-slot="alert-dialog-content"]').evaluate((node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, top: rect.top, radius: style.borderRadius, zIndex: style.zIndex };
  });
  check('risk confirmation opens centered with cancel focused',
    initial === '취소' && alertGeometry.width <= 560 && alertGeometry.left >= 24 && alertGeometry.top >= 24,
    JSON.stringify({ initial, alertGeometry }));

  await page.locator('[data-slot="alert-dialog-overlay"]').click({ position: { x: 4, y: 4 }, force: true });
  check('outside click does not dismiss risk confirmation', await page.locator('[data-slot="alert-dialog-content"]').isVisible(), 'alert remains visible');

  const ownerLayers = await page.evaluate(() => {
    const inspect = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      return { kind: node.dataset.overlayOwnerKind, id: node.dataset.overlayOwnerId, zIndex: style.zIndex, pointerEvents: style.pointerEvents };
    };
    return {
      underlying: inspect('#underlying-popover-content'),
      alertOverlay: inspect('[data-slot="alert-dialog-overlay"]'),
      alert: inspect('[data-slot="alert-dialog-content"]'),
    };
  });
  check('pre-existing page popover stays below the alert and is noninteractive',
    ownerLayers.underlying?.kind === 'page' && ownerLayers.underlying.zIndex === '300' && ownerLayers.underlying.pointerEvents === 'none' && ownerLayers.alertOverlay?.zIndex === '700' && ownerLayers.alert?.kind === 'alert' && ownerLayers.alert.zIndex === '800' && Boolean(ownerLayers.alert.id),
    JSON.stringify(ownerLayers));

  await page.locator('#nested-popover-trigger').click();
  const nestedLayer = await page.evaluate(() => {
    const nested = document.querySelector('#alert-owned-popover-content');
    const alert = document.querySelector('[data-slot="alert-dialog-content"]');
    if (!(nested instanceof HTMLElement) || !(alert instanceof HTMLElement)) return null;
    return { kind: nested.dataset.overlayOwnerKind, id: nested.dataset.overlayOwnerId, alertId: alert.dataset.overlayOwnerId, zIndex: getComputedStyle(nested).zIndex };
  });
  await page.locator('#popover-last-action').click();
  check('alert-owned popover is above the alert, operable, and shares its owner id',
    nestedLayer?.kind === 'alert' && nestedLayer.zIndex === '900' && nestedLayer.id === nestedLayer.alertId && await page.evaluate(() => document.activeElement?.id === 'popover-last-action'),
    JSON.stringify({ nestedLayer, active: await page.evaluate(() => document.activeElement?.id) }));
  await page.keyboard.press('Escape');
  await page.locator('#alert-owned-popover-content').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.id === 'nested-popover-trigger');
  check('topmost Escape closes nested popover only',
    !(await page.locator('#alert-owned-popover-content').isVisible()) && await page.locator('[data-slot="alert-dialog-content"]').isVisible() && await page.evaluate(() => document.activeElement?.id === 'nested-popover-trigger'),
    `nested hidden, alert visible, active=${await page.evaluate(() => document.activeElement?.id)}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.id === 'confirm-trigger');
  check('second Escape closes alert and restores logical successor',
    !(await page.locator('[data-slot="alert-dialog-content"]').isVisible()) && await page.locator('#confirm-dialog-content').isVisible() && await page.evaluate(() => document.activeElement?.id === 'confirm-trigger') && await page.locator('#alert-owned-popover-content').count() === 0,
    `dialog visible=${await page.locator('#confirm-dialog-content').isVisible()}, active=${await page.evaluate(() => document.activeElement?.id)}, child portals=${await page.locator('#alert-owned-popover-content').count()}`);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.id === 'confirm-dialog-trigger');
  check('closing the remaining dialog restores its page trigger without background focus leak',
    !(await page.locator('#confirm-dialog-content').isVisible()) && await page.evaluate(() => document.activeElement?.id === 'confirm-dialog-trigger'),
    `active=${await page.evaluate(() => document.activeElement?.id)}`);

  await page.close();
} finally {
  await browser.close();
  await server.close();
}

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}: ${failures.length} failed assertions`);
process.exitCode = failures.length === 0 ? 0 : 1;
