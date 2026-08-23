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

describe('이동·복사 프리뷰 — 전후 인원 수와 등급을 준다 (`FR-ACL-006` · `FR-CONFIRM-016`)', () => {
  it('이동 전과 이동 후를 함께 준다', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });

    const res = await request(app).get(`/api/nodes/${doc}/relocation-preview`).query({ destinationId: 닫힌방 });

    expect(res.status).toBe(200);
    // 명단을 실을 칸이 응답에 없다 (AC-3).
    expect(Object.keys(res.body).sort()).toEqual(['after', 'before', 'grade', 'kind']);
    expect(res.body.before).toBe(2);
    expect(res.body.after).toBe(1);
  });

  it('수치가 변하는 이동은 L2 이고 변하지 않는 이동은 L1 이다 (`FR-CONFIRM-016`)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });

    const 좁아짐 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 닫힌방 });
    const 그대로 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 열린방 });

    expect(좁아짐.body.grade).toBe('L2');
    expect(그대로.body).toMatchObject({ before: 2, after: 2, grade: 'L1' });
  });

  it('복사는 목적지 기준 수치 하나와 언제나 L2 를 준다 (`FR-ACL-002` · `FR-CONFIRM-017`)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });

    const 넓은쪽 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ kind: 'copy', destinationId: 열린방 });
    const 좁은쪽 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ kind: 'copy', destinationId: 닫힌방 });

    // 전후 두 칸이 아니라 목적지 하나다 — 복사본의 접근자는 목적지 상속에서
    // 파생되므로 「복사 전」 이라는 자리가 성립하지 않는다.
    expect(Object.keys(넓은쪽.body).sort()).toEqual(['grade', 'kind', 'reachable']);
    expect(넓은쪽.body.reachable).toBe(2);
    expect(좁은쪽.body.reachable).toBe(1);
    // 수치가 갈려도 등급은 갈리지 않는다 (`FR-CONFIRM-017` AC-3).
    expect(넓은쪽.body.grade).toBe('L2');
    expect(좁은쪽.body.grade).toBe('L2');
  });

  it('목적지를 바꾸면 이동 후 수치가 그 목적지 기준으로 갈린다 (AC-2)', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: 열린방, principalId: 한범.id, level: 'view' });
    const 또다른방 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '또다른방' }),
    );
    grantPermission(stores, root, { nodeId: 또다른방, principalId: 한범.id, level: 'view' });

    const 닫힌쪽 = await request(app).get(`/api/nodes/${doc}/relocation-preview`).query({ destinationId: 닫힌방 });
    const 열린쪽 = await request(app).get(`/api/nodes/${doc}/relocation-preview`).query({ destinationId: 또다른방 });

    expect(닫힌쪽.body.after).toBe(1);
    expect(열린쪽.body.after).toBe(2);
  });

  it('목적지를 비우면 워크스페이스 루트로 옮기는 것이다', async () => {
    const res = await request(app).get(`/api/nodes/${doc}/relocation-preview`);

    expect(res.status).toBe(200);
    expect(res.body.after).toBeGreaterThan(0);
  });

  it('옮길 수 없는 사람에게는 404 다', async () => {
    const 구경꾼 = 사용자('구경꾼');
    grantPermission(stores, root, { nodeId: ws, principalId: 구경꾼.id, level: 'view' });
    actingAs = actorFor(stores.principals, 구경꾼.id);

    expect((await request(app).get(`/api/nodes/${doc}/relocation-preview`)).status).toBe(404);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).get(`/api/nodes/${doc}/relocation-preview`)).status).toBe(401);
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

  it('시스템 그룹 둘 다 대상이고 실행까지 간다 (`FR-PRINCIPAL-010` AC-2)', async () => {
    const { DEFAULT_GROUP_ID } = await import('../../src/domain/principal/system-groups.js');
    // 조항이 이름 댄 것은 **둘**이다 — `default` 만 재면 슈퍼유저 그룹을
    // 거르는 구현이 통과한다.
    for (const 그룹 of [DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID]) {
      grantPermission(stores, root, { nodeId: doc, principalId: 그룹, level: 'view' });

      expect((await request(app).get(`/api/principals/${그룹}/revocation`)).body.rows).toHaveLength(1);

      // 미리보기에서 멈추지 않는다 — AC-2 가 요구하는 것은 **실행하면
      // 항목이 제거된다**이고, 조회만 재면 그 절반이 빈다.
      const 실행 = await request(app).post(`/api/principals/${그룹}/revocation`);
      expect(실행.status).toBe(200);
      expect(실행.body.rows).toHaveLength(1);
      expect(
        stores.acl.entriesOnAny([doc]).filter((entry) => entry.principalId === 그룹),
      ).toHaveLength(0);
    }
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

describe('이동 프리뷰의 목적지도 인가를 지난다 (`SEC-ACL-006` · `SEC-ACL-014`)', () => {
  it('목적지에 권한이 없으면 그 목적지의 접근자 수가 새지 않는다', async () => {
    const 침입자 = 사용자('침입자');
    // 출발 노드에만 편집을 준다 — 목적지에는 아무 권한이 없다.
    grantPermission(stores, root, { nodeId: 열린방, principalId: 침입자.id, level: 'edit' });
    // 목적지 쪽을 넓혀 두 수치가 달라지게 만든다.
    for (const name of ['갑', '을', '병']) {
      const 사람 = 사용자(name);
      grantPermission(stores, root, { nodeId: 닫힌방, principalId: 사람.id, level: 'view' });
    }
    actingAs = actorFor(stores.principals, 침입자.id);

    const 권한없는목적지 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 닫힌방 });
    const 없는목적지 = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 'nope' });

    // 볼 수 없는 목적지와 없는 목적지가 **같은 답**이다 — 다르면 그 차이가
    // 곧 그 노드의 존재를 알린다.
    expect(권한없는목적지.status).toBe(404);
    expect(권한없는목적지.status).toBe(없는목적지.status);
    expect(권한없는목적지.body).toEqual(없는목적지.body);
  });

  it('워크스페이스 경계를 넘는 목적지도 같은 404 다 (`SEC-ACL-014`)', async () => {
    const 다른곳 = (
      await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '영업팀')
    ).id;
    const 저쪽방 = idOf(
      createNode(stores, root, { workspaceId: 다른곳, parentId: null, kind: 'directory', name: '저쪽방' }),
    );
    const 관리자 = 사용자('관리자');
    grantPermission(stores, root, { nodeId: ws, principalId: 관리자.id, level: 'admin' });
    grantPermission(stores, root, { nodeId: 다른곳, principalId: 관리자.id, level: 'admin' });
    actingAs = actorFor(stores.principals, 관리자.id);

    // 양쪽 다 관리 권한이 있어도 경계는 넘지 못한다 — 인가가 아니라 이동
    // 규칙의 제약이다.
    const res = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 저쪽방 });

    expect(res.status).toBe(404);
  });

  it('목적지에 편집이 있으면 그대로 답한다 — 거부 시험만 두면 아무도 못 쓰는 구현이 통과한다', async () => {
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    actingAs = actorFor(stores.principals, 편집자.id);

    const res = await request(app)
      .get(`/api/nodes/${doc}/relocation-preview`)
      .query({ destinationId: 닫힌방 });

    expect(res.status).toBe(200);
    expect(res.body.after).toBeGreaterThan(0);
  });
});

