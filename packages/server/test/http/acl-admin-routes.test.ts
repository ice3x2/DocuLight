import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { breakInheritance, grantPermission } from '../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../src/app/acl/permission-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let ws: string;
let 열린방: string;
let 닫힌방: string;
let doc: string;
let app: Express;
let actingAs: Actor | undefined;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-acl-admin-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;

  열린방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '열린방' }));
  닫힌방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '닫힌방' }));
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: 열린방, kind: 'file', name: '회의록.md' }));

  actingAs = root;
  app = express();
  app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 그 이름의 활성 사용자를 만들고 배우로 세운다. */
const 사용자 = (name: string): Actor => actorFor(stores.principals, stores.principals.createUser(name).id);

/** 그 이름의 슈퍼유저 — ACL 항목 없이 상방 게이트로만 닿는 사람이다. */
const 슈퍼유저 = (name: string): Actor => {
  const user = stores.principals.createUser(name);
  stores.principals.addMember(SUPERUSER_GROUP_ID, user.id);
  return actorFor(stores.principals, user.id);
};

/**
 * 그 노드를 고립시킨다 — 직접 걸린 항목을 전부 걷는다.
 *
 * 노드를 만들면 생성자에게 편집이 자동으로 붙으므로(`SEC-ACL-011`), 그것을
 * 걷지 않으면 ACL 접근자 0 인 노드를 시험에서 만들 수 없다.
 */
const 고립시킨다 = (nodeId: string): void => {
  for (const entry of stores.acl.entriesOnAny([nodeId])) stores.acl.revoke(entry.id);
};

describe('접근자 지표 — 두 축을 서로 다른 이름으로 내보낸다 (`IR-ACL-001` · `SEC-ACL-015`)', () => {
  it('접근 가능과 ACL 접근자를 각각 준다', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    슈퍼유저('감사자');

    const res = await request(app).get(`/api/nodes/${doc}/accessors`);

    expect(res.status).toBe(200);
    // 두 수치가 **다른 키**로 온다 — 한 칸에 담기면 화면이 어느 축인지
    // 고를 수 없다 (`IR-ACL-001` AC-7).
    expect(Object.keys(res.body.metrics).sort()).toEqual(['reachable', 'viaAcl']);
    // 감사자는 상방 게이트로만 닿으므로 `reachable` 에는 들고 `viaAcl` 에서는
    // 빠진다. 설치자와 한범은 각각 생성자 항목과 워크스페이스 보기로 닿으니
    // 둘 다에 든다.
    expect(res.body.metrics.reachable).toBe(3);
    expect(res.body.metrics.viaAcl).toBe(2);
  });

  it('ACL 로 아무도 닿지 못하는 노드에서도 접근 가능 수치가 0 이 아니다 (`IR-ACL-001` AC-5)', async () => {
    고립시킨다(닫힌방);

    const res = await request(app).get(`/api/nodes/${닫힌방}/accessors`);

    expect(res.body.metrics.reachable).toBeGreaterThan(0);
    expect(res.body.metrics.viaAcl).toBe(0);
  });

  it('편집 보유자는 수치를 받고 명단은 받지 못한다 (`SEC-ACL-015` AC-5 · AC-6)', async () => {
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 편집자.id, level: 'edit' });
    actingAs = actorFor(stores.principals, 편집자.id);

    const res = await request(app).get(`/api/nodes/${doc}/accessors`);

    expect(res.status).toBe(200);
    expect(res.body.metrics.reachable).toBeGreaterThan(0);
    // 이니셜·부분 목록으로 줄여 주는 자리도 없다 — 통째로 `null` 이다.
    expect(res.body.roster).toBeNull();
  });

  it('관리 보유자만 명단을 받는다 (`SEC-ACL-015` AC-1)', async () => {
    const 관리자 = 사용자('관리자');
    grantPermission(stores, root, { nodeId: ws, principalId: 관리자.id, level: 'admin' });
    actingAs = actorFor(stores.principals, 관리자.id);

    const res = await request(app).get(`/api/nodes/${doc}/accessors`);

    expect(res.body.roster).toContain(관리자.id);
  });

  it('보기만 가진 사람에게는 없는 노드와 같은 404 다 (`SEC-ACL-006`)', async () => {
    const 구경꾼 = 사용자('구경꾼');
    grantPermission(stores, root, { nodeId: ws, principalId: 구경꾼.id, level: 'view' });
    actingAs = actorFor(stores.principals, 구경꾼.id);

    const 있는노드 = await request(app).get(`/api/nodes/${doc}/accessors`);
    const 없는노드 = await request(app).get('/api/nodes/nope/accessors');

    expect(있는노드.status).toBe(404);
    expect(있는노드.status).toBe(없는노드.status);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get(`/api/nodes/${doc}/accessors`)).status).toBe(401);
  });
});

