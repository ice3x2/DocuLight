import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

describe('IR-ACL-004 grant route representation preference', () => {
  let dir: string; let db: Database; let stores: ReturnType<typeof attachmentStores>; let root: Actor;
  let editor: Actor; let targetId: string; let doc: string; let app: Express; let actingAs: Actor | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'grant-route-')); db = openDatabase(join(dir, 'db.sqlite'));
    stores = attachmentStores(db, join(dir, 'docs')); root = superuserActor(stores);
    const ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, 'receipt')).id;
    doc = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'receipt.md' }) as { ok: true; id: string }).id;
    const editorUser = stores.principals.createUser('editor'); targetId = stores.principals.createUser('target').id;
    grantPermission(stores, root, { nodeId: doc, principalId: editorUser.id, level: 'edit' });
    editor = actorFor(stores.principals, editorUser.id); actingAs = editor;
    app = express(); app.use(express.json()); app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
  });
  afterEach(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });

  it('keeps legacy and ignored preferences at 204, and accepts a case-insensitive token among multiple preferences', async () => {
    expect((await request(app).post(`/api/nodes/${doc}/share`).send({ principalId: targetId, level: 'view' })).status).toBe(204);
    expect((await request(app).post(`/api/nodes/${doc}/share`).set('Prefer', 'respond-async').send({ principalId: targetId, level: 'edit' })).status).toBe(204);
    const represented = await request(app).post(`/api/nodes/${doc}/share`).set('Prefer', 'wait=5, RETURN=REPRESENTATION').send({ principalId: stores.principals.createUser('fresh').id, level: 'view' });
    expect(represented.status).toBe(200);
    expect(Object.keys(represented.body).sort()).toEqual(['canRevoke', 'entryId']);
    expect(represented.body).toMatchObject({ canRevoke: true });
    expect(stores.acl.findEntry(represented.body.entryId)).toMatchObject({ nodeId: doc, level: 'view' });
  });

  it('returns the actual duplicate ID and policy result without changing grantor or row count', async () => {
    const existing = stores.acl.grant({ nodeId: doc, principalId: targetId, level: 'view', grantedBy: root.id });
    const before = stores.acl.entriesOn(doc).length;
    const represented = await request(app).post(`/api/nodes/${doc}/share`).set('Prefer', 'return=representation').send({ principalId: targetId, level: 'view' });
    expect(represented.body).toEqual({ entryId: existing.id, canRevoke: false });
    expect(stores.acl.entriesOn(doc)).toHaveLength(before);
    expect(stores.acl.findEntry(existing.id)?.grantedBy).toBe(root.id);
  });

  it('does not emit a receipt for a failed grant', async () => {
    actingAs = actorFor(stores.principals, stores.principals.createUser('outsider').id);
    const denied = await request(app).post(`/api/nodes/${doc}/share`).set('Prefer', 'return=representation').send({ principalId: targetId, level: 'view' });
    expect(denied.status).toBe(404);
    expect(denied.body).toEqual({});
  });
});
