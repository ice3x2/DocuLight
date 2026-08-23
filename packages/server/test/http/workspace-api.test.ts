import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { grantPermission } from '../../src/app/acl/grant-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { writeSetting } from '../../src/app/settings/instance-settings.js';
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

describe('FR-SHELL-003 · FR-ATTACH-001 — 노드 생성과 디렉토리 업로드', () => {
  it('새 문서를 만들 수 있다', async () => {
    const res = await request(app)
      .post('/api/nodes')
      .send({ workspaceId: ws, parentId: null, kind: 'file', name: '새 노트.md' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('새 노트.md');
    expect(typeof res.body.id).toBe('string');
  });

  it('이름이 겹치면 접미사가 붙고 확인을 묻지 않는다 (`SEC-SHELL-002`)', async () => {
    await request(app).post('/api/nodes').send({ workspaceId: ws, parentId: null, kind: 'file', name: '겹침.md' });

    const again = await request(app)
      .post('/api/nodes')
      .send({ workspaceId: ws, parentId: null, kind: 'file', name: '겹침.md' });

    expect(again.status).toBe(200);
    expect(again.body.name).not.toBe('겹침.md');
    // 안내 문구를 함께 준다 — 이름이 바뀐 사실을 안 알리면 사용자가 그
    // 문서를 못 찾는다.
    expect(again.body.notice).toContain(again.body.name);
  });

  it('편집 권한이 없으면 403 이다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    const res = await request(app)
      .post('/api/nodes')
      .send({ workspaceId: ws, parentId: null, kind: 'file', name: '몰래.md' });

    expect(res.status).toBe(403);
  });

  it('SEC-ATTACH-001 AC-1: 디렉토리에 파일을 올릴 수 있다', async () => {
    const dir = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));

    const res = await request(app)
      .post(`/api/nodes/${dir}/uploads`)
      .attach('file', Buffer.from('binary'), '설계.zip');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('설계.zip');
  });

  it('SEC-ATTACH-001 AC-2: 편집 권한이 없는 디렉토리에는 올릴 수 없다', async () => {
    const dir = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));
    grantPermission(stores, root, { nodeId: dir, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    const res = await request(app)
      .post(`/api/nodes/${dir}/uploads`)
      .attach('file', Buffer.from('binary'), '설계.zip');

    expect(res.status).toBe(403);
    // 거절만 재면 노드는 안 서고 파일만 놓인 상태가 통과한다.
    expect(stores.nodes.allIn(ws).filter((node) => node.name === '설계.zip')).toEqual([]);
    await expect(readFile(join(docsRoot, ws, '회의', '설계.zip'))).rejects.toThrow();
  });

  it('`CON-ATTACH-001` AC-1: 임의 확장자의 바이너리도 형식을 이유로 거부되지 않는다', async () => {
    const dir = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));

    // 점으로 시작하는 이름은 뺀다 — 그것이 막히는 이유는 형식이 아니라
    // 숨김 이름 규칙(`SEC-STORAGE-004`)이고, 여기서 재는 축이 아니다.
    for (const name of ['도구.exe', '보관.tar.gz', '무확장자', '스크립트.sh', '문서.docx']) {
      const res = await request(app)
        .post(`/api/nodes/${dir}/uploads`)
        .attach('file', Buffer.from('binary'), name);

      expect({ name, status: res.status }).toEqual({ name, status: 200 });
    }
  });

  it('FR-ATTACH-006 AC-4: 디렉토리 업로드에도 같은 크기 제한이 걸린다', async () => {
    writeSetting(stores.settings, 'upload-size-limit-bytes', '3');
    const dir = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));

    const res = await request(app)
      .post(`/api/nodes/${dir}/uploads`)
      .attach('file', Buffer.from('너무 큰 바이트'), '큰것.bin');

    expect(res.status).toBe(413);
  });
});

