import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { approveAccount, reopenRejected } from '../../../src/app/auth/signup-service.js';
import { NODE_CREATE, createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { workspaceApiRouter } from '../../../src/http/routes/workspace-api.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 감사 기록이 **제품 경로에서** 실제로 남는가 (`OBS-AUDIT-003` AC-2 ·
 * `OBS-AUDIT-001` AC-2).
 *
 * 서비스 함수가 감사 인자를 받아 남기는지를 재는 시험은 이미 있다. 이
 * 파일이 재는 것은 그 인자를 **호출자가 실제로 넘기는가** 다 — 인자가
 * 선택이면 라우트가 빠뜨려도 아무 시험이 죽지 않고, 그때 요구는 통과한
 * 채로 제품에서 0행이 된다.
 */

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & {
  passwords: BcryptPasswordHasher;
};
let root: Actor;
let app: Express;
let actingAs: Actor | undefined;

const PASSWORD = 'x'.repeat(10);
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 행 = (operation: string) =>
  db
    .all<{ operation: string; actor: string; subject_id: string | null }>(
      'SELECT operation, actor, subject_id FROM audit_log WHERE operation = ?',
      [operation],
    );

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-production-audit-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, join(dir, 'docs')), passwords: new BcryptPasswordHasher() };
  root = superuserActor(stores);

  actingAs = root;
  app = express();
  app.use(express.json());
  // 운영과 같은 순서로 세운다 — `apiRouter` 가 파서를 먼저 세우고 그 뒤에
  // 이 라우터가 붙는다. 라우터 자신은 파서를 갖지 않는다.
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OBS-AUDIT-003 — 그룹 멤버십 변경이 제품 경로에서 남는다', () => {
  it('AC-2: 멤버 추가 라우트가 감사 행을 남긴다', async () => {
    const 한범 = stores.principals.createUser('한범');
    const 팀 = stores.principals.createGroup('기획팀');

    await request(app)
      .post(`/api/roster/groups/${팀.id}/members`)
      .send({ userId: 한범.id })
      .expect(204);

    expect(행('principal.member-add')).toEqual([
      { operation: 'principal.member-add', actor: root.id, subject_id: 한범.id },
    ]);
  });

  it('AC-2: 멤버 제거 라우트가 감사 행을 남긴다', async () => {
    const 한범 = stores.principals.createUser('한범');
    const 팀 = stores.principals.createGroup('기획팀');
    stores.principals.addMember(팀.id, 한범.id);

    await request(app).delete(`/api/roster/groups/${팀.id}/members/${한범.id}`).expect(204);

    expect(행('principal.member-remove')).toEqual([
      { operation: 'principal.member-remove', actor: root.id, subject_id: 한범.id },
    ]);
  });
});

describe('OBS-AUDIT-005 — 업로드가 생성 감사 행을 남긴다', () => {
  it('AC-6: 디렉토리 업로드 라우트가 생성 행을 남기고 별도 조작명을 만들지 않는다', async () => {
    const ws = (
      await createWorkspace(
        { workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) },
        '기획팀',
      )
    ).id;
    const 방 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }),
    );
    const 이전 = 행(NODE_CREATE).length;

    await request(app)
      .post(`/api/nodes/${방}/uploads`)
      .attach('file', Buffer.from('binary'), '첨부.png')
      .expect(200);

    // 올려 보지 않고 「upload 라는 조작명이 없다」만 재면 업로드 기능이
    // 아예 없어도 통과한다.
    expect(행(NODE_CREATE)).toHaveLength(이전 + 1);
    expect(
      stores.auditLog
        .operationsInScope([ws], { includeInstance: true })
        .filter((one) => one.includes('upload')),
    ).toEqual([]);
  });
});

describe('OBS-AUDIT-003 — 계정 상태 전환이 제품 경로에서 남는다', () => {
  const 계정 = async (status: 'pending' | 'rejected') =>
    idOf(await registerAccount(stores, { name: `${status}인`, password: PASSWORD, status }));

  it('AC-2: 가입 승인이 감사 행을 남긴다', async () => {
    const 신청자 = await 계정('pending');

    expect(approveAccount(stores, root.id, 신청자)).toEqual({ ok: true });

    expect(행('principal.status')).toEqual([
      { operation: 'principal.status', actor: root.id, subject_id: 신청자 },
    ]);
  });

  it('AC-2: 재심사 복귀가 감사 행을 남긴다', async () => {
    const 거절된 = await 계정('rejected');

    expect(reopenRejected(stores, root.id, 거절된)).toEqual({ ok: true });

    expect(행('principal.status')).toEqual([
      { operation: 'principal.status', actor: root.id, subject_id: 거절된 },
    ]);
  });

  it('AC-2: 슈퍼유저가 아닌 사람의 승인 시도는 행을 남기지 않는다', async () => {
    const 신청자 = await 계정('pending');
    const 구경꾼 = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);

    expect(approveAccount(stores, 구경꾼.id, 신청자).ok).toBe(false);

    expect(행('principal.status')).toEqual([]);
  });

  it('AC-2: 승인한 사람이 행위자로 남는다', async () => {
    const 다른보스 = stores.principals.createUser('다른보스');
    stores.principals.addMember(SUPERUSER_GROUP_ID, 다른보스.id);
    const 신청자 = await 계정('pending');

    approveAccount(stores, 다른보스.id, 신청자);

    // 행위자가 고정값이면 누가 승인했는지 되짚을 수 없다.
    expect(행('principal.status')[0]?.actor).toBe(다른보스.id);
  });
});

describe('FR-AUTH-003 — 슈퍼유저 직접 등록은 사용자 관리 안의 조작이다', () => {
  it('AC-1: 사용자 관리 라우트 아래에서 계정이 선다', async () => {
    const res = await request(app)
      .post('/api/roster/users')
      .send({ name: '새사람', password: 'x'.repeat(10) })
      .expect(201);

    // 별도 화면·별도 라우트를 만들지 않는다 (AC-2·AC-3) — 경로가
    // `사용자 관리` 목록과 같은 자리에 붙는다.
    expect(stores.principals.findById(res.body.id)?.name).toBe('새사람');
  });

  it('직접 등록한 계정은 즉시 `active` 다 — 승인해 줄 사람이 이미 있다', async () => {
    const res = await request(app)
      .post('/api/roster/users')
      .send({ name: '새사람', password: 'x'.repeat(10) })
      .expect(201);

    expect(stores.principals.findById(res.body.id)?.status).toBe('active');
  });

  it('AC-4: 슈퍼유저가 아니면 없는 자리와 같은 답이다', async () => {
    actingAs = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);

    const 이전 = stores.principals.membersOf(SUPERUSER_GROUP_ID).length;
    await request(app)
      .post('/api/roster/users')
      .send({ name: '몰래', password: 'x'.repeat(10) })
      .expect(404);

    // 목록 조회와 같은 404 다 — 다르면 그 차이가 자리의 존재를 알린다.
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID).length).toBe(이전);
  });

  it('AC-5: 인증되지 않으면 401 이다', async () => {
    actingAs = undefined;

    await request(app)
      .post('/api/roster/users')
      .send({ name: '몰래', password: 'x'.repeat(10) })
      .expect(401);
  });

  it('빈 비밀번호는 거절된다 — 계정 규칙은 가입 경로와 같은 것을 쓴다', async () => {
    await request(app).post('/api/roster/users').send({ name: '새사람', password: '' }).expect(400);
  });
});
