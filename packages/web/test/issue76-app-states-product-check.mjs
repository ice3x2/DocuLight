import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, loginAs, WEB_URL } from './_web-harness.mjs';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const configuredOutput = process.env.DOCULIGHT_ISSUE76_OUTPUT_DIR;
if (!configuredOutput) throw new Error('DOCULIGHT_ISSUE76_OUTPUT_DIR is required');
const output = path.resolve(configuredOutput);
fs.mkdirSync(output, { recursive: true });
const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value) => rgb(value).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (hi + .05) / (lo + .05); };
const near = (actual, expected) => Math.abs(actual - expected) <= 2;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const settledGeometry = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const deadline = performance.now() + 5000;
  let previous = ''; let stable = 0;
  const frame = () => {
    const value = { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight, dpr: devicePixelRatio };
    const serialized = JSON.stringify(value);
    stable = serialized === previous ? stable + 1 : 0;
    previous = serialized;
    if (stable >= 3) resolve(value);
    else if (performance.now() >= deadline) reject(new Error(`geometry did not settle: ${serialized}`));
    else requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}));
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-issue76-browser-'));
const extension = path.join(temporaryRoot, 'zoom-extension'); fs.mkdirSync(extension);
fs.writeFileSync(path.join(extension, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Issue76 zoom controller', version: '1.0.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
fs.writeFileSync(path.join(extension, 'worker.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
let context;
try {
  let clientAddress = 0;
  const isolatedClientHeaders = () => ({ 'x-forwarded-for': `198.51.100.${++clientAddress}` });
  context = await chromium.launchPersistentContext(path.join(temporaryRoot, 'profile'), { headless: false, viewport: { width: 1280, height: 720 }, colorScheme: 'light', extraHTTPHeaders: isolatedClientHeaders(), args: ['--window-position=-32000,-32000', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  if (context.serviceWorkers().length === 0) await context.waitForEvent('serviceworker');
  const worker = context.serviceWorkers()[0]; const page = context.pages()[0] ?? await context.newPage();
  let retryAriaBusy = false;
  const setZoom = async (value) => worker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); return chrome.tabs.getZoom(tab.id); }, { target: page.url(), value });
  await login(page);
  const primaryCookies = await context.cookies();
  const second = await page.evaluate(async () => {
    const stamp = `${Date.now()}`;
    const account = { name: `issue76-second-${stamp}`, password: `Issue76-second-${stamp}` };
    const response = await fetch('/api/roster/users', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(account),
    });
    if (!response.ok) return { error: `register ${response.status}` };
    return { account, principal: await response.json() };
  });
  assert.equal(second.error, undefined, second.error);
  let secondCookies = [];
  let primaryUserId;
  let secondUserId;
  const secondContext = await chromium.launchPersistentContext(path.join(temporaryRoot, 'second-profile'), {
    headless: false, viewport: { width: 1280, height: 720 }, extraHTTPHeaders: isolatedClientHeaders(), args: ['--window-position=-32000,-32000'],
  });
  try {
    const secondPage = secondContext.pages()[0] ?? await secondContext.newPage();
    await loginAs(secondPage, second.account.name, second.account.password);
    secondCookies = await secondContext.cookies();
    await secondPage.goto(WEB_URL, { waitUntil: 'networkidle' });
    const identities = await Promise.all([
      page.evaluate(async () => (await (await fetch('/api/auth/me')).json()).userId),
      secondPage.evaluate(async () => (await (await fetch('/api/auth/me')).json()).userId),
    ]);
    assert.notEqual(identities[0], identities[1]);
    primaryUserId = identities[0];
    secondUserId = identities[1];
    assert.equal(await secondPage.locator('[data-document-recovery]').count(), 0);
    const aclFixture = await page.evaluate(async ({ principalId }) => {
      const tree = await (await fetch('/api/tree')).json();
      const workspaceId = tree[0].workspace.id;
      const name = `issue76-acl-${Date.now()}.md`;
      const made = await (await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name }) })).json();
      const read = await (await fetch(`/api/documents/${made.id}`)).json();
      await fetch(`/api/documents/${made.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: '# ACL server body', baseHash: read.hash }) });
      const granted = await fetch(`/api/nodes/${made.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId, level: 'edit' }) });
      if (!granted.ok) return { error: `grant ${granted.status}` };
      return { id: made.id, name };
    }, { principalId: second.principal.id });
    assert.equal(aclFixture.error, undefined, aclFixture.error);
    await secondPage.reload({ waitUntil: 'networkidle' });
    await secondPage.getByRole('button', { name: aclFixture.name, exact: true }).focus();
    await secondPage.getByRole('button', { name: aclFixture.name, exact: true }).press('Enter');
    await secondPage.locator('[data-document-surface]').waitFor();
    await secondPage.getByRole('button', { name: '편집', exact: true }).click();
    await secondPage.getByRole('button', { name: '소스', exact: true }).click();
    let pendingAclSave;
    await secondPage.route('**/api/documents/**', (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      pendingAclSave = route;
    });
    const aclDraft = '# ACL server body\nsecond owner unsaved suffix';
    await secondPage.getByLabel('원문').fill(aclDraft);
    await secondPage.getByLabel('원문').press('Control+s');
    for (let attempt = 0; attempt < 100 && pendingAclSave === undefined; attempt += 1) await secondPage.waitForTimeout(50);
    assert.notEqual(pendingAclSave, undefined);
    const revoked = await page.evaluate(async ({ nodeId, principalId }) => {
      const view = await (await fetch(`/api/nodes/${nodeId}/share`)).json();
      const row = view.rows.find((one) => one.principalId === principalId && one.entryId !== null);
      if (row === undefined) return { error: 'grant row missing' };
      const response = await fetch(`/api/acl-entries/${row.entryId}`, { method: 'DELETE' });
      return { status: response.status };
    }, { nodeId: aclFixture.id, principalId: second.principal.id });
    assert.equal(revoked.status, 204);
    assert.equal(await secondPage.evaluate(async (id) => (await fetch(`/api/documents/${id}`)).status, aclFixture.id), 404);
    await secondPage.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state })));
    await secondPage.getByText('문서를 찾을 수 없습니다', { exact: true }).waitFor({ timeout: 10_000 });
    const recovery = secondPage.locator('[data-document-recovery]');
    await recovery.waitFor();
    assert.equal(await recovery.getByLabel('로컬 편집 내용').inputValue(), aclDraft);
    assert.equal(await secondPage.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
    if (pendingAclSave !== undefined) await pendingAclSave.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    await secondPage.unroute('**/api/documents/**');
  } finally {
    await secondContext.close();
  }
  const authOutcomes = [];
  const runAuthCell = async (label, exercise) => {
    const account = await page.evaluate(async (label) => {
      const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const input = { name: `issue76-${label}-${stamp}`, password: `Issue76-${label}-${stamp}` };
      const response = await fetch('/api/roster/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      if (!response.ok) return { error: `register ${response.status}` };
      return input;
    }, label);
    assert.equal(account.error, undefined, account.error);
    const cell = await chromium.launchPersistentContext(path.join(temporaryRoot, `auth-${label}`), {
      headless: false, viewport: { width: 1280, height: 720 }, extraHTTPHeaders: isolatedClientHeaders(), args: ['--window-position=-32000,-32000'],
    });
    try {
      const authPage = await cell.newPage();
      await loginAs(authPage, account.name, account.password);
      await authPage.goto(WEB_URL, { waitUntil: 'networkidle' });
      const observed = await exercise(authPage, account);
      authOutcomes.push({ label, freshContext: true, verified: true, ...(observed ?? {}) });
    } finally { await cell.close(); }
  };
  const runAuthCookieCell = async (label, exercise) => {
    const cell = await chromium.launchPersistentContext(path.join(temporaryRoot, `auth-${label}`), {
      headless: false, viewport: { width: 1280, height: 720 }, extraHTTPHeaders: isolatedClientHeaders(), args: ['--window-position=-32000,-32000'],
    });
    try {
      await cell.addCookies(primaryCookies);
      const authPage = await cell.newPage();
      await authPage.goto(WEB_URL, { waitUntil: 'networkidle' });
      const observed = await exercise(authPage);
      authOutcomes.push({ label, freshContext: true, verified: true, ...(observed ?? {}) });
    } finally { await cell.close(); }
  };
  const openAccount = async (authPage) => {
    await authPage.getByRole('button', { name: '설정', exact: true }).click();
    await authPage.getByRole('tab', { name: '계정', exact: true }).click();
  };
  const continuePastDraftHandoff = async (authPage, mutationObserved) => {
    const handoff = authPage.getByRole('dialog', { name: '편집 내용 보관' });
    for (let attempt = 0; attempt < 40 && !mutationObserved(); attempt += 1) {
      if (await handoff.isVisible().catch(() => false)) {
        await handoff.getByRole('button', { name: '편집본을 버리고 계속', exact: true }).click();
        break;
      }
      await authPage.waitForTimeout(25);
    }
  };
  const authFixture = await page.evaluate(async () => {
    const tree = await (await fetch('/api/tree')).json();
    const workspaceId = tree[0].workspace.id;
    const name = `issue76-auth-editor-${Date.now()}.md`;
    const made = await (await fetch('/api/nodes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name }),
    })).json();
    return { id: made.id, name };
  });
  const mountAuthEditor = async (authPage, label) => {
    await authPage.getByRole('button', { name: authFixture.name, exact: true }).click();
    await authPage.locator('[data-document-surface]').waitFor();
    await authPage.getByRole('button', { name: '편집', exact: true }).click();
    await authPage.getByRole('button', { name: '소스', exact: true }).click();
    const source = authPage.getByLabel('원문');
    const exactEditorBytes = `${label}-EXACT-EDITOR-BYTES`;
    await source.fill(exactEditorBytes);
    await source.evaluate((node) => { globalThis.__issue76AuthEditor = node.closest('[data-document-surface]'); });
    return { source, exactEditorBytes };
  };
  await runAuthCell('logout-204', async (authPage) => {
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '로그아웃', exact: true }).click();
    await authPage.getByRole('main', { name: '로그인' }).waitFor();
  });
  await runAuthCell('password-400', async (authPage) => {
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await authPage.getByLabel('현재 비밀번호').fill('definitely-wrong');
    await authPage.getByLabel('새 비밀번호').fill('Issue76-next-password');
    await authPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
    await authPage.getByText('현재 비밀번호가 올바르지 않습니다', { exact: true }).waitFor();
    assert.equal(await authPage.locator('[data-shell="root"]').count(), 1);
  });
  await runAuthCell('password-204', async (authPage, account) => {
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await authPage.getByLabel('현재 비밀번호').fill(account.password);
    await authPage.getByLabel('새 비밀번호').fill(`${account.password}-next`);
    await authPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
    await authPage.getByRole('main', { name: '로그인' }).waitFor();
    await authPage.getByText('비밀번호가 변경되었습니다. 다시 로그인하세요.', { exact: true }).waitFor();
  });
  await runAuthCookieCell('logout-malformed-identity', async (authPage) => {
    let logoutPosts = 0;
    await authPage.route('**/api/auth/logout', (route) => { logoutPosts += 1; return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
    await authPage.route('**/api/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ superuser: false, workspaceCount: 0, adminWorkspaceCount: 0 }) }));
    await authPage.route('**/api/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 76 }) }));
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '로그아웃', exact: true }).click();
    await authPage.locator('[data-auth-uncertainty]').waitFor();
    assert.equal(logoutPosts, 1);
    assert.equal(await authPage.locator('[data-shell="root"]').count(), 1);
  });
  await runAuthCookieCell('password-401', async (authPage) => {
    await authPage.route('**/api/auth/password', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await authPage.getByLabel('현재 비밀번호').fill('anything');
    await authPage.getByLabel('새 비밀번호').fill('Issue76-next-password');
    await authPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
    await authPage.getByRole('main', { name: '로그인' }).waitFor();
  });
  const sessionBody = { superuser: false, workspaceCount: 1, adminWorkspaceCount: 0 };
  const unknownLogout = async (label, sessionResult, identityResult, expected) => runAuthCookieCell(label, async (authPage) => {
    const mountedAuthEditor = identityResult === 'malformed' ? await mountAuthEditor(authPage, label) : undefined;
    const currentUserId = await authPage.evaluate(async () => (await (await fetch('/api/auth/me')).json()).userId);
    let logoutPosts = 0;
    let mutationStarted = false;
    let authenticationIdentityExpected = false;
    let malformedRetryStarted = false;
    let sessionReadsExact = 0;
    let identityReadsExact = 0;
    let protectedWritesExact = 0;
    await authPage.route('**/api/documents/**', (route) => {
      if (route.request().method() !== 'GET') protectedWritesExact += 1;
      return route.continue();
    });
    await authPage.route('**/api/auth/logout', (route) => { mutationStarted = true; logoutPosts += 1; return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
    await authPage.route('**/api/session', (route) => {
      if (!mutationStarted) return route.continue();
      sessionReadsExact += 1;
      if (sessionResult === 'network') return route.abort('failed');
      if (sessionResult === 401 || sessionResult === 500) return route.fulfill({ status: sessionResult, contentType: 'application/json', body: '{}' });
      authenticationIdentityExpected = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody) });
    });
    await authPage.route('**/api/auth/me', (route) => {
      if (!mutationStarted || (!authenticationIdentityExpected && mountedAuthEditor === undefined)) return route.continue();
      if (identityReadsExact > 0 && mountedAuthEditor === undefined) return route.continue();
      identityReadsExact += 1;
      if (identityReadsExact > 1 && mountedAuthEditor === undefined) return route.continue();
      if (identityResult === 'network') return route.abort('failed');
      if (identityResult === 401 || identityResult === 500) return route.fulfill({ status: identityResult, contentType: 'application/json', body: '{}' });
      if (identityResult === 'malformed') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(malformedRetryStarted ? { userId: currentUserId } : {}) });
      const userId = identityResult === 'different' ? `${currentUserId}-different` : currentUserId;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId }) });
    });
    await authPage.waitForTimeout(250);
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '로그아웃', exact: true }).click();
    await continuePastDraftHandoff(authPage, () => logoutPosts > 0);
    for (let attempt = 0; attempt < 100 && logoutPosts === 0; attempt += 1) await authPage.waitForTimeout(25);
    assert.equal(logoutPosts, 1);
    for (let attempt = 0; attempt < 100 && sessionReadsExact === 0; attempt += 1) await authPage.waitForTimeout(25);
    if (sessionResult === 200) for (let attempt = 0; attempt < 100 && identityReadsExact === 0; attempt += 1) await authPage.waitForTimeout(25);
    if (expected === 'ended') await authPage.getByRole('main', { name: '로그인' }).waitFor();
    else if (expected === 'uncertain') await authPage.locator('[data-auth-uncertainty]').waitFor();
    else if (expected === 'different') {
      await authPage.locator('[data-shell="root"]').waitFor();
      assert.equal(await authPage.locator('[data-auth-uncertainty]').count(), 0);
    } else {
      const boundary = authPage.locator('[data-auth-uncertainty]');
      await boundary.waitFor({ state: 'attached' });
      for (let attempt = 0; attempt < 100 && !/\ucc98\ub9ac \uacb0\uacfc\ub97c \ud655\uc778\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4/.test(await boundary.textContent() ?? ''); attempt += 1) await authPage.waitForTimeout(25);
      assert.match(await boundary.textContent(), /처리 결과를 확인하지 못했습니다/);
      assert.equal(await boundary.locator('button', { hasText: '편집 계속' }).count(), 1);
      assert.equal(await authPage.locator('[data-shell="root"]').count(), 1);
    }
    let malformedEditorObservation;
    if (mountedAuthEditor !== undefined) {
      const editorState = await mountedAuthEditor.source.evaluate((node, exactEditorBytes) => ({
        sameEditorIdentity: node.closest('[data-document-surface]') === globalThis.__issue76AuthEditor,
        exactEditorBytes: node.value === exactEditorBytes,
        editorReadOnly: node.readOnly,
      }), mountedAuthEditor.exactEditorBytes);
      await mountedAuthEditor.source.press('Control+s');
      await authPage.waitForTimeout(100);
      const writeBlocked = await mountedAuthEditor.source.inputValue() === mountedAuthEditor.exactEditorBytes && protectedWritesExact === 0;
      assert.deepEqual(editorState, { sameEditorIdentity: true, exactEditorBytes: true, editorReadOnly: true });
      assert.equal(writeBlocked, true);
      await authPage.getByRole('button', { name: '설정 닫기', exact: true }).click();
      const retrySessionBefore = sessionReadsExact;
      const retryIdentityBefore = identityReadsExact;
      malformedRetryStarted = true;
      const retryButton = authPage.locator('[data-auth-uncertainty] button', { hasText: '로그인 상태 다시 확인' });
      assert.equal(await retryButton.count(), 1, JSON.stringify({ label, boundary: await authPage.locator('[data-auth-uncertainty]').textContent(), sessionReadsExact, identityReadsExact }));
      await retryButton.click();
      for (let attempt = 0; attempt < 100 && (sessionReadsExact === retrySessionBefore || identityReadsExact === retryIdentityBefore); attempt += 1) await authPage.waitForTimeout(25);
      const retrySessionReads = sessionReadsExact - retrySessionBefore;
      const retryIdentityReads = identityReadsExact - retryIdentityBefore;
      assert.equal(retrySessionReads, 1);
      assert.equal(retryIdentityReads, 1);
      malformedEditorObservation = { mountedAuthEditor: true, ...editorState, writeBlocked, retrySessionReads, retryIdentityReads };
    }
    const mutationPostsExact = logoutPosts;
    assert.equal(mutationPostsExact, 1);
    assert.equal(protectedWritesExact, 0);
    assert.equal(sessionReadsExact, mountedAuthEditor === undefined ? 1 : 2);
    assert.equal(identityReadsExact, sessionResult === 200 ? (mountedAuthEditor === undefined ? 1 : 2) : 0);
    return { mutationPostsExact, sessionReadsExact, identityReadsExact, protectedWritesExact, observedOutcome: expected, ...malformedEditorObservation };
  });
  await unknownLogout('logout-unknown-session-same', 200, 'same', 'same');
  await unknownLogout('logout-unknown-session-different', 200, 'different', 'different');
  await unknownLogout('logout-unknown-session-401', 401, 'same', 'ended');
  await unknownLogout('logout-unknown-session-500', 500, 'same', 'uncertain');
  await unknownLogout('logout-unknown-session-network', 'network', 'same', 'uncertain');
  await unknownLogout('logout-unknown-me-401', 200, 401, 'ended');
  await unknownLogout('logout-unknown-me-500', 200, 500, 'uncertain');
  await unknownLogout('logout-unknown-me-network', 200, 'network', 'uncertain');
  await unknownLogout('logout-unknown-me-malformed', 200, 'malformed', 'uncertain');

  const passwordMalformedIdentity = async (label, passwordStatus) => runAuthCookieCell(label, async (authPage) => {
    const mountedAuthEditor = await mountAuthEditor(authPage, label);
    const currentUserId = await authPage.evaluate(async () => (await (await fetch('/api/auth/me')).json()).userId);
    let mutationPostsExact = 0;
    let sessionReadsExact = 0;
    let identityReadsExact = 0;
    let protectedWritesExact = 0;
    let mutationStarted = false;
    let malformedRetryStarted = false;
    await authPage.route('**/api/documents/**', (route) => {
      if (mutationStarted && route.request().method() !== 'GET') protectedWritesExact += 1;
      return route.continue();
    });
    await authPage.route('**/api/auth/password', (route) => {
      mutationStarted = true;
      mutationPostsExact += 1;
      return route.fulfill({
      status: passwordStatus,
      contentType: 'application/json',
      body: passwordStatus === 400 ? JSON.stringify({ detail: { rule: 'wrong-password' } }) : '{}',
      });
    });
    await authPage.route('**/api/session', (route) => {
      if (!mutationStarted) return route.continue();
      sessionReadsExact += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody) });
    });
    await authPage.route('**/api/auth/me', (route) => {
      if (!mutationStarted) return route.continue();
      identityReadsExact += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(malformedRetryStarted ? { userId: currentUserId } : {}) });
    });
    await openAccount(authPage);
    await authPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
    await authPage.getByLabel('현재 비밀번호').fill('unknown-current');
    await authPage.getByLabel('새 비밀번호').fill('Issue76-next-password');
    await authPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
    await continuePastDraftHandoff(authPage, () => mutationPostsExact > 0);
    for (let attempt = 0; attempt < 100 && mutationPostsExact === 0; attempt += 1) await authPage.waitForTimeout(25);
    assert.equal(mutationPostsExact, 1);
    await authPage.locator('[data-auth-uncertainty]').waitFor();
    assert.equal(await authPage.locator('[data-shell="root"]').count(), 1);
    const editorState = await mountedAuthEditor.source.evaluate((node, exactEditorBytes) => ({
      sameEditorIdentity: node.closest('[data-document-surface]') === globalThis.__issue76AuthEditor,
      exactEditorBytes: node.value === exactEditorBytes,
      editorReadOnly: node.readOnly,
    }), mountedAuthEditor.exactEditorBytes);
    await mountedAuthEditor.source.press('Control+s');
    await authPage.waitForTimeout(100);
    const writeBlocked = await mountedAuthEditor.source.inputValue() === mountedAuthEditor.exactEditorBytes && protectedWritesExact === 0;
    assert.deepEqual(editorState, { sameEditorIdentity: true, exactEditorBytes: true, editorReadOnly: true });
    assert.equal(writeBlocked, true);
    await authPage.getByRole('button', { name: '설정 닫기', exact: true }).click();
    const retrySessionBefore = sessionReadsExact;
    const retryIdentityBefore = identityReadsExact;
    malformedRetryStarted = true;
    await authPage.locator('[data-auth-uncertainty] button', { hasText: '로그인 상태 다시 확인' }).click();
    for (let attempt = 0; attempt < 100 && (sessionReadsExact === retrySessionBefore || identityReadsExact === retryIdentityBefore); attempt += 1) await authPage.waitForTimeout(25);
    const retrySessionReads = sessionReadsExact - retrySessionBefore;
    const retryIdentityReads = identityReadsExact - retryIdentityBefore;
    assert.equal(retrySessionReads, 1);
    assert.equal(retryIdentityReads, 1);
    assert.equal(mutationPostsExact, 1);
    assert.equal(protectedWritesExact, 0);
    return { mountedAuthEditor: true, ...editorState, writeBlocked, retrySessionReads, retryIdentityReads, mutationPostsExact, sessionReadsExact, identityReadsExact, protectedWritesExact, observedOutcome: 'uncertain' };
  });
  await passwordMalformedIdentity('password-400-me-malformed', 400);
  await passwordMalformedIdentity('password-unknown-me-malformed', 500);

  const confirmedTerminal = async (kind, sessionResult) => {
    const label = `${kind}-confirmed204-session${sessionResult === 'network' ? '-network' : sessionResult}`;
    await runAuthCookieCell(label, async (authPage) => {
      let mutationPostsExact = 0;
      let sessionReadsExact = 0;
      let identityReadsExact = 0;
      let lateSessionReadsExact = 0;
      let protectedWritesExact = 0;
      let mutationAccepted = false;
      let terminalRefetchWindowOpen = true;
      let resolveIdentityRead;
      const identityReadObserved = new Promise((resolve) => { resolveIdentityRead = resolve; });
      await authPage.route(`**/api/auth/${kind === 'logout' ? 'logout' : 'password'}`, (route) => {
        mutationAccepted = true;
        mutationPostsExact += 1;
        return route.fulfill({ status: 204 });
      });
      await authPage.route('**/api/session', async (route) => {
        if (route.request().headers()['x-issue76-late-session'] !== 'true') {
          if (mutationAccepted) sessionReadsExact += 1;
          return route.continue();
        }
        lateSessionReadsExact += 1;
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (sessionResult === 'network') return route.abort('failed');
        if (sessionResult === 401 || sessionResult === 500) return route.fulfill({ status: sessionResult, contentType: 'application/json', body: '{}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody) });
      });
      await authPage.route('**/api/auth/me', (route) => {
        if (mutationAccepted && terminalRefetchWindowOpen) {
          identityReadsExact += 1;
          resolveIdentityRead();
        }
        return route.continue();
      });
      await authPage.route('**/api/documents/**', (route) => { if (route.request().method() !== 'GET') protectedWritesExact += 1; return route.continue(); });
      const lateRead = authPage.evaluate(() => fetch('/api/session', { headers: { 'x-issue76-late-session': 'true' } }).then((response) => response.status).catch(() => 0));
      await openAccount(authPage);
      if (kind === 'logout') await authPage.getByRole('button', { name: '로그아웃', exact: true }).click();
      else {
        await authPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
        await authPage.getByLabel('현재 비밀번호').fill('intercepted-current');
        await authPage.getByLabel('새 비밀번호').fill('Issue76-confirmed-next');
        await authPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
      }
      await authPage.getByRole('main', { name: '로그인' }).waitFor();
      await lateRead;
      await Promise.race([
        identityReadObserved,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: terminal identity refetch was not observed`)), 2_500)),
      ]);
      await authPage.waitForTimeout(50);
      terminalRefetchWindowOpen = false;
      assert.equal(await authPage.locator('[data-shell="root"]').count(), 0);
      assert.equal(mutationPostsExact, 1);
      assert.equal(lateSessionReadsExact, 1);
      assert.equal(sessionReadsExact, 0);
      assert.equal(identityReadsExact, 1, label);
      assert.equal(protectedWritesExact, 0);
      return { mutationPostsExact, lateSessionReadsExact, sessionReadsExact, identityReadsExact, protectedWritesExact, observedOutcome: 'terminal' };
    });
  };
  const confirmedLabels = [
    'logout-confirmed204-session200', 'logout-confirmed204-session401', 'logout-confirmed204-session500', 'logout-confirmed204-session-network',
    'password-confirmed204-session200', 'password-confirmed204-session401', 'password-confirmed204-session500', 'password-confirmed204-session-network',
  ];
  for (const result of [200, 401, 500, 'network']) await confirmedTerminal('logout', result);
  for (const result of [200, 401, 500, 'network']) await confirmedTerminal('password', result);
  assert.equal(confirmedLabels.every((label) => authOutcomes.some((row) => row.label === label)), true);
  assert.equal(authOutcomes.length, 24);
  let sessionReads = 0;
  await page.route('**/api/session', (route) => {
    sessionReads += 1;
    if (sessionReads === 1) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    return route.continue();
  });
  await page.goto(WEB_URL);
  const bootstrapError = page.getByRole('alert', { name: '애플리케이션 오류' });
  await bootstrapError.waitFor();
  assert.equal(await page.locator('[data-shell="root"]').count(), 0);
  const sessionRetry = bootstrapError.getByRole('button', { name: '다시 시도' });
  await sessionRetry.focus(); await sessionRetry.press('Enter');
  await page.getByRole('button', { name: '설정', exact: true }).waitFor();
  assert.equal(sessionReads, 2);
  await page.unroute('**/api/session');
  await page.goto(new URL('/d/00000000-0000-4000-8000-000000000076', WEB_URL).toString(), { waitUntil: 'networkidle' });
  await page.getByText('문서를 찾을 수 없습니다').waitFor();
  assert.equal(await page.locator('[data-document-surface]').count(), 0);
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  const empty = page.locator('[data-empty="documents"]'); await empty.getByText('문서를 선택하세요.').waitFor();
  const historyFixture = await page.evaluate(async () => {
    const tree = await (await fetch('/api/tree')).json();
    const workspaceId = tree[0].workspace.id;
    const stamp = Date.now();
    const create = async (name, body) => {
      const made = await (await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name }) })).json();
      const read = await (await fetch(`/api/documents/${made.id}`)).json();
      await fetch(`/api/documents/${made.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, baseHash: read.hash }) });
      return { id: made.id, name };
    };
    return {
      first: await create(`issue76-history-a-${stamp}.md`, '# HISTORY-A'),
      second: await create(`issue76-history-b-${stamp}.md`, '# HISTORY-B'),
      unavailable: await create(`issue76-history-unavailable-${stamp}.md`, '# HISTORY-UNAVAILABLE'),
    };
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: historyFixture.first.name, exact: true }).focus();
  await page.getByRole('button', { name: historyFixture.first.name, exact: true }).press('Enter');
  await page.locator('[data-document-surface]').waitFor();
  const firstMark = await page.evaluate(() => ({ mark: history.state?.__doculight, length: history.length }));
  await page.getByRole('button', { name: historyFixture.second.name, exact: true }).focus();
  await page.getByRole('button', { name: historyFixture.second.name, exact: true }).press('Enter');
  await page.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).waitFor();
  const secondMark = await page.evaluate(() => ({ mark: history.state?.__doculight, length: history.length }));
  assert(firstMark.mark && secondMark.mark && firstMark.mark.key !== secondMark.mark.key && secondMark.mark.index > firstMark.mark.index);
  await page.goBack();
  await page.waitForURL(new RegExp(`/d/${historyFixture.first.id}$`));
  const backMark = await page.evaluate(() => ({ mark: history.state?.__doculight, length: history.length }));
  assert.equal(backMark.mark.key, firstMark.mark.key);
  assert.equal(backMark.length, secondMark.length);
  await page.goForward();
  await page.waitForURL(new RegExp(`/d/${historyFixture.second.id}$`));
  await page.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).waitFor();
  const forwardMark = await page.evaluate(() => ({ mark: history.state?.__doculight, length: history.length }));
  assert.equal(forwardMark.mark.key, secondMark.mark.key);
  assert.equal(forwardMark.length, secondMark.length);

  // A third-party/untracked history entry cannot safely calculate a rollback
  // delta. Resolve it in a new tab so the rejected current draft remains an
  // inactive exact instance, without presenting a destructive replacement.
  await page.route(`**/api/documents/${historyFixture.second.id}`, (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    : route.continue());
  await page.getByRole('button', { name: '편집', exact: true }).click();
  await page.getByRole('button', { name: '소스', exact: true }).click();
  const untrackedDraft = 'UNTRACKED-EXACT-DRAFT';
  await page.getByLabel('원문').fill(untrackedDraft);
  await page.getByLabel('원문').press('Control+s');
  await page.locator('[data-save-rejected]').waitFor();
  const historyInvoker = page.getByLabel('원문');
  await historyInvoker.focus();
  await historyInvoker.evaluate((node) => { globalThis.__issue76HistoryInvoker = node; });

  // Back cancellation must compensate to the exact accepted B entry without
  // rewriting either entry. A second Back can still be accepted to A.
  await page.goBack();
  const backConfirmation = page.locator('[data-replace-confirmation]');
  await backConfirmation.waitFor();
  const backPending = await page.evaluate(() => ({ mark: history.state?.__doculight, length: history.length }));
  assert.equal(backPending.mark.key, firstMark.mark.key);
  assert.equal(backPending.length, secondMark.length);
  const retainedDuringBack = await page.locator('[data-retained-document-host]').evaluate((node) => ({
    hidden: node.hidden,
    inert: node.hasAttribute('inert'),
    ariaHidden: node.getAttribute('aria-hidden'),
  }));
  assert.deepEqual(retainedDuringBack, { hidden: true, inert: true, ariaHidden: 'true' });
  const retainedHostHiddenFromAT = retainedDuringBack.hidden && retainedDuringBack.inert && retainedDuringBack.ariaHidden === 'true';
  assert.equal(await backConfirmation.getAttribute('role'), 'alertdialog');
  assert.match(await backConfirmation.textContent(), /편집 중인 문서/);
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '머무르기');
  const cancelBack = backConfirmation.getByRole('button', { name: '머무르기' });
  const acceptBack = backConfirmation.getByRole('button', { name: '그래도 열기' });
  await cancelBack.press('Shift+Tab');
  assert.equal(await acceptBack.evaluate((node) => node === document.activeElement), true);
  await acceptBack.press('Tab');
  assert.equal(await cancelBack.evaluate((node) => node === document.activeElement), true);
  const pendingSurface = page.locator('[data-retained-document-host] [data-document-surface]');
  await pendingSurface.evaluate((node) => { globalThis.__issue76PendingSurface = node; });
  await page.setViewportSize({ width: 1280, height: 400 });
  assert.equal(await setZoom(2), 2);
  const runtimeZoomed = await settledGeometry(page);
  const dialogScroll = await backConfirmation.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
    const action = node.querySelector('[data-slot="alert-dialog-actions"]');
    const actionRect = action?.getBoundingClientRect();
    return {
      scrollable: node.scrollHeight > node.clientHeight,
      reached: Math.abs(node.scrollTop - (node.scrollHeight - node.clientHeight)) <= 2,
      actionVisible: actionRect !== undefined && actionRect.bottom <= innerHeight + 2,
    };
  });
  assert(dialogScroll.scrollable && dialogScroll.reached && dialogScroll.actionVisible, JSON.stringify(dialogScroll));
  assert.equal(await pendingSurface.evaluate((node) => node === globalThis.__issue76PendingSurface), true);
  assert.equal(await setZoom(1), 1);
  await page.setViewportSize({ width: 1280, height: 720 });
  const runtimeReset = await settledGeometry(page);
  const runtimeResizeReachable = runtimeZoomed.innerWidth === 640 && runtimeReset.innerWidth === 1280 && dialogScroll.actionVisible;
  const dialogFocusTrapAndRestore = true;
  await cancelBack.evaluate((button) => button.addEventListener('click', () => {
    queueMicrotask(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { thirdParty: 'rapid-nonmatching' } })));
  }, { capture: true, once: true }));
  await cancelBack.click();
  await page.waitForURL(new RegExp(`/d/${historyFixture.second.id}$`));
  await page.waitForFunction(() => document.activeElement === globalThis.__issue76HistoryInvoker);
  const invokerIdentityRestored = await historyInvoker.evaluate((node) => document.activeElement === node && node === globalThis.__issue76HistoryInvoker);
  assert.equal(invokerIdentityRestored, true);
  assert.equal((await page.evaluate(() => history.state?.__doculight?.key)), secondMark.mark.key);
  assert.equal(await page.getByLabel('원문').inputValue(), untrackedDraft);
  await page.goBack();
  const acceptedBack = page.locator('[data-replace-confirmation]');
  await acceptedBack.waitFor();
  await acceptedBack.getByRole('button', { name: '그래도 열기' }).click();
  await page.locator('[data-document-body]').getByText('HISTORY-A', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => history.state?.__doculight?.key)), firstMark.mark.key);

  // Symmetric Forward cancellation returns to the original A entry and leaves
  // B reachable for a later accepted Forward.
  await page.route(`**/api/documents/${historyFixture.first.id}`, (route) => route.request().method() === 'PUT'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
    : route.continue());
  await page.getByRole('button', { name: '편집', exact: true }).click();
  await page.getByRole('button', { name: '소스', exact: true }).click();
  const forwardDraft = 'FORWARD-CANCEL-EXACT-DRAFT';
  await page.getByLabel('원문').fill(forwardDraft);
  await page.getByLabel('원문').press('Control+s');
  await page.locator('[data-save-rejected]').waitFor();
  await page.goForward();
  const forwardConfirmation = page.locator('[data-replace-confirmation]');
  await forwardConfirmation.waitFor();
  await forwardConfirmation.getByRole('button', { name: '머무르기' }).click();
  await page.waitForURL(new RegExp(`/d/${historyFixture.first.id}$`));
  assert.equal((await page.evaluate(() => history.state?.__doculight?.key)), firstMark.mark.key);
  assert.equal(await page.getByLabel('원문').inputValue(), forwardDraft);
  await page.goForward();
  const acceptedForward = page.locator('[data-replace-confirmation]');
  await acceptedForward.waitFor();
  await acceptedForward.getByRole('button', { name: '그래도 열기' }).click();
  await page.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).waitFor();
  assert.equal((await page.evaluate(() => history.state?.__doculight?.key)), secondMark.mark.key);
  await page.unroute(`**/api/documents/${historyFixture.first.id}`);

  await page.getByRole('button', { name: '편집', exact: true }).click();
  await page.getByRole('button', { name: '소스', exact: true }).click();
  await page.getByLabel('원문').fill(untrackedDraft);
  await page.getByLabel('원문').press('Control+s');
  await page.locator('[data-save-rejected]').waitFor();
  await page.evaluate(({ id }) => {
    history.pushState({ thirdParty: 'untracked' }, '', `/d/${id}`);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }, { id: historyFixture.first.id });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('[data-replace-confirmation]').count(), 0);
  await page.locator('[data-document-body]').getByText('HISTORY-A', { exact: true }).waitFor();
  await page.getByRole('tab', { name: new RegExp(historyFixture.second.name) }).click();
  await page.getByRole('button', { name: '편집', exact: true }).click();
  await page.getByRole('button', { name: '소스', exact: true }).click();
  assert.equal(await page.getByLabel('원문').inputValue(), untrackedDraft);
  await page.unroute(`**/api/documents/${historyFixture.second.id}`);

  const unavailablePage = await context.newPage();
  await unavailablePage.goto(WEB_URL, { waitUntil: 'networkidle' });
  for (const item of [historyFixture.first, historyFixture.unavailable, historyFixture.second]) {
    await unavailablePage.getByRole('button', { name: item.name, exact: true }).click();
    await unavailablePage.waitForURL(new RegExp(`/d/${item.id}$`));
  }
  const removedUnavailable = await page.evaluate(async (id) => (await fetch(`/api/nodes/${id}`, { method: 'DELETE' })).status, historyFixture.unavailable.id);
  assert.equal(removedUnavailable, 204);
  await unavailablePage.goBack();
  await unavailablePage.waitForURL(new RegExp(`/d/${historyFixture.unavailable.id}$`));
  await unavailablePage.getByText('문서를 찾을 수 없습니다', { exact: true }).waitFor();
  await unavailablePage.goForward();
  await unavailablePage.waitForURL(new RegExp(`/d/${historyFixture.second.id}$`));
  await unavailablePage.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).waitFor();
  let delayedTree;
  let treeReads = 0;
  await unavailablePage.route('**/api/tree', (route) => {
    treeReads += 1;
    if (treeReads === 1) { delayedTree = route; return; }
    return route.continue();
  });
  await unavailablePage.goBack();
  for (let attempt = 0; attempt < 100 && delayedTree === undefined; attempt += 1) await unavailablePage.waitForTimeout(25);
  assert.notEqual(delayedTree, undefined);
  await unavailablePage.goForward();
  await unavailablePage.waitForURL(new RegExp(`/d/${historyFixture.second.id}$`));
  await unavailablePage.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).waitFor();
  await delayedTree.continue();
  await unavailablePage.waitForTimeout(100);
  assert.equal(new URL(unavailablePage.url()).pathname, `/d/${historyFixture.second.id}`);
  assert.equal(await unavailablePage.locator('[data-document-body]').getByText('HISTORY-B', { exact: true }).count(), 1);
  await unavailablePage.unroute('**/api/tree');
  await unavailablePage.close();

  const recoveryMeasurements = [];
  const recoveryCases = [
    ['recovery-session401', 'session401'],
    ['recovery-identity401', 'identity401'],
    ['recovery-password401', 'password401'],
    ['recovery-account-replacement', 'replacement'],
  ];
  for (const [label, trigger] of recoveryCases) {
    const recoveryContext = await chromium.launchPersistentContext(path.join(temporaryRoot, label), {
      headless: false, viewport: { width: 1280, height: 720 }, extraHTTPHeaders: isolatedClientHeaders(), args: ['--window-position=-32000,-32000'],
    });
    try {
      await recoveryContext.addCookies(primaryCookies);
      const recoveryPage = recoveryContext.pages()[0] ?? await recoveryContext.newPage();
      await recoveryPage.goto(WEB_URL, { waitUntil: 'networkidle' });
      await recoveryPage.getByRole('button', { name: historyFixture.first.name, exact: true }).click();
      await recoveryPage.getByRole('button', { name: '편집', exact: true }).click();
      await recoveryPage.getByRole('button', { name: '소스', exact: true }).click();
      const recoveryDraft = `${label}-EXACT-LOCAL-BYTES`;
      await recoveryPage.getByLabel('원문').fill(recoveryDraft);
      let mutationPostsExact = 0;
      let sessionReadsExact = 0;
      let identityReadsExact = 0;
      let protectedWritesExact = 0;
      await recoveryPage.route('**/api/documents/**', (route) => {
        if (route.request().method() !== 'GET') protectedWritesExact += 1;
        return route.continue();
      });
      if (trigger === 'password401') {
        await recoveryPage.route('**/api/auth/password', (route) => { mutationPostsExact += 1; return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }); });
      } else {
        await recoveryPage.route('**/api/auth/logout', (route) => { mutationPostsExact += 1; return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }); });
        await recoveryPage.route('**/api/session', (route) => {
          sessionReadsExact += 1;
          if (trigger === 'session401') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionBody) });
        });
        await recoveryPage.route('**/api/auth/me', (route) => {
          identityReadsExact += 1;
          if (trigger === 'identity401') return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
          const userId = trigger === 'replacement' ? secondUserId : primaryUserId;
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId }) });
        });
      }
      await openAccount(recoveryPage);
      if (trigger === 'password401') {
        await recoveryPage.getByRole('button', { name: '비밀번호 변경', exact: true }).click();
        await recoveryPage.getByLabel('현재 비밀번호').fill('intercepted-current');
        await recoveryPage.getByLabel('새 비밀번호').fill('Issue76-recovery-next');
        await recoveryPage.getByRole('button', { name: '비밀번호 바꾸기', exact: true }).click();
      } else await recoveryPage.getByRole('button', { name: '로그아웃', exact: true }).click();
      const draftHandoff = recoveryPage.locator('[data-auth-draft-handoff]');
      await draftHandoff.waitFor();
      await draftHandoff.locator('[data-auth-draft-actions] button').nth(1).click();
      if (trigger === 'replacement') {
        await recoveryPage.locator('[data-shell="root"]').waitFor();
        assert.equal(await recoveryPage.locator('[data-local-recovery]').count(), 0);
        await recoveryPage.unroute('**/api/auth/logout');
        await recoveryPage.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
        await openAccount(recoveryPage);
        await recoveryPage.getByRole('button', { name: '로그아웃', exact: true }).click();
      }
      await recoveryPage.getByRole('main', { name: '로그인' }).waitFor();
      await recoveryPage.unrouteAll({ behavior: 'wait' });
      let differentAccountAutosaveWrites = 0;
      await recoveryPage.route('**/api/documents/**', (route) => {
        if (route.request().method() !== 'GET') differentAccountAutosaveWrites += 1;
        return route.continue();
      });
      await recoveryPage.evaluate(({ recoveryDraft, oldName }) => {
        globalThis.__issue76RecoveryPageToken = crypto.randomUUID();
        globalThis.__issue76DifferentAccountOldContentFrames = 0;
        globalThis.__issue76DifferentAccountExposures = [];
        globalThis.__issue76WatchDifferentAccount = true;
        const inspect = () => {
          const text = document.body.textContent ?? '';
          const values = [...document.querySelectorAll('input, textarea')].map((node) => node.value).join('\n');
          if (text.includes(recoveryDraft) || text.includes(oldName) || values.includes(recoveryDraft)) {
            globalThis.__issue76DifferentAccountOldContentFrames += 1;
            globalThis.__issue76DifferentAccountExposures.push({ hasDraftText: text.includes(recoveryDraft), hasOldName: text.includes(oldName), hasDraftValue: values.includes(recoveryDraft) });
          }
          if (globalThis.__issue76WatchDifferentAccount) requestAnimationFrame(inspect);
        };
        requestAnimationFrame(inspect);
      }, { recoveryDraft, oldName: historyFixture.first.name });
      const recoveryPageToken = await recoveryPage.evaluate(() => globalThis.__issue76RecoveryPageToken);
      await recoveryPage.getByLabel('이름').fill(second.account.name);
      await recoveryPage.getByLabel('비밀번호').fill(second.account.password);
      await recoveryPage.getByRole('button', { name: '로그인', exact: true }).click();
      await recoveryPage.locator('[data-shell="root"]').waitFor();
      await recoveryPage.waitForTimeout(100);
      const differentAccountSamePage = await recoveryPage.evaluate((token) => globalThis.__issue76RecoveryPageToken === token, recoveryPageToken);
      const differentAccountRecoveryNoticeCount = await recoveryPage.locator('[data-local-recovery], [data-document-recovery]').count();
      const differentAccountRecoveryActionCount = await recoveryPage.locator('[data-local-recovery] button, [data-document-recovery] button').count();
      const differentAccountOldNameCount = await recoveryPage.getByText(historyFixture.first.name, { exact: true }).count();
      const differentAccountOldBodyCount = await recoveryPage.getByText(recoveryDraft, { exact: false }).count();
      const differentAccountQueryCacheCount = await recoveryPage.evaluate(() => {
        globalThis.__issue76WatchDifferentAccount = false;
        return globalThis.__issue76DifferentAccountOldContentFrames;
      });
      assert.equal(differentAccountSamePage, true);
      assert.equal(differentAccountRecoveryNoticeCount, 0);
      assert.equal(differentAccountRecoveryActionCount, 0);
      assert.equal(differentAccountOldNameCount, 0);
      assert.equal(differentAccountOldBodyCount, 0);
      assert.equal(differentAccountQueryCacheCount, 0, JSON.stringify({ trigger, exposures: await recoveryPage.evaluate(() => globalThis.__issue76DifferentAccountExposures) }));
      assert.equal(differentAccountAutosaveWrites, 0);
      await openAccount(recoveryPage);
      await recoveryPage.getByRole('button', { name: '로그아웃', exact: true }).click();
      await recoveryPage.getByRole('main', { name: '로그인' }).waitFor();
      await recoveryPage.getByLabel('이름').fill(process.env.DOCULIGHT_E2E_USER);
      await recoveryPage.getByLabel('비밀번호').fill(process.env.DOCULIGHT_E2E_PASS);
      await recoveryPage.getByRole('button', { name: '로그인', exact: true }).click();
      const samePageOriginalLogin = await recoveryPage.evaluate((token) => globalThis.__issue76RecoveryPageToken === token, recoveryPageToken);
      assert.equal(samePageOriginalLogin, true);
      const localRecovery = recoveryPage.locator('[data-local-recovery]');
      for (let attempt = 0; attempt < 200 && await localRecovery.count() === 0; attempt += 1) await recoveryPage.waitForTimeout(25);
      assert.equal(await localRecovery.count(), 1, JSON.stringify({ trigger, body: await recoveryPage.locator('body').innerText() }));
      assert.equal(await localRecovery.getByLabel('로컬 편집 내용').inputValue(), recoveryDraft);
      await recoveryPage.evaluate(() => {
        globalThis.__issue76RecoveryBlob = undefined;
        URL.createObjectURL = (blob) => { globalThis.__issue76RecoveryBlob = blob; return 'blob:issue76-recovery'; };
        URL.revokeObjectURL = () => undefined;
        HTMLAnchorElement.prototype.click = () => undefined;
      });
      await localRecovery.getByRole('button', { name: '로컬 파일로 다운로드' }).click();
      const sameAccountRecoveryBytes = await recoveryPage.evaluate(async () => globalThis.__issue76RecoveryBlob?.text());
      assert.equal(sameAccountRecoveryBytes, recoveryDraft);

      recoveryMeasurements.push({ label, sameAccountRecoveryBytes, differentAccountSamePage, differentAccountRecoveryNoticeCount, differentAccountRecoveryActionCount, differentAccountOldNameCount, differentAccountOldBodyCount, differentAccountQueryCacheCount, differentAccountAutosaveWrites, samePageOriginalLogin, mutationPostsExact, sessionReadsExact, identityReadsExact, protectedWritesExact, observedOutcome: trigger });
      await localRecovery.getByRole('button', { name: '파일 보관을 확인하고 제거' }).click();
      await localRecovery.waitFor({ state: 'detached' });
      const recoveryDiscarded = await recoveryPage.locator('[data-local-recovery]').count() === 0;
      assert.equal(recoveryDiscarded, true);
      recoveryMeasurements[recoveryMeasurements.length - 1].recoveryDiscarded = recoveryDiscarded;
      assert.equal(protectedWritesExact, 0);
      assert.equal(mutationPostsExact, 1);
    } finally { await recoveryContext.close(); }
  }


  const mountedReadResults = [];
  const mountedReadLabels = {
    http500: { label: 'mounted-read-http500' },
    network: { label: 'mounted-read-network' },
  };
  for (const failure of ['http500', 'network']) {
    const source = page.getByLabel('원문');
    await source.fill(`MOUNTED-${failure}-EXACT-BODY`);
    await source.evaluate((node) => {
      node.focus();
      node.setSelectionRange(8, 16, 'backward');
      globalThis.__issue76MountedEditor = node.closest('[data-document-surface]');
    });
    await source.dispatchEvent('compositionstart', { data: '조합' });
    const readMountedEditorState = () => source.evaluate((node) => ({
      sameEditorIdentity: node.closest('[data-document-surface]') === globalThis.__issue76MountedEditor,
      body: node.value,
      selectionStart: node.selectionStart,
      selectionEnd: node.selectionEnd,
      selectionDirection: node.selectionDirection,
      activeCaretEndpoint: node.selectionDirection === 'backward' ? node.selectionStart : node.selectionEnd,
    }));
    const expectedMountedState = {
      sameEditorIdentity: true,
      body: `MOUNTED-${failure}-EXACT-BODY`,
      selectionStart: 8,
      selectionEnd: 16,
      selectionDirection: 'backward',
      activeCaretEndpoint: 8,
    };
    const beforeFailure = await readMountedEditorState();
    assert.deepEqual(beforeFailure, expectedMountedState);
    let documentReads = 0;
    await page.route(`**/api/documents/${historyFixture.second.id}`, (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      documentReads += 1;
      if (documentReads !== 1) return route.continue();
      return failure === 'network'
        ? route.abort('failed')
        : route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });
    const row = page.getByRole('treeitem', { name: new RegExp(escapeRegExp(historyFixture.second.name)) });
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '새 버전 올리기' }).click();
    const prompt = page.locator('[data-new-version-prompt]');
    await prompt.locator('input[type=file]').setInputFiles({
      name: historyFixture.second.name,
      mimeType: 'text/markdown',
      buffer: Buffer.from(`# mounted ${failure}\n`, 'utf8'),
    });
    const guardedUpload = prompt.getByRole('button', { name: '새 버전 올리기' });
    if (await guardedUpload.count() > 0) {
      await guardedUpload.click();
      await page.getByRole('alertdialog').getByRole('button', { name: '교체하기' }).click();
    }
    const refreshError = prompt.getByRole('alert', { name: '새 버전 업로드 오류' });
    await refreshError.waitFor();
    const duringFailure = await readMountedEditorState();
    assert.deepEqual(duringFailure, expectedMountedState);
    await refreshError.getByRole('button', { name: '다시 시도' }).click();
    await prompt.getByRole('status', { name: '새 버전 업로드 상태' }).waitFor();
    const afterRetry = await readMountedEditorState();
    assert.deepEqual(afterRetry, expectedMountedState);
    await prompt.getByRole('button', { name: '닫기', exact: true }).click();
    let compositionLogoutPosts = 0;
    await page.route('**/api/auth/logout', (route) => { compositionLogoutPosts += 1; return route.fulfill({ status: 204 }); });
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('tab', { name: '계정', exact: true }).click();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await page.getByText('입력을 마친 뒤 다시 시도하세요.', { exact: true }).waitFor();
    assert.equal(compositionLogoutPosts, 0);
    await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
    await page.unroute('**/api/auth/logout');
    await source.dispatchEvent('compositionend', { data: '조합' });
    const compositionObserved = compositionLogoutPosts === 0
      && await source.inputValue() === `MOUNTED-${failure}-EXACT-BODY`;
    assert.equal(compositionObserved, true);
    mountedReadResults.push({ ...mountedReadLabels[failure], beforeFailure, duringFailure, afterRetry, exactSelectionPreserved: true, compositionObserved, compositionPreserved: compositionObserved, retryRecovered: true });
    await page.unroute(`**/api/documents/${historyFixture.second.id}`);
  }
  await page.goto(WEB_URL, { waitUntil: 'networkidle' });
  await page.locator('[data-empty="documents"]').waitFor();
  const viewports = [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]; const normal = [];
  let matrixCell = 0;
  for (const viewport of viewports) for (const theme of ['light', 'dark']) for (const zoom of [1, 2]) {
    const cell = await chromium.launchPersistentContext(path.join(temporaryRoot, `matrix-${matrixCell++}`), {
      headless: false, viewport, colorScheme: theme, args: ['--window-position=-32000,-32000', '--force-device-scale-factor=1', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      await cell.addCookies(primaryCookies);
      if (cell.serviceWorkers().length === 0) await cell.waitForEvent('serviceworker');
      const cellWorker = cell.serviceWorkers()[0];
      const cellPage = await cell.newPage();
      await cellPage.route('**/api/session', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await cellPage.goto(WEB_URL, { waitUntil: 'networkidle' });
      const cellError = cellPage.getByRole('alert', { name: '애플리케이션 오류' });
      await cellError.waitFor();
      const baseline = await settledGeometry(cellPage);
      assert(near(baseline.innerWidth, viewport.width) && near(baseline.innerHeight, viewport.height), JSON.stringify({ viewport, baseline }));
      const target = cellPage.url();
      const tabZoom = await cellWorker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); return { tabId: tab.id, zoom: await chrome.tabs.getZoom(tab.id) }; }, { target, value: zoom });
      assert.equal(tabZoom.zoom, zoom);
      const zoomed = await settledGeometry(cellPage);
      assert(near(zoomed.innerWidth, baseline.innerWidth / zoom) && near(zoomed.innerHeight, baseline.innerHeight / zoom), JSON.stringify({ baseline, zoomed, zoom }));
      const cellRetry = cellError.getByRole('button', { name: '다시 시도' });
      await cellRetry.focus();
      const measured = await cellError.evaluate((node) => {
        const effectiveBackground = (start) => { let current = start; while (current) { const value = getComputedStyle(current).backgroundColor; if (!value.endsWith(', 0)') && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') return value; current = current.parentElement; } return 'rgb(255, 255, 255)'; };
        const rect = node.getBoundingClientRect(), style = getComputedStyle(node), parent = node.parentElement;
        const action = node.querySelector('button'); const actionStyle = getComputedStyle(action);
        return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, color: style.color, background: effectiveBackground(node), padding: style.padding, maxWidth: style.maxWidth, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, parentScroll: parent.scrollHeight > parent.clientHeight, action: { color: actionStyle.color, background: effectiveBackground(action), surroundingBackground: effectiveBackground(action.parentElement), border: actionStyle.borderColor, outline: actionStyle.outlineColor, outlineStyle: actionStyle.outlineStyle, outlineWidth: actionStyle.outlineWidth } };
      });
      measured.ratio = contrast(measured.color, measured.background);
      measured.action.textRatio = contrast(measured.action.color, measured.action.background);
      measured.action.boundaryRatio = contrast(measured.action.border, measured.action.surroundingBackground);
      measured.action.focusRatio = contrast(measured.action.outline, measured.action.surroundingBackground);
      assert(!measured.overflow && measured.rect.width <= 560 && measured.rect.x > 0 && measured.ratio >= 4.5 && measured.action.textRatio >= 4.5 && measured.action.boundaryRatio >= 3 && measured.action.focusRatio >= 3 && measured.action.outlineStyle !== 'none' && parseFloat(measured.action.outlineWidth) >= 2, JSON.stringify(measured));
      const resetZoom = await cellWorker.evaluate(async ({ target }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, 1); return chrome.tabs.getZoom(tab.id); }, { target });
      assert.equal(resetZoom, 1);
      const reset = await settledGeometry(cellPage);
      assert(near(reset.innerWidth, baseline.innerWidth) && near(reset.innerHeight, baseline.innerHeight), JSON.stringify({ baseline, reset }));
      normal.push({ viewport, theme, zoom, baseline, zoomed, reset, measured, browser: { version: cell.browser()?.version(), userAgent: await cellPage.evaluate(() => navigator.userAgent), profile: `matrix-${matrixCell - 1}`, tabId: tabZoom.tabId }, freshContext: true });
    } finally { await cell.close(); }
  }
  await page.setViewportSize({ width: 1280, height: 720 }); assert.equal(await setZoom(1), 1); assert.equal(await setZoom(2), 2); await page.setViewportSize({ width: 1440, height: 900 }); assert.equal(await setZoom(1), 1);
  const docButton = page.getByRole('button', { name: /긴 한글 문서 상태/ }).first();
  let failedDocumentRead = false;
  let pendingDocumentRetry;
  await page.route('**/api/documents/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (!failedDocumentRead && /^\/api\/documents\/[^/]+$/.test(pathname)) {
      failedDocumentRead = true;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    if (/^\/api\/documents\/[^/]+$/.test(pathname) && route.request().method() === 'GET' && pendingDocumentRetry === undefined) {
      pendingDocumentRetry = route;
      return;
    }
    return route.continue();
  });
  await docButton.click();
  const error = page.getByRole('alert', { name: '문서 오류' }); await error.waitFor();
  const failedActiveElement = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '');
  const retry = error.locator('button'); await retry.focus();
  const retryActiveElement = await retry.evaluate((node) => document.activeElement === node);
  await retry.press('Enter');
  for (let attempt = 0; attempt < 100 && pendingDocumentRetry === undefined; attempt += 1) await page.waitForTimeout(25);
  assert.notEqual(pendingDocumentRetry, undefined);
  retryAriaBusy = await retry.getAttribute('aria-busy') === 'true'
    && await retry.isDisabled()
    && await error.getAttribute('aria-busy') === 'true';
  assert.equal(retryAriaBusy, true);
  await pendingDocumentRetry.continue();
  await page.locator('[data-document-surface]').waitFor();
  const editor = page.locator('[data-document-surface]'); const identity = await editor.evaluate((node) => node); assert(identity);
  await page.getByRole('button', { name: '편집', exact: true }).click();
  await page.getByRole('button', { name: '소스', exact: true }).click();
  const source = page.getByLabel('원문');
  await source.evaluate((node) => { node.focus(); node.setSelectionRange(2, 7, 'backward'); });
  const caret = await source.evaluate((node) => ({ selectionStart: node.selectionStart, selectionEnd: node.selectionEnd, selectionDirection: node.selectionDirection, activeCaretEndpoint: node.selectionDirection === 'backward' ? node.selectionStart : node.selectionEnd }));
  assert.deepEqual(caret, { selectionStart: 2, selectionEnd: 7, selectionDirection: 'backward', activeCaretEndpoint: 2 });
  const exactDraft = 'issue76 exact local draft bytes';
  let logoutRequests = 0;
  await page.route('**/api/auth/logout', (route) => { logoutRequests += 1; return route.fulfill({ status: 204 }); });
  await source.dispatchEvent('compositionstart');
  await source.fill(exactDraft);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('tab', { name: '계정', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  assert.equal(logoutRequests, 0);
  await page.getByText('입력을 마친 뒤 다시 시도하세요.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-auth-draft-handoff]').count(), 0);
  await page.getByRole('button', { name: '설정 닫기', exact: true }).click();
  await source.dispatchEvent('compositionend');

  let pendingSave;
  let saveRequests = 0;
  await page.route('**/api/documents/**', async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    saveRequests += 1;
    pendingSave = route;
  });
  await source.press('Control+s');
  for (let attempt = 0; attempt < 100 && saveRequests === 0; attempt += 1) await page.waitForTimeout(50);
  assert.equal(saveRequests, 1);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('tab', { name: '계정', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  assert.equal(logoutRequests, 0);
  const handoff = page.locator('[data-auth-draft-handoff]');
  await handoff.waitFor();
  await page.evaluate(() => {
    globalThis.__issue76Download = undefined;
    URL.createObjectURL = (blob) => { globalThis.__issue76Download = blob; return 'blob:issue76'; };
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = () => undefined;
  });
  await handoff.getByRole('button', { name: '내려받기', exact: true }).click();
  const downloaded = await page.evaluate(async () => globalThis.__issue76Download?.text());
  assert.equal(downloaded, exactDraft);
  await handoff.getByRole('button', { name: '취소', exact: true }).click();
  assert.equal(saveRequests, 1);
  await pendingSave.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  await page.locator('[data-save-rejected]').waitFor();
  await page.unroute('**/api/auth/logout');
  await page.unroute('**/api/documents/**');
  const forced = [];
  for (const viewport of viewports) for (const zoom of [1, 2]) {
    const cell = await chromium.launchPersistentContext(path.join(temporaryRoot, `forced-${matrixCell++}`), {
        headless: false, viewport, forcedColors: 'active', args: ['--window-position=-32000,-32000', '--force-device-scale-factor=1', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      await cell.addCookies(primaryCookies);
      if (cell.serviceWorkers().length === 0) await cell.waitForEvent('serviceworker');
      const cellWorker = cell.serviceWorkers()[0];
      const cellPage = await cell.newPage();
      await cellPage.route('**/api/session', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
      await cellPage.goto(WEB_URL, { waitUntil: 'networkidle' });
      const baseline = await settledGeometry(cellPage);
      assert(near(baseline.innerWidth, viewport.width) && near(baseline.innerHeight, viewport.height), JSON.stringify({ viewport, baseline }));
      const target = cellPage.url();
      const tabZoom = await cellWorker.evaluate(async ({ target, value }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, value); return { tabId: tab.id, zoom: await chrome.tabs.getZoom(tab.id) }; }, { target, value: zoom });
      assert.equal(tabZoom.zoom, zoom);
      const zoomed = await settledGeometry(cellPage);
      assert(near(zoomed.innerWidth, baseline.innerWidth / zoom) && near(zoomed.innerHeight, baseline.innerHeight / zoom), JSON.stringify({ baseline, zoomed, zoom }));
      const settings = cellPage.getByRole('alert', { name: '애플리케이션 오류' }).getByRole('button', { name: '다시 시도' });
      await settings.focus();
      const m = await settings.evaluate((node) => { const effectiveBackground = (start) => { let current = start; while (current) { const value = getComputedStyle(current).backgroundColor; if (!value.endsWith(', 0)') && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') return value; current = current.parentElement; } return 'rgb(255, 255, 255)'; }; const s = getComputedStyle(node), r = node.getBoundingClientRect(); return { outline: s.outlineStyle, width: s.outlineWidth, color: s.color, background: effectiveBackground(node), surroundingBackground: effectiveBackground(node.parentElement), border: s.borderColor, forcedColorAdjust: s.forcedColorAdjust, visible: r.width >= 36 && r.height >= 36 }; });
      m.ratio = contrast(m.color, m.background);
      m.boundaryRatio = contrast(m.border, m.surroundingBackground);
      assert(m.visible && m.outline !== 'none' && parseFloat(m.width) >= 2 && m.ratio >= 3 && m.boundaryRatio >= 3, JSON.stringify(m));
      const resetZoom = await cellWorker.evaluate(async ({ target }) => { const tab = (await chrome.tabs.query({})).find((one) => one.url === target); if (!tab?.id) throw new Error('tab missing'); await chrome.tabs.setZoom(tab.id, 1); return chrome.tabs.getZoom(tab.id); }, { target });
      assert.equal(resetZoom, 1);
      const reset = await settledGeometry(cellPage);
      assert(near(reset.innerWidth, baseline.innerWidth) && near(reset.innerHeight, baseline.innerHeight), JSON.stringify({ baseline, reset }));
      forced.push({ viewport, zoom, baseline, zoomed, reset, measured: m, browser: { version: cell.browser()?.version(), userAgent: await cellPage.evaluate(() => navigator.userAgent), profile: `forced-${matrixCell - 1}`, tabId: tabZoom.tabId }, freshContext: true });
    } finally { await cell.close(); }
  }
  assert.equal(await setZoom(1), 1);
  const liveStateMeasurements = {
    label: 'live-error-retry-recovery',
    retryAriaBusy,
    retainedHostHiddenFromAT,
    dialogFocusTrapAndRestore,
    runtimeResizeReachable,
    dialogScroll,
    invokerIdentityRestored,
    failedActiveElement,
    retryActiveElement,
    ...caret,
  };
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify({ normal, forced, authOutcomes, recoveryMeasurements, mountedReadResults, liveStateMeasurements, finalZoom: 1, transitions: { bootstrap500ToShell: true, sessionReads, missingRoute: true, retryToEditor: true, editorMounted: true, historyBackForward: true, unavailableHistoryBackForward: true, lateHistoryResolverIsolated: true, busyHandoff: true, exactDownloadBytes: true, aclMounted404: true }, composition: { blockedLogoutRequests: logoutRequests, verified: true } }, null, 2));
  console.log(`issue76 product checks passed (${normal.length} normal + ${forced.length} forced)`);
} finally { if (context) await context.close(); fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
