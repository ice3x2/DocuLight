import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { breakInheritance, grantPermission } from '../../src/app/acl/grant-service.js';
import { authenticateSession } from '../../src/app/auth/login-service.js';
import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { sessionTokenOf } from '../../src/http/routes/auth.js';
import { hashSecretToken, newSecretToken } from '../../src/domain/auth/secret-token.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let workspaceId: string;
let candidateId: string;
let app: Express;
let clientToken: string | undefined;
let transaction: <T>(fn: () => T) => T;

const idOf = (value: unknown) => (value as { ok: true; id: string }).id;
const issueSession = (userId: string, expiresAt = new Date(Date.now() + 60 * 60 * 1_000)): string => {
  const token = newSecretToken();
  stores.sessions.create(hashSecretToken(token), {
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return token;
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-admin-preview-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  workspaceId = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획실')).id;
  candidateId = stores.principals.createUser('새 관리자').id;
  clientToken = issueSession(root.id);
  transaction = <T,>(fn: () => T): T => db.transaction(fn);
  app = express();
  app.use((req, _res, next) => {
    if (req.headers.cookie === undefined && clientToken !== undefined) {
      req.headers.cookie = `doculight_session=${encodeURIComponent(clientToken)}`;
    }
    next();
  });
  app.use(express.json());
  app.use('/api', workspaceApiRouter({
    stores: { ...stores, transaction: <T,>(fn: () => T): T => transaction(fn) },
    actorOf: (req) => {
      const token = sessionTokenOf(req.headers.cookie);
      const session = token === undefined ? undefined : authenticateSession(stores, token);
      return session === undefined ? undefined : actorFor(stores.principals, session.userId);
    },
  }));

});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('워크스페이스 관리자 부여 영향 미리보기 (`IR-WORKSPACE-003`)', () => {
  it('서버가 끊긴 상속 아래까지 보이는 하위 항목을 세고 고정된 L2 계약을 반환한다', async () => {
    const folder = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'directory', name: '공개' }));
    const document = idOf(createNode(stores, root, { workspaceId, parentId: folder, kind: 'file', name: '회의.md' }));
    breakInheritance(stores, root, folder);

    const response = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      workspace: { id: workspaceId, name: '기획실' },
      principal: { id: candidateId, name: '새 관리자', kind: 'user', status: 'active', system: false },
      level: 'admin', grade: 'L2', coverage: 'workspace-admin-gate',
      visibleDescendantCount: 2, warnings: [], alreadyAssigned: false,
    });
    expect(response.body.previewToken).toEqual(expect.any(String));
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThan(Date.now());
    expect(document).toBeTruthy();
  });

  it('관리 권한이 없거나 주체가 없고 거절된 경우를 같은 404로 닫고 구조 오류는 400으로 가른다', async () => {
    const outsider = stores.principals.createUser('열람자');
    grantPermission(stores, root, { nodeId: workspaceId, principalId: outsider.id, level: 'view' });
    clientToken = issueSession(outsider.id);
    expect((await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId })).status).toBe(404);
    clientToken = issueSession(root.id);
    expect((await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: 'missing' })).status).toBe(404);
    expect((await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview?principalId=a&principalId=b`)).status).toBe(400);
  });

  it('신선한 토큰으로 한 번만 부여하고 재전송도 감사 행을 늘리지 않는다', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    const append = vi.spyOn(stores.audit, 'append');

    const first = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    const replay = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    expect(stores.acl.entriesOn(workspaceId).filter((row) => row.principalId === candidateId && row.level === 'admin')).toHaveLength(1);
    expect(append.mock.calls.filter(([row]) => row.operation === 'acl.grant')).toHaveLength(1);
  });

  it('보이는 범위가 바뀐 토큰은 409로 거절하고 쓰지 않는다', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name: '새 문서.md' }));

    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ rule: 'preview-stale' });
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
  });

  it('숨김 레코드만 더해진 것은 토큰 오라클이 되지 않고 부여를 유지한다', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    stores.nodes.create({ workspaceId, parentId: null, kind: 'file', name: '.숨김.md' });

    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });

    expect(response.status).toBe(200);
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId && row.level === 'admin')).toBe(true);
  });

  it('감사 기록 실패는 같은 트랜잭션의 ACL 쓰기도 되돌린다', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    vi.spyOn(stores.audit, 'append').mockImplementationOnce(() => { throw new Error('audit unavailable'); });

    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });

    expect(response.status).toBe(500);
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
  });
  it('binds a preview to the exact authentication session, including same-account relogin and revocation', async () => {
    const originalToken = clientToken!;
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    clientToken = issueSession(root.id);
    expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(409);
    clientToken = originalToken;
    expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(200);
    clientToken = undefined;
    expect((await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId })).status).toBe(401);
  });

  it('uses only the canonical doculight session despite unrelated cookie order and never exposes its secret or fingerprint', async () => {
    const secret = clientToken!;
    const fingerprint = hashSecretToken(secret);
    const preview = await request(app)
      .get(`/api/workspaces/${workspaceId}/admin-grant-preview`)
      .set('Cookie', `theme=dark; doculight_session=${encodeURIComponent(secret)}; extra=one`)
      .query({ principalId: candidateId });
    const response = await request(app)
      .post(`/api/workspaces/${workspaceId}/admin-grants`)
      .set('Cookie', `extra=two; doculight_session=${encodeURIComponent(secret)}; theme=light`)
      .send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(response.status).toBe(200);
    const exposed = JSON.stringify([preview.body, response.body, stores.auditLog.inScope([], { includeInstance: true })]);
    expect(exposed).not.toContain(secret);
    expect(exposed).not.toContain(fingerprint);
    expect(exposed).not.toContain('session:v1:');
  });

  it('fails closed when logout, expiry, or password revocation removes the exact session', async () => {
    const assertRevoked = async (revoke: (token: string) => void) => {
      clientToken = issueSession(root.id);
      const token = clientToken;
      const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
      revoke(token);
      const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
      expect(response.status).toBe(401);
      expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
    };
    await assertRevoked((token) => stores.sessions.remove(hashSecretToken(token)));
    await assertRevoked(() => stores.sessions.removeAllFor(root.id));
    clientToken = issueSession(root.id, new Date(Date.now() - 1));
    expect((await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId })).status).toBe(401);
  });

  it('revalidates session and account identity inside the grant transaction', async () => {
    const token = clientToken!;
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    transaction = <T,>(fn: () => T): T => {
      stores.sessions.remove(hashSecretToken(token));
      return db.transaction(fn);
    };
    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(response.status).toBe(401);
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
  });

  it('revalidates the authenticated account status inside the grant transaction', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    transaction = <T,>(fn: () => T): T => {
      stores.principals.setStatus(root.id, 'suspended');
      return db.transaction(fn);
    };
    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(response.status).toBe(401);
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
  });

  it('rejects expired, forged, cross-workspace, cross-principal, and cross-actor tokens without writes', async () => {
    vi.useFakeTimers();
    try {
      const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
      vi.advanceTimersByTime(300_001);
      expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(409);
      vi.useRealTimers();
      expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: 'forged' })).status).toBe(409);
      const otherPrincipal = stores.principals.createUser('other');
      expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: otherPrincipal.id, previewToken: preview.body.previewToken })).status).toBe(409);
      const otherWorkspace = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, 'other')).id;
      expect((await request(app).post(`/api/workspaces/${otherWorkspace}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(409);
      clientToken = issueSession(stores.principals.createUser('other actor').id);
      expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(404);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates identity, status, topology, inheritance, direct assignment, and authority changes', async () => {
    const assertStale = async (mutate: () => void) => {
      const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
      mutate();
      expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken })).status).toBe(409);
    };
    await assertStale(() => stores.workspaces.rename(workspaceId, 'renamed'));
    await assertStale(() => stores.principals.rename(candidateId, 'renamed principal'));
    await assertStale(() => stores.principals.setStatus(candidateId, 'suspended'));
    stores.principals.setStatus(candidateId, 'active');
    const first = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name: 'a.md' }));
    await assertStale(() => stores.nodes.relocate(first, { parentId: null, name: 'b.md' }));
    const folder = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'directory', name: 'folder' }));
    await assertStale(() => { breakInheritance(stores, root, folder); });
    await assertStale(() => { grantPermission(stores, root, { nodeId: workspaceId, principalId: candidateId, level: 'admin' }); });
  });

  it('publishes replay success only after commit and redacts generic failures', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    transaction = () => { throw new Error('secret database path'); };
    const failed = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(failed.status).toBe(500);
    expect(failed.text).not.toContain('secret database path');
    transaction = <T,>(fn: () => T): T => db.transaction(fn);
    const retry = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(retry.status).toBe(200);
    const replay = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(retry.body);
  });

  it('returns an exact nonempty response schema without extra fields', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    expect(Object.keys(preview.body).sort()).toEqual(['alreadyAssigned', 'coverage', 'expiresAt', 'grade', 'level', 'previewToken', 'principal', 'visibleDescendantCount', 'warnings', 'workspace']);
    expect(preview.body.previewToken).not.toBe('');
    const receipt = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(Object.keys(receipt.body).sort()).toEqual(['entryId', 'level', 'principalId', 'workspaceId']);
  });
  it('allows two concurrent deliveries to produce one grant and one audit receipt', async () => {
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    const append = vi.spyOn(stores.audit, 'append');
    const [left, right] = await Promise.all([
      request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken }),
      request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken }),
    ]);
    expect([left.status, right.status]).toEqual([200, 200]);
    expect(left.body).toEqual(right.body);
    expect(stores.acl.entriesOn(workspaceId).filter((row) => row.principalId === candidateId && row.level === 'admin')).toHaveLength(1);
    expect(append.mock.calls.filter(([row]) => row.operation === 'acl.grant')).toHaveLength(1);
  });

  it('does not synthesize another grant or audit when the candidate is already directly assigned', async () => {
    grantPermission(stores, root, { nodeId: workspaceId, principalId: candidateId, level: 'admin' });
    const before = stores.auditLog.inScope([], { includeInstance: true, operation: 'acl.grant' }).length;
    const preview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    expect(preview.body.alreadyAssigned).toBe(true);
    const response = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: preview.body.previewToken });
    expect(response.status).toBe(409);
    expect(stores.auditLog.inScope([], { includeInstance: true, operation: 'acl.grant' })).toHaveLength(before);
  });

  it('rechecks current workspace authority and candidate account eligibility at acceptance', async () => {
    const manager = stores.principals.createUser('manager');
    const managerGrant = grantPermission(stores, root, { nodeId: workspaceId, principalId: manager.id, level: 'admin' });
    if (!managerGrant.ok) throw new Error('manager fixture failed');
    clientToken = issueSession(manager.id);
    const authorityPreview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    stores.acl.revoke(managerGrant.entryId);
    expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: authorityPreview.body.previewToken })).status).toBe(404);

    clientToken = issueSession(root.id);
    const accountPreview = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    stores.principals.setStatus(candidateId, 'rejected');
    expect((await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: accountPreview.body.previewToken })).status).toBe(404);
  });
  it('evicts the oldest live preview when the bounded token store reaches capacity', async () => {
    const first = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
    for (let index = 0; index < 512; index += 1) {
      const response = await request(app).get(`/api/workspaces/${workspaceId}/admin-grant-preview`).query({ principalId: candidateId });
      expect(response.status).toBe(200);
    }
    const evicted = await request(app).post(`/api/workspaces/${workspaceId}/admin-grants`).send({ principalId: candidateId, previewToken: first.body.previewToken });
    expect(evicted.status).toBe(409);
    expect(stores.acl.entriesOn(workspaceId).some((row) => row.principalId === candidateId)).toBe(false);
  });
});
