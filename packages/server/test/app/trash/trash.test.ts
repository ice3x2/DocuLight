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
import {
  readDocument,
  saveDocument,
  type DocumentStores,
} from '../../../src/app/document/save-service.js';
import {
  beginEditSession,
  listVersions,
} from '../../../src/app/document/version-service.js';
import { TRASH_DIRECTORY } from '../../../src/domain/trash/trash-layout.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { documentStores, superuserActor, trashStores } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: NodeStores & TrashStores;
let docs: DocumentStores;
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
  stores = trashStores(db, docsRoot, () => now);
  docs = documentStores(db, docsRoot, () => now);
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

  it('AC-2: 볼 수도 없는 요청자에게는 없는 항목과 같은 답이 온다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    const outsider = actorFor(stores.principals, stores.principals.createUser('외부인').id);

    // 「못 고친다」로 답하면 그 차이가 「거기 그런 항목이 있다」를 알린다
    // (`SEC-ACL-006`). 휴지통은 지워진 문서의 목록이라 그 사실 자체가
    // 새 정보다.
    expect(await restoreFromTrash(stores, outsider, doc)).toEqual({
      ok: false,
      rule: 'not-in-trash',
    });

    expect(existsSync(join(docsRoot, ws, TRASH_DIRECTORY, doc, '회의록.md'))).toBe(true);
  });

  it('AC-2: 볼 수는 있으나 못 고치는 요청자에게는 거절이 정직한 답이다', async () => {
    const doc = await place(ws, '회의록.md');
    await moveToTrash(stores, root, doc);

    const viewer = stores.principals.createUser('보기만');
    grantPermission(stores, root, { nodeId: ws, principalId: viewer.id, level: 'view' });

    // 그는 그 항목이 있다는 것을 이미 알고 있으므로 숨길 것이 없다.
    expect(await restoreFromTrash(stores, actorFor(stores.principals, viewer.id), doc)).toEqual({
      ok: false,
      rule: 'forbidden',
    });

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

describe('FR-STORAGE-006 — 복구가 버전 이력을 데려온다 (AC-3)', () => {
  /**
   * AC-3 은 세 가지가 삭제 전과 같기를 요구한다 — 노드 ID · ACL · **버전 이력**.
   * 위의 「권한이 있으면 원본 경로로 돌아가고 ID·ACL 이 보존된다」 항이 앞의 둘을
   * 잰다. 셋째 축은 어느 시험도 재지 않았고 이 절이 그 자리다.
   *
   * **구조가 그렇게 생겼다는 것은 재어진 것이 아니다.** 버전은 지금
   * `.versions/<노드ID>/` 에 노드 ID 로 놓이므로(`version-layout.ts`) 문서 실체만
   * 옮기는 휴지통을 그냥 지나친다. 그러나 그 성질은 언제든 바뀔 수 있고, 바뀌면
   * 사용자는 삭제했다 되살린 문서의 이력을 통째로 잃는다 — 되살린 사람은 그것이
   * 사라진 줄도 모른다.
   */

  /** 세션을 열고 저장해 스냅샷을 하나 남긴다. 버전은 「저장 직전의 본문」이다. */
  async function 버전을쌓는다(actor: Actor, nodeId: string, bodies: readonly string[]): Promise<void> {
    for (const body of bodies) {
      const session = beginEditSession(docs, actor, nodeId);
      const before = ((await readDocument(docs, actor, nodeId)) as { ok: true; hash: string }).hash;
      await saveDocument(docs, actor, { nodeId, body, baseHash: before, session });
    }
  }

  /**
   * **이 항은 DB 인덱스 축만 잰다.** 실측으로 확인했다 — `moveToTrash` 가
   * `.versions/<노드ID>/` 를 걷어 가게 만든 탐침에서 아래 두 항은 죽었으나
   * 이 항은 그대로 초록이었다. `listVersions` 가 목록을 DB 에서 읽기
   * 때문이며, 실체 축은 다음 두 항이 소유한다.
   */
  it('AC-3: 복구 뒤에도 버전 목록이 순번까지 그대로다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(me, doc, ['# 1판\n', '# 2판\n']);

    const 삭제전 = listVersions(docs, me, doc).map((one) => one.seq);
    expect(삭제전, '전제가 서지 않았다 — 쌓인 버전이 없으면 이 항은 아무것도 재지 않는다').toHaveLength(2);

    await moveToTrash(stores, me, doc);
    expect(await restoreFromTrash(stores, me, doc)).toEqual({ ok: true, name: '회의록.md' });

    expect(listVersions(docs, me, doc).map((one) => one.seq), '복구가 버전 이력을 잃었다').toEqual(삭제전);
  });

  it('AC-3: 되살린 문서의 버전 실체가 그대로 열린다 — 목록만 남고 파일이 없으면 복원이 안 된다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(me, doc, ['# 1판\n']);

    const 삭제전본문 = await readFile(listVersions(docs, me, doc)[0]!.path, 'utf8');

    await moveToTrash(stores, me, doc);
    await restoreFromTrash(stores, me, doc);

    const 복구후 = listVersions(docs, me, doc)[0]!;
    expect(existsSync(복구후.path), '버전 목록은 남았는데 실체 파일이 없다').toBe(true);
    expect(await readFile(복구후.path, 'utf8')).toBe(삭제전본문);
  });

  it('AC-3: 휴지통에 든 동안에도 버전 실체가 지워지지 않는다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(me, doc, ['# 1판\n']);
    const 실체 = listVersions(docs, me, doc)[0]!.path;

    await moveToTrash(stores, me, doc);

    // 복구 전에 이미 사라졌다면 복구 뒤의 판정은 우연히 서 있는 것이다.
    expect(existsSync(실체), '휴지통으로 보내는 조작이 버전 실체를 걷어 갔다').toBe(true);
  });
});

