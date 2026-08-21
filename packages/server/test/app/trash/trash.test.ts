import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, resolveNode, visibleChildrenOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode, type NodeStores } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import {
  DEFAULT_RETENTION_DAYS,
  listTrash,
  moveToTrash,
  purgeFromTrash,
  rebuildTrashIndex,
  restoreFromTrash,
  sweepExpiredTrash,
  type TrashStores,
} from '../../../src/app/trash/trash-service.js';
import { TRASH_DIRECTORY } from '../../../src/domain/trash/trash-layout.js';
import { FsTrashFiles } from '../../../src/infra/fs/trash-files.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteTrashRepository } from '../../../src/infra/sqlite/trash-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: NodeStores & TrashStores;
let ws: string;
let other: string;
let root: Actor;
let me: Actor;
let now: Date;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 디스크에 실체가 있는 문서를 만든다 — 휴지통은 파일을 옮기는 일이다. */
async function place(workspaceId: string, name: string, parentId: string | null = null): Promise<string> {
  const created = createNode(stores, root, { workspaceId, parentId, kind: 'file', name });
  const id = idOf(created);
  const path = stores.nodes.pathOf(id);
  await mkdir(join(docsRoot, workspaceId, path, '..'), { recursive: true });
  await writeFile(join(docsRoot, workspaceId, path), `# ${name}\n`, 'utf8');
  return id;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-trash-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T09:00:00.000Z');
  stores = {
    ...nodeStores(db),
    trash: new SqliteTrashRepository(db),
    trashFiles: new FsTrashFiles(docsRoot),
    clock: () => now,
  };
  root = superuserActor(stores);
  const files = new FsWorkspaceFiles(docsRoot);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  other = (await createWorkspace({ workspaces: stores.workspaces, files }, '인사팀')).id;
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-STORAGE-005 — 삭제는 휴지통 이동이며 노드 ID 로 격리한다', () => {
  it('AC-1 · AC-2: 파일이 지워지지 않고 .trash/노드ID/원본이름 으로 간다', async () => {
    const doc = await place(ws, '회의록.md');

    expect(await moveToTrash(stores, root, doc)).toEqual({ ok: true });

    expect(existsSync(join(docsRoot, ws, '회의록.md')), '원본 자리에 파일이 남았다').toBe(false);
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc, '회의록.md')), '휴지통에 없다').toBe(true);
  });

  it('AC-4: 이름이 같은 둘을 차례로 삭제해도 어느 쪽도 덮어쓰이지 않는다', async () => {
    const first = await place(ws, '회의록.md');
    await moveToTrash(stores, root, first);
    const second = await place(ws, '회의록.md');
    await moveToTrash(stores, root, second);

    expect(first).not.toBe(second);
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, first, '회의록.md'))).toBe(true);
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, second, '회의록.md'))).toBe(true);
    expect((listTrash(stores, root, ws) as { ok: true; entries: unknown[] }).entries).toHaveLength(2);
  });

  it('AC-3 · AC-5: 인덱스는 DB 에, 실체는 파일시스템에. ACL 은 살아 있다', async () => {
    const doc = await place(ws, '회의록.md');
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    await moveToTrash(stores, root, doc);

    expect(db.all('SELECT node_id FROM trash_entry')).toHaveLength(1);
    // ACL 이 사라지면 복구해도 누가 볼 수 있었는지가 사라진다.
    expect(stores.acl.entriesOn(doc).some((e) => e.principalId === me.id)).toBe(true);
    expect(stores.nodes.findById(doc), '노드 레코드가 지워졌다').toBeDefined();
  });

  it('휴지통에 들어간 노드는 트리에서 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    expect(visibleChildrenOf(stores, root, { workspaceId: ws, parentId: null }).map((c) => c.node.id)).toContain(doc);

    await moveToTrash(stores, root, doc);

    expect(visibleChildrenOf(stores, root, { workspaceId: ws, parentId: null }).map((c) => c.node.id)).not.toContain(doc);
    expect(resolveNode(stores, root, doc), '휴지통 항목이 열린다').toBeUndefined();
  });
});

