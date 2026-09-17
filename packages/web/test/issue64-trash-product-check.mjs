import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const { chromium } = createRequire(path.join(root, 'packages/editor/package.json'))('playwright');
const required = ['WEB_URL', 'DOCULIGHT_E2E_USER', 'DOCULIGHT_E2E_PASS', 'DOCULIGHT_E2E_MANAGER_USER', 'DOCULIGHT_E2E_MANAGER_PASS', 'DOCULIGHT_E2E_EMPTY_USER', 'DOCULIGHT_E2E_EMPTY_PASS', 'DOCULIGHT_E2E_MANAGED_WORKSPACE', 'DOCULIGHT_E2E_EDITED_WORKSPACE', 'DOCULIGHT_E2E_MANAGER_ID'];
for (const name of required) if (!process.env[name]) throw new Error(`isolated multi-account product input ${name} is missing`);
const origin = process.env.WEB_URL;
const output = path.join(root, '.kiwi/sessions/newspaper-20260916/evidence/issue64');
const managedWorkspaceId = process.env.DOCULIGHT_E2E_MANAGED_WORKSPACE;
const editedWorkspaceId = process.env.DOCULIGHT_E2E_EDITED_WORKSPACE;
const managerPrincipalId = process.env.DOCULIGHT_E2E_MANAGER_ID;
const browser = await chromium.launch({ headless: true });
const contexts = [];

const login = async (name, password) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'networkidle' });
  await page.getByLabel('이름').fill(name);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.getByRole('button', { name: '설정' }).waitFor();
  return page;
};