describe('이동 프리뷰 — 전후 인원 수만 준다 (`FR-ACL-006`)', () => {
  it('이동 전과 이동 후를 함께 준다', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });

    const res = await request(app).get(`/api/nodes/${doc}/move-preview`).query({ destinationId: 닫힌방 });

    expect(res.status).toBe(200);
    // 명단을 실을 칸이 응답에 없다 (AC-3).
    expect(Object.keys(res.body).sort()).toEqual(['after', 'before']);
    expect(res.body.before).toBe(2);
    expect(res.body.after).toBe(1);
  });

  it('목적지를 바꾸면 이동 후 수치가 그 목적지 기준으로 갈린다 (AC-2)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });
    const 또다른방 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '또다른방' }),
    );
    grantPermission(stores, root, { nodeId: 또다른방, principalId: 한범.id, level: 'view' });

    const 닫힌쪽 = await request(app).get(`/api/nodes/${doc}/move-preview`).query({ destinationId: 닫힌방 });
    const 열린쪽 = await request(app).get(`/api/nodes/${doc}/move-preview`).query({ destinationId: 또다른방 });

    expect(닫힌쪽.body.after).toBe(1);
    expect(열린쪽.body.after).toBe(2);
  });

  it('목적지를 비우면 워크스페이스 루트로 옮기는 것이다', async () => {
    const res = await request(app).get(`/api/nodes/${doc}/move-preview`);

    expect(res.status).toBe(200);
    expect(res.body.after).toBeGreaterThan(0);
  });

  it('옮길 수 없는 사람에게는 404 다', async () => {
    const 구경꾼 = 사용자('구경꾼');
    grantPermission(stores, root, { nodeId: ws, principalId: 구경꾼.id, level: 'view' });
    actingAs = actorFor(stores.principals, 구경꾼.id);

    expect((await request(app).get(`/api/nodes/${doc}/move-preview`)).status).toBe(404);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get(`/api/nodes/${doc}/move-preview`)).status).toBe(401);
  });
});

describe('일괄 회수 — 미리보기와 실행이 같은 문을 쓴다 (`FR-ACL-003`)', () => {
  it('미리보기가 워크스페이스·경로·레벨·부여자·부여 시각을 가진 행을 준다 (AC-4)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    const res = await request(app).get(`/api/principals/${한범.id}/revocation`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      workspaceName: '기획팀',
      path: '열린방/회의록.md',
      level: 'view',
      grantedBy: root.id,
    });
    expect(typeof res.body.rows[0].grantedAt).toBe('string');
  });

  it('적용 범위를 요청자 레벨에 따라 실어 보낸다 (`FR-PRINCIPAL-004`)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    const 슈퍼 = await request(app).get(`/api/principals/${한범.id}/revocation`);

    const 관리자 = 사용자('관리자');
    grantPermission(stores, root, { nodeId: ws, principalId: 관리자.id, level: 'admin' });
    actingAs = actorFor(stores.principals, 관리자.id);
    const 관리 = await request(app).get(`/api/principals/${한범.id}/revocation`);

    expect(슈퍼.body.scope).toBe('instance');
    expect(관리.body.scope).toBe('managed-workspaces');
  });

  it('실행하면 그 주체의 항목이 사라지고 계정과 멤버십은 남는다 (AC-1 · AC-2 · AC-5)', async () => {
    const 한범 = 사용자('한범');
    const 그룹 = stores.principals.createGroup('기획');
    stores.principals.addMember(그룹.id, 한범.id);
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });

    const res = await request(app).post(`/api/principals/${한범.id}/revocation`);

    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), doc)).toBeNull();
    expect(stores.principals.groupsOf(한범.id)).toContain(그룹.id);
    expect(stores.principals.findById(한범.id)?.status).toBe('active');
  });

  it('상속이 끊긴 노드의 항목도 함께 걷힌다 (AC-3)', async () => {
    const 한범 = 사용자('한범');
    breakInheritance(stores, root, 열린방);
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });

    await request(app).post(`/api/principals/${한범.id}/revocation`);

    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 열린방)).toBeNull();
  });

  it('시스템 그룹도 대상이다 (`FR-PRINCIPAL-010`)', async () => {
    const { DEFAULT_GROUP_ID } = await import('../../src/domain/principal/system-groups.js');
    grantPermission(stores, root, { nodeId: doc, principalId: DEFAULT_GROUP_ID, level: 'view' });

    const res = await request(app).get(`/api/principals/${DEFAULT_GROUP_ID}/revocation`);

    expect(res.body.rows).toHaveLength(1);
  });

  it('관리 레벨이 없으면 미리보기도 실행도 404 다', async () => {
    const 한범 = 사용자('한범');
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });
    actingAs = actorFor(stores.principals, 편집자.id);

    expect((await request(app).get(`/api/principals/${한범.id}/revocation`)).status).toBe(404);
    expect((await request(app).post(`/api/principals/${한범.id}/revocation`)).status).toBe(404);
    // 거부가 실제로 걷지 않았음을 함께 잰다 — 상태 코드만 보면 걷고 나서
    // 404 를 주는 구현도 통과한다.
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), doc)).toBe('view');
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/principals/누구/revocation')).status).toBe(401);
    expect((await request(app).post('/api/principals/누구/revocation')).status).toBe(401);
  });
});

