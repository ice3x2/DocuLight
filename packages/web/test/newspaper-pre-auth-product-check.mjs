import { runBrowserChecks, waitUntil, login, WEB_URL } from './_web-harness.mjs';

// Mutation-heavy product evidence: run only against a disposable server/data directory.
// It intentionally stays out of test:browser:all so it cannot consume a shared server's
// login-rate budget or leave accounts and signup-mode changes behind.

const loginVisible = () => document.querySelector('input[name="password"]') !== null;
const appVisible = () => document.querySelector('[role="tree"]') !== null;
const alertText = () => document.querySelector('[role="alert"]')?.textContent?.trim() ?? '';
let adminCookie = '';

async function screenLogin(page, name, password) {
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
}

async function logout(page) {
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await waitUntil(() => page.evaluate(loginVisible), Boolean, { timeout: 10_000 });
}

async function setMode(page, mode) {
  const status = (await fetch(new URL('/api/instance/signup-mode', WEB_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ mode }),
  })).status;
  if (status !== 204) throw new Error(`signup mode update failed: ${status}`);
  await logout(page);
}

async function signup(page, name, password) {
  await page.getByRole('button', { name: '가입 신청하기' }).click();
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="password"]', password);
  await page.getByRole('button', { name: '가입 신청' }).click();
}

await runBrowserChecks(async ({ page, check }) => {
  const stamp = Date.now();
  const password = `Issue59-${stamp}`;
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await waitUntil(() => page.evaluate(loginVisible), Boolean, { timeout: 10_000 });
  const anonymous = await page.evaluate(() => ({
    shell: document.querySelector('[data-shell="root"]') !== null,
    settings: document.querySelector('[data-shell="settings-corner"]') !== null,
  }));
  check('anonymous product omits shell and settings', !anonymous.shell && !anonymous.settings);
  await page.getByRole('button', { name: '가입 신청하기' }).click();
  check('real signup navigation works', await page.getByRole('heading', { name: '가입 신청' }).isVisible());
  await page.getByRole('button', { name: '로그인하기' }).click();
  check('real login return navigation works', await page.getByRole('heading', { name: '로그인' }).isVisible());

  const captured = page.waitForRequest((request) => request.url().endsWith('/api/auth/login') && request.method() === 'POST');
  await screenLogin(page, `missing-${stamp}`, password);
  const request = await captured;
  check('login endpoint and exact payload values are unchanged',
    request.url().endsWith('/api/auth/login') && JSON.stringify(request.postDataJSON()) === JSON.stringify({ name: `missing-${stamp}`, password }));
  await waitUntil(() => page.evaluate(alertText), (value) => value.length > 0, { timeout: 5_000 });
  const unknown = await page.evaluate(alertText);
  await page.fill('input[name="name"]', process.env.DOCULIGHT_E2E_USER);
  await page.fill('input[name="password"]', `wrong-${stamp}`);
  await page.click('button[type="submit"]');
  await waitUntil(() => page.evaluate(alertText), (value) => value.length > 0, { timeout: 5_000 });
  const wrong = await page.evaluate(alertText);
  check('unknown user and wrong password are indistinguishable', unknown === wrong && wrong.includes('이름 또는 비밀번호'));

  await login(page);
  adminCookie = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
  await login(page);
  const accounts = await page.evaluate(async ({ stamp: value, password: secret }) => {
    const made = [];
    for (const status of ['pending', 'suspended', 'rejected']) {
      const created = await (await fetch('/api/roster/users', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${status}-${value}`, password: secret }),
      })).json();
      await fetch(`/api/roster/users/${created.id}/status`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      made.push({ name: `${status}-${value}`, status });
    }
    return made;
  }, { stamp, password });
  await logout(page);
  const expected = { pending: '승인 대기 중', suspended: '계정이 정지됨', rejected: '가입이 거절됨' };
  for (const account of accounts) {
    await screenLogin(page, account.name, password);
    await waitUntil(() => page.evaluate(alertText), (value) => value.length > 0, { timeout: 5_000 });
    check(`${account.status} server-approved message survives`, (await page.evaluate(alertText)).includes(expected[account.status]));
  }

  await setMode(page, 'open');
  const openName = `open-${stamp}`;
  await signup(page, openName, password);
  check('open signup keeps neutral receipt text', (await page.getByRole('status').textContent()).includes('승인이 필요한 경우'));
  await page.getByRole('button', { name: '로그인하기' }).click();
  await screenLogin(page, openName, password);
  await waitUntil(() => page.evaluate(appVisible), Boolean, { timeout: 10_000 });
  check('open signup account enters authenticated app', await page.evaluate(appVisible));

  await logout(page);
  await setMode(page, 'approval');
  const approvalName = `approval-${stamp}`;
  await signup(page, approvalName, password);
  check('approval signup keeps neutral receipt text', (await page.getByRole('status').textContent()).includes('승인이 필요한 경우'));
  await page.getByRole('button', { name: '로그인하기' }).click();
  await screenLogin(page, approvalName, password);
  await waitUntil(() => page.evaluate(alertText), (value) => value.length > 0, { timeout: 5_000 });
  check('approval signup remains blocked before approval', (await page.evaluate(alertText)).includes('승인 대기 중'));

  await setMode(page, 'invite-only');
  await signup(page, `closed-${stamp}`, password);
  await waitUntil(() => page.evaluate(alertText), (value) => value.length > 0, { timeout: 5_000 });
  check('closed signup preserves supplied App text', (await page.evaluate(alertText)).includes('가입 신청을 받지 않습니다'));
});
