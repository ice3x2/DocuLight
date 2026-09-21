import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { breakInheritance, grantPermission } from '../../src/app/acl/grant-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let app: Express;
let root: ReturnType<typeof superuserActor>;
let workspaceId: string;
let folderId: string;

const idOf = (value: unknown) => (value as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-issue85-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  workspaceId = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획실')).id;
  folderId = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'directory', name: '닫힌방' }));
  breakInheritance(stores, root, folderId);
  app = express();
  app.use(express.json());
  app.use('/api', workspaceApiRouter({
    stores: { ...stores, transaction: <T,>(fn: () => T): T => db.transaction(fn) },
    actorOf: () => root,
  }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('IR-ACL-005 inheritance restoration preview', () => {
  it('returns the complete directory impact and restores only with its fresh revision', async () => {
    const viewer = stores.principals.createUser('열람자');
    grantPermission(stores, root, { nodeId: workspaceId, principalId: viewer.id, level: 'view' });
    grantPermission(stores, root, { nodeId: folderId, principalId: viewer.id, level: 'edit' });
    idOf(createNode(stores, root, { workspaceId, parentId: folderId, kind: 'file', name: '문서.md' }));

    const preview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);

    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toContain('no-store');
    expect(preview.body).toMatchObject({
      nodeId: folderId,
      workspace: { id: workspaceId, name: '기획실' },
      path: '닫힌방', kind: 'directory', applicableDescendants: 1,
    });
    expect(preview.body.retainedDirectAcl).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalId: viewer.id, principalName: '열람자', level: 'edit', source: null }),
    ]));
    expect(preview.body.incomingParentAcl).toEqual(expect.arrayContaining([
      expect.objectContaining({ principalId: viewer.id, principalName: '열람자', level: 'view', source: '기획실' }),
    ]));
    expect(preview.body.revision).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/);

    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({})).status).toBe(428);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: preview.body.revision })).status).toBe(204);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(true);
    expect(stores.acl.entriesOn(folderId).some((entry) => entry.principalId === viewer.id && entry.level === 'edit')).toBe(true);
  });

  it('rejects same-count replacement, parent ACL change and duplicate submission as stale', async () => {
    const first = idOf(createNode(stores, root, { workspaceId, parentId: folderId, kind: 'file', name: '첫째.md' }));
    const preview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    stores.nodes.markOrphaned(first, new Date().toISOString());
    idOf(createNode(stores, root, { workspaceId, parentId: folderId, kind: 'file', name: '둘째.md' }));
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: preview.body.revision })).status).toBe(409);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);

    const fresh = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    const user = stores.principals.createUser('새 사용자');
    grantPermission(stores, root, { nodeId: workspaceId, principalId: user.id, level: 'view' });
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: fresh.body.revision })).status).toBe(409);

    const finalPreview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: finalPreview.body.revision })).status).toBe(204);
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: finalPreview.body.revision })).status).toBe(409);
  });

  it('does not disclose preview to an editor and rejects forged revisions', async () => {
    const manager = root;
    const editor = stores.principals.createUser('편집자');
    grantPermission(stores, root, { nodeId: folderId, principalId: editor.id, level: 'edit' });
    const managerPreview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    root = { id: editor.id, requester: { subjectIds: [editor.id], superuser: false } };
    expect((await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`)).status).toBe(404);
    root = manager;
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: `${managerPreview.body.revision}x` })).status).toBe(409);
  });

  it('prunes a broken descendant branch, uses null for files, and invalidates proofs on server restart', async () => {
    const openChild = idOf(createNode(stores, root, { workspaceId, parentId: folderId, kind: 'file', name: '열린.md' }));
    const brokenChild = idOf(createNode(stores, root, { workspaceId, parentId: folderId, kind: 'directory', name: '하위단절' }));
    idOf(createNode(stores, root, { workspaceId, parentId: brokenChild, kind: 'file', name: '제외.md' }));
    breakInheritance(stores, root, brokenChild);
    const directoryPreview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    expect(directoryPreview.body.applicableDescendants).toBe(1);

    breakInheritance(stores, root, openChild);
    const filePreview = await request(app).get(`/api/nodes/${openChild}/restore-inheritance-preview`);
    expect(filePreview.body).toMatchObject({ kind: 'file', applicableDescendants: null });

    const restarted = express();
    restarted.use(express.json());
    restarted.use('/api', workspaceApiRouter({ stores: { ...stores, transaction: <T,>(fn: () => T): T => db.transaction(fn) }, actorOf: () => root }));
    expect((await request(restarted).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: directoryPreview.body.revision })).status).toBe(409);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);
  });

  it('rolls back inheritance when the audit append fails', async () => {
    const preview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    db.run(`CREATE TRIGGER issue85_abort_restore BEFORE INSERT ON audit_log
      WHEN NEW.operation = 'acl.restore-inheritance' BEGIN SELECT RAISE(ABORT, 'issue85 injected audit failure'); END`);
    const response = await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: preview.body.revision });
    expect(response.status).toBe(500);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);
    expect(stores.auditLog.inScope([workspaceId], { includeInstance: true, operation: 'acl.restore-inheritance' })).toHaveLength(0);
  });

  it('rejects non-canonical base64url pad bits instead of accepting an altered revision', async () => {
    const preview = await request(app).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = preview.body.revision.at(-1) as string;
    const altered = `${preview.body.revision.slice(0, -1)}${alphabet[alphabet.indexOf(last) + 1]}`;
    expect(Buffer.from(preview.body.revision.slice(3), 'base64url')).toEqual(Buffer.from(altered.slice(3), 'base64url'));
    expect((await request(app).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: altered })).status).toBe(409);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);
  });

  it('rebuilds authorization inside the write transaction and rejects boundary role loss', async () => {
    const editorRecord = stores.principals.createUser('경계 편집자');
    grantPermission(stores, root, { nodeId: workspaceId, principalId: editorRecord.id, level: 'edit' });
    const editor = { id: editorRecord.id, requester: { subjectIds: [editorRecord.id], superuser: false } };
    let calls = 0;
    const raceApp = express(); raceApp.use(express.json()); raceApp.use('/api', workspaceApiRouter({
      stores: { ...stores, transaction: <T,>(fn: () => T): T => db.transaction(fn) },
      actorOf: () => { calls += 1; return calls <= 2 ? root : editor; },
    }));
    const preview = await request(raceApp).get(`/api/nodes/${folderId}/restore-inheritance-preview`);
    expect(preview.status).toBe(200);
    expect((await request(raceApp).post(`/api/nodes/${folderId}/restore-inheritance`).send({ revision: preview.body.revision })).status).toBe(404);
    expect(stores.nodes.findById(folderId)?.inheritsAcl).toBe(false);
  });
});
