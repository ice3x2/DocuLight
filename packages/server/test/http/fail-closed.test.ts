import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcile } from '../../src/app/reconciliation/reconcile.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { ARCHIVE_DIRECTORY } from '../../src/domain/workspace/archive.js';
import { API_PREFIX, createHttpServer } from '../../src/http/server.js';
import { documentsRouter } from '../../src/http/routes/documents.js';
import { FsDocumentStore } from '../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { SqliteAuditLog } from '../../src/infra/sqlite/audit-log-repository.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let docsRoot: string;
let db: Database;
let documents: FsDocumentStore;
let nodes: SqliteNodeRepository;
let stores: Parameters<typeof reconcile>[0];
let server: Server;
let origin: string;
let ws: string;

/** `/api/documents/<워크스페이스>/<경로>` 를 친다. */
const get = (path: string) =>
  fetch(`${origin}${API_PREFIX}/documents/${ws}/${path.split('/').map(encodeURIComponent).join('/')}`);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-failclosed-'));
  docsRoot = join(dir, 'docs');
  await mkdir(join(dir, 'web'), { recursive: true });
  await writeFile(join(dir, 'web', 'index.html'), '<!doctype html><title>DocuLight</title>', 'utf8');
  await mkdir(docsRoot, { recursive: true });

  db = openDatabase(join(dir, 'doculight.db'));
  documents = new FsDocumentStore(docsRoot);
  nodes = new SqliteNodeRepository(db);
  const workspaces = new SqliteWorkspaceRepository(db);
  stores = {
    nodes,
    workspaces,
    documents,
    audit: new SqliteAuditLog(db),
    queue: new SqliteFindingQueue(db),
  };
  ws = (await createWorkspace({ workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;

  const app = createHttpServer({
    webRoot: join(dir, 'web'),
    api: documentsRouter({ nodes, documents }),
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('listener did not report a port');
  }
  origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-STORAGE-006 — 서빙은 fail-closed 다', () => {
  it('SEC-STORAGE-006 AC-1 — DB 에 대응 레코드가 없는 파일시스템 경로에 대한 요청은 거부된다.', async () => {
    await documents.write(ws, '회의록.md', '# 비밀');

    // 파일은 디스크에 있고 노드 레코드만 없다.
    expect(await documents.exists(ws, '회의록.md')).toBe(true);
    expect(nodes.allIn(ws)).toEqual([]);

    const response = await get('회의록.md');
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('비밀');
  });

  it('SEC-STORAGE-006 AC-2 — 레코드가 없다는 사실이 허용의 근거가 되는 경로가 없다.', async () => {
    await documents.write(ws, '회의록.md', '# 비밀');
    await documents.write(ws, '기획/회의록.md', '# 비밀');

    // 모양을 바꿔 여러 번 두드려도 열리는 자리가 없다.
    const probes = ['회의록.md', '기획/회의록.md', './회의록.md', '기획/../회의록.md', ''];
    for (const probe of probes) {
      const response = await get(probe);
      expect(response.status, `${probe} 가 열렸다`).not.toBe(200);
      expect(await response.text()).not.toContain('비밀');
    }

    // 없는 워크스페이스도 마찬가지다 — 레코드가 없으면 판정할 근거가 없다.
    const elsewhere = await fetch(`${origin}${API_PREFIX}/documents/없는것/회의록.md`);
    expect(elsewhere.status).not.toBe(200);
  });

  it('SEC-STORAGE-006 AC-3 — 서버가 돌아가는 동안 docsRoot 에 직접 넣은 파일은 재조정으로 등록되기 전까지 서빙되지 않는다.', async () => {
    // 서버가 도는 중에 누군가 디스크에 파일을 둔다.
    await documents.write(ws, '나중에 넣은 문서.md', '# 본문');

    const before = await get('나중에 넣은 문서.md');
    expect(before.status).toBe(404);

    // 재조정이 등록하면 그때 열린다. **거부가 기본이고 재조정이 그것을 푼다** —
    // 반대로 구현하면 미등록 파일이 그대로 노출된다.
    await reconcile(stores);

    const after = await get('나중에 넣은 문서.md');
    expect(after.status).toBe(200);
    expect(await after.text()).toBe('# 본문');
  });

  it('SEC-STORAGE-006 AC-4 — 아카이브 디렉토리 아래의 어떤 경로도 서빙되지 않는다.', async () => {
    await documents.write(ws, `${ARCHIVE_DIRECTORY}/옛 워크스페이스/회의록.md`, '# 비밀');

    // 레코드가 **있어도** 열리지 않는다. 레코드 유무로만 판정하면
    // 아카이브 안의 노드가 등재되는 순간 서빙된다.
    const archive = nodes.create({
      workspaceId: ws,
      parentId: null,
      kind: 'directory',
      name: ARCHIVE_DIRECTORY,
    });
    const inner = nodes.create({
      workspaceId: ws,
      parentId: archive,
      kind: 'directory',
      name: '옛 워크스페이스',
    });
    nodes.create({ workspaceId: ws, parentId: inner, kind: 'file', name: '회의록.md' });

    const response = await get(`${ARCHIVE_DIRECTORY}/옛 워크스페이스/회의록.md`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('비밀');
  });

  it('SEC-STORAGE-006 — tombstone 이 된 노드는 서빙되지 않는다.', async () => {
    await documents.write(ws, '회의록.md', '# 본문');
    await reconcile(stores);
    expect((await get('회의록.md')).status).toBe(200);

    // 파일이 사라지면 노드는 남지만 서빙 대상은 아니다. 레코드가 있다는
    // 이유로 열면 사라진 파일을 읽으려다 서버가 터진다.
    await rm(join(docsRoot, ws, '회의록.md'));
    await reconcile(stores);

    expect((await get('회의록.md')).status).toBe(404);
  });
});
