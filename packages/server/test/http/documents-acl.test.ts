import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import type { NodeStores } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { API_PREFIX, createHttpServer } from '../../src/http/server.js';
import { documentsRouter } from '../../src/http/routes/documents.js';
import { FsDocumentStore } from '../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: NodeStores;
let ws: string;
let root: Actor;
let me: Actor;
let server: Server;
let base: string;

/** 요청마다 누구로 볼지 정한다. wave-3 의 세션이 들어올 자리다. */
let caller: Actor | undefined;

const BODY = '# 기획 회의\n';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-docacl-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
  caller = root;

  const app = createHttpServer({
    webRoot: join(dir, 'web'),
    api: documentsRouter({
      stores,
      documents: new FsDocumentStore(docsRoot),
      actorOf: () => caller,
    }),
  });
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${API_PREFIX}/documents/${ws}/`;
});

afterEach(async () => {
  server.close();
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 디스크에 파일을 두고 노드로 등재한다. */
async function place(name: string): Promise<string> {
  await writeFile(join(docsRoot, ws, name), BODY, 'utf8');
  return stores.nodes.create({ workspaceId: ws, parentId: null, kind: 'file', name });
}

describe('SEC-ACL-006 — 서빙 표면이 권한 없음과 존재하지 않음을 구별하지 못하게 한다', () => {
  it('AC-1 · AC-2: 두 응답의 상태·본문·헤더가 같다', async () => {
    const doc = await place('회의록.md');
    expect(doc).toBeDefined();
    caller = me;

    const forbidden = await fetch(base + encodeURIComponent('회의록.md'));
    const missing = await fetch(base + encodeURIComponent('없는문서.md'));

    expect(forbidden.status, '권한 없는 노드가 서빙됐다').toBe(404);
    expect(missing.status).toBe(404);
    expect(await forbidden.text()).toBe(await missing.text());
    expect(forbidden.headers.get('content-type')).toBe(missing.headers.get('content-type'));
  });

  it('AC-3: 어느 응답에도 권한 부족을 뜻하는 문구나 403 이 없다', async () => {
    await place('회의록.md');
    caller = me;

    const response = await fetch(base + encodeURIComponent('회의록.md'));

    expect(response.status).not.toBe(403);
    expect(await response.text()).not.toMatch(/권한|forbidden|permission|denied/i);
  });

  it('권한을 주면 열린다 — 거부가 전체로 번지지 않는다', async () => {
    const doc = await place('회의록.md');
    caller = me;
    expect((await fetch(base + encodeURIComponent('회의록.md'))).status).toBe(404);

    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    // 같은 요청자, 같은 경로 — 사이에 무효화 호출이 없다.
    caller = actorFor(stores.principals, me.id);

    const opened = await fetch(base + encodeURIComponent('회의록.md'));
    expect(opened.status).toBe(200);
    expect(await opened.text()).toBe(BODY);
  });

  it('요청자를 세울 수 없으면 아무것도 서빙하지 않는다 — 인증 부재는 허용이 아니다', async () => {
    await place('회의록.md');
    caller = undefined;

    expect((await fetch(base + encodeURIComponent('회의록.md'))).status).toBe(404);
  });
});
