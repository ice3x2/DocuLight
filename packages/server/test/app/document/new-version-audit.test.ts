import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { NEW_VERSION, uploadNewVersion } from '../../../src/app/document/new-version.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import type { DocumentStores } from '../../../src/app/document/save-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { documentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: DocumentStores & { auditLog: SqliteAuditLog };
let root: Actor;
let ws: string;
let 문서: string;
let 바이너리: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));
const 판올림행 = () => stores.auditLog.inScope([ws]).filter((row) => row.operation === NEW_VERSION);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-newver-audit-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...documentStores(db, docsRoot), auditLog: new SqliteAuditLog(db) };
  root = superuserActor(stores);
  ws = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;

  문서 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(문서), '# 이전 본문\n', 'utf8');
  바이너리 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.zip' }));
  await writeFile(fileOf(바이너리), 'old-binary', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OBS-AUDIT-004 · OBS-AUDIT-005 — 바이너리 새 버전만 기록한다', () => {
  it('`OBS-AUDIT-004` AC-1: md 새 버전은 감사 행을 남기지 않는다', async () => {
    // 버전 이력이 행위자와 시각을 영구히 재현하므로 제외된다.
    expect(await uploadNewVersion(stores, root, { nodeId: 문서, bytes: Buffer.from('# 새 본문\n') })).toEqual(
      { ok: true },
    );

    expect(판올림행()).toHaveLength(0);
  });

  it('`OBS-AUDIT-004` AC-2 · `OBS-AUDIT-005` AC-7: 바이너리 새 버전은 감사 행을 남긴다', async () => {
    expect(
      await uploadNewVersion(stores, root, { nodeId: 바이너리, bytes: Buffer.from('new-binary') }),
    ).toEqual({ ok: true });

    // 버전 대상이 md 로 한정돼 있어 재현 수단이 없다 — 여기서 남기지
    // 않으면 그 덮어쓰기는 어디에도 흔적이 없다.
    expect(판올림행()).toEqual([
      expect.objectContaining({ operation: NEW_VERSION, actor: root.id, nodeId: 바이너리 }),
    ]);
  });

  it('`OBS-AUDIT-005` AC-7: 올린 사람이 행위자로 남는다', async () => {
    const 한범 = stores.principals.createUser('한범');
    grantPermission(stores, root, { nodeId: 바이너리, principalId: 한범.id, level: 'edit' });

    await uploadNewVersion(stores, actorFor(stores.principals, 한범.id), {
      nodeId: 바이너리,
      bytes: Buffer.from('new-binary'),
    });

    expect(판올림행().map((row) => row.actor)).toEqual([한범.id]);
  });

  it('거절된 새 버전은 감사 행을 남기지 않는다', async () => {
    const 구경꾼 = stores.principals.createUser('구경꾼');

    const 결과 = await uploadNewVersion(stores, actorFor(stores.principals, 구경꾼.id), {
      nodeId: 바이너리,
      bytes: Buffer.from('new-binary'),
    });

    expect(결과.ok).toBe(false);
    expect(판올림행()).toHaveLength(0);
  });

  it('올릴 때마다 남는다 — 한 번만 남기면 두 번째 덮어쓰기가 흔적 없이 지나간다', async () => {
    await uploadNewVersion(stores, root, { nodeId: 바이너리, bytes: Buffer.from('a') });
    await uploadNewVersion(stores, root, { nodeId: 바이너리, bytes: Buffer.from('b') });

    expect(판올림행()).toHaveLength(2);
  });
});
