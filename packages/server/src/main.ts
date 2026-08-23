import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Router, type Express, type Request } from 'express';

import {
  reconcile,
  startReconciliationLoop,
  type ReconciliationLoop,
} from './app/reconciliation/reconcile.js';
import { bootstrapDefaultWorkspace } from './app/workspace/bootstrap-default-workspace.js';
import { actorFor, type Actor } from './app/acl/permission-service.js';
import { authenticateSession } from './app/auth/login-service.js';
import type { AttachmentStores } from './app/attachment/attachment-service.js';
import type { TrashStores } from './app/trash/trash-service.js';
import { loadConfig, type ServerConfig } from './config/config.js';
import { createHttpServer } from './http/server.js';
import { installGate } from './http/middleware/install-gate.js';
import { isInstalled, mintInstallToken } from './app/install/install-service.js';
import { authRouter, sessionTokenOf } from './http/routes/auth.js';
import { installRouter } from './http/routes/install.js';
import { workspaceApiRouter } from './http/routes/workspace-api.js';
import { FsDocumentStore } from './infra/fs/document-store.js';
import { FsTrashFiles } from './infra/fs/trash-files.js';
import { FsWorkspaceFiles } from './infra/fs/workspace-sidecar.js';
import { SqliteAclRepository } from './infra/sqlite/acl-repository.js';
import { SqliteAttachmentRepository } from './infra/sqlite/attachment-repository.js';
import type { FavoriteStores } from './app/favorite/favorite-service.js';
import { SqliteFavoriteRepository } from './infra/sqlite/favorite-repository.js';
import { SqliteAuditLog } from './infra/sqlite/audit-log-repository.js';
import { openDatabase } from './infra/sqlite/database.js';
import { SqliteFindingQueue } from './infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from './infra/sqlite/node-repository.js';
import { SqlitePrincipalRepository } from './infra/sqlite/principal-repository.js';
import { BcryptPasswordHasher } from './infra/crypto/bcrypt-hasher.js';
import { SqliteSessionRepository } from './infra/sqlite/session-repository.js';
import { SqliteSettingStore } from './infra/sqlite/setting-store.js';
import { SqlitePersonalSettingStore } from './infra/sqlite/personal-setting-store.js';
import { SqliteTrashRepository } from './infra/sqlite/trash-repository.js';
import { SqliteVersionRepository } from './infra/sqlite/version-repository.js';
import { SqliteWorkspaceRepository } from './infra/sqlite/workspace-repository.js';

/**
 * Express 앱을 만든다. 리스너를 열지 않는다.
 *
 * 프로세스를 띄우는 일과 앱을 만드는 일을 나눠 두는 이유는, 라우트를
 * 서버를 실제로 띄우지 않고도 시험할 수 있어야 하기 때문이다.
 *
 * **런타임을 주면 API 가 붙는다.** 주지 않으면 정적 산출물만 올라간다 —
 * 그 경우가 필요한 것은 정적 서빙만 시험할 때뿐이며, 운영 진입점은 언제나
 * 준다. 안 주면 `/api/*` 가 전부 404 가 되고, 화면은 세션을 영영 못 받아
 * 로딩 상태에 머문다.
 *
 * **런타임과 함께 설치 관문도 선다** (`SEC-AUTH-011`). 관문을 시험만
 * 주입하고 운영이 빠뜨리면, 설치 전 인스턴스에서 모든 경로가 열린 채
 * 남는다 — 그 상태는 아무도 눈치채지 못한다.
 */
export function createApp(runtime?: ServerRuntime): Express {
  if (runtime === undefined) return createHttpServer({});

  return createHttpServer({
    // **함수로 넘긴다** — 기동 시점 값을 굳히면 설치를 마쳐도 관문이 계속
    // 닫혀 있고, 슈퍼유저가 0명으로 돌아가도 다시 닫히지 않는다.
    gate: installGate(() => isInstalled(runtime.stores)),
    api: apiRouter(runtime),
  });
}

/**
 * `/api` 아래에 붙는 것 전부.
 *
 * 한 자리에 모으는 이유는 **빠뜨림이 곧 침묵**이기 때문이다 — 라우터를
 * 안 붙이면 그 경로가 404 를 주는데, 그것은 「없는 자원」과 구별되지 않아
 * 아무도 알아채지 못한다.
 */
function apiRouter(runtime: ServerRuntime): Router {
  const router = Router();

  // 설치가 **가장 앞**이다. 관문이 허용목록으로 여는 두 경로이므로 다른
  // 라우터 뒤에 두면 그 앞의 미매칭 처리에 먼저 걸린다.
  router.use(installRouter(runtime.stores));
  router.use(authRouter(runtime.stores));
  router.use(workspaceApiRouter({ stores: runtime.stores, actorOf: runtime.actorOf }));

  return router;
}