describe('IR-STORAGE-001 · FR-SHELL-002 AC-3 — 버전 목록과 복원', () => {
  it('버전 목록을 준다', async () => {
    const { session } = (await request(app).post(`/api/documents/${doc}/session`)).body;
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;
    await request(app).put(`/api/documents/${doc}`).send({ body: '# 고침\n', baseHash: hash, session });

    const res = await request(app).get(`/api/documents/${doc}/versions`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ seq: 1 });
    expect(typeof res.body[0].author).toBe('string');
    expect(typeof res.body[0].createdAt).toBe('string');
  });

  it('한 버전의 본문을 준다 — 그것 없이는 나란히 놓을 것이 없다', async () => {
    const { session } = (await request(app).post(`/api/documents/${doc}/session`)).body;
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;
    await request(app).put(`/api/documents/${doc}`).send({ body: '# 고침\n', baseHash: hash, session });

    const res = await request(app).get(`/api/documents/${doc}/versions/1`);

    expect(res.status).toBe(200);
    expect(res.body.body).toBe('# 처음\n');
  });

  it('AC-2: 고른 버전으로 복원한다', async () => {
    const { session } = (await request(app).post(`/api/documents/${doc}/session`)).body;
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;
    await request(app).put(`/api/documents/${doc}`).send({ body: '# 고침\n', baseHash: hash, session });

    const res = await request(app).post(`/api/documents/${doc}/versions/1/restore`);

    expect(res.status).toBe(204);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 처음\n');
  });

  it('보기 권한만으로는 복원되지 않는다 — 복원은 본문을 바꾸는 일이다', async () => {
    const { session } = (await request(app).post(`/api/documents/${doc}/session`)).body;
    const { hash } = (await request(app).get(`/api/documents/${doc}`)).body;
    await request(app).put(`/api/documents/${doc}`).send({ body: '# 고침\n', baseHash: hash, session });

    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).post(`/api/documents/${doc}/versions/1/restore`)).status).toBe(403);
  });

  it('권한 없는 문서의 버전 목록은 404 다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get(`/api/documents/${doc}/versions`)).status).toBe(404);
  });
});

describe('DR-SHELL-001 · IR-SHELL-002 AC-7 — 런타임 설정을 화면에서 바꾼다', () => {
  it('현재 값을 준다', async () => {
    const res = await request(app).get('/api/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      'signup-mode': 'approval',
      'trash-retention-days': '30',
      'retained-version-count': '20',
    });
  });

  it('AC-1: 값을 바꿔 저장할 수 있다', async () => {
    const saved = await request(app).put('/api/settings').send({ 'trash-retention-days': '7' });

    expect(saved.status).toBe(204);
    expect((await request(app).get('/api/settings')).body['trash-retention-days']).toBe('7');
  });

  it('슈퍼유저가 아니면 거절한다 — 인스턴스 설정은 인스턴스의 것이다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get('/api/settings')).status).toBe(403);
    expect((await request(app).put('/api/settings').send({ 'trash-retention-days': '7' })).status).toBe(403);
  });

  it('열거에 없는 키는 거절한다 — 오타가 조용한 기본값으로 살아남는다', async () => {
    const saved = await request(app).put('/api/settings').send({ 'trash-retention-day': '7' });

    expect(saved.status).toBe(400);
  });

  it('AC-3: 바꾼 값이 DB 에 남는다 — 재기동해도 유지된다', async () => {
    await request(app).put('/api/settings').send({ 'retained-version-count': '3' });

    // 같은 DB 를 다시 읽는 것이 재기동이 보는 것과 같은 상태다.
    expect(stores.settings.get('retained-version-count')).toBe('3');
  });

  it('OBS-AUDIT-011 AC-1: 감사 로그 보존 기간을 이 화면에서 지정할 수 있다', async () => {
    // 다섯 값 중 이 키만 오래도록 아무 시험도 건드리지 않았다 — 그 사이에
    // 이 설정은 저장되기만 하고 읽는 곳이 없었다.
    const saved = await request(app).put('/api/settings').send({ 'audit-retention-days': '400' });

    expect(saved.status).toBe(204);
    expect((await request(app).get('/api/settings')).body['audit-retention-days']).toBe('400');
  });

  it('REL-AUDIT-003 AC-5: 감사 보존을 휴지통 보존 아래로 내리면 400 이다', async () => {
    // 강제 지점이 화면이 아니라 서비스라는 것이 이 시험의 내용이다 —
    // 화면에만 두면 이 요청이 그대로 통과한다.
    const rejected = await request(app).put('/api/settings').send({ 'audit-retention-days': '7' });

    expect(rejected.status).toBe(400);
    expect((await request(app).get('/api/settings')).body['audit-retention-days']).toBe('365');
  });

  it('REL-AUDIT-003 AC-5: 둘을 한 요청으로 함께 올리면 통과한다', async () => {
    // 한 키씩만 받으면 관리자가 올바른 순서를 스스로 알아내야 한다.
    const saved = await request(app)
      .put('/api/settings')
      .send({ 'trash-retention-days': '90', 'audit-retention-days': '120' });

    expect(saved.status).toBe(204);
    const now = (await request(app).get('/api/settings')).body;
    expect([now['trash-retention-days'], now['audit-retention-days']]).toEqual(['90', '120']);
  });
});

