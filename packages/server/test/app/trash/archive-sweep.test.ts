import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNode } from '../../../src/app/node/node-service.js';
import { moveToTrash, sweepExpiredTrash } from '../../../src/app/trash/trash-service.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { ARCHIVE_DIRECTORY, archivePathOf } from '../../../src/domain/workspace/archive.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { superuserActor, trashStores } from '../../support/acl-fixture.js';
import type { Actor } from '../../../src/app/acl/permission-service.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof trashStores>;
let root: Actor;
let ws: string;
let now: Date;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-archive-sweep-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T00:00:00.000Z');
  stores = trashStores(db, docsRoot, () => now);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-STORAGE-007 — 보존 기간은 휴지통에만 걸린다', () => {
  it('AC-5: 아카이브된 워크스페이스는 기간이 지나도 정리되지 않는다', async () => {
    // 휴지통에 든 문서 하나 — 이것은 기간이 지나면 사라져야 한다.
    const doomed = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '옛문서.md' }));
    await writeFile(join(docsRoot, ws, stores.nodes.pathOf(doomed)), '# 옛\n', 'utf8');
    await moveToTrash(stores, root, doomed);

    // 아카이브 자리에 놓인 워크스페이스 — 지우기로 한 것이 아니라 치워
    // 둔 것이라 같은 시계를 적용하면 보관하려던 것이 기간만으로 사라진다.
    const archived = archivePathOf(docsRoot, 'ws-old');
    await mkdir(archived, { recursive: true });
    await writeFile(join(archived, '보관.md'), '# 보관\n', 'utf8');

    writeSetting(stores.settings, 'trash-retention-days', '1');
    now = new Date('2026-09-30T00:00:00.000Z');

    const swept = await sweepExpiredTrash(stores);

    expect(swept.purged).toBe(1);
    expect(await readdir(archived)).toEqual(['보관.md']);
    expect(await readdir(join(docsRoot, ARCHIVE_DIRECTORY))).toEqual(['ws-old']);
  });
});