describe('공유 응답이 상속 조작의 재료를 함께 준다 (`FR-CONFIRM-015` · `SEC-CONFIRM-007`)', () => {
  it('노드 유형·상속 여부·영향 건수를 싣는다', async () => {
    const res = await request(app).get(`/api/nodes/${열린방}/share`);

    expect(res.body).toMatchObject({ nodeKind: 'directory', inheritsAcl: true });
    // 하위 하나(`회의록.md`)가 이 부여의 도달 범위다.
    expect(res.body.reached).toBe(1);
  });

  it('워크스페이스는 상속의 시작점이라 끊을 수 없음을 유형으로 알린다 (`FR-CONFIRM-015` AC-5)', async () => {
    const res = await request(app).get(`/api/nodes/${ws}/share`);

    expect(res.body.nodeKind).toBe('workspace');
  });

  it('상속을 끊으면 그 사실이 응답에 나타난다 (`SEC-CONFIRM-007` AC-1 의 전제)', async () => {
    breakInheritance(stores, root, 열린방);

    expect((await request(app).get(`/api/nodes/${열린방}/share`)).body.inheritsAcl).toBe(false);
  });

  it('문서는 하위가 없으므로 영향 건수가 0 이다', async () => {
    expect((await request(app).get(`/api/nodes/${doc}/share`)).body.reached).toBe(0);
  });
});

describe('상속 끊기와 부모 권한 가져오기가 라우트 위에 선다 (`SEC-ACL-003` · `SEC-CONFIRM-007`)', () => {
  it('관리 보유자는 상속을 끊고 부모 권한을 가져온다', async () => {
    const 한범 = 사용자('한범');
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });

    expect((await request(app).post(`/api/nodes/${열린방}/break-inheritance`)).status).toBe(204);
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 열린방)).toBeNull();

    expect((await request(app).post(`/api/nodes/${열린방}/inherit-from-parent`)).status).toBe(204);
    expect(permissionOf(stores, actorFor(stores.principals, 한범.id), 열린방)).toBe('view');
  });

  it('SEC-CONFIRM-007 AC-3: 편집 레벨이 가져오기를 직접 호출하면 거부된다', async () => {
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    breakInheritance(stores, root, 열린방);
    const 전 = stores.acl.entriesOnAny([열린방]).length;
    actingAs = actorFor(stores.principals, 편집자.id);

    expect((await request(app).post(`/api/nodes/${열린방}/inherit-from-parent`)).status).toBe(404);
    // 거부가 실제로 아무것도 만들지 않았는지 함께 잰다.
    expect(stores.acl.entriesOnAny([열린방])).toHaveLength(전);
  });

  it('편집 레벨은 상속도 끊지 못한다 — 좁히기는 관리에 유보돼 있다', async () => {
    const 편집자 = 사용자('편집자');
    grantPermission(stores, root, { nodeId: ws, principalId: 편집자.id, level: 'edit' });
    actingAs = actorFor(stores.principals, 편집자.id);

    expect((await request(app).post(`/api/nodes/${열린방}/break-inheritance`)).status).toBe(404);
    expect(stores.nodes.findById(열린방)?.inheritsAcl).toBe(true);
  });

  it('인증되지 않은 요청은 401 이다', async () => {
    actingAs = undefined;

    expect((await request(app).post(`/api/nodes/${열린방}/break-inheritance`)).status).toBe(401);
    expect((await request(app).post(`/api/nodes/${열린방}/inherit-from-parent`)).status).toBe(401);
  });
});
