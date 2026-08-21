import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let me: Actor;
let ws: string;
let doc: string;
let app: Express;
/** 이 요청을 누구로 볼 것인가 — 시험이 바꿔 낀다. */
let actingAs: Actor | undefined;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-api-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(doc), '# 처음\n', 'utf8');
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);

  actingAs = root;
  app = express();
  app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('세션 — 화면이 표시 조건을 세울 근거를 받는다 (`IR-SHELL-002`)', () => {
  it('요청자의 슈퍼유저 여부와 워크스페이스 수를 준다', async () => {
    const res = await request(app).get('/api/session');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ superuser: true, workspaceCount: 1 });
  });

  it('관리 권한을 가진 워크스페이스 수를 따로 센다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'admin' });
    actingAs = actorFor(stores.principals, me.id);

    const res = await request(app).get('/api/session');

    expect(res.body).toMatchObject({ superuser: false, workspaceCount: 1, adminWorkspaceCount: 1 });
  });

  it('인증되지 않은 요청은 401 이다 — 빈 세션을 주면 화면이 로그인 상태로 뜬다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/session')).status).toBe(401);
  });
});

describe('트리 — 서버가 이미 거른 것을 준다 (`FR-WORKSPACE-003`)', () => {
  it('접근 가능한 워크스페이스와 그 하위를 준다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    const res = await request(app).get('/api/tree');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ workspace: { id: ws, name: '기획팀' }, visibility: 'full' });
    expect(res.body[0].roots.map((n: { name: string }) => n.name)).toEqual(['회의록.md']);
  });

  it('권한 없는 워크스페이스는 목록에 없다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get('/api/tree')).body).toEqual([]);
  });

  it('각 노드가 화면이 필요한 값을 담는다 — 권한과 가시성', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    actingAs = actorFor(stores.principals, me.id);

    const [node] = (await request(app).get('/api/tree')).body[0].roots;

    expect(node).toMatchObject({ id: doc, kind: 'file', level: 'edit', visibility: 'full' });
  });
});

describe('문서 본문 — 읽고 저장한다 (`FR-STORAGE-001` · `FR-STORAGE-002`)', () => {
  it('본문과 기준 해시를 함께 준다', async () => {
    const res = await request(app).get(`/api/documents/${doc}`);

    expect(res.status).toBe(200);
    expect(res.body.body).toBe('# 처음\n');
    expect(typeof res.body.hash).toBe('string');
  });

  it('그 해시로 저장하면 반영된다', async () => {
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;

    const saved = await request(app).put(`/api/documents/${doc}`).send({ body: '# 고침\n', baseHash: hash });

    expect(saved.status).toBe(200);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 고침\n');
  });

  it('낡은 해시로 저장하면 409 이고 서버의 현재 본문을 함께 준다', async () => {
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;
    await writeFile(fileOf(doc), '# 남이 고침\n', 'utf8');

    const saved = await request(app).put(`/api/documents/${doc}`).send({ body: '# 내 것\n', baseHash: hash });

    expect(saved.status).toBe(409);
    expect(saved.body.current).toBe('# 남이 고침\n');
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 남이 고침\n');
  });

  it('보기 권한만으로는 저장이 403 이다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;

    const saved = await request(app).put(`/api/documents/${doc}`).send({ body: '# 몰래\n', baseHash: hash });

    expect(saved.status).toBe(403);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 처음\n');
  });

  it('권한 없는 문서는 없는 문서와 같은 404 다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    const forbidden = await request(app).get(`/api/documents/${doc}`);
    const missing = await request(app).get('/api/documents/no-such-node');

    expect(forbidden.status).toBe(404);
    expect(forbidden.status).toBe(missing.status);
  });

  it('편집 세션을 열 수 있다 — 스냅샷이 세션당 1회이기 때문이다', async () => {
    const opened = await request(app).post(`/api/documents/${doc}/session`);

    expect(opened.status).toBe(200);
    expect(typeof opened.body.session).toBe('string');
  });
});

describe('첨부 — 소유 문서 권한으로 판정한다 (`SEC-ATTACH-002`)', () => {
  const PNG = Buffer.from('\x89PNG\r\n\x1a\n bytes', 'binary');

  it('문서에 붙이면 링크를 돌려준다', async () => {
    const res = await request(app)
      .post(`/api/documents/${doc}/attachments`)
      .attach('file', PNG, '그림.png');

    expect(res.status).toBe(200);
    expect(res.body.link).toMatch(/^\/api\/attachments\//);
  });

  it('그 링크로 바이트를 받는다', async () => {
    const { link } = (
      await request(app).post(`/api/documents/${doc}/attachments`).attach('file', PNG, '그림.png')
    ).body;

    const got = await request(app).get(link);

    expect(got.status).toBe(200);
    expect(Buffer.from(got.body)).toEqual(PNG);
  });

  it('소유 문서를 못 보는 요청자에게는 404 다 — 해시를 알아도 못 연다', async () => {
    const { link } = (
      await request(app).post(`/api/documents/${doc}/attachments`).attach('file', PNG, '그림.png')
    ).body;
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get(link)).status).toBe(404);
  });

  it('편집 권한이 없으면 업로드가 403 이다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    const res = await request(app)
      .post(`/api/documents/${doc}/attachments`)
      .attach('file', PNG, '그림.png');

    expect(res.status).toBe(403);
  });
});

describe('휴지통 — 전 워크스페이스 통합 목록 (`FR-SHELL-007`)', () => {
  it('행마다 워크스페이스 이름과 영구 삭제 가능 여부를 준다', async () => {
    await request(app).delete(`/api/nodes/${doc}`);

    const res = await request(app).get('/api/trash');

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ nodeId: doc, workspaceName: '기획팀', canPurge: true });
  });

  it('삭제는 휴지통으로 보내고 실체를 지우지 않는다', async () => {
    await request(app).delete(`/api/nodes/${doc}`);

    expect((await request(app).get('/api/trash')).body).toHaveLength(1);
  });
});
