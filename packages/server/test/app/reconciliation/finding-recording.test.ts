import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcile } from '../../../src/app/reconciliation/reconcile.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { reconcileWorkspaceSidecars } from '../../../src/app/workspace/restore-from-sidecar.js';
import { QUARANTINE_DIRECTORY } from '../../../src/app/workspace/quarantine-duplicate-sidecar.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let docsRoot: string;
let db: Database;
let documents: FsDocumentStore;
let nodes: SqliteNodeRepository;
let workspaces: SqliteWorkspaceRepository;
let files: FsWorkspaceFiles;
let queue: SqliteFindingQueue;
let audit: SqliteAuditLog;
let stores: Parameters<typeof reconcile>[0];
let wsStores: Parameters<typeof reconcileWorkspaceSidecars>[0];
let ws: string;

const auditRows = () =>
  db.all<{ id: string; operation: string; node_id: string | null; workspace_id: string | null }>(
    'SELECT id, operation, node_id, workspace_id FROM audit_log ORDER BY rowid',
  );

const findingCount = () => db.all('SELECT id FROM reconciliation_finding').length;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-finding-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));

  documents = new FsDocumentStore(docsRoot);
  nodes = new SqliteNodeRepository(db);
  workspaces = new SqliteWorkspaceRepository(db);
  files = new FsWorkspaceFiles(docsRoot);
  queue = new SqliteFindingQueue(db);
  audit = new SqliteAuditLog(db);

  stores = { nodes, workspaces, documents, audit, queue };
  wsStores = { workspaces, files, audit, queue };

  ws = (await createWorkspace(wsStores, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-001 · DR-WORKSPACE-002 — 발견은 감사 1행 + 대기열 1건이다', () => {
  it('REL-AUDIT-001 AC-6 — 서버 정지 중 파일을 이동한 뒤 기동하면 재조정이 만든 신규 노드가 audit_log 에 생성 1행을 남기고 대기열에 그 행을 가리키는 항목 1건이 생긴다.', async () => {
    await documents.write(ws, '기획/회의록.md', '# 본문');
    await reconcile(stores);

    const before = auditRows().length;
    const moved = nodes.allIn(ws).find((n) => n.name === '회의록.md')!;

    // 서버가 멈춘 사이에 누군가 파일을 옮긴다.
    await documents.write(ws, '보관/회의록.md', '# 본문');
    await rm(join(docsRoot, ws, '기획/회의록.md'));

    await reconcile(stores);

    const added = auditRows().slice(before);
    const created = added.filter((r) => r.operation === 'create');
    const orphaned = added.filter((r) => r.operation === 'orphan');

    // 신규 노드 하나에 생성 1행. 중간 디렉토리 `보관` 도 하나 서므로
    // 생성 행은 둘이고, 그중 파일 노드를 가리키는 것이 1행이다.
    const newFile = nodes.allIn(ws).find((n) => n.name === '회의록.md' && n.orphanedAt === null)!;
    expect(created.filter((r) => r.node_id === newFile.id)).toHaveLength(1);

    // 옮겨 온 쪽은 tombstone 이 되고 그 사실도 1행이다.
    expect(orphaned.filter((r) => r.node_id === moved.id)).toHaveLength(1);

    // 각 행을 가리키는 대기열 항목이 정확히 1건씩이다.
    const referencing = (auditId: string) =>
      queue.unresolved().filter((f) => queue.auditRefsOf(f.id).includes(auditId));
    for (const row of [...created, ...orphaned]) {
      expect(referencing(row.id), `감사 행 ${row.id} 를 가리키는 항목`).toHaveLength(1);
    }
  });

  it('REL-AUDIT-001 AC-7 — 같은 사실이 audit_log 와 대기열에 두 번 적히지 않는다.', async () => {
    await documents.write(ws, '회의록.md', '# 본문');
    await reconcile(stores);

    const auditAfterFirst = auditRows().length;
    const findingsAfterFirst = findingCount();
    expect(auditAfterFirst).toBeGreaterThan(0);
    expect(findingsAfterFirst).toBe(auditAfterFirst);

    // 같은 상태에서 다시 돌면 아무것도 늘지 않는다. 늘면 같은 사실이
    // 회차마다 다시 적히는 것이고, 그 대기열은 사람이 볼 수 없게 된다.
    await reconcile(stores);
    await reconcile(stores);
    expect(auditRows().length).toBe(auditAfterFirst);
    expect(findingCount()).toBe(findingsAfterFirst);

    // 대기열은 사실을 **참조**만 한다 — 자기 칸에 복제하지 않는다.
    const queueColumns = db
      .all<{ name: string }>('PRAGMA table_info(reconciliation_finding)')
      .map((c) => c.name);
    expect(queueColumns.filter((c) => /occurred|actor|node_id|workspace_id/.test(c))).toEqual([]);
  });

  it('DR-WORKSPACE-002 AC-5 — 스캔 중 이미 등록된 `id` 를 가진 `.workspace.json` 을 또 발견하면 나중 것을 격리하고 DB 에 이중 등록하지 않는다.', async () => {
    // `cp -r` 백업 사본이 docsRoot 안에 그대로 남은 상황.
    await cp(join(docsRoot, ws), join(docsRoot, `${ws}-backup`), { recursive: true });

    const result = await reconcileWorkspaceSidecars(wsStores);

    // 이중 등록되지 않는다.
    expect(workspaces.list().map((w) => w.id)).toEqual([ws]);
    expect(result.quarantined).toEqual([`${ws}-backup`]);

    // 자기 자리에 있는 원본은 그대로다.
    expect(await readdir(docsRoot)).toContain(ws);
    // 사본은 격리 자리로 옮겨졌고 docsRoot 최상위에서 사라졌다.
    expect(await readdir(docsRoot)).not.toContain(`${ws}-backup`);
    expect(await readdir(join(docsRoot, QUARANTINE_DIRECTORY))).toContain(`${ws}-backup`);

    // 다시 돌려도 같은 사실이 또 쌓이지 않는다 — 격리 자리는 점으로
    // 시작하므로 스캔 대상이 아니다.
    const again = await reconcileWorkspaceSidecars(wsStores);
    expect(again.quarantined).toEqual([]);
  });

  it('DR-WORKSPACE-002 AC-6 — 그 격리 사실이 재조정 대기열에 기재된다.', async () => {
    await cp(join(docsRoot, ws), join(docsRoot, `${ws}-backup`), { recursive: true });

    await reconcileWorkspaceSidecars(wsStores);

    const unresolved = queue.unresolved();
    expect(unresolved).toHaveLength(1);

    // 격리 사실도 감사 행이 먼저고 대기열이 그것을 참조한다. 참조가
    // 비면 시각·행위자의 유일한 출처가 사라진다(`R139`).
    const refs = queue.auditRefsOf(unresolved[0]!.id);
    expect(refs).toHaveLength(1);

    const row = auditRows().find((r) => r.id === refs[0]);
    expect(row?.operation).toBe('quarantine');
    // 대상이 노드가 아니라 워크스페이스다 — 노드 칸에 워크스페이스를
    // 넣으면 같은 칸이 두 사실을 담는다.
    expect(row?.node_id).toBeNull();
    expect(row?.workspace_id).toBe(ws);
  });

  it('DR-WORKSPACE-002 — 자기 자리에 있지 않은 사이드카는 복원하지 않고 격리한다.', async () => {
    // 디렉토리명이 곧 ID 라는 것이 물리 레이아웃의 불변식이다(`R40-a`).
    // 어긋난 것을 그대로 복원하면 DB 는 있는데 그 경로에는 아무것도 없는
    // 워크스페이스가 생긴다.
    const stray = (await createWorkspace(wsStores, '떠돌이')).id;
    await cp(join(docsRoot, stray), join(docsRoot, 'somewhere-else'), { recursive: true });
    await rm(join(docsRoot, stray), { recursive: true });
    db.run('DELETE FROM workspace WHERE id = ?', [stray]);

    const result = await reconcileWorkspaceSidecars(wsStores);

    expect(result.restored).toEqual([]);
    expect(result.quarantined).toEqual(['somewhere-else']);
    expect(workspaces.findById(stray)).toBeUndefined();
  });
});