try {
  const superPage = await login(process.env.DOCULIGHT_E2E_USER, process.env.DOCULIGHT_E2E_PASS);
  const managerPage = await login(process.env.DOCULIGHT_E2E_MANAGER_USER, process.env.DOCULIGHT_E2E_MANAGER_PASS);
  const emptyPage = await login(process.env.DOCULIGHT_E2E_EMPTY_USER, process.env.DOCULIGHT_E2E_EMPTY_PASS);
  const stamp = Date.now();
  const body = `issue64 exact bytes ${stamp}\n둘째 줄`;
  const purgeBody = `issue64 purge resource ${stamp}`;
  const attachmentBytes = `issue64 attachment ${stamp}`;

  const prepared = await superPage.evaluate(async ({ managedWorkspaceId, editedWorkspaceId, stamp, body, purgeBody, attachmentBytes }) => {
    const request = async (url, init) => {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} ${response.status}`);
      return response.status === 204 ? null : response.json();
    };
    const create = (workspaceId, parentId, kind, name) => request('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId, kind, name }) });
    const save = async (nodeId, value) => {
      const current = await request(`/api/documents/${nodeId}`);
      return request(`/api/documents/${nodeId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: value, baseHash: current.hash, forceSnapshot: true }) });
    };
    const folder = await create(managedWorkspaceId, null, 'directory', `issue64-folder-${stamp}`);
    const restore = await create(managedWorkspaceId, folder.id, 'file', `issue64-collision-${stamp}.md`);
    const purge = await create(managedWorkspaceId, folder.id, 'file', `issue64-purge-${stamp}.md`);
    const managedOther = await create(managedWorkspaceId, folder.id, 'file', `issue64-managed-other-${stamp}.md`);
    const editOther = await create(editedWorkspaceId, null, 'file', `issue64-edit-hidden-${stamp}.md`);
    await save(restore.id, body);
    await save(purge.id, purgeBody);
    const data = new FormData();
    data.append('file', new Blob([attachmentBytes]), `issue64-${stamp}.txt`);
    const attachment = await request(`/api/documents/${purge.id}/attachments`, { method: 'POST', body: data });
    const restoreVersions = await request(`/api/documents/${restore.id}/versions`);
    const restoreAcl = await request(`/api/nodes/${restore.id}/share`);
    for (const node of [restore, purge, managedOther, editOther]) await request(`/api/nodes/${node.id}`, { method: 'DELETE' });
    const collision = await create(managedWorkspaceId, folder.id, 'file', restore.name);
    await save(collision.id, `collision stays ${stamp}`);
    return { folder, restore, purge, managedOther, editOther, collision, attachment, restoreVersions, restoreAcl };
  }, { managedWorkspaceId, editedWorkspaceId, stamp, body, purgeBody, attachmentBytes });

  const managerOwn = await managerPage.evaluate(async ({ managedWorkspaceId, editedWorkspaceId, stamp }) => {
    const createTrash = async (workspaceId, name) => {
      const made = await fetch('/api/nodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: null, kind: 'file', name }) });
      if (!made.ok) throw new Error(`manager create ${made.status}`);
      const node = await made.json();
      const removed = await fetch(`/api/nodes/${node.id}`, { method: 'DELETE' });
      if (!removed.ok) throw new Error(`manager trash ${removed.status}`);
      return node;
    };
    return { managed: await createTrash(managedWorkspaceId, `issue64-manager-admin-${stamp}.md`), edited: await createTrash(editedWorkspaceId, `issue64-manager-edit-${stamp}.md`) };
  }, { managedWorkspaceId, editedWorkspaceId, stamp });

  await emptyPage.getByRole('button', { name: '설정' }).click();
  const emptyTree = await emptyPage.evaluate(async () => (await (await fetch('/api/tree')).json()));
  assert.equal(emptyTree.length, 0);
  assert.equal(await emptyPage.locator('[data-settings-dialog]').getByRole('tab', { name: '휴지통' }).count(), 0, 'no-workspace account hides trash category');

  const lensRequests = [];
  managerPage.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/trash') lensRequests.push({ scope: url.searchParams.get('scope'), workspaceId: url.searchParams.get('workspaceId') });
  });
  const scopes = await managerPage.evaluate(async ({ managedWorkspaceId }) => {
    const take = async (query) => (await (await fetch(`/api/trash?${query}`)).json()).map((row) => ({ nodeId: row.nodeId, workspaceId: row.workspaceId, canPurge: row.canPurge }));
    return { mine: await take('scope=mine'), all: await take('scope=all'), managed: await take(`scope=all&workspaceId=${managedWorkspaceId}`) };
  }, { managedWorkspaceId });
  assert.deepEqual(new Set(scopes.mine.map((row) => row.nodeId)), new Set([managerOwn.managed.id, managerOwn.edited.id]));
  assert(scopes.all.some((row) => row.nodeId === prepared.managedOther.id));
  assert(!scopes.all.some((row) => row.nodeId === prepared.editOther.id));
  assert(scopes.managed.every((row) => row.workspaceId === managedWorkspaceId));
  assert.equal(scopes.all.find((row) => row.nodeId === managerOwn.managed.id)?.canPurge, true);
  assert.equal(scopes.all.find((row) => row.nodeId === managerOwn.edited.id)?.canPurge, false);

  await managerPage.reload({ waitUntil: 'networkidle' });
  await managerPage.getByRole('button', { name: '설정' }).click();
  const managerSettings = managerPage.locator('[data-settings-dialog]');
  await managerSettings.getByRole('tab', { name: '휴지통' }).click();
  const managerPanel = managerSettings.locator('[data-panel="trash"]');
  await managerPanel.getByRole('button', { name: '전체 보기' }).click();
  await managerPanel.getByText('현재 범위: 전체').waitFor();
  await managerPanel.getByLabel('워크스페이스 필터').selectOption(managedWorkspaceId);
  assert(lensRequests.some((one) => one.scope === 'all'));
  assert(lensRequests.some((one) => one.scope === 'all' && one.workspaceId === managedWorkspaceId));

  const observed = { list: 0, restore: 0, purge: 0 };
  superPage.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/trash' && request.method() === 'GET') observed.list += 1;
    if (url.pathname === `/api/trash/${prepared.restore.id}/restore` && request.method() === 'POST') observed.restore += 1;
    if (url.pathname === `/api/trash/${prepared.purge.id}` && request.method() === 'DELETE') observed.purge += 1;
  });
  await superPage.reload({ waitUntil: 'networkidle' });
  await superPage.getByRole('button', { name: '설정' }).click();
  let settings = superPage.locator('[data-settings-dialog]');
  await settings.getByRole('tab', { name: '휴지통' }).click();
  let panel = settings.locator('[data-panel="trash"]');
  await panel.waitFor();
  const clickAction = (nodeId, kind) => panel.evaluate((node, target) => node.querySelector(`[data-trash-action="${target.kind}"][data-trash-node-id="${target.nodeId}"]`).click(), { nodeId, kind });
  await clickAction(prepared.purge.id, 'purge');
  let gate = superPage.getByRole('alertdialog');
  assert.equal(observed.purge, 0);
  await superPage.keyboard.press('Escape');
  await gate.waitFor({ state: 'detached' });
  assert.equal(observed.purge, 0);
  await clickAction(prepared.purge.id, 'purge');
  gate = superPage.getByRole('alertdialog');
  await gate.getByRole('button', { name: '영구 삭제' }).click();
  await panel.locator(':scope > p[role="status"]').filter({ hasText: '항목을 영구 삭제했습니다.' }).waitFor();
  assert.equal(observed.purge, 1);

  await superPage.reload({ waitUntil: 'networkidle' });
  await superPage.getByRole('button', { name: '설정' }).click();
  settings = superPage.locator('[data-settings-dialog]');
  await settings.getByRole('tab', { name: '휴지통' }).click();
  panel = settings.locator('[data-panel="trash"]');
  await panel.evaluate((node, nodeId) => node.querySelector(`[data-trash-action="restore"][data-trash-node-id="${nodeId}"]`).click(), prepared.restore.id);
  await panel.locator(':scope > p[role="status"]').filter({ hasText: '항목을 복구했습니다.' }).waitFor();
  assert.equal(observed.restore, 1);

  const preservation = await superPage.evaluate(async ({ restoreId, purgeId, attachmentLink }) => {
    const response = async (url, init) => {
      const got = await fetch(url, init);
      return { status: got.status, body: got.ok && got.headers.get('content-type')?.includes('json') ? await got.json() : undefined };
    };
    return {
      restored: await response(`/api/documents/${restoreId}`),
      versions: await response(`/api/documents/${restoreId}/versions`),
      acl: await response(`/api/nodes/${restoreId}/share`),
      tree: (await response('/api/tree')).body,
      purgeRead: await response(`/api/documents/${purgeId}`),
      purgeVersions: await response(`/api/documents/${purgeId}/versions`),
      purgeAcl: await response(`/api/nodes/${purgeId}/share`),
      purgeRestore: await response(`/api/trash/${purgeId}/restore`, { method: 'POST' }),
      attachment: await response(attachmentLink),
    };
  }, { restoreId: prepared.restore.id, purgeId: prepared.purge.id, attachmentLink: prepared.attachment.link });
  assert.equal(preservation.restored.status, 200);
  assert.equal(preservation.restored.body.body, body);
  assert.deepEqual(preservation.versions.body, prepared.restoreVersions);
  assert.deepEqual(preservation.acl.body, prepared.restoreAcl);
  const flat = preservation.tree.flatMap((workspace) => {
    const walk = (nodes) => nodes.flatMap((node) => [node, ...walk(node.children ?? [])]);
    return walk(workspace.roots);
  });
  const restoredNode = flat.find((node) => node.id === prepared.restore.id);
  const collisionNode = flat.find((node) => node.id === prepared.collision.id);
  assert(restoredNode && collisionNode && restoredNode.id !== collisionNode.id);
  assert.notEqual(restoredNode.name, collisionNode.name, 'restore collision uses suffix without overwrite');
  assert.equal(preservation.purgeRead.status, 404);
  assert.equal(preservation.purgeVersions.status, 404);
  assert.equal(preservation.purgeAcl.status, 404);
  assert.equal(preservation.purgeRestore.status, 404);
  assert.equal(preservation.attachment.status, 404);

  const revoked = await superPage.evaluate(async ({ managedWorkspaceId, managerPrincipalId }) => {
    const share = await (await fetch(`/api/nodes/${managedWorkspaceId}/share`)).json();
    const row = share.rows.find((one) => one.principalId === managerPrincipalId && one.entryId !== null);
    if (!row) throw new Error('manager workspace grant missing');
    return (await fetch(`/api/acl-entries/${row.entryId}`, { method: 'DELETE' })).status;
  }, { managedWorkspaceId, managerPrincipalId });
  assert.equal(revoked, 204);
  const afterLoss = await managerPage.evaluate(async ({ nodeId, managedWorkspaceId }) => {
    const list = await (await fetch('/api/trash?scope=all')).json();
    const restore = await fetch(`/api/trash/${nodeId}/restore`, { method: 'POST' });
    const purge = await fetch(`/api/trash/${nodeId}`, { method: 'DELETE' });
    return { list, restore: restore.status, purge: purge.status, managedWorkspaceId };
  }, { nodeId: prepared.managedOther.id, managedWorkspaceId });
  assert(!afterLoss.list.some((row) => row.nodeId === prepared.managedOther.id), 'lost manager scope removes other-user item on next query');
  assert([403, 404].includes(afterLoss.restore));
  assert([403, 404].includes(afterLoss.purge));
  const intact = await superPage.evaluate(async (nodeId) => (await (await fetch('/api/trash?scope=all')).json()).some((row) => row.nodeId === nodeId), prepared.managedOther.id);
  assert(intact, 'forbidden actions leave target intact');

  await superPage.screenshot({ path: path.join(output, 'product-trash.png') });
  const evidence = {
    ownedBrowsers: 1,
    contexts: contexts.length,
    pages: contexts.length,
    roles: { superuser: true, mixedManager: true, noWorkspace: true },
    lenses: { requests: lensRequests, mineCount: scopes.mine.length, allCount: scopes.all.length, managedCount: scopes.managed.length },
    observed,
    preservation: { bytes: true, nodeId: true, acl: true, versions: true, collisionSuffixNoOverwrite: true },
    purgeResources: { document: 404, versions: 404, acl: 404, attachment: 404, restore: 404 },
    permissionLoss: { nextQueryExcluded: true, forbiddenRestore: afterLoss.restore, forbiddenPurge: afterLoss.purge, itemIntact: true },
    l2NoDeleteBeforeAccept: true,
  };
  fs.writeFileSync(path.join(output, 'product-result.json'), JSON.stringify(evidence, null, 2));
  console.log(`PASS product roles=3 restore=${observed.restore} purge=${observed.purge} list=${observed.list}`);
} finally {
  await Promise.all(contexts.map((context) => context.close()));
  await browser.close();
}
