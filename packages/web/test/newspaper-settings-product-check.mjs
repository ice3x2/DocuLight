import { runBrowserChecks, login, loginAs, WEB_URL, waitUntil } from './_web-harness.mjs';

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
  const tabs = dialog.getByRole('tab');
  await tabs.nth(0).click();
  const editorRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/personal-settings' && request.method() === 'PATCH') editorRequests.push(request.postDataJSON());
  });
  const editorSelects = dialog.locator('[role="tabpanel"]:visible select');
  check('built product exposes exactly two editor native selects', await editorSelects.count() === 2);
  check('built product editor options are exact', JSON.stringify(await editorSelects.evaluateAll((items) => items.map((item) => [...item.options].map((option) => option.value)))) === JSON.stringify([['view', 'edit'], ['live-preview', 'source']]));
  await editorSelects.nth(0).focus();
  await page.keyboard.press('ArrowDown');
  await waitUntil(() => editorSelects.nth(0).inputValue(), (value) => value === 'edit', { timeout: 5_000 });
  check('built product editor select supports native keyboard traversal', await editorSelects.nth(0).inputValue() === 'edit');
  await dialog.getByText('저장됨', { exact: true }).waitFor({ timeout: 5_000 });
  await page.keyboard.press('Tab');
  const editorTabForward = await editorSelects.nth(1).evaluate((node) => document.activeElement === node);
  await page.keyboard.press('Shift+Tab');
  check('built product editor selects support Tab and Shift+Tab', editorTabForward && await editorSelects.nth(0).evaluate((node) => document.activeElement === node));
  check('built product sends one exact editor key assignment', editorRequests.length === 1 && JSON.stringify(editorRequests[0]) === JSON.stringify({ 'default-view-mode': 'edit' }));
  await page.reload({ waitUntil: 'networkidle' });
  await gear.click();
  const reloadedDialog = page.locator('[data-settings-dialog]');
  const reloadedEditor = reloadedDialog.locator('[role="tabpanel"]:visible select');
  check('built product authoritative reread preserves exact key without clobbering sibling', await reloadedEditor.nth(0).inputValue() === 'edit' && await reloadedEditor.nth(1).inputValue() === 'live-preview');
  await reloadedDialog.locator('[data-settings-header] button').click();
  await gear.click();
  await tabs.nth(1).click();
  const themeSelect = dialog.locator('[role="tabpanel"]:visible select');
  check('built product exposes exactly one theme select', await themeSelect.count() === 1);
  check('built product theme options are exact', JSON.stringify(await themeSelect.locator('option').evaluateAll((items) => items.map((item) => item.value))) === JSON.stringify(['light', 'dark', 'system']));
  await tabs.nth(3).click();
  const account = dialog.locator('[role="tabpanel"]:visible');
  await account.locator('button').first().click();
  const form = account.locator('form:has(input[name="current"])');
  check('built product renders the issue 62 password form', await form.getAttribute('data-password-change-form') !== null);
  check('built product keeps password-manager attributes', JSON.stringify(await form.locator('input').evaluateAll((items) => items.map((item) => ({ type: item.type, name: item.name, autocomplete: item.autocomplete })))) === JSON.stringify([
    { type: 'password', name: 'current', autocomplete: 'current-password' },
    { type: 'password', name: 'next', autocomplete: 'new-password' },
  ]));
  const current = form.locator('input[name="current"]');
  const next = form.locator('input[name="next"]');
  await current.focus();
  await page.keyboard.press('Tab');
  const tabForward = await next.evaluate((item) => document.activeElement === item);
  await page.keyboard.press('Shift+Tab');
  const tabBackward = await current.evaluate((item) => document.activeElement === item);
  check('built product password fields support Tab and Shift+Tab', tabForward && tabBackward);
  const geometry = await form.evaluate((node) => {
    const formRect = node.getBoundingClientRect();
    const controls = [...node.querySelectorAll('input, button[type="submit"]')].map((item) => item.getBoundingClientRect().height);
    return { width: formRect.width, controls };
  });
  check('built product password geometry is bounded and reachable', geometry.width <= 560.5 && geometry.controls.every((height) => height >= 36));
  await dialog.getByRole('button', { name: '설정 닫기' }).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') === null);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '설정', null, { timeout: 5_000 });
  check('product close restores the original gear', true);

  const username = process.env.DOCULIGHT_E2E_USER;
  const originalPassword = process.env.DOCULIGHT_E2E_PASS;
  const changedPassword = `Issue62-새값-${Date.now()}`;
  const passwordRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/password') passwordRequests.push(request.postDataJSON());
  });
  await gear.click();
  const liveDialog = page.getByRole('dialog', { name: '설정' });
  await liveDialog.getByRole('tab').nth(3).click();
  const liveAccount = liveDialog.locator('[role="tabpanel"]:visible');
  await liveAccount.locator('button').first().click();
  const liveForm = liveAccount.locator('form:has(input[name="current"])');
  await liveForm.locator('input[name="current"]').fill('definitely-wrong-current');
  await liveForm.locator('input[name="next"]').fill('eventful-disposable-next');
  await liveForm.locator('button[type="submit"]').click();
  await liveForm.getByRole('alert').waitFor();
  check('built product eventful autofill sends exact rejected credential bytes', passwordRequests.length === 1 && passwordRequests[0]?.current === 'definitely-wrong-current' && passwordRequests[0]?.next === 'eventful-disposable-next');
  await liveForm.evaluate((node, values) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(node.querySelector('input[name="current"]'), values.current);
    setter.call(node.querySelector('input[name="next"]'), values.next);
  }, { current: originalPassword, next: changedPassword });
  await page.route('**/api/auth/password', async (route) => {
    if (route.request().postDataJSON()?.next === changedPassword) await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await liveForm.locator('input[name="next"]').focus();
  await page.keyboard.down('Enter');
  await liveForm.locator('button[type="submit"]').dispatchEvent('click');
  await page.keyboard.up('Enter');
  await page.locator('input[name="password"]').waitFor({ timeout: 10_000 });
  check('built product successful password change returns to login', true);
  check('built product sends one exact DOM-native credential request', passwordRequests.length === 2 && passwordRequests[1]?.current === originalPassword && passwordRequests[1]?.next === changedPassword);

  await loginAs(page, username, changedPassword);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const productGear = page.getByRole('button', { name: '설정' });
  await productGear.click();
  const logoutDialog = page.getByRole('dialog', { name: '설정' });
  await logoutDialog.getByRole('tab').nth(3).click();
  const requestsBeforeLogout = passwordRequests.length;
  const logoutAccount = logoutDialog.locator('[role="tabpanel"]:visible');
  await logoutAccount.locator('button').first().click();
  await logoutAccount.locator('input[name="current"]').fill('populated-current');
  await logoutAccount.locator('input[name="next"]').fill('populated-next');
  await logoutAccount.locator('button').last().click();
  await page.locator('input[name="password"]').waitFor({ timeout: 10_000 });
  check('built product logout returns to login without password request', passwordRequests.length === requestsBeforeLogout);
  await loginAs(page, username, changedPassword);
  check('built product logout leaves changed password valid', true);
});