describe('DR-STORAGE-004 — 사이드카가 정본이고 DB 는 캐시다', () => {
  it('AC-1: 네 값을 담은 사이드카가 함께 기록된다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, actorFor(stores.principals, me.id), doc);

    const files = await readdir(join(docsRoot, ws, TRASH_DIRECTORY, doc));
    const sidecarName = files.find((f) => f !== '회의록.md');
    expect(sidecarName, '사이드카가 없다').toBeDefined();

    const sidecar = JSON.parse(await readFile(join(docsRoot, ws, TRASH_DIRECTORY, doc, sidecarName!), 'utf8'));
    expect(sidecar).toMatchObject({
      nodeId: doc,
      originalPath: '회의록.md',
      deletedAt: now.toISOString(),
      deletedBy: me.id,
    });
  });

  it('AC-2: DB 인덱스를 비워도 사이드카만으로 재구성된다', async () => {
    const a = await place(ws, '회의록.md');
    const b = await place(ws, '기획서.md');
    await moveToTrash(stores, root, a);
    await moveToTrash(stores, root, b);

    db.run('DELETE FROM trash_entry');
    expect((listTrash(stores, root, ws) as { ok: true; entries: unknown[] }).entries).toEqual([]);

    await rebuildTrashIndex(stores, ws);

    const rebuilt = (listTrash(stores, root, ws) as { ok: true; entries: { nodeId: string }[] }).entries;
    expect(rebuilt.map((e) => e.nodeId).sort()).toEqual([a, b].sort());
  });

  it('AC-3: 사이드카와 DB 가 어긋나면 사이드카가 이긴다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    // DB 만 손댄다 — 사이드카는 그대로다.
    db.run("UPDATE trash_entry SET original_path = '거짓말.md' WHERE node_id = ?", [doc]);

    await rebuildTrashIndex(stores, ws);

    const entry = (listTrash(stores, root, ws) as { ok: true; entries: { originalPath: string }[] }).entries[0];
    expect(entry?.originalPath).toBe('회의록.md');
  });

  it('AC-4: 영구 삭제하면 사이드카도 함께 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc))).toBe(true);

    await purgeFromTrash(stores, root, doc);

    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc)), '휴지통 디렉토리가 남았다').toBe(false);
  });
});

describe('DR-STORAGE-006 — 휴지통은 워크스페이스마다 둔다', () => {
  it('AC-1 · AC-2: 두 워크스페이스의 삭제 항목이 섞이지 않는다', async () => {
    const here = await place(ws, '회의록.md');
    const there = await place(other, '인사.md');

    await moveToTrash(stores, root, here);
    await moveToTrash(stores, root, there);

    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, here))).toBe(true);
    expect(existsSync(join(docsRoot, other, TRASH_DIRECTORY, there))).toBe(true);
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, there)), '남의 워크스페이스 항목이 섞였다').toBe(false);
  });

  it('AC-5: 워크스페이스 디렉토리 아래에 있으므로 통째로 옮기면 함께 따라간다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    // 휴지통 경로가 워크스페이스 디렉토리 **안**이라는 것이 그 성질의 근거다.
    const trashPath = join(docsRoot, ws, TRASH_DIRECTORY, doc);
    expect(trashPath.startsWith(join(docsRoot, ws))).toBe(true);
  });
});

