import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

describe('IR-PRINCIPAL-005 revocation bypass metadata', () => {
  let dir: string;
  let db: Database;
  let stores: ReturnType<typeof attachmentStores>;
  let app: Express;
  let actingAs: Actor | undefined;
  let root: Actor;
  let workspaceId: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'doculight-issue84-'));
    const docsRoot = join(dir, 'docs');
    await mkdir(docsRoot, { recursive: true });
    db = openDatabase(join(dir, 'doculight.db'));
    stores = attachmentStores(db, docsRoot);
    root = superuserActor(stores);
    workspaceId = (await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      'Issue 84 workspace',
    )).id;
    actingAs = root;
    app = express();
    app.use(express.json());
    app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps ordinary search private and exposes the boolean only for managed revocation search', async () => {
    const ordinary = stores.principals.createUser('ordinary target');
    const activeSuperuser = stores.principals.createUser('active superuser');
    const suspendedSuperuser = stores.principals.createUser('suspended superuser');
    const misleading = stores.principals.createGroup('Superuser administrators');
    stores.principals.addMember(SUPERUSER_GROUP_ID, activeSuperuser.id);
    stores.principals.addMember(SUPERUSER_GROUP_ID, suspendedSuperuser.id);
    stores.principals.setStatus(suspendedSuperuser.id, 'suspended');
    stores.principals.addMember(misleading.id, activeSuperuser.id);

    const plain = await request(app).get('/api/principals').query({ q: 'superuser', for: `workspace:${workspaceId}` });
    expect(plain.status).toBe(200);
    expect(plain.body.every((row: object) => !Object.hasOwn(row, 'aclRevokePreservesSuperuserBypass'))).toBe(true);

    const projected = await request(app).get('/api/principals').query({
      q: 'superuser', for: `workspace:${workspaceId}`, purpose: 'revocation',
    });
    expect(projected.status).toBe(200);
    const capability = Object.fromEntries(projected.body.map((row: { id: string; aclRevokePreservesSuperuserBypass: boolean }) => [row.id, row.aclRevokePreservesSuperuserBypass]));
    expect(capability).toMatchObject({
      [activeSuperuser.id]: true,
      [suspendedSuperuser.id]: true,
      [misleading.id]: false,
    });

    for (const [id, expected] of [[SUPERUSER_GROUP_ID, true], [DEFAULT_GROUP_ID, false]] as const) {
      const name = stores.principals.findById(id)!.name;
      const systemGroup = await request(app).get('/api/principals').query({
        q: name.slice(0, 2), for: `workspace:${workspaceId}`, purpose: 'revocation',
      });
      expect(systemGroup.body.find((row: { id: string }) => row.id === id)?.aclRevokePreservesSuperuserBypass).toBe(expected);
    }
    expect(ordinary.id).not.toBe('');
  });

  it('rejects revocation projection for missing, unknown, node, and unmanaged scopes', async () => {
    const manager = stores.principals.createUser('manager');
    grantPermission(stores, root, { nodeId: workspaceId, principalId: manager.id, level: 'admin' });
    actingAs = actorFor(stores.principals, manager.id);

    expect((await request(app).get('/api/principals').query({ q: 'ma', purpose: 'revocation' })).status).toBe(404);
    expect((await request(app).get('/api/principals').query({ q: 'ma', for: `node:${workspaceId}`, purpose: 'revocation' })).status).toBe(404);
    expect((await request(app).get('/api/principals').query({ q: 'ma', for: 'workspace:missing', purpose: 'revocation' })).status).toBe(404);
    expect((await request(app).get('/api/principals').query({ q: 'ma', for: `workspace:${workspaceId}`, purpose: 'unknown' })).status).toBe(400);
    actingAs = undefined;
    expect((await request(app).get('/api/principals').query({ q: 'ma', for: `workspace:${workspaceId}`, purpose: 'revocation' })).status).toBe(401);
  });

  it('returns authoritative selected-subject metadata and refuses a missing subject', async () => {
    const selected = stores.principals.createUser('selected superuser');
    stores.principals.addMember(SUPERUSER_GROUP_ID, selected.id);

    const preview = await request(app).get(`/api/principals/${selected.id}/revocation`);
    expect(preview.status).toBe(200);
    expect(preview.body.subject).toEqual({ id: selected.id, aclRevokePreservesSuperuserBypass: true });

    stores.principals.removeMember(SUPERUSER_GROUP_ID, selected.id);
    const refreshed = await request(app).get(`/api/principals/${selected.id}/revocation`);
    expect(refreshed.body.subject).toEqual({ id: selected.id, aclRevokePreservesSuperuserBypass: false });
    expect((await request(app).get('/api/principals/missing/revocation')).status).toBe(404);
  });
});
