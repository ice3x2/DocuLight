import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const root = path.resolve(webRoot, '../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const origin = process.env.WEB_URL;
const token = process.env.DOCULIGHT_INSTALL_TOKEN;
const username = process.env.DOCULIGHT_E2E_USER;
const password = process.env.DOCULIGHT_E2E_PASS;
if (!origin || !token || !username || !password) throw new Error('isolated product inputs are missing');

const evidenceDir = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue60');
fs.mkdirSync(evidenceDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
const page = await context.newPage();
const endpoints = [];
page.on('request', (request) => {
  const pathname = new URL(request.url()).pathname;
  if (pathname.startsWith('/api/install/')) endpoints.push(`${request.method()} ${pathname}`);
});

try {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '설치 마법사' }).waitFor({ timeout: 15_000 });
  const installUrl = page.url();
  assert.equal(await page.locator('[data-shell="root"]').count(), 0);
  await page.locator('input[name="installToken"]').fill(token);
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('heading', { name: '최초 슈퍼유저 계정' }).waitFor();
  await page.getByLabel('슈퍼유저 이름').fill(username);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel('비밀번호 확인').fill(password);
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('heading', { name: '초기 정책' }).waitFor();
  await page.getByLabel('가입 모드').selectOption('approval');
  await page.getByLabel('기본 그룹 초기 권한').selectOption('edit');
  await page.getByRole('button', { name: '다음' }).click();
  await page.getByRole('button', { name: '설치 완료' }).click();
  const commitResponse = page.waitForResponse((response) => response.url().endsWith('/api/install/commit'));
  await page.getByRole('button', { name: '설치하고 부여' }).click();
  assert.equal((await commitResponse).status(), 200);
  await page.getByRole('heading', { name: '완료' }).waitFor();
  assert.equal(page.url(), installUrl);
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.getByRole('heading', { name: '로그인' }).waitFor();

  const reused = await page.evaluate(async (oldToken) => {
    const response = await fetch('/api/install/verify-token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: oldToken }),
    });
    return response.status;
  }, token);
  assert.notEqual(reused, 200);

  await page.getByLabel('이름').fill(username);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.locator('[data-shell="root"]').waitFor({ timeout: 15_000 });
  assert.deepEqual(endpoints, ['POST /api/install/verify-token', 'POST /api/install/commit', 'POST /api/install/verify-token']);

  fs.writeFileSync(path.join(evidenceDir, 'product-install-latest.json'), JSON.stringify({
    runner: 'Playwright-owned fresh isolated Chromium',
    profile: 'ephemeral browser context',
    viewport: '1440x900',
    installScreenBeforeCommit: true,
    commitStatus: 200,
    completionHeldUntilStart: true,
    consumedTokenRejected: true,
    firstAdminLogin: true,
    endpoints,
    secretsRecorded: false,
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