describe('즐겨찾기 — 문서와 디렉토리를 한 목록에 담는다 (`FR-SHELL-001` AC-3 · AC-4)', () => {
  it('더한 문서가 목록에 온다', async () => {
    expect((await request(app).post('/api/favorites').send({ nodeId: doc })).status).toBe(204);

    const listed = await request(app).get('/api/favorites');

    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([
      { nodeId: doc, name: '회의록.md', kind: 'file', workspaceName: '기획팀' },
    ]);
  });

  it('더한 디렉토리도 같은 목록에 온다', async () => {
    const folder = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '자료' }),
    );

    await request(app).post('/api/favorites').send({ nodeId: folder });

    expect((await request(app).get('/api/favorites')).body).toMatchObject([
      { nodeId: folder, kind: 'directory' },
    ]);
  });

  it('뺀 것은 목록에서 사라진다', async () => {
    await request(app).post('/api/favorites').send({ nodeId: doc });

    expect((await request(app).delete(`/api/favorites/${doc}`)).status).toBe(204);
    expect((await request(app).get('/api/favorites')).body).toEqual([]);
  });

  it('볼 수 없는 노드는 없는 것과 같은 답을 받는다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).post('/api/favorites').send({ nodeId: doc })).status).toBe(404);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/favorites')).status).toBe(401);
  });
});

describe('새 버전 올리기 — 덮어쓰기의 유일한 경로 (`FR-SHELL-008`)', () => {
  it('AC-2: 파일을 덮어쓴다', async () => {
    const sent = await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.from('# 다음\n'), '회의록.md');

    expect(sent.status).toBe(204);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 다음\n');
  });

  it('AC-4: md 는 이전 본문이 버전으로 남는다', async () => {
    await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.from('# 다음\n'), '회의록.md');

    expect((await request(app).get(`/api/documents/${doc}/versions`)).body).toHaveLength(1);
  });

  it('AC-3: 편집 권한이 없으면 거절한다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    const sent = await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.from('# 다음\n'), '회의록.md');

    expect(sent.status).toBe(403);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 처음\n');
  });

  it('볼 수도 없으면 없는 것과 같은 답을 받는다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    const sent = await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.from('# 다음\n'), '회의록.md');

    expect(sent.status).toBe(404);
  });

  it('AC-5: 트리가 되돌릴 수 없는 파일을 알려 준다 — 화면이 .md 를 다시 판정하면 두 판정이 갈린다', async () => {
    const zip = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.zip' }),
    );

    const roots = (await request(app).get('/api/tree')).body[0].roots as {
      id: string;
      overwriteIrreversible?: boolean;
    }[];

    expect(roots.find((node) => node.id === zip)?.overwriteIrreversible).toBe(true);
    expect(roots.find((node) => node.id === doc)?.overwriteIrreversible).toBe(false);
  });
});

