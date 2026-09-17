import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { chromium } = createRequire(new URL('../../editor/package.json', import.meta.url))('playwright');

const webUrl = process.env.WEB_URL ?? 'http://127.0.0.1:3399/';
const user = process.env.DOCULIGHT_E2E_USER;
const password = process.env.DOCULIGHT_E2E_PASS;
if (!user || !password) throw new Error('authenticated disposable account is required');

const login = async (page, name, pass) => {
  await page.goto(webUrl, { waitUntil: 'networkidle' });
  const result = await page.evaluate(async ([loginName, loginPassword]) => {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: loginName, password: loginPassword }) });
    return { ok: response.ok, status: response.status };
  }, [name, pass]);
  assert.equal(result.ok, true, `login failed (${result.status})`);
};

const browser = await chromium.launch({ headless: true });
const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const owner = await ownerContext.newPage();
let nodeId;
try {
  await login(owner, user, password);
  const stamp = Date.now();
  const prepared = await owner.evaluate(async (suffix) => {
    const tree = await (await fetch('/api/tree')).json();
    const workspace = tree[0]?.workspace;
    if (!workspace) return { error: 'workspace missing' };
    const made = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: workspace.id, parentId: null, kind: 'file', name: `version-product-${suffix}.md` }) });
    if (!made.ok) return { error: `create failed ${made.status}` };
    const node = await made.json();
    const first = await (await fetch(`/api/documents/${node.id}`)).json();
    const historical = '# 복원할 정확한 본문\n\n첫 번째 저장의 바이트입니다.\n';
    const current = '# 현재 본문\n\n두 번째 저장의 바이트입니다.\n';
    let saved = await fetch(`/api/documents/${node.id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: historical, baseHash: first.hash }) });
    if (!saved.ok) return { error: `first save failed ${saved.status}` };
    const form = new FormData();
    form.append('file', new Blob([current], { type: 'text/markdown' }), node.name);
    saved = await fetch(`/api/nodes/${node.id}/new-version`, { method: 'POST', body: form });
    if (!saved.ok) return { error: `new version failed ${saved.status}` };
    const versions = await (await fetch(`/api/documents/${node.id}/versions`)).json();
    let sequence = null;
    for (const row of versions) {
      const candidate = await (await fetch(`/api/documents/${node.id}/versions/${row.seq}`)).json();
      if (candidate.body === historical) sequence = row.seq;
    }
    if (sequence === null) return { error: 'historical snapshot missing' };
    const viewerAccount = { name: `version-viewer-${suffix}`, password: `Version-${suffix}-pass` };
    const registered = await fetch('/api/roster/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(viewerAccount) });
    if (!registered.ok) return { error: `viewer registration failed ${registered.status}` };
    const principal = await registered.json();
    const shared = await fetch(`/api/nodes/${node.id}/share`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ principalId: principal.id, level: 'view' }) });
    if (!shared.ok) return { error: `share failed ${shared.status}` };
    return { nodeId: node.id, name: node.name, workspaceId: workspace.id, historical, current, sequence, viewerAccount, versionCount: versions.length };
  }, stamp);
  assert.equal(prepared.error, undefined, prepared.error);
  nodeId = prepared.nodeId;

  await owner.goto(webUrl, { waitUntil: 'networkidle' });
  await owner.getByRole('button', { name: prepared.name }).first().click();
  await owner.getByRole('button', { name: `${prepared.name} 문서 메뉴` }).click();
  await owner.getByRole('menuitem', { name: '버전 기록' }).click();
  const history = owner.locator('[data-version-history]');
  await history.waitFor();
  await history.getByRole('button', { name: `${prepared.sequence}판 비교` }).click();
  const comparison = owner.getByRole('region', { name: '버전 비교' });
  await comparison.waitFor();
  assert.equal(await comparison.getByLabel(`보관된 ${prepared.sequence}판 전체 원문`).textContent(), prepared.historical);
  await owner.getByRole('button', { name: '이 버전으로 복원' }).click();
  await history.waitFor({ state: 'detached' });
  const persisted = await owner.evaluate(async (id) => await (await fetch(`/api/documents/${id}`)).json(), prepared.nodeId);
  assert.equal(persisted.body, prepared.historical);
  const versionsAfter = await owner.evaluate(async (id) => await (await fetch(`/api/documents/${id}/versions`)).json(), prepared.nodeId);
  assert(versionsAfter.some((row) => row.seq === prepared.sequence));
  const treeAfter = await owner.evaluate(async () => await (await fetch('/api/tree')).json());
  const flatten = (rows) => rows.flatMap((row) => [row, ...flatten(row.children ?? [])]);
  const ownerNode = treeAfter.flatMap((workspace) => flatten(workspace.roots ?? [])).find((row) => row.id === prepared.nodeId);
  assert(ownerNode);

  const viewerContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const viewer = await viewerContext.newPage();
  try {
    await login(viewer, prepared.viewerAccount.name, prepared.viewerAccount.password);
    await viewer.goto(webUrl, { waitUntil: 'networkidle' });
    await viewer.getByRole('button', { name: prepared.name }).first().click();
    await viewer.getByRole('button', { name: `${prepared.name} 문서 메뉴` }).click();
    await viewer.getByRole('menuitem', { name: '버전 기록' }).click();
    const viewerHistory = viewer.locator('[data-version-history]');
    await viewerHistory.getByRole('button', { name: `${prepared.sequence}판 복원` }).click();
    await viewerHistory.getByRole('alert').waitFor();
    assert(await viewerHistory.getByRole('alert').isVisible());
    assert.equal(await viewerHistory.count(), 1);
    const afterDenied = await viewer.evaluate(async (id) => await (await fetch(`/api/documents/${id}`)).json(), prepared.nodeId);
    assert.equal(afterDenied.body, prepared.historical);
  } finally { await viewerContext.close(); }

  console.log(JSON.stringify({ pass: true, nodeStable: ownerNode.id === prepared.nodeId, versionIdentityStable: true, exactBytesPersisted: true, viewOnlyRestoreRejected: true, versionsBefore: prepared.versionCount, versionsAfter: versionsAfter.length }));
} finally {
  if (nodeId) await owner.evaluate(async (id) => { await fetch(`/api/nodes/${id}`, { method: 'DELETE' }); }, nodeId).catch(() => {});
  await ownerContext.close();
  await browser.close();
}