describe('유효 권한 시뮬레이션 (`FR-ACL-004`)', () => {
  it('그 주체 관점의 노드별 레벨과 출처를 준다 (AC-1 · AC-5)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'edit' });

    const res = await request(app).get('/api/simulation').query({ subjectId: 한범.id });

    expect(res.status).toBe(200);
    expect(res.body.subjectId).toBe(한범.id);
    const 방 = res.body.nodes.find((n: { nodeId: string }) => n.nodeId === 열린방);
    const 문서 = res.body.nodes.find((n: { nodeId: string }) => n.nodeId === doc);
    expect(방).toMatchObject({ level: 'edit', source: 'direct' });
    expect(문서).toMatchObject({ level: 'edit', source: 'inherited' });
  });

  it('못 보는 노드도 행으로 나온다 — 그것이 이 화면의 답이다 (AC-6)', async () => {
    const 한범 = 사용자('한범');

    const res = await request(app).get('/api/simulation').query({ subjectId: 한범.id });

    const 닫힌 = res.body.nodes.find((n: { nodeId: string }) => n.nodeId === 닫힌방);
    expect(닫힌).toMatchObject({ level: null, source: null });
  });

  it('주체를 지정하지 않으면 400 이다 — 빈 결과를 주면 화면이 권한 없음으로 읽는다', async () => {
    expect((await request(app).get('/api/simulation')).status).toBe(400);
  });

  it('관리 레벨이 없으면 404 다 (AC-4)', async () => {
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    actingAs = actorFor(stores.principals, 편집자.id);

    expect((await request(app).get('/api/simulation').query({ subjectId: 편집자.id })).status).toBe(404);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/simulation').query({ subjectId: 'x' })).status).toBe(401);
  });
});

describe('상속 끊김 감사 (`FR-ACL-005`)', () => {
  it('끊긴 노드만 ACL 접근자 수와 함께 준다 (AC-1 · AC-4)', async () => {
    breakInheritance(stores, root, 닫힌방);
    고립시킨다(닫힌방);

    const res = await request(app).get('/api/broken-inheritance');

    expect(res.status).toBe(200);
    expect(res.body.rows.map((r: { nodeId: string }) => r.nodeId)).toEqual([닫힌방]);
    // 지표명이 `aclAccessors` 다 — `reachable` 을 쓰면 상방 게이트가 섞여
    // 고립 노드를 찾는다는 이 목록의 목적이 무너진다.
    expect(res.body.rows[0]).toMatchObject({ path: '닫힌방', aclAccessors: 0 });
    expect(res.body.rows[0].reachable).toBeUndefined();
  });

  it('되돌리면 다시 조상의 항목을 받고 목록에서 빠진다 (AC-2 · AC-3)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, 닫힌방);
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 닫힌방)).toBeNull();

    const res = await request(app).post(`/api/nodes/${닫힌방}/restore-inheritance`);

    expect(res.status).toBe(204);
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 닫힌방)).toBe('view');
    expect((await request(app).get('/api/broken-inheritance')).body.rows).toHaveLength(0);
  });

  it('관리 레벨이 없으면 목록도 되돌리기도 막힌다 (AC-7)', async () => {
    breakInheritance(stores, root, 닫힌방);
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    actingAs = actorFor(stores.principals, 편집자.id);

    expect((await request(app).get('/api/broken-inheritance')).status).toBe(404);
    expect((await request(app).post(`/api/nodes/${닫힌방}/restore-inheritance`)).status).toBe(404);
    expect(stores.nodes.findById(닫힌방)?.inheritsAcl).toBe(false);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get('/api/broken-inheritance')).status).toBe(401);
    expect((await request(app).post(`/api/nodes/${닫힌방}/restore-inheritance`)).status).toBe(401);
  });
});