describe('링크 — 백링크와 아웃고잉 (`CON-EDITOR-002` AC-2 · AC-3)', () => {
  it('양쪽을 한 번에 준다', async () => {
    const other = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.md' }),
    );
    await writeFile(fileOf(other), '지난 [[회의록]] 을 본다\n', 'utf8');

    const got = await request(app).get(`/api/documents/${doc}/links`);

    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({
      outgoing: [],
      backlinks: [{ nodeId: other, name: '설계.md', resolved: true }],
    });
  });

  it('볼 수 없는 문서에는 없는 것과 같은 답을 준다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get(`/api/documents/${doc}/links`)).status).toBe(404);
  });
});

describe('위키링크 대상 제안 (`CON-EDITOR-002` AC-1)', () => {
  it('이름이 걸리는 문서를 준다', async () => {
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.md' });

    const got = await request(app).get('/api/wiki-targets').query({ q: '회의' });

    expect(got.status).toBe(200);
    expect(got.body).toEqual([{ target: '회의록', label: '회의록.md', detail: '기획팀' }]);
  });

  it('질의가 비면 전부 준다 — `[[` 만 친 순간에도 고를 것이 보여야 한다', async () => {
    const got = await request(app).get('/api/wiki-targets').query({ q: '' });

    expect(got.body).toHaveLength(1);
  });

  it('볼 수 없는 문서는 제안되지 않는다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get('/api/wiki-targets').query({ q: '회의' })).body).toEqual([]);
  });

  it('md 가 아닌 파일은 제안되지 않는다 — 위키링크는 문서 사이의 것이다', async () => {
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.zip' });

    expect((await request(app).get('/api/wiki-targets').query({ q: '설계' })).body).toEqual([]);
  });
});

