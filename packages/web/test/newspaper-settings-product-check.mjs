import { runBrowserChecks, login, WEB_URL, waitUntil } from './_web-harness.mjs';

await runBrowserChecks(async ({ page, check }) => {
  await login(page);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await waitUntil(() => page.locator('[data-shell="root"]').count(), (count) => count === 1, { timeout: 15_000 });
  const gear = page.getByRole('button', { name: '설정' });
  await gear.click();
  const dialog = page.getByRole('dialog', { name: '설정' });
  await dialog.waitFor();
  check('installed authenticated product opens one settings dialog', await dialog.count() === 1);
  check('installed superuser product exposes exact 14 categories', await dialog.getByRole('tab').count() === 14);
  check('product settings uses grouped vertical navigation',
    JSON.stringify(await dialog.locator('[data-settings-navigation]').getByRole('heading', { level: 2 }).allTextContents()) === JSON.stringify(['개인', '워크스페이스 관리', '인스턴스']));
  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '설정', null, { timeout: 5_000 });
  check('product close restores the original gear', true);
});
