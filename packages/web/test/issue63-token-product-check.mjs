import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium, request } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const origin = process.env.WEB_URL;
const userName = process.env.DOCULIGHT_E2E_USER;
const password = process.env.DOCULIGHT_E2E_PASS;
const secondUserName = process.env.DOCULIGHT_E2E_SECOND_USER;
const secondPassword = process.env.DOCULIGHT_E2E_SECOND_PASS;
if (!origin || !userName || !password || !secondUserName || !secondPassword) throw new Error('isolated product inputs are missing');

const browser = await chromium.launch({ headless: true });
const secretFieldCount = (value) => {
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + secretFieldCount(entry), 0);
  if (value === null || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((sum, [key, entry]) => sum + (/^(token|secret|plaintext)$/i.test(key) ? 1 : 0) + secretFieldCount(entry), 0);
};
const logIn = async (context, name, pass) => {
  const page = await context.newPage(); await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('이름').fill(name); await page.getByLabel('비밀번호').fill(pass); await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('button', { name: '설정' }).waitFor(); return page;
};
const issueByApi = async (context, name) => {
  const response = await context.request.post(new URL('/api/auth/tokens', origin).href, { data: { name, scope: 'read-only', expiresInDays: 90 } });
  assert.equal(response.status(), 201); return response.json();
};
const patStatus = async (token) => {
  const client = await request.newContext({ baseURL: origin, extraHTTPHeaders: { authorization: `Bearer ${token}` } });
  try { return (await client.post('/api/mcp', { data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } })).status(); }
  finally { await client.dispose(); }
};

