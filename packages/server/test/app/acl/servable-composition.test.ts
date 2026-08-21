import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, resolveNode, visibleChildrenOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { ARCHIVE_DIRECTORY } from '../../../src/domain/workspace/archive.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: NodeStores;
let ws: string;
let root: Actor;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-servable-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 재조정이 디스크에서 주워 등재하는 경로 — 이름 검증을 거치지 않는다. */
const adopt = (name: string, parentId: string | null, kind: 'file' | 'directory' = 'file') =>
  stores.nodes.create({ workspaceId: ws, parentId, kind, name });

describe('보이는 노드의 정의는 한 자리에 있다', () => {
  it('SEC-STORAGE-005 · REL-STORAGE-001 — resolveNode 가 점 이름·아카이브·tombstone 을 함께 막는다', () => {
    // 권한은 슈퍼유저라 통과한다. 그러니 여기서 거절되면 그것은 ACL 이
    // 아니라 서빙 관문이 막은 것이다.
    const dotted = adopt('.env', null);
    expect(permissionOf(stores, root, dotted)).toBe('admin');
    expect(resolveNode(stores, root, dotted), '점 이름이 ACL 경로로 새어 나온다').toBeUndefined();

    const archive = adopt(ARCHIVE_DIRECTORY, null, 'directory');
    const inArchive = adopt('보관된.md', archive);
    expect(resolveNode(stores, root, inArchive), '아카이브가 ACL 경로로 새어 나온다').toBeUndefined();

    const gone = adopt('사라진.md', null);
    stores.nodes.markOrphaned(gone, '2026-08-21T00:00:00.000Z');
    expect(resolveNode(stores, root, gone), 'tombstone 이 ACL 경로로 새어 나온다').toBeUndefined();
  });

  it('SEC-STORAGE-004 — visibleChildrenOf 가 점으로 시작하는 항목을 트리에서 뺀다', () => {
    adopt('.obsidian', null, 'directory');
    const normal = adopt('회의록.md', null);

    const listed = visibleChildrenOf(stores, root, { workspaceId: ws, parentId: null });

    expect(listed.map((c) => c.node.id)).toEqual([normal]);
  });

  it('조상이 점 이름이면 그 아래도 나오지 않는다 — 세그먼트 하나만 보면 새어 나간다', () => {
    const hidden = adopt('.obsidian', null, 'directory');
    const inside = adopt('workspace.json', hidden);

    expect(resolveNode(stores, root, inside)).toBeUndefined();
  });

  it('정상 노드는 그대로 통과한다 — 관문이 전체로 번지지 않는다', () => {
    const folder = adopt('기획', null, 'directory');
    const doc = adopt('회의록.md', folder);

    expect(resolveNode(stores, root, doc)?.id).toBe(doc);
    expect(visibleChildrenOf(stores, root, { workspaceId: ws, parentId: folder }).map((c) => c.node.id)).toEqual([doc]);
  });

  it('권한이 없으면 관문을 통과해도 보이지 않는다 — 두 규칙이 함께 걸린다', () => {
    const doc = adopt('회의록.md', null);
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);

    expect(resolveNode(stores, me, doc)).toBeUndefined();

    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    expect(resolveNode(stores, me, doc)?.id).toBe(doc);
  });

  it('createNode 로 만든 정상 노드도 같은 경로를 지난다', () => {
    const created = createNode(stores, root, {
      workspaceId: ws,
      parentId: null,
      kind: 'file',
      name: '회의록.md',
    });
    const id = (created as { ok: true; id: string }).id;

    expect(resolveNode(stores, root, id)?.id).toBe(id);
  });
});

describe('삭제된 노드 ID 가 권한을 남기지 않는다', () => {
  it('지운 노드의 ACL 항목이 함께 사라진다', () => {
    const folder = adopt('기획', null, 'directory');
    const doc = adopt('회의록.md', folder);
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: folder, principalId: me.id, level: 'edit' });

    stores.nodes.remove(folder);

    // 노드가 사라졌으므로 그 앞으로 걸린 항목도 남을 이유가 없다.
    // 남으면 그 ID 가 판정에서 되살아난다.
    expect(stores.acl.entriesOn(folder)).toEqual([]);
    expect(stores.acl.entriesOn(doc), '하위 노드의 항목이 고아로 남았다').toEqual([]);
  });

  it('지운 노드 ID 로 판정하면 권한이 없다 — 워크스페이스 루트로 격상되지 않는다', () => {
    const doc = adopt('회의록.md', null);
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    stores.nodes.remove(doc);

    // 사슬이 비었다는 것만으로 워크스페이스로 읽으면, 지운 노드 ID 가
    // 상속 체인의 루트가 되어 그 앞으로 남은 항목이 그대로 살아난다.
    expect(permissionOf(stores, me, doc)).toBeNull();
  });

  it('실재하지 않는 ID 는 슈퍼유저가 아닌 누구에게도 열리지 않는다', () => {
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);

    expect(permissionOf(stores, me, 'no-such-id')).toBeNull();
    expect(resolveNode(stores, me, 'no-such-id')).toBeUndefined();
  });

  it('워크스페이스 자신은 그대로 판정된다 — 닫힘이 전체로 번지지 않는다', () => {
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'admin' });

    expect(permissionOf(stores, actorFor(stores.principals, me.id), ws)).toBe('admin');
  });
});