describe('주체 검색 — 사용자·그룹 (`CON-ARCH-004` AC-4)', () => {
  it('이름이 걸리는 사용자와 그룹을 한 목록으로 준다', async () => {
    stores.principals.createGroup('한범팀');

    const got = await request(app).get('/api/principals').query({ q: '한범', for: `workspace:${ws}` });

    expect(got.status).toBe(200);
    expect(got.body).toEqual(
      expect.arrayContaining([
        { id: me.id, name: '한범', kind: 'user', status: 'active', system: false },
        expect.objectContaining({ name: '한범팀', kind: 'group' }),
      ]),
    );
  });

  it('SEC-PRINCIPAL-003 AC-1: 한 글자 질의는 아무것도 주지 않는다', async () => {
    const got = await request(app).get('/api/principals').query({ q: '한', for: `workspace:${ws}` });

    expect(got.status).toBe(200);
    expect(got.body).toEqual([]);
  });

  it('SEC-PRINCIPAL-003 AC-3: 스물다섯이 걸려도 스무 건까지만 준다', async () => {
    for (let n = 0; n < 25; n += 1) stores.principals.createUser(`검색대상${n}`);

    const got = await request(app).get('/api/principals').query({ q: '검색대상', for: `workspace:${ws}` });

    expect(got.body).toHaveLength(20);
  });

  it('SEC-PRINCIPAL-003 AC-4: 질의 문자열로 상한과 최소 길이를 덮을 수 없다', async () => {
    for (let n = 0; n < 25; n += 1) stores.principals.createUser(`검색대상${n}`);

    // 이 자리가 열려 있으면 화면이 아니라 **아무나** 값을 바꿀 수 있다 —
    // 화면별 재량을 막는 것보다 먼저 막아야 하는 문이다.
    const wider = await request(app)
      .get('/api/principals')
      .query({ q: '검색대상', for: `workspace:${ws}`, limit: '100', max: '100' });
    const shorter = await request(app).get('/api/principals').query({ q: '한', for: `workspace:${ws}`, min: '1' });

    expect(wider.body).toHaveLength(20);
    expect(shorter.body).toEqual([]);
  });

  it('FR-PRINCIPAL-006: 관리 권한자가 없는 워크스페이스가 지목된다', async () => {
    const 없는곳 = await request(app).get('/api/workspaces');
    expect(없는곳.body).toEqual([{ id: ws, name: '기획팀', adminless: true }]);

    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'admin' });

    // 슈퍼유저는 어느 워크스페이스에도 닿지만 그것은 지정된 관리자가 아니다.
    expect((await request(app).get('/api/workspaces')).body).toEqual([
      { id: ws, name: '기획팀', adminless: false },
    ]);
  });

  it('FR-PRINCIPAL-008 AC-1 · AC-3: 정지 계정에만 확인 사유가 붙는다', async () => {
    const 정지된 = stores.principals.createUser('정지된이');
    stores.principals.setStatus(정지된.id, 'suspended');

    const 정지 = await request(app).get('/api/grant-warnings').query({ principalId: 정지된.id });
    const 멀쩡 = await request(app).get('/api/grant-warnings').query({ principalId: me.id });

    expect(정지.body).toEqual(['suspended-subject']);
    expect(멀쩡.body).toEqual([]);
  });

  it('FR-PRINCIPAL-005 AC-2: 마지막 관리 권한자 회수에 사유가 붙는다', async () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'admin' });
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === me.id)!;

    const got = await request(app).get('/api/grant-warnings').query({ entryId: 항목.id });

    expect(got.body).toEqual(['last-administrator']);
  });

  it('R163 · FR-PRINCIPAL-009: 명부는 rejected 를 담고 상한이 없다', async () => {
    for (let n = 0; n < 25; n += 1) stores.principals.createUser(`사람${n}`);
    const 거절된 = stores.principals.createUser('거절자');
    stores.principals.setStatus(거절된.id, 'rejected');

    const got = await request(app).get('/api/roster/users');

    expect(got.status).toBe(200);
    expect(got.body.length).toBeGreaterThanOrEqual(26);
    expect(got.body.find((row: { name: string }) => row.name === '거절자')?.status).toBe('rejected');
  });

  it('R163-a: 슈퍼유저가 아니면 명부가 없는 자리와 같은 답을 받는다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get('/api/roster/users')).status).toBe(404);
    expect((await request(app).get('/api/roster/groups')).status).toBe(404);
  });

  it('FR-PRINCIPAL-002: 그룹을 지우면 그 그룹의 ACL 항목도 사라진다', async () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    grantPermission(stores, root, { nodeId: ws, principalId: 팀.id, level: 'edit' });

    const gone = await request(app).delete(`/api/roster/groups/${팀.id}`);

    expect(gone.status).toBe(204);
    expect(stores.acl.entriesOfPrincipal(팀.id)).toEqual([]);
  });

  it('FR-PRINCIPAL-001 AC-2: 슈퍼유저만 멤버십을 바꾼다', async () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    actingAs = actorFor(stores.principals, me.id);

    const 거절 = await request(app).post(`/api/roster/groups/${팀.id}/members`).send({ userId: me.id });
    actingAs = root;
    const 허용 = await request(app).post(`/api/roster/groups/${팀.id}/members`).send({ userId: me.id });

    expect(거절.status).toBe(404);
    expect(허용.status).toBe(204);
    expect(stores.principals.membersOf(팀.id)).toEqual([me.id]);
  });

  it('DR-SHELL-002 AC-1 · AC-3: 개인 설정을 쓰면 그 사용자에게만 그 값이 나온다', async () => {
    actingAs = me;

    const wrote = await request(app)
      .patch('/api/personal-settings')
      .send({ theme: 'dark', 'default-view-mode': 'edit' });
    const mine = await request(app).get('/api/personal-settings');
    actingAs = root;
    const others = await request(app).get('/api/personal-settings');

    expect(wrote.status).toBe(204);
    expect(mine.body).toEqual({
      theme: 'dark',
      'default-view-mode': 'edit',
      'default-edit-subview': 'live-preview',
    });
    // 다른 사용자에게는 기본값이 그대로다 — 전역 평면 맵이면 여기가 dark 다.
    expect(others.body).toEqual({
      theme: 'system',
      'default-view-mode': 'view',
      'default-edit-subview': 'live-preview',
    });
  });

  it('DR-SHELL-002 AC-6: 열거에 없는 키와 값은 거절된다', async () => {
    actingAs = me;

    expect((await request(app).patch('/api/personal-settings').send({ 'font-size': '14' })).status).toBe(400);
    expect((await request(app).patch('/api/personal-settings').send({ theme: 'sepia' })).status).toBe(400);
  });

  it('DR-SHELL-002: 인증되지 않은 요청에는 개인 설정이 없다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/personal-settings')).status).toBe(401);
    expect((await request(app).patch('/api/personal-settings').send({ theme: 'dark' })).status).toBe(401);
  });

  it('SEC-PRINCIPAL-002 AC-3: rejected 계정은 나오지 않는다', async () => {
    const 거절된 = stores.principals.createUser('검색대상거절');
    stores.principals.setStatus(거절된.id, 'rejected');

    expect((await request(app).get('/api/principals').query({ q: '검색대상', for: `workspace:${ws}` })).body).toEqual([]);
  });

  it('R162 · R162-a: 그 대상에 부여할 자격이 없으면 없는 대상과 같은 답을 받는다', async () => {
    actingAs = actorFor(stores.principals, me.id);

    const 자격없음 = await request(app).get('/api/principals').query({ q: '한범', for: `workspace:${ws}` });
    const 없는대상 = await request(app).get('/api/principals').query({ q: '한범', for: 'workspace:없음' });

    // 갈리면 이 자리가 존재 오라클이 된다 (`R94`).
    expect(자격없음.status).toBe(404);
    expect(없는대상.status).toBe(404);
  });

  it('R162: 스코프가 없으면 요청이 성립하지 않는다', async () => {
    // 기본값을 전역 검색으로 두면 빠뜨린 호출 하나가 명부를 연다.
    expect((await request(app).get('/api/principals').query({ q: '한범' })).status).toBe(404);
  });

  it('R162: 노드 편집 보유자는 그 노드를 대상으로 검색할 수 있다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });
    actingAs = actorFor(stores.principals, me.id);

    const got = await request(app).get('/api/principals').query({ q: '한범', for: `node:${doc}` });

    // `R70-a` 가 넓히기를 편집에게 열었으므로 검색도 거기서 열린다.
    expect(got.status).toBe(200);
    expect(got.body).toEqual(
      expect.arrayContaining([{ id: me.id, name: '한범', kind: 'user', status: 'active', system: false }]),
    );
  });

  it('R162: 보기만 가진 사람은 그 노드를 대상으로 검색할 수 없다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).get('/api/principals').query({ q: '한범', for: `node:${doc}` })).status).toBe(404);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/principals').query({ q: '한', for: `workspace:${ws}` })).status).toBe(401);
  });
});

