import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { moveToTrash, purgeFromTrash, sweepExpiredTrash } from '../../../src/app/trash/trash-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { SYSTEM_RETENTION } from '../../../src/domain/principal/system-principals.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { trashStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof trashStores>;
let audit: SqliteAuditLog;
let root: Actor;
let ws: string;
let doc: string;
let now: Date;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-purge-audit-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-23T00:00:00.000Z');
  stores = trashStores(db, docsRoot, () => now);
  audit = new SqliteAuditLog(db);
  root = superuserActor(stores);
  ws = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(doc)), '# 처음\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const purgeRows = () => audit.inScope([ws], { includeInstance: true }).filter((row) => row.operation === 'node.purge');

describe('OBS-AUDIT-001 AC-2 — 영구 삭제가 감사 행을 남긴다', () => {
  it('사람이 실행한 영구 삭제는 그 사람이 행위자다', async () => {
    await moveToTrash(stores, root, doc);
    await purgeFromTrash(stores, root, doc);

    expect(purgeRows()).toHaveLength(1);
    expect(purgeRows()[0]).toMatchObject({ actor: root.id, nodeId: doc, workspaceId: ws });
  });

  it('거절된 영구 삭제는 행을 남기지 않는다 — 남기면 감사가 시도와 실행을 구별하지 못한다', async () => {
    const 구경꾼 = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);
    await moveToTrash(stores, root, doc);

    const 결과 = await purgeFromTrash(stores, 구경꾼, doc);

    // 거절 자체를 먼저 잰다 — 반환값을 버리면 「거절되어 행이 없다」와
    // 「삭제에는 성공했는데 기록만 빠졌다」가 같은 결과로 읽힌다.
    expect(결과.ok).toBe(false);
    expect(purgeRows()).toHaveLength(0);
  });
});

describe('DR-AUDIT-001 AC-2 — 보존 만료가 일으킨 영구 삭제의 행위자', () => {
  it('예약 주체 system:retention 이 행위자다', async () => {
    writeSetting(stores.settings, 'trash-retention-days', '1');
    await moveToTrash(stores, root, doc);
    // 보존 기간을 넘긴다.
    now = new Date('2026-09-23T00:00:00.000Z');

    const { purged } = await sweepExpiredTrash(stores);

    expect(purged).toBe(1);
    expect(purgeRows()).toHaveLength(1);
    // 사람의 조작이 아니므로 사람 ID 를 쓸 수 없고, 비워 두면 「누가 지웠나」가
    // 사라진다. 하위체계 이름이 그 자리를 채운다.
    expect(purgeRows()[0]).toMatchObject({ actor: SYSTEM_RETENTION, nodeId: doc, workspaceId: ws });
  });

  it('만료되지 않은 항목은 지워지지도 기록되지도 않는다', async () => {
    writeSetting(stores.settings, 'trash-retention-days', '30');
    await moveToTrash(stores, root, doc);

    expect((await sweepExpiredTrash(stores)).purged).toBe(0);
    expect(purgeRows()).toHaveLength(0);
  });
});