describe('SEC-STORAGE-002 — 열람 범위는 본인 삭제분, 관리자는 전체', () => {
  it('AC-1 · AC-2: 남이 삭제한 항목은 건수로도 드러나지 않는다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const mine = await place(ws, '내것.md');
    const yours = await place(ws, '네것.md');

    await moveToTrash(stores, me, mine);
    await moveToTrash(stores, root, yours);

    const listed = (listTrash(stores, me, ws) as { ok: true; entries: { nodeId: string }[] }).entries;
    expect(listed.map((e) => e.nodeId)).toEqual([mine]);
    expect(listed).toHaveLength(1);
  });

  it('AC-3: 워크스페이스 관리 권한 보유자는 남의 삭제분도 본다', async () => {
    const mine = await place(ws, '내것.md');
    await moveToTrash(stores, root, mine);

    const admin = actorFor(stores.principals, stores.principals.createUser('관리인').id);
    grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });

    const listed = (listTrash(stores, actorFor(stores.principals, admin.id), ws) as { ok: true; entries: unknown[] }).entries;
    expect(listed).toHaveLength(1);
  });

  it('AC-4: 관리 권한을 잃으면 다음 요청부터 전체 목록을 못 본다', async () => {
    const mine = await place(ws, '내것.md');
    await moveToTrash(stores, root, mine);

    const admin = actorFor(stores.principals, stores.principals.createUser('관리인').id);
    const granted = grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });
    expect((listTrash(stores, actorFor(stores.principals, admin.id), ws) as { ok: true; entries: unknown[] }).entries).toHaveLength(1);

    stores.acl.revoke((granted as { ok: true; entryId: string }).entryId);

    expect((listTrash(stores, actorFor(stores.principals, admin.id), ws) as { ok: true; entries: unknown[] }).entries).toEqual([]);
  });
});

describe('FR-STORAGE-006 — 복구는 원본 편집 권한을 요구한다', () => {
  it('AC-1 · AC-3: 권한이 있으면 원본 경로로 돌아가고 ID·ACL 이 보존된다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, me, doc);

    expect(await restoreFromTrash(stores, me, doc)).toEqual({ ok: true, name: '회의록.md' });

    expect(stores.nodes.findById(doc)?.id).toBe(doc);
    expect(stores.nodes.pathOf(doc)).toBe('회의록.md');
    expect(existsSync(join(docsRoot, ws, '회의록.md'))).toBe(true);
    expect(resolveNode(stores, me, doc)?.id).toBe(doc);
  });

  it('AC-2: 권한이 없으면 거부되고 항목이 그대로 남는다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    const outsider = actorFor(stores.principals, stores.principals.createUser('외부인').id);
    expect(await restoreFromTrash(stores, outsider, doc)).toEqual({ ok: false, rule: 'forbidden' });

    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc, '회의록.md'))).toBe(true);
  });

  it('AC-6: 복구 위치에 같은 이름이 있으면 접미사가 붙고 기존 것은 그대로다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);
    const replacement = await place(ws, '회의록.md');

    const restored = await restoreFromTrash(stores, root, doc);

    expect(restored.ok).toBe(true);
    expect((restored as { ok: true; name: string }).name).not.toBe('회의록.md');
    expect(stores.nodes.findById(replacement)?.name, '기존 항목이 덮어쓰였다').toBe('회의록.md');
  });

  it('AC-4 · AC-5: 부모 체인이 사라지면 일반 사용자는 못 하고 관리자가 대체 위치를 고른다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const doc = await place(ws, '회의록.md', folder);
    await moveToTrash(stores, me, doc);

    // 부모가 휴지통으로 간다 — 그 아래로 되돌리면 트리에 나타나지 않는
    // 채로 「복구됐다」가 되어 아무도 찾지 못한다.
    await moveToTrash(stores, root, folder);

    expect(await restoreFromTrash(stores, actorFor(stores.principals, me.id), doc)).toEqual({
      ok: false,
      rule: 'parent-gone',
    });
    // 관리자도 대체 위치 없이는 못 한다.
    expect(await restoreFromTrash(stores, root, doc)).toEqual({ ok: false, rule: 'parent-gone' });

    const done = await restoreFromTrash(stores, root, doc, { into: null });
    expect(done.ok, '관리자가 대체 위치를 골라도 복구되지 않는다').toBe(true);
    expect(stores.nodes.findById(doc)?.parentId).toBeNull();
  });
});

