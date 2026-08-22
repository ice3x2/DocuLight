import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { moveToTrash } from '../../../src/app/trash/trash-service.js';
import { trashView, type TrashScope } from '../../../src/app/trash/trash-view.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { superuserActor, trashStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof trashStores>;
let docsRoot: string;
let root: Actor;
let plan: string;
let hr: string;
let planDoc: string;
let hrDoc: string;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 디스크에 실체가 있는 문서 — 휴지통은 파일을 옮기는 일이다. */
async function place(workspaceId: string, name: string): Promise<string> {
  const id = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));
  await mkdir(join(docsRoot, workspaceId), { recursive: true });
  await writeFile(join(docsRoot, workspaceId, stores.nodes.pathOf(id)), `# ${name}
`, 'utf8');
  return id;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-trashview-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  const files = new FsWorkspaceFiles(docsRoot);
  stores = trashStores(db, docsRoot);
  root = superuserActor(stores);

  plan = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  hr = (await createWorkspace({ workspaces: stores.workspaces, files }, '인사팀')).id;
  planDoc = await place(plan, '기획.md');
  hrDoc = await place(hr, '인사.md');

  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const view = (actor: Actor, over: Partial<{ workspaceId: string; scope: TrashScope }> = {}) =>
  trashView(stores, actor, over);

describe('FR-SHELL-007 — 휴지통은 접근 가능한 전 워크스페이스의 통합 목록이다', () => {
  it('AC-3: 두 워크스페이스의 항목이 하나의 목록에 워크스페이스 이름과 함께 나온다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'edit' });
    await moveToTrash(stores, actorFor(stores.principals, me.id), planDoc);
    await moveToTrash(stores, actorFor(stores.principals, me.id), hrDoc);

    const rows = view(actorFor(stores.principals, me.id));

    expect(rows.map((r) => r.workspaceName).sort()).toEqual(['기획팀', '인사팀']);
  });

  it('AC-4: 워크스페이스로 좁힐 수 있다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'edit' });
    await moveToTrash(stores, actorFor(stores.principals, me.id), planDoc);
    await moveToTrash(stores, actorFor(stores.principals, me.id), hrDoc);

    const rows = view(actorFor(stores.principals, me.id), { workspaceId: plan });

    expect(rows.map((r) => r.workspaceId)).toEqual([plan]);
  });

  it('AC-6: 관리 권한이 없으면 본인이 삭제한 것만 보인다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    const mine = await place(plan, '내가지운.md');
    await moveToTrash(stores, root, planDoc); // 남이 지운 것
    await moveToTrash(stores, actorFor(stores.principals, me.id), mine);

    // 본인 것이 **남고** 남의 것이 빠지는 두 방향을 함께 잰다 — 빈 목록만
    // 단언하면 목록이 통째로 죽어도 이 시험은 통과한다.
    expect(view(actorFor(stores.principals, me.id)).map((r) => r.nodeId)).toEqual([mine]);
  });

  it('AC-6: 판정은 목록 전체가 아니라 행마다 그 행의 워크스페이스를 기준으로 한다', async () => {
    // 한 사용자가 A 의 관리자이면서 B 의 편집자다. 사용자 단위로 한 번
    // 판정해 목록 전체에 적용하면 이 조항이 깨진다 — A 의 남이 지운 것까지
    // 가려지거나, B 의 남이 지운 것까지 열린다.
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'admin' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'edit' });
    const hrMine = await place(hr, '내인사.md');
    await moveToTrash(stores, root, planDoc); // A — 남이 지운 것
    await moveToTrash(stores, root, hrDoc); // B — 남이 지운 것
    await moveToTrash(stores, actorFor(stores.principals, me.id), hrMine);

    const rows = view(actorFor(stores.principals, me.id), { scope: 'all' });

    expect(rows.map((r) => r.nodeId).sort()).toEqual([planDoc, hrMine].sort());
  });

  it('AC-5: 관리자는 전체 범위로 남이 지운 것까지 본다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'admin' });
    await moveToTrash(stores, root, planDoc);

    const mine = view(actorFor(stores.principals, me.id), { scope: 'mine' });
    const all = view(actorFor(stores.principals, me.id), { scope: 'all' });

    expect(mine).toEqual([]);
    expect(all.map((r) => r.nodeId)).toEqual([planDoc]);
  });

  it('AC-5: 관리 권한이 없는 워크스페이스에서는 전체 범위를 요청해도 본인 것만 나온다', async () => {
    // 범위 토글이 권한을 대신하면 그것이 곧 우회 경로가 된다.
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    await moveToTrash(stores, root, planDoc);

    expect(view(actorFor(stores.principals, me.id), { scope: 'all' })).toEqual([]);
  });

  it('접근할 수 없는 워크스페이스의 항목은 어떤 범위로도 나오지 않는다', async () => {
    await moveToTrash(stores, root, hrDoc);

    expect(view(actorFor(stores.principals, me.id), { scope: 'all' })).toEqual([]);
  });
});

describe('SEC-SHELL-001 — 영구 삭제 버튼은 권한이 없으면 표시하지 않는다', () => {
  it('AC-1: 권한이 없는 요청자의 행에는 영구 삭제가 열리지 않는다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'edit' });
    await moveToTrash(stores, actorFor(stores.principals, me.id), planDoc);

    // 본인이 지운 것이라도 편집 권한만으로는 영구 삭제가 열리지 않는다 —
    // 영구 삭제는 되돌릴 수 없어 관리 권한을 요구한다.
    expect(view(actorFor(stores.principals, me.id)).map((r) => r.canPurge)).toEqual([false]);
  });

  it('AC-2: 권한이 있는 요청자의 행에는 영구 삭제가 열린다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'admin' });
    await moveToTrash(stores, actorFor(stores.principals, me.id), planDoc);

    expect(view(actorFor(stores.principals, me.id)).map((r) => r.canPurge)).toEqual([true]);
  });

  it('AC-3: 한 목록 안에 열린 행과 닫힌 행이 함께 나온다', async () => {
    grantPermission(stores, root, { nodeId: plan, principalId: me.id, level: 'admin' });
    grantPermission(stores, root, { nodeId: hr, principalId: me.id, level: 'edit' });
    const mine = actorFor(stores.principals, me.id);
    await moveToTrash(stores, mine, planDoc);
    await moveToTrash(stores, mine, hrDoc);

    const rows = view(actorFor(stores.principals, me.id));

    // 판정이 목록 전체가 아니라 행마다 그 행의 워크스페이스를 기준으로
    // 이뤄진다는 것이 이 요구의 내용이다.
    expect(new Map(rows.map((r) => [r.workspaceId, r.canPurge]))).toEqual(
      new Map([
        [plan, true],
        [hr, false],
      ]),
    );
  });

  it('슈퍼유저에게는 열린다 — 우회가 이 판정에도 적용된다', async () => {
    await moveToTrash(stores, root, planDoc);

    expect(view(root, { scope: 'all' }).map((r) => r.canPurge)).toEqual([true]);
  });
});
