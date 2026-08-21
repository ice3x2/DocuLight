import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import express, { type Express } from 'express';

import { bootstrapDefaultWorkspace } from './app/workspace/bootstrap-default-workspace.js';
import { reconcileWorkspaceSidecars } from './app/workspace/restore-from-sidecar.js';
import { loadConfig, type ServerConfig } from './config/config.js';
import { FsWorkspaceFiles } from './infra/fs/workspace-sidecar.js';
import { openDatabase } from './infra/sqlite/database.js';
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

/**
 * 기동 시 한 번 도는 준비 절차.
 *
 * 순서가 규칙이다 — **사이드카 재구성이 먼저**고 기본 워크스페이스 생성이
 * 뒤다(`DR-WORKSPACE-002` AC-7 · `FR-WORKSPACE-006`). 뒤집으면 DB 만
 * 비어 있는 재구성 상황에서 필요 없는 워크스페이스가 하나 더 생긴다.
 */
export async function bootstrap(config: ServerConfig): Promise<void> {
  await mkdir(config.docsRoot, { recursive: true });
  await mkdir(dirname(config.databaseFile), { recursive: true });

  const db = openDatabase(config.databaseFile);
  try {
    const stores = {
      workspaces: new SqliteWorkspaceRepository(db),
      files: new FsWorkspaceFiles(config.docsRoot),
    };
    await reconcileWorkspaceSidecars(stores);
    await bootstrapDefaultWorkspace(stores);
  } finally {
    db.close();
  }
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
