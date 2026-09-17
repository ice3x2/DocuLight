import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor } from '../../../src/app/acl/permission-service.js';
import { grantCapabilityReceipt, grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

describe('IR-ACL-004 grant capability receipt projection', () => {
  let dir: string;
  let db: Database;

  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'grant-receipt-')); db = openDatabase(join(dir, 'db.sqlite')); });
  afterEach(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });

  it('derives canRevoke from the existing revoke policy for own, foreign, system, and admin entries', async () => {
    const stores = attachmentStores(db, join(dir, 'docs'));
    const root = superuserActor(stores);
    const workspace = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, 'receipt')).id;
    const doc = (createNode(stores, root, { workspaceId: workspace, parentId: null, kind: 'file', name: 'receipt.md' }) as { ok: true; id: string }).id;
    const editorUser = stores.principals.createUser('editor');
    const target = stores.principals.createUser('target');
    grantPermission(stores, root, { nodeId: doc, principalId: editorUser.id, level: 'edit' });
    const editor = actorFor(stores.principals, editorUser.id);
    const own = grantPermission(stores, editor, { nodeId: doc, principalId: target.id, level: 'view' });
    const ownId = (own as { ok: true; entryId: string }).entryId;
    expect(grantCapabilityReceipt(stores, editor, ownId)).toEqual({ entryId: ownId, canRevoke: true });

    const foreign = stores.acl.grant({ nodeId: doc, principalId: target.id, level: 'edit', grantedBy: root.id });
    const system = stores.acl.grant({ nodeId: doc, principalId: stores.principals.createUser('system-target').id, level: 'view', grantedBy: null });
    expect(grantCapabilityReceipt(stores, editor, foreign.id)).toEqual({ entryId: foreign.id, canRevoke: false });
    expect(grantCapabilityReceipt(stores, editor, system.id)).toEqual({ entryId: system.id, canRevoke: false });
    expect(grantCapabilityReceipt(stores, root, foreign.id)).toEqual({ entryId: foreign.id, canRevoke: true });
  });
});
