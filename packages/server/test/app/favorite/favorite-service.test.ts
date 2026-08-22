import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission, revokePermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import {
  addFavorite,
  listFavorites,
  removeFavorite,
} from '../../../src/app/favorite/favorite-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteFavoriteRepository } from '../../../src/infra/sqlite/favorite-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { favorites: SqliteFavoriteRepository };
let root: Actor;
let me: Actor;
let ws: string;
let doc: string;
let folder: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-fav-'));
  docsRoot = join(dir, 'docs');
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, docsRoot), favorites: new SqliteFavoriteRepository(db) };
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
  folder = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }),
  );
  doc = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: '주간.md' }),
  );
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('즐겨찾기 (`FR-SHELL-001` AC-3 · AC-4)', () => {
  it('문서를 더하면 목록에 그 문서가 나타난다', () => {
    expect(addFavorite(stores, root, doc)).toEqual({ ok: true });

    expect(listFavorites(stores, root)).toEqual([
      { nodeId: doc, name: '주간.md', kind: 'file', workspaceName: '기획팀' },
    ]);
  });

  it('디렉토리를 더하면 목록에 그 디렉토리가 나타난다', () => {
    expect(addFavorite(stores, root, folder)).toEqual({ ok: true });

    expect(listFavorites(stores, root)).toEqual([
      { nodeId: folder, name: '회의', kind: 'directory', workspaceName: '기획팀' },
    ]);
  });

  it('더한 것을 뺄 수 있다', () => {
    addFavorite(stores, root, doc);
    removeFavorite(stores, root, doc);

    expect(listFavorites(stores, root)).toEqual([]);
  });

  it('같은 것을 두 번 더해도 한 줄이다 — 두 줄이면 지울 때 하나가 남는다', () => {
    addFavorite(stores, root, doc);
    addFavorite(stores, root, doc);

    expect(listFavorites(stores, root)).toHaveLength(1);
  });

  it('목록은 사람마다 따로다 — 남의 즐겨찾기가 내 목록에 오면 그 문서의 존재가 새어 나간다', () => {
    addFavorite(stores, root, doc);

    expect(listFavorites(stores, me)).toEqual([]);
  });

  it('볼 수 없는 노드는 더할 수 없다', () => {
    expect(addFavorite(stores, me, doc)).toEqual({ ok: false, rule: 'unknown-node' });
  });

  it('권한을 잃으면 목록에서도 사라진다 — 더할 때의 판정만으로는 이름이 남는다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'view' });
    const mine = actorFor(stores.principals, me.id);
    addFavorite(stores, mine, doc);
    expect(listFavorites(stores, mine)).toHaveLength(1);

    for (const entry of stores.acl.entriesOn(ws)) revokePermission(stores, root, entry.id);

    expect(listFavorites(stores, mine)).toEqual([]);
  });
});
