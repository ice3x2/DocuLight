import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import express, { type Express } from 'express';

import {
  reconcile,
  startReconciliationLoop,
  type ReconciliationLoop,
} from './app/reconciliation/reconcile.js';
import { bootstrapDefaultWorkspace } from './app/workspace/bootstrap-default-workspace.js';
import { reconcileWorkspaceSidecars } from './app/workspace/restore-from-sidecar.js';
import { loadConfig, type ServerConfig } from './config/config.js';
import { FsDocumentStore } from './infra/fs/document-store.js';
import { FsWorkspaceFiles } from './infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from './infra/sqlite/audit-log-repository.js';
import { openDatabase } from './infra/sqlite/database.js';
import { SqliteFindingQueue } from './infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from './infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from './infra/sqlite/workspace-repository.js';

/**
 * Express 앱을 만든다. 리스너를 열지 않는다.
 *
 * 프로세스를 띄우는 일과 앱을 만드는 일을 나눠 두는 이유는, 뒤 Task 가
 * 서버를 실제로 띄우지 않고도 라우트를 시험할 수 있어야 하기 때문이다.
 * 이 분리를 나중에 하려면 진입점을 쓰는 자리를 전부 고쳐야 한다.
 */
export function createApp(): Express {
  return express();
}

/** 기동이 잡은 자원. 잡은 쪽이 아니라 **연 쪽**이 닫는다. */
export interface ServerRuntime {
  /** 주기 재조정 (`REL-STORAGE-001` AC-4). */
  reconciliation: ReconciliationLoop;
  close(): Promise<void>;
}

/**
 * 기동 시 한 번 도는 준비 절차.
 *
 * 순서가 규칙이다 — **사이드카 재구성 → 기본 워크스페이스 → 전체 재조정**.
 * ① 재구성이 먼저가 아니면 DB 만 비어 있는 복원 상황에서 필요 없는
 *    워크스페이스가 하나 더 생긴다(`DR-WORKSPACE-002` AC-7).
 * ② 재조정이 마지막인 것은 그 앞 둘이 워크스페이스 목록을 확정하기
 *    때문이다 — 먼저 돌면 아직 복원되지 않은 워크스페이스의 파일을
 *    보지 못한다.
 *
 * **복원 전용 스캔 경로를 따로 두지 않는다** (`OPS-STORAGE-001` AC-2).
 * 복원 직후의 안전망은 새 절차가 아니라 이 기동 재조정 자체다 — 둘로
 * 두면 한쪽만 고쳐진 채로 남는다(`CON-ARCH-008`).
 */
export async function bootstrap(config: ServerConfig): Promise<ServerRuntime> {
  await mkdir(config.docsRoot, { recursive: true });
  await mkdir(dirname(config.databaseFile), { recursive: true });

  const db = openDatabase(config.databaseFile);
  const stores = {
    nodes: new SqliteNodeRepository(db),
    workspaces: new SqliteWorkspaceRepository(db),
    files: new FsWorkspaceFiles(config.docsRoot),
    documents: new FsDocumentStore(config.docsRoot),
    audit: new SqliteAuditLog(db),
    queue: new SqliteFindingQueue(db),
  };

  try {
    await reconcileWorkspaceSidecars(stores);
    await bootstrapDefaultWorkspace(stores);
    await reconcile(stores);
  } catch (error) {
    db.close();
    throw error;
  }

  // 첫 회차는 위에서 이미 돌았다. 이 루프는 그 뒤의 주기 반복을 맡는다.
  const reconciliation = startReconciliationLoop(stores);

  return {
    reconciliation,
    async close() {
      // 돌고 있는 회차를 기다린 뒤에 닫는다 — 기다리지 않으면 닫힌 DB 에
      // 그 회차의 쓰기가 도착한다.
      await reconciliation.stop();
      db.close();
    },
  };
}

/**
 * 운영 진입점. 정적 산출물과 API 를 **한 프로세스**가 같은 오리진에 올린다
 * (`OPS-ARCH-001`). 별도의 프론트엔드 서버를 두지 않는다.
 */
export function startServer(port: number): ReturnType<Express['listen']> {
  return createApp().listen(port);
}

// `node main.js` 로 직접 실행될 때만 리스너를 연다 — import 시에는 열지 않는다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const config = loadConfig();
  await bootstrap(config);
  startServer(config.port);
}