describe('새 버전 올리기도 업로드 크기 제한을 지킨다 (`IR-SHELL-002` AC-7)', () => {
  it('제한을 넘는 파일은 413 이고 원본은 그대로다', async () => {
    writeSetting(stores.settings, 'upload-size-limit-bytes', '8');

    const sent = await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.alloc(64, 1), '회의록.md');

    expect(sent.status).toBe(413);
    // 검사가 쓰기보다 **먼저**여야 한다 — 뒤면 거절된 파일이 이미 덮여 있다.
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 처음\n');
  });

  it('제한 안이면 그대로 올라간다', async () => {
    writeSetting(stores.settings, 'upload-size-limit-bytes', '1024');

    const sent = await request(app)
      .post(`/api/nodes/${doc}/new-version`)
      .attach('file', Buffer.from('# 다음\n'), '회의록.md');

    expect(sent.status).toBe(204);
  });
});

describe('휴지통 복구 (`FR-SHELL-007`)', () => {
  it('복구하면 트리에 다시 나타난다', async () => {
    await request(app).delete(`/api/nodes/${doc}`);
    expect((await request(app).get('/api/trash').query({ scope: 'all' })).body).toHaveLength(1);

    const back = await request(app).post(`/api/trash/${doc}/restore`);

    expect(back.status).toBe(204);
    expect((await request(app).get('/api/trash').query({ scope: 'all' })).body).toEqual([]);
  });

  it('볼 수 없는 항목은 복구할 수 없다', async () => {
    await request(app).delete(`/api/nodes/${doc}`);
    actingAs = actorFor(stores.principals, me.id);

    expect((await request(app).post(`/api/trash/${doc}/restore`)).status).toBe(404);
  });
});
