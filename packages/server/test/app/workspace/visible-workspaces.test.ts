import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, visibleWorkspacesOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode, type NodeStores } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: NodeStores;
let root: Actor;
let me: Actor;
let plan: string;
let hr: string;
let secret: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-wslist-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  const files = new FsWorkspaceFiles(docsRoot);
  plan = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  hr = (await createWorkspace({ workspaces: stores.workspaces, files }, '인사팀')).id;
  secret = (await createWorkspace({ workspaces: stores.workspaces, files }, '비밀')).id;
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-WORKSPACE-003 — 접근 가능한 워크스페이스를 나란히 표시한다', () => {
  it('AC-1: 둘 이상에 권한이 있으면 둘 다 최상위로 나온다', () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'view' });

    const listed = visibleWorkspacesOf(stores, actorFor(stores.principals, me.id));

    expect(listed.map((w) => w.workspace.id).sort()).toEqual([plan, hr].sort());
  });

  it('AC-4: 권한 없는 워크스페이스는 나오지 않는다', () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'view' });

    const listed = visibleWorkspacesOf(stores, actorFor(stores.principals, me.id));

    expect(listed.map((w) => w.workspace.id)).toEqual([plan]);
    expect(listed.map((w) => w.workspace.id)).not.toContain(secret);
  });

  it('AC-1: 하위에만 권한이 있어도 그 워크스페이스가 pass-through 로 나온다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: hr, parentId: null, kind: 'file', name: '급여.md' }));
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    const listed = visibleWorkspacesOf(stores, actorFor(stores.principals, me.id));

    // 워크스페이스 자체에는 권한이 없지만 그 안에 닿을 문서가 있다 —
    // 나오지 않으면 권한은 있는데 열 길이 없는 상태가 된다.
    expect(listed.map((w) => w.workspace.id)).toEqual([hr]);
    expect(listed[0]?.visibility).toBe('pass-through');
  });

  it('AC-3: 전환 UI 를 위한 「현재 워크스페이스」 개념이 반환값에 없다', () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'edit' });

    const listed = visibleWorkspacesOf(stores, actorFor(stores.principals, me.id));

    // 하나를 고른 상태를 담는 칸이 있으면 화면이 그것을 전환 UI 로 그린다.
    for (const entry of listed) {
      expect(Object.keys(entry).sort()).toEqual(['visibility', 'workspace']);
    }
  });

  it('슈퍼유저에게는 전부 나온다 — 우회가 이 목록에도 적용된다', () => {
    expect(visibleWorkspacesOf(stores, root).map((w) => w.workspace.id).sort()).toEqual(
      [plan, hr, secret].sort(),
    );
  });

  it('default 그룹 권한으로도 나온다 — 소속이 불변식이라 멤버십 행이 없어도 걸린다', () => {
    grantPermission(stores, root, { nodeId: plan, principalId: DEFAULT_GROUP_ID, level: 'view' });

    expect(visibleWorkspacesOf(stores, actorFor(stores.principals, me.id)).map((w) => w.workspace.id)).toEqual([plan]);
  });

  it('아무 권한도 없으면 빈 목록이다 — 빈 상태 안내의 조건이 이것이다', () => {
    expect(visibleWorkspacesOf(stores, actorFor(stores.principals, me.id))).toEqual([]);
  });
});