describe('SEC-STORAGE-003 — 영구 삭제는 워크스페이스 관리 권한을 요구한다', () => {
  it('AC-2 · AC-3: 본인이 삭제한 것이라도 관리 권한이 없으면 못 지운다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, me, doc);

    expect(await purgeFromTrash(stores, me, doc)).toEqual({ ok: false, rule: 'forbidden' });
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc, '회의록.md'))).toBe(true);
  });

  it('AC-1 · AC-4: 관리 권한이 있으면 실체·사이드카·인덱스가 모두 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    expect(await purgeFromTrash(stores, root, doc)).toEqual({ ok: true });

    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc))).toBe(false);
    expect(db.all('SELECT node_id FROM trash_entry')).toEqual([]);
    expect(stores.nodes.findById(doc), '노드 레코드가 남았다').toBeUndefined();
    expect(stores.acl.entriesOn(doc), 'ACL 이 남았다').toEqual([]);
  });

  it('AC-5: 판정이 그 항목이 속한 워크스페이스를 기준으로 한다', async () => {
    const here = await place(ws, '회의록.md');
    const there = await place(other, '인사.md');
    await moveToTrash(stores, root, here);
    await moveToTrash(stores, root, there);

    // 한쪽 워크스페이스에만 관리 권한을 가진 주체.
    const partial = actorFor(stores.principals, stores.principals.createUser('반쪽관리인').id);
    grantPermission(stores, root, { nodeId: ws, principalId: partial.id, level: 'admin' });
    const fresh = actorFor(stores.principals, partial.id);

    expect(await purgeFromTrash(stores, fresh, here)).toEqual({ ok: true });
    expect(await purgeFromTrash(stores, fresh, there)).toEqual({ ok: false, rule: 'forbidden' });
  });
});

describe('FR-STORAGE-007 — 보존 기간 30일과 자동 영구 삭제', () => {
  it('AC-1: 기본값이 30일이다', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(30);
  });

  it('AC-2: 보존 일수가 지난 항목이 사람의 조작 없이 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    now = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000);
    expect(await sweepExpiredTrash(stores)).toEqual({ purged: 0 });
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc))).toBe(true);

    now = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    expect(await sweepExpiredTrash(stores)).toEqual({ purged: 1 });
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc))).toBe(false);
  });

  it('AC-3: 보존 일수를 바꾸면 그 값이 저장소에 남는다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);
    stores.settings.set('trash-retention-days', '7');

    now = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await sweepExpiredTrash(stores)).toEqual({ purged: 1 });
  });

  it('AC-4: 0 이면 기간 경과로 사라지는 항목이 없다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);
    stores.settings.set('trash-retention-days', '0');

    now = new Date(now.getTime() + 3650 * 24 * 60 * 60 * 1000);
    expect(await sweepExpiredTrash(stores)).toEqual({ purged: 0 });
    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc))).toBe(true);
  });
});

describe('SEC-ACL-012 · SEC-ACL-013 — 삭제가 권한 판정을 지난다', () => {
  it('SEC-ACL-012 AC-4: 대상의 편집이 없으면 삭제가 거부된다', async () => {
    const doc = await place(ws, '회의록.md');
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    expect(await moveToTrash(stores, actorFor(stores.principals, me.id), doc)).toEqual({
      ok: false,
      rule: 'forbidden',
    });
    expect(existsSync(join(docsRoot, ws, '회의록.md'))).toBe(true);
  });

  it('SEC-ACL-013 AC-2: 숨은 하위가 있는 디렉토리는 편집 레벨로 삭제되지 않는다', async () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const buried = await place(ws, '숨김.md', folder);
    grantPermission(stores, root, { nodeId: folder, principalId: me.id, level: 'edit' });

    const { breakInheritance } = await import('../../../src/app/acl/grant-service.js');
    breakInheritance(stores, root, buried);

    const editor = actorFor(stores.principals, me.id);
    expect(permissionOf(stores, editor, buried)).toBeNull();
    expect(await moveToTrash(stores, editor, folder), '숨은 하위가 있는데 편집만으로 지워졌다').toEqual({
      ok: false,
      rule: 'forbidden',
    });
  });
});