/** 기동이 잡은 자원. 잡은 쪽이 아니라 **연 쪽**이 닫는다. */
export interface ServerRuntime {
  /** 주기 재조정 (`REL-STORAGE-001` AC-4). */
  reconciliation: ReconciliationLoop;
  /** 라우트가 쓰는 저장소 전부. */
  stores: RuntimeStores;
  /**
   * 이 요청을 누구로 볼 것인가.
   *
   * 세션 쿠키에서 세운다. **세울 수 없으면 `undefined`** — 인증 부재가
   * 허용이 아니므로, 못 세운 요청은 아무것도 하지 못한다.
   */
  actorOf: (request: Request) => Actor | undefined;
  close(): Promise<void>;
}

/** 라우트가 필요로 하는 저장소의 합집합. */
type RuntimeStores = { personalSettings: SqlitePersonalSettingStore } & AttachmentStores &
  TrashStores &
  FavoriteStores &
  Parameters<typeof authRouter>[0] & {
    documents: FsDocumentStore;
    queue: SqliteFindingQueue;
    files: FsWorkspaceFiles;
    /**
     * 콘솔에 한 줄 낸다 (`SEC-AUTH-012` AC-1).
     *
     * `docsRoot`·`clock` 과 같은 자리에 둔다 — 저장소가 아니라 **실행
     * 환경**을 나르는 값들이고, 여기 두어야 라우터가 사본이 아닌 원본을
     * 본다. 사본을 넘기면 기동 뒤에 바뀐 값을 라우터가 못 본다.
     */
    announce: (line: string) => void;
  };

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
  // 저장소를 **한 번만** 조립한다. 라우트마다 따로 만들면 같은 DB 위에
  // 서로 다른 캐시가 서고, 한쪽이 쓴 것을 다른 쪽이 못 본다.
  const stores: RuntimeStores = {
    nodes: new SqliteNodeRepository(db),
    workspaces: new SqliteWorkspaceRepository(db),
    acl: new SqliteAclRepository(db),
    principals: new SqlitePrincipalRepository(db),
    sessions: new SqliteSessionRepository(db),
    passwords: new BcryptPasswordHasher(),
    settings: new SqliteSettingStore(db),
    personalSettings: new SqlitePersonalSettingStore(db),
    versions: new SqliteVersionRepository(db),
    attachments: new SqliteAttachmentRepository(db),
    favorites: new SqliteFavoriteRepository(db),
    trash: new SqliteTrashRepository(db),
    trashFiles: new FsTrashFiles(config.docsRoot),
    files: new FsWorkspaceFiles(config.docsRoot),
    documents: new FsDocumentStore(config.docsRoot),
    // 쓰는 경계와 읽는 경계가 **같은 객체**다 — 나눠 만들면 한쪽이 다른
    // 데이터베이스를 보게 되고, 그때 기록은 되는데 조회가 비어 온다.
    audit: new SqliteAuditLog(db),
    auditLog: new SqliteAuditLog(db),
    queue: new SqliteFindingQueue(db),
    docsRoot: config.docsRoot,
    clock: () => new Date(),
    // eslint-disable-next-line no-console -- 설치 토큰의 출력처가 콘솔이다.
    announce: (line: string) => console.log(line),
  };

  try {
    // 재조정이 사이드카 재구성을 안에서 먼저 돌린다 — 워크스페이스 목록이
    // 확정돼야 그 안의 파일을 볼 수 있다.
    await reconcile(stores);
    // 기본 워크스페이스는 그 뒤다. 앞서면 DB 만 비어 있는 복원 상황에서
    // 사이드카로 되살아날 워크스페이스를 못 보고 하나를 더 만든다.
    await bootstrapDefaultWorkspace(stores);
  } catch (error) {
    db.close();
    throw error;
  }

  // **설치 전이면 토큰을 낸다** (`SEC-AUTH-012` AC-1 · `SEC-AUTH-014`).
  // 토큰은 프로세스 메모리에만 살고 그것을 읽는 API 가 없으므로
  // (`SEC-AUTH-014` AC-4·AC-6), 여기서 내지 않으면 아무도 그 값을 알 수
  // 없어 설치가 영원히 불가능하다.
  //
  // 이미 설치된 인스턴스에는 내지 않는다 — 낼 이유가 없고, 내면 그 값이
  // 설치를 다시 여는 문이 된다.
  if (!isInstalled(stores)) mintInstallToken(stores);

  // 첫 회차는 위에서 이미 돌았다 — 루프에게 다시 돌지 말라고 **말해야**
  // 한다. 말하지 않으면 기동 직후 전체 스캔이 두 번 돈다.
  const reconciliation = startReconciliationLoop(stores, { runImmediately: false });

  return {
    reconciliation,
    stores,
    actorOf: (request: Request): Actor | undefined => {
      const token = sessionTokenOf(request.headers.cookie);
      if (token === undefined) return undefined;

      const session = authenticateSession(stores, token);
      return session === undefined ? undefined : actorFor(stores.principals, session.userId);
    },
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
export function startServer(
  config: ServerConfig,
  runtime: ServerRuntime,
): ReturnType<Express['listen']> {
  return createApp(runtime).listen(config.port);
}

// `node main.js` 로 직접 실행될 때만 리스너를 연다 — import 시에는 열지 않는다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const config = loadConfig();
  const runtime = await bootstrap(config);
  startServer(config, runtime);
}
