import { chmod, cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcile, startReconciliationLoop } from '../../../src/app/reconciliation/reconcile.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { QUARANTINE_DIRECTORY } from '../../../src/domain/workspace/quarantine.js';
import type { ServerConfig } from '../../../src/config/config.js';
import { bootstrap } from '../../../src/main.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let docsRoot: string;
let config: ServerConfig;
let db: Database;
let documents: FsDocumentStore;
let nodes: SqliteNodeRepository;
let workspaces: SqliteWorkspaceRepository;
let files: FsWorkspaceFiles;
let queue: SqliteFindingQueue;
let stores: Parameters<typeof reconcile>[0];
let ws: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-resilience-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  config = {
    docsRoot,
    databaseFile: join(dir, 'data', 'doculight.db'),
    port: 3400,
    trustProxyHops: 0,
  };

  db = openDatabase(join(dir, 'doculight.db'));
  documents = new FsDocumentStore(docsRoot);
  nodes = new SqliteNodeRepository(db);
  workspaces = new SqliteWorkspaceRepository(db);
  files = new FsWorkspaceFiles(docsRoot);
  queue = new SqliteFindingQueue(db);
  stores = { nodes, workspaces, documents, files: new FsWorkspaceFiles(docsRoot), audit: new SqliteAuditLog(db), queue, transaction: <T,>(fn: () => T): T => db.transaction(fn) };

  ws = (await createWorkspace({ workspaces, files }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await chmod(docsRoot, 0o700).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe('REL-STORAGE-001 — 재조정은 되돌릴 수 있고 스스로를 망가뜨리지 않는다', () => {
  it('REL-STORAGE-001 AC-2 — 사라졌던 파일이 돌아오면 tombstone 이 풀린다.', async () => {
    await documents.write(ws, '회의록.md', '# 본문');
    await reconcile(stores);
    const id = nodes.allIn(ws).find((n) => n.kind === 'file')!.id;

    await rm(join(docsRoot, ws, '회의록.md'));
    await reconcile(stores);
    expect(nodes.findById(id)?.orphanedAt).toBeTruthy();

    // tombstone 의 정당화는 「파일이 잠시 없었을 뿐인 경우」다. 그 「잠시」가
    // 끝났을 때 돌아오는 길이 없으면 그 정당화가 성립하지 않고, 노드는
    // 파일이 있는데도 영구 미해소로 남는다.
    await documents.write(ws, '회의록.md', '# 본문');
    const result = await reconcile(stores);

    expect(nodes.findById(id)?.orphanedAt).toBeNull();
    expect(result.revived).toEqual([id]);
    // 새 노드를 만들어 대신하지 않는다 — 만들면 ID 가 바뀌어 그 노드
    // 앞으로 부여된 권한과 이력이 끊긴다.
    expect(nodes.allIn(ws).filter((n) => n.kind === 'file')).toHaveLength(1);
  });

  it('REL-STORAGE-001 — 회차 도중 실패하면 그 회차가 통째로 되돌아간다.', async () => {
    for (let i = 0; i < 5; i += 1) {
      await documents.write(ws, `기획/문서${i}.md`, '# 본문');
    }

    // 대기열이 세 번째 발견에서 터진다 — 디스크 오류·잠금 경합의 대역이다.
    let 남은것 = 3;
    const 터지는큐 = {
      ...queue,
      open: (input: Parameters<typeof queue.open>[0]) => {
        남은것 -= 1;
        if (남은것 < 0) throw new Error('큐가 터졌다');
        return queue.open(input);
      },
      unresolved: () => queue.unresolved(),
    } as typeof queue;

    await expect(reconcile({ ...stores, queue: 터지는큐 })).rejects.toThrow('큐가 터졌다');

    // **절반만 반영된 상태가 남으면 안 된다.** 남으면 다음 회차가 그
    // 절반 위에서 돌고, 그 절반이 무엇인지는 아무 기록에도 없다.
    expect(nodes.allIn(ws)).toEqual([]);
    expect(queue.unresolved()).toEqual([]);
  });

  it('REL-STORAGE-001 — 디렉토리를 읽지 못한 것을 「전부 사라졌다」로 읽지 않는다.', async () => {
    for (let i = 0; i < 5; i += 1) {
      await documents.write(ws, `기획/문서${i}.md`, '# 본문');
    }
    await reconcile(stores);
    expect(nodes.allIn(ws).filter((n) => n.kind === 'file')).toHaveLength(5);

    // 첫 회차가 남긴 등재 발견은 정상이다 — 여기서 재는 것은 그 뒤로
    // **더 늘지 않는다**는 것이다.
    const findingsBefore = queue.unresolved().length;

    // 워크스페이스 디렉토리를 통째로 치운다 — 마운트가 끊기거나 권한이
    // 조여진 상황의 대역이다. 「없음」과 「읽을 수 없음」을 구분하지 않으면
    // 이 한 번으로 전 문서가 tombstone 이 된다.
    await rm(join(docsRoot, ws), { recursive: true });

    await expect(reconcile(stores)).rejects.toThrow(/read/i);

    // 하나도 tombstone 이 되지 않았고 대기열도 늘지 않았다.
    expect(nodes.allIn(ws).filter((n) => n.orphanedAt !== null)).toEqual([]);
    expect(queue.unresolved()).toHaveLength(findingsBefore);
  });

  it('REL-STORAGE-001 AC-4 — 기동 시 전체 스캔은 한 번만 돈다.', async () => {
    const ran: number[] = [];
    const loop = startReconciliationLoop(stores, {
      intervalMs: 20,
      runImmediately: false,
      onRun: () => ran.push(ran.length),
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    // 기동 회차는 호출자가 이미 돌렸다. 루프가 또 돌면 큰 볼트에서 기동
    // 직후 스캔 비용이 두 배가 된다.
    expect(ran).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(ran.length).toBeGreaterThanOrEqual(1);
    await loop.stop();
  });

  it('REL-STORAGE-001 AC-4 — 주기 재조정이 사이드카도 함께 본다.', async () => {
    const runtime = await bootstrap(config);
    await runtime.close();

    // 서버가 도는 중에 백업 사본이 docsRoot 안에 생긴다.
    const live = openDatabase(config.databaseFile);
    try {
      const repo = new SqliteWorkspaceRepository(live);
      const target = repo.list()[0]!.id;
      await cp(join(docsRoot, target), join(docsRoot, `${target}-backup`), { recursive: true });

      const scanned = {
        nodes: new SqliteNodeRepository(live),
        workspaces: repo,
        documents,
        files,
        audit: new SqliteAuditLog(live),
        queue: new SqliteFindingQueue(live),
        transaction: <T,>(fn: () => T): T => live.transaction(fn),
      };

      // 재기동을 기다리지 않고 주기 재조정이 잡아야 한다 — 기다리면 그
      // 사이 사본 안의 파일은 어느 워크스페이스에도 속하지 않아 스캔
      // 대상조차 아니다.
      await reconcile(scanned);

      expect(await readdir(docsRoot)).not.toContain(`${target}-backup`);
      expect(await readdir(join(docsRoot, QUARANTINE_DIRECTORY))).toContain(`${target}-backup`);
    } finally {
      live.close();
    }
  });

  it('DR-WORKSPACE-002 AC-5 — 격리 자리에 같은 이름이 이미 있어도 기동이 서지 않는다.', async () => {
    await cp(join(docsRoot, ws), join(docsRoot, `${ws}-backup`), { recursive: true });
    db.close();

    const first = await bootstrap(config);
    await first.close();

    // 같은 이름의 사본이 또 들어온다. 격리 자리가 이미 차 있으면 옮기기가
    // 실패하는데, 그 실패가 기동을 세우면 사람이 docsRoot 를 직접 손대기
    // 전까지 매 기동이 같은 자리에서 죽는다.
    await cp(
      join(docsRoot, (await readdir(docsRoot)).find((name) => !name.startsWith('.'))!),
      join(docsRoot, `${ws}-backup`),
      { recursive: true },
    );

    const second = await bootstrap(config);
    await second.close();

    expect(await readdir(docsRoot)).not.toContain(`${ws}-backup`);
    const shelved = await readdir(join(docsRoot, QUARANTINE_DIRECTORY));
    // 먼저 격리된 것을 덮어쓰지 않는다 — 둘 다 사람이 판단할 대상이다.
    expect(shelved.length).toBeGreaterThanOrEqual(2);

    db = openDatabase(join(dir, 'doculight.db'));
  });
});