let primaryContext; let secondContext;
try {
  primaryContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  secondContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const primaryPage = await logIn(primaryContext, userName, password);
  const secondPage = await logIn(secondContext, secondUserName, secondPassword);
  const consoleMessages = [];
  primaryPage.on('console', (message) => { consoleMessages.push(message.text()); });
  const preservedPrimary = await issueByApi(primaryContext, 'Issue63 preserved primary');
  const preservedSecond = await issueByApi(secondContext, 'Issue63 preserved second');
  assert.equal(await patStatus(preservedPrimary.token), 200);
  assert.equal(await patStatus(preservedSecond.token), 200);
  await primaryPage.reload({ waitUntil: 'networkidle' });
  await primaryPage.getByRole('button', { name: '설정' }).waitFor();

  const observed = { issueRequests: 0, revokeRequests: 0, listRequests: 0, listSecretFields: 0 };
  let failNextList = false; let failNextRevoke = true; let listFailureObserved = false; let revokeFailureObserved = false;
  primaryPage.on('request', (outgoing) => {
    const parsed = new URL(outgoing.url());
    if (parsed.pathname === '/api/auth/tokens' && outgoing.method() === 'POST') observed.issueRequests += 1;
    if (parsed.pathname.startsWith('/api/auth/tokens/') && outgoing.method() === 'DELETE') observed.revokeRequests += 1;
    if (parsed.pathname === '/api/auth/tokens' && outgoing.method() === 'GET') observed.listRequests += 1;
  });
  primaryPage.on('response', async (response) => {
    const parsed = new URL(response.url());
    if (parsed.pathname !== '/api/auth/tokens' || response.request().method() !== 'GET' || !response.ok()) return;
    observed.listSecretFields += secretFieldCount(await response.json());
  });
  await primaryPage.route('**/api/auth/tokens', async (route) => {
    if (route.request().method() === 'GET' && failNextList) {
      failNextList = false; listFailureObserved = true; await route.abort('failed'); return;
    }
    await route.continue();
  });
  await primaryPage.route('**/api/auth/tokens/*', async (route) => {
    if (route.request().method() === 'DELETE' && failNextRevoke) {
      failNextRevoke = false; revokeFailureObserved = true; await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); return;
    }
    await route.continue();
  });

  await primaryPage.getByRole('button', { name: '설정' }).click();
  const settings = primaryPage.locator('[data-settings-dialog]'); await settings.getByRole('tab', { name: '액세스 토큰' }).click();
  await settings.getByRole('cell', { name: 'Issue63 preserved primary', exact: true }).waitFor();
  failNextList = true;
  await settings.getByRole('button', { name: '새 액세스 토큰' }).click();
  await settings.getByLabel('이름').fill('Issue63 product target'); await settings.getByRole('button', { name: '발급' }).click();
  const secret = await settings.getByLabel('발급된 액세스 토큰').inputValue();
  assert(secret.length > 20);
  const persistenceBoundary = await primaryPage.evaluate((value) => {
    const storageEntries = (storage) => Object.keys(storage).flatMap((key) => [key, storage.getItem(key) ?? '']);
    const liveText = [...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]')]
      .map((node) => node.textContent ?? '').join('');
    const attributeLeak = [...document.querySelectorAll('*')].some((node) =>
      [...node.attributes].some((attribute) => attribute.value.includes(value)));
    const globalStringLeak = Object.keys(window).some((key) => {
      const entry = window[key];
      return typeof entry === 'string' && entry.includes(value);
    });
    return {
      authorizedPlaintextFields: [...document.querySelectorAll('[data-testid="token-plaintext"]')]
        .filter((node) => node.value === value).length,
      url: location.href.includes(value),
      history: JSON.stringify(history.state).includes(value),
      localStorage: storageEntries(localStorage).some((entry) => entry.includes(value)),
      sessionStorage: storageEntries(sessionStorage).some((entry) => entry.includes(value)),
      liveRegions: liveText.includes(value),
      attributes: attributeLeak,
      enumerableGlobals: globalStringLeak,
    };
  }, secret);
  assert.equal(persistenceBoundary.authorizedPlaintextFields, 1);
  assert.equal(Object.entries(persistenceBoundary).some(([key, leaked]) => key !== 'authorizedPlaintextFields' && leaked === true), false);
  assert.equal(consoleMessages.some((message) => message.includes(secret)), false);
  assert.equal(await patStatus(secret), 200);
  await settings.getByRole('button', { name: '복사하고 닫기' }).click();
  await settings.getByText('토큰 목록을 불러오지 못했습니다.').waitFor();
  assert.equal(await primaryPage.evaluate(async (value) => (await navigator.clipboard.readText()) === value, secret), true);
  assert.equal((await primaryPage.locator('body').textContent()).includes(secret), false);
  await settings.getByRole('button', { name: '다시 시도' }).click();
  await settings.getByRole('button', { name: 'Issue63 product target 폐기' }).waitFor();

  const primaryRowsBefore = await (await primaryContext.request.get(new URL('/api/auth/tokens', origin).href)).json();
  const target = primaryRowsBefore.find((row) => row.name === 'Issue63 product target'); assert(target);
  assert.equal(secretFieldCount(primaryRowsBefore), 0);
  await settings.getByRole('button', { name: 'Issue63 product target 폐기' }).click();
  await primaryPage.getByRole('alertdialog').getByRole('button', { name: '실행' }).click();
  await settings.getByText('토큰을 폐기하지 못했습니다. 다시 시도하십시오.').waitFor();
  assert(settings.getByRole('button', { name: 'Issue63 product target 폐기' }));
  await settings.getByRole('button', { name: 'Issue63 product target 폐기' }).click();
  await primaryPage.getByRole('alertdialog').getByRole('button', { name: '실행' }).click();
  await primaryPage.waitForFunction(async (id) => !(await (await fetch('/api/auth/tokens')).json()).some((row) => row.id === id && row.revokedAt === null), target.id);

  const primaryRowsAfter = await (await primaryContext.request.get(new URL('/api/auth/tokens', origin).href)).json();
  const secondRowsAfter = await (await secondContext.request.get(new URL('/api/auth/tokens', origin).href)).json();
  assert(primaryRowsAfter.some((row) => row.id === preservedPrimary.id && row.revokedAt === null));
  assert(secondRowsAfter.some((row) => row.id === preservedSecond.id && row.revokedAt === null));
  assert(!secondRowsAfter.some((row) => row.id === target.id));
  assert.equal(secretFieldCount(primaryRowsAfter) + secretFieldCount(secondRowsAfter), 0);
  const targetPatBeforeRevoke = 200;
  const targetPatAfterRevoke = await patStatus(secret);
  const preservedPrimaryStatus = await patStatus(preservedPrimary.token);
  const preservedSecondStatus = await patStatus(preservedSecond.token);
  assert.equal(targetPatAfterRevoke, 401); assert.equal(preservedPrimaryStatus, 200); assert.equal(preservedSecondStatus, 200);
  assert.equal(observed.issueRequests, 1); assert.equal(observed.revokeRequests, 2); assert(listFailureObserved); assert(revokeFailureObserved);

  const browserProcessesObserved = browser.isConnected() ? 1 : 0;
  const contextsObserved = browser.contexts().length;
  assert.equal(browserProcessesObserved, 1);
  assert.equal(contextsObserved, 2);
  const evidence = {
    pass: true,
    browserProcessesObserved,
    contextsObserved,
    browserOwnership: 'one fresh Playwright-owned Chromium process with two isolated contexts',
    accountsExercised: 2,
    observedRequests: observed,
    injectedFailures: { metadataRefresh: listFailureObserved, revokeFirstAttempt: revokeFailureObserved },
    clipboardExact: true,
    domSecretAfterClose: false,
    plaintextPersistenceBoundary: { ...persistenceBoundary, console: false, listQueryResponses: observed.listSecretFields },
    targetPatAuthentication: { beforeRevoke: targetPatBeforeRevoke, afterRevoke: targetPatAfterRevoke },
    preservation: { primaryOtherTokenStatus: preservedPrimaryStatus, secondUserTokenStatus: preservedSecondStatus, secondUserListExcludedTarget: true },
  };
  const out = path.resolve('..', '..', '.kiwi/sessions/newspaper-20260916/evidence/issue63/product-result.json'); fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  await secondPage.close();
} finally {
  await primaryContext?.close(); await secondContext?.close(); await browser.close();
}
