import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECONCILE_INTERVAL_MS,
  reconcile,
  startReconciliationLoop,
  type ReconciliationLoop,
} from '../../../src/app/reconciliation/reconcile.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteTrashRepository } from '../../../src/infra/sqlite/trash-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let dir: string;
let docsRoot: string;
let db: Database;
let documents: FsDocumentStore;
let nodes: SqliteNodeRepository;
let workspaces: SqliteWorkspaceRepository;
let queue: SqliteFindingQueue;
let stores: Parameters<typeof reconcile>[0];
let ws: string;
let loop: ReconciliationLoop | undefined;

/** 서버가 정지한 동안 누군가 디스크에 파일을 둔 상황을 만든다. */
const putOnDisk = (path: string, body = '# 본문') => documents.write(ws, path, body);

const pathsInDb = () =>
  nodes
    .allIn(ws)
    .filter((n) => n.kind === 'file')
    .map((n) => nodes.pathOf(n.id))
    .sort();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-reconcile-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));

  documents = new FsDocumentStore(docsRoot);
  nodes = new SqliteNodeRepository(db);
  workspaces = new SqliteWorkspaceRepository(db);
  queue = new SqliteFindingQueue(db);

  stores = {
    nodes,
    workspaces,
    documents,
    files: new FsWorkspaceFiles(docsRoot),
    audit: new SqliteAuditLog(db),
    queue,
    // 회차를 한 트랜잭션으로 묶는다 (`DR-STORAGE-002` AC-2).
    transaction: <T,>(fn: () => T): T => db.transaction(fn),
  };

  ws = (await createWorkspace({ workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  // 멈추지 않으면 다음 회차가 닫힌 DB 를 건드린다.
  await loop?.stop();
  loop = undefined;
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-STORAGE-001 · DR-STORAGE-001 — 재조정이 정지 중의 변경을 따라잡는다', () => {
  it('REL-STORAGE-001 AC-1 — 서버가 정지한 동안 docsRoot 에 추가된 파일은 기동 직후 재조정에서 신규 노드로 생성되고 부모의 ACL 을 상속한다.', async () => {
    await putOnDisk('회의 기록/2026 상반기/기획 회의.md');

    const result = await reconcile(stores);

    expect(result.created).toHaveLength(1);
    expect(pathsInDb()).toEqual(['회의 기록/2026 상반기/기획 회의.md']);

    // 중간 디렉토리도 함께 선다. 서지 않으면 파일 노드가 부모 없이 떠서
    // 상속의 출발점 자체가 없어진다.
    const created = nodes.findById(result.created[0]!)!;
    expect(created.kind).toBe('file');
    expect(created.parentId).not.toBeNull();
    expect(nodes.pathOf(created.parentId!)).toBe('회의 기록/2026 상반기');

    // 한계 — ACL 테이블이 wave-1 에 없어 상속 자체는 관측 대상이 아니다.
    // 여기서 고정하는 것은 상속이 걸릴 **부모 사슬이 실제로 선다**는 것이며,
    // 상속 규칙은 ACL scope 가 서는 wave 가 자기 자리에서 판정한다.
  });

  it('REL-STORAGE-003 AC-1: 휴지통에 든 노드는 재조정이 고아로 세지 않는다', async () => {
    await putOnDisk('회의록.md');
    await reconcile(stores);
    const [id] = nodes.allIn(ws).filter((n) => n.kind === 'file').map((n) => n.id);

    // 삭제한 상태를 만든다 — 노드 행은 남고 파일만 `.trash/<노드ID>/` 로
    // 옮겨져 원래 자리에서 사라진다. **서버가 스스로 옮긴 것**이므로 재조정이
    // 그것을 소실로 세면, 복구가 `trashedAt` 만 지워 되살린 문서가 트리에는
    // 서고 열리지 않는다.
    new SqliteTrashRepository(db).add({
      nodeId: id!,
      workspaceId: ws,
      originalPath: '회의록.md',
      deletedAt: new Date().toISOString(),
      deletedBy: '지운사람',
    });
    await rm(join(docsRoot, ws, '회의록.md'));

    const result = await reconcile(stores);

    expect(result.orphaned, '휴지통에 든 노드를 재조정이 고아로 세웠다').toEqual([]);
    expect(nodes.findById(id!)?.orphanedAt).toBeNull();
  });

  it('REL-STORAGE-001 AC-2 — 서버가 정지한 동안 사라진 파일의 노드는 ACL 이 삭제되지 않고 orphaned_at 이 기록된 tombstone 상태가 된다.', async () => {
    await putOnDisk('회의록.md');
    await reconcile(stores);
    const [id] = nodes.allIn(ws).filter((n) => n.kind === 'file').map((n) => n.id);

    await rm(join(docsRoot, ws, '회의록.md'));
    const result = await reconcile(stores);

    // 지우지 않는다. 삭제는 되돌릴 수 없고, 파일이 잠시 없었을 뿐인
    // 경우에도 권한이 영구히 사라진다.
    expect(result.orphaned).toEqual([id]);
    const tombstone = nodes.findById(id!);
    expect(tombstone).not.toBeUndefined();
    expect(tombstone?.orphanedAt).toBeTruthy();

    // 이미 tombstone 인 노드를 매 회차마다 다시 세지 않는다 — 세면
    // 대기열이 같은 사실로 채워진다.
    expect((await reconcile(stores)).orphaned).toEqual([]);
  });

  it('REL-STORAGE-001 AC-3 — 위 두 경우 모두 재조정 대기열에 미해소 항목으로 기재된다.', async () => {
    await putOnDisk('회의록.md');
    await reconcile(stores);
    expect(queue.unresolved()).toHaveLength(1);

    await rm(join(docsRoot, ws, '회의록.md'));
    await reconcile(stores);

    const kinds = queue.unresolved().map((f) => f.type).sort();
    expect(kinds).toHaveLength(2);
    // 두 사실은 서로 다른 유형이다 — 같은 유형이면 대기열을 보는 사람이
    // 무엇이 일어났는지 구별할 수 없다.
    expect(new Set(kinds).size).toBe(2);

    // 항목마다 참조 감사 행이 있다. 비면 시각·대상 노드·행위자의 유일한
    // 출처가 사라진다(`R139`).
    for (const finding of queue.unresolved()) {
      expect(queue.auditRefsOf(finding.id).length).toBeGreaterThan(0);
    }
  });

  it('REL-STORAGE-001 AC-4 — 재조정은 기동 시 1회 수행되고 그 뒤로도 주기적으로 반복된다.', async () => {
    // 가짜 시계를 쓰지 않는다 — 재조정은 실제 파일시스템 I/O 를 하므로
    // 시계를 앞당겨도 그 I/O 가 끝났음을 보장하지 못한다. 간격만 줄인다.
    const ran: number[] = [];
    loop = startReconciliationLoop(stores, { intervalMs: 20, onRun: () => ran.push(ran.length) });

    // **기다리는 창을 명시해 넓힌다 — 요구 회차는 그대로 1 과 3 이다.**
    // 한 회차가 실제 파일 I/O 를 하므로 부하 아래에서 회차 하나가 수백 ms 로
    // 늘고, 그러면 `vi.waitFor` 의 기본 1초 안에 세 회차가 들어오지 못해
    // 죽는다(실측: `expected 2 to be greater than or equal to 3`). 넓히는
    // 것은 창이지 기준이 아니며, 회차가 차는 즉시 통과하므로 통상 회차의
    // 소요는 늘지 않는다. 둘을 합쳐도 이 파일의 `testTimeout` 20초 안이다.

    // 기동 시 1회.
    await vi.waitFor(() => expect(ran.length).toBeGreaterThanOrEqual(1), { timeout: 5_000 });

    // 그 뒤 주기 반복.
    await vi.waitFor(() => expect(ran.length).toBeGreaterThanOrEqual(3), { timeout: 10_000 });

    await loop.stop();
    const afterStop = ran.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ran.length).toBe(afterStop);

    // 운영 기본 간격은 상수 한 곳에 산다 — 자리마다 적으면 갈린다.
    expect(RECONCILE_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('REL-STORAGE-001 AC-4 — 간격을 주지 않으면 운영 기본 간격이 실제로 배선된다.', async () => {
    // 위 시험이 간격을 주입하는 바람에 **기본값이 실제로 쓰이는지**가 어느
    // 자리에서도 재지지 않았다. 그것을 여기서 정확한 회차 수로 잰다.
    //
    // 워크스페이스가 하나도 없는 저장소를 흉내 내어 파일시스템을 아예
    // 건드리지 않는다 — 실제 I/O 가 없으면 가짜 시계로 회차를 정확히
    // 셀 수 있고, 여기서 재려는 것은 재조정의 내용이 아니라 **일정**이다.
    const idle = {
      workspaces: { list: () => [] },
      files: { readAllSidecars: async () => [] },
    } as unknown as Parameters<typeof reconcile>[0];

    vi.useFakeTimers();
    // 루프를 **가짜 시계 안에서** 멈춰야 한다. 시계를 되돌린 뒤에 멈추면
    // 가짜 핸들을 진짜 `clearInterval` 에 넘기게 되어 타이머가 남고,
    // 워커가 종료하지 못한다.
    let scheduled: ReconciliationLoop | undefined;
    try {
      const ran: number[] = [];
      scheduled = startReconciliationLoop(idle, { onRun: () => ran.push(ran.length) });

      await vi.advanceTimersByTimeAsync(0);
      expect(ran).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS - 1);
      // 간격 **직전**에는 돌지 않는다. 이 단언이 없으면 기본값이 1ms 여도
      // 「주기적으로 돈다」가 통과한다.
      expect(ran).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(ran).toHaveLength(2);

      await vi.advanceTimersByTimeAsync(RECONCILE_INTERVAL_MS * 2);
      expect(ran).toHaveLength(4);
    } finally {
      await scheduled?.stop();
      vi.useRealTimers();
    }
  });

  it('REL-STORAGE-001 AC-5 — 재조정이 만든 신규 노드에도 경로 독립적인 노드 ID 가 부여된다.', async () => {
    await putOnDisk('가/나/다.md');

    const result = await reconcile(stores);

    // 파일 하나와 중간 디렉토리 둘.
    expect(nodes.allIn(ws)).toHaveLength(3);
    for (const node of nodes.allIn(ws)) {
      expect(node.id).toMatch(UUID_V4);
      expect(node.id).not.toContain(node.name);
    }
    expect(result.created.every((id) => UUID_V4.test(id))).toBe(true);
  });

  it('DR-STORAGE-001 AC-3 — 문서 본문은 데이터베이스에 보관되지 않는다 — DB 를 비우고 재구성해도 파일시스템의 문서 본문은 그대로 남는다.', async () => {
    await putOnDisk('회의록.md', '# 원문 그대로');
    await reconcile(stores);

    // DB 를 통째로 비운다.
    db.run('DELETE FROM node');
    db.run('DELETE FROM workspace');
    expect(nodes.allIn(ws)).toEqual([]);

    // 본문은 남아 있다.
    expect(await documents.read(ws, '회의록.md')).toBe('# 원문 그대로');

    // 어느 테이블에도 본문을 담는 칸이 없다.
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);
    for (const table of tables) {
      const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((c) => c.name);
      expect(
        columns.filter((c) => /body|content|markdown|text_body/.test(c)),
        `${table} 이 본문을 담는다`,
      ).toEqual([]);
    }
  });

  it('REL-STORAGE-001 — 점으로 시작하는 경로는 노드로 등재하지 않는다.', async () => {
    // 사이드카와 `.obsidian` 은 제품·도구가 쓰는 예약 자리다. 노드로
    // 만들면 숨김 규칙이 낸 자리에 트리 항목이 들어앉는다.
    await mkdir(join(docsRoot, ws, '.obsidian'), { recursive: true });
    await documents.write(ws, '.obsidian/app.json', '{}');
    await putOnDisk('회의록.md');

    await reconcile(stores);

    expect(pathsInDb()).toEqual(['회의록.md']);
  });
});