describe('SEC-STORAGE-008 — 영구 삭제는 버전 이력도 함께 걷는다', () => {
  /**
   * **버전 파일은 본문 그 자체를 담는다.**
   *
   * 영구 삭제가 첨부와 벡터 인덱스를 걷는 사유는 같다 — 남으면 지운 문서의
   * 내용이 남는다. 버전은 조각도 요약도 아니라 본문 전문이라 그 사유가 더
   * 강하게 걸리는데, 소거 목록에 들어 있지 않았다.
   *
   * 휴지통으로 보내는 경로에서는 걷지 않는다. 복구가 이력을 데려와야 하기
   * 때문이며(`FR-STORAGE-006` AC-3), 그것이 이 요구의 AC-4 다.
   */

  /** 세션을 열고 저장해 스냅샷을 남긴다. */
  async function 버전을쌓는다(actor: Actor, nodeId: string, bodies: readonly string[]): Promise<void> {
    for (const body of bodies) {
      const session = beginEditSession(docs, actor, nodeId);
      const before = ((await readDocument(docs, actor, nodeId)) as { ok: true; hash: string }).hash;
      await saveDocument(docs, actor, { nodeId, body, baseHash: before, session });
    }
  }

  /** 그 문서의 버전들이 사는 디렉터리. */
  const 버전자리 = (nodeId: string) => join(docsRoot, ws, '.versions', nodeId);

  it('AC-1 · AC-2: 영구 삭제하면 버전 실체와 사이드카가 모두 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(root, doc, ['# 1판\n', '# 2판\n']);
    expect(listVersions(docs, root, doc), '전제가 서지 않았다').toHaveLength(2);
    expect(existsSync(버전자리(doc))).toBe(true);

    await moveToTrash(stores, root, doc);
    expect(await purgeFromTrash(stores, root, doc)).toEqual({ ok: true });

    expect(existsSync(버전자리(doc)), '영구 삭제한 문서의 버전이 디스크에 남았다').toBe(false);
  });

  it('AC-3: 버전 인덱스 행도 함께 사라진다', async () => {
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(root, doc, ['# 1판\n']);

    await moveToTrash(stores, root, doc);
    await purgeFromTrash(stores, root, doc);

    expect(docs.versions.listOf(doc), '인덱스에 유령이 남았다').toHaveLength(0);
  });

  it('AC-4: 휴지통으로 보내는 조작은 버전을 걷지 않는다', async () => {
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(root, doc, ['# 1판\n']);

    await moveToTrash(stores, root, doc);

    expect(existsSync(버전자리(doc)), '되돌릴 수 있는 상태에서 이력을 지웠다').toBe(true);
    expect(docs.versions.listOf(doc)).toHaveLength(1);
  });

  it('AC-5: 보존 기간 경과에 따른 자동 영구 삭제도 버전을 걷는다', async () => {
    const doc = await place(ws, '회의록.md');
    await 버전을쌓는다(root, doc, ['# 1판\n']);
    await moveToTrash(stores, root, doc);

    // 사람이 부르지 않는 경로다 — 여기가 비면 만료된 문서의 본문만 남는다.
    now = new Date('2026-10-22T09:00:00.000Z');
    expect(await sweepExpiredTrash(stores)).toEqual({ purged: 1 });

    expect(existsSync(버전자리(doc)), '자동 영구 삭제가 버전을 두고 갔다').toBe(false);
    expect(docs.versions.listOf(doc)).toHaveLength(0);
  });

  it('AC-6: 버전이 하나도 없던 노드를 영구 삭제해도 실패하지 않는다', async () => {
    const doc = await place(ws, '한번도안고침.md');
    await moveToTrash(stores, root, doc);

    expect(await purgeFromTrash(stores, root, doc)).toEqual({ ok: true });
  });

  it('다른 문서의 버전은 건드리지 않는다 — 걷는 범위가 그 노드 하나다', async () => {
    const 지울것 = await place(ws, '지울것.md');
    const 남을것 = await place(ws, '남을것.md');
    await 버전을쌓는다(root, 지울것, ['# 1판\n']);
    await 버전을쌓는다(root, 남을것, ['# 1판\n']);

    await moveToTrash(stores, root, 지울것);
    await purgeFromTrash(stores, root, 지울것);

    expect(existsSync(버전자리(남을것)), '남의 버전까지 걷어 갔다').toBe(true);
    expect(listVersions(docs, root, 남을것)).toHaveLength(1);
  });
});
