import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

describe('IR-PRINCIPAL-004 authoritative group deletion impact', () => {
  let dir: string;
  let db: Database;
  let stores: ReturnType<typeof attachmentStores> & { transaction: <T>(fn: () => T) => T };
  let root: Actor;
  let ordinary: Actor;
  let app: Express;
  let actingAs: Actor | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'doculight-group-delete-'));
    db = openDatabase(join(dir, 'doculight.db'));
    stores = Object.assign(attachmentStores(db, join(dir, 'docs')), { transaction: <T>(fn: () => T) => db.transaction(fn) });
    root = superuserActor(stores, 'root');
    ordinary = actorFor(stores.principals, stores.principals.createUser('ordinary').id);
    actingAs = root;
    app = express();
    app.use(express.json());
    app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns complete membership and every persisted ACL row, then the existing delete keeps users and removes the group-owned rows atomically', async () => {
    const group = stores.principals.createGroup('삭제 대상');
    const memberA = stores.principals.createUser('회원 A');
    const memberB = stores.principals.createUser('회원 B');
    stores.principals.setStatus(memberB.id, 'suspended');
    stores.principals.addMember(group.id, memberA.id);
    stores.principals.addMember(group.id, memberB.id);
    const workspaceA = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, 'A')).id;
    const workspaceB = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, 'B')).id;
    grantPermission(stores, root, { nodeId: workspaceA, principalId: group.id, level: 'view' });
    grantPermission(stores, root, { nodeId: workspaceB, principalId: group.id, level: 'admin' });
    db.run("INSERT INTO acl_entry (id, node_id, principal_id, level, granted_by) VALUES (?, ?, ?, 'edit', ?)", [
      'unplaceable-group-grant', 'missing-node-kept-by-schema', group.id, root.id,
    ]);
    const persistedBefore = db.get<{ count: number }>('SELECT COUNT(*) AS count FROM acl_entry WHERE principal_id = ?', [group.id]);
    expect(persistedBefore?.count).toBe(3);

    const preview = await request(app).get(`/api/roster/groups/${group.id}/delete-preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers['cache-control']).toContain('no-store');
    expect(preview.body).toEqual({ id: group.id, name: '삭제 대상', system: false, memberCount: 2, aclEntryCount: persistedBefore?.count });

    const gone = await request(app).delete(`/api/roster/groups/${group.id}`);
    expect(gone.status).toBe(204);
    expect(stores.principals.findById(group.id)).toBeUndefined();
    expect(stores.principals.membersOf(group.id)).toEqual([]);
    expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM acl_entry WHERE principal_id = ?', [group.id])?.count).toBe(0);
    expect(stores.principals.findById(memberA.id)?.name).toBe('회원 A');
    expect(stores.principals.findById(memberB.id)?.name).toBe('회원 B');
  });

  it('applies authentication, no-enumeration, and canonical system-group denial to preview and delete', async () => {
    const group = stores.principals.createGroup('ordinary group');
    actingAs = undefined;
    expect((await request(app).get(`/api/roster/groups/${group.id}/delete-preview`)).status).toBe(401);
    expect((await request(app).delete(`/api/roster/groups/${group.id}`)).status).toBe(401);

    actingAs = ordinary;
    for (const id of [group.id, DEFAULT_GROUP_ID, 'missing']) {
      expect((await request(app).get(`/api/roster/groups/${id}/delete-preview`)).status).toBe(404);
      expect((await request(app).delete(`/api/roster/groups/${id}`)).status).toBe(404);
    }

    actingAs = root;
    expect((await request(app).get(`/api/roster/groups/${DEFAULT_GROUP_ID}/delete-preview`)).status).toBe(403);
    expect((await request(app).delete(`/api/roster/groups/${DEFAULT_GROUP_ID}`)).status).toBe(403);
  });
});
