import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../src/app/acl/permission-service.js';
import { createNode } from '../../src/app/node/node-service.js';
import { readSetting } from '../../src/app/settings/instance-settings.js';
import { createWorkspace } from '../../src/app/workspace/create-workspace.js';
import { SUPERUSER_GROUP_ID } from '../../src/domain/principal/system-groups.js';
import { workspaceApiRouter } from '../../src/http/routes/workspace-api.js';
import { FsWorkspaceFiles } from '../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../support/acl-fixture.js';

const NOW = new Date('2026-09-18T12:00:00.000Z');

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & {
  metadata: Database;
  transaction: Database['transaction'];
};
let root: Actor;
let ordinary: Actor;
let app: Express;
let actingAs: Actor | undefined;
let workspaceId: string;
let currentNow: Date;

const idOf = (result: unknown) => (result as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-retention-impact-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  currentNow = NOW;
  stores = Object.assign(attachmentStores(db, docsRoot, () => currentNow), {
    metadata: db,
    transaction: <T,>(fn: () => T): T => db.transaction(fn),
  });
  root = superuserActor(stores);
  ordinary = actorFor(stores.principals, stores.principals.createUser('ordinary').id);
  workspaceId = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, 'work')).id;
  actingAs = root;
  app = express();
  app.use(express.json());
  app.use('/api', workspaceApiRouter({ stores, actorOf: () => actingAs }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

function appendOldAudit(id: string, occurredAt = '2026-01-01 00:00:00'): void {
  db.run('INSERT INTO audit_log (id, occurred_at, operation, actor) VALUES (?, ?, ?, ?)', [
    id,
    occurredAt,
    'test.old',
    root.id,
  ]);
}

function appendFinding(id: string, auditIds: readonly string[]): void {
  db.run('INSERT INTO reconciliation_finding (id, type) VALUES (?, ?)', [id, 'test']);
  auditIds.forEach((auditId, ordinal) => {
    db.run(
      'INSERT INTO reconciliation_finding_audit_ref (finding_id, audit_log_id, ordinal) VALUES (?, ?, ?)',
      [id, auditId, ordinal],
    );
  });
}

function trashDirectoryWithChild(
  rootId: string = randomUUID(),
  deletedAt = '2026-01-01T00:00:00.000Z',
): { rootId: string; childId: string } {
  const createdRoot = idOf(createNode(stores, root, {
    workspaceId,
    parentId: null,
    kind: 'directory',
    name: `folder-${rootId}`,
  }));
  const childId = idOf(createNode(stores, root, {
    workspaceId,
    parentId: createdRoot,
    kind: 'file',
    name: `child-${rootId}.md`,
  }));
  db.run(
    'INSERT INTO trash_entry (node_id, workspace_id, original_path, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?)',
    [createdRoot, workspaceId, `folder-${rootId}`, deletedAt, root.id],
  );
  return { rootId: createdRoot, childId };
}

async function preview(patch: Record<string, string>) {
  const response = await request(app).post('/api/settings/retention-impact').send({ patch });
  expect(response.status).toBe(200);
  return response;
}

function settingsAuditRows() {
  return db.all<{ operation: string; before_value: string; after_value: string }>(
    "SELECT operation, before_value, after_value FROM audit_log WHERE operation LIKE 'settings.%' ORDER BY operation",
  );
}

function expectUnchanged(): void {
  expect(readSetting(stores.settings, 'trash-retention-days')).toBe('30');
  expect(readSetting(stores.settings, 'audit-retention-days')).toBe('365');
  expect(readSetting(stores.settings, 'signup-mode')).toBe('approval');
  expect(settingsAuditRows()).toEqual([]);
}

function appWithForbiddenImpactScan(actor: Actor | undefined) {
  let scanCalls = 0;
  const forbiddenMetadata = new Proxy(db, {
    get(target, property, receiver) {
      if (['all', 'get', 'run', 'transaction'].includes(String(property))) {
        return () => {
          scanCalls += 1;
          throw new Error(`authoritative scan reached ${String(property)}`);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  const guardedApp = express();
  guardedApp.use(express.json());
  guardedApp.use('/api', workspaceApiRouter({
    stores: Object.assign({}, stores, { metadata: forbiddenMetadata }),
    actorOf: () => actor,
  }));
  return { guardedApp, scanCalls: () => scanCalls };
}

function databaseIdentity(): Record<string, unknown[]> {
  const tables = db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return Object.fromEntries(tables.map(({ name }) => [name, db.all(`SELECT * FROM "${name}" ORDER BY rowid`)]));
}

async function fileIdentity(at: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(current: string, relative: string): Promise<void> {
    for (const name of (await readdir(current)).sort()) {
      const full = join(current, name);
      const child = relative === '' ? name : `${relative}/${name}`;
      const entry = await lstat(full);
      if (entry.isSymbolicLink()) result[child] = `symlink:${await readlink(full)}`;
      else if (entry.isDirectory()) {
        result[`${child}/`] = 'directory';
        await visit(full, child);
      } else result[child] = `file:${createHash('sha256').update(await readFile(full)).digest('hex')}`;
    }
  }
  result['./'] = 'directory';
  await visit(at, '');
  return result;
}

describe('FR-CONFIRM-024 — retention impact preview and save consent', () => {
  it('AC-1/AC-3: counts coordinated shortening as disjoint trash-node, audit-row and finding identities', async () => {
    trashDirectoryWithChild();
    appendOldAudit('audit-old');
    appendFinding('finding-one', ['audit-old']);

    const previewResponse = await preview({ 'trash-retention-days': '7', 'audit-retention-days': '30' });

    expect(previewResponse.status).toBe(200);
    expect(previewResponse.headers['cache-control']).toContain('no-store');
    expect(previewResponse.body).toMatchObject({
      beforeRetention: { 'trash-retention-days': '30', 'audit-retention-days': '365' },
      proposedRetention: { 'trash-retention-days': '7', 'audit-retention-days': '30' },
      shortened: expect.arrayContaining(['trash-retention-days', 'audit-retention-days']),
      impact: { trashNodes: 2, auditRows: 1, findings: 1, total: 4 },
      grade: 'L3',
      typingToken: '4',
    });
    expect(previewResponse.body.receipt).toEqual(expect.any(String));
    expect(previewResponse.body.shortened).toHaveLength(2);
    expect(JSON.stringify(previewResponse.body)).not.toContain('audit-old');
    expect(JSON.stringify(previewResponse.body)).not.toContain('finding-one');
  });

  it('AC-2/AC-3: a fresh zero preview is L2 and authorizes the exact patch without a typing token', async () => {
    const patch = { 'trash-retention-days': '7' };
    const previewResponse = await preview(patch);

    expect(previewResponse.body).toMatchObject({
      impact: { trashNodes: 0, auditRows: 0, findings: 0, total: 0 },
      grade: 'L2',
      typingToken: null,
    });

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', previewResponse.body.receipt)
      .send(patch);

    expect(saved.status).toBe(204);
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('7');
  });

  it('runs the positive real HTTP GET -> preview -> PUT -> GET chain and persists settings plus per-field audits', async () => {
    appendOldAudit('http-chain-old');
    const patch = { 'trash-retention-days': '7', 'audit-retention-days': '30', 'signup-mode': 'open' };
    const before = await request(app).get('/api/settings');
    expect(before.status).toBe(200);
    expect(before.body['trash-retention-days']).toBe('30');

    const checked = await request(app).post('/api/settings/retention-impact').send({ patch });
    expect(checked.status).toBe(200);
    expect(checked.body.grade).toBe('L3');
    expect(checked.body.impact.total).toBeGreaterThan(0);

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', checked.body.receipt)
      .set('X-Retention-Impact-Token', String(checked.body.impact.total))
      .send(patch);
    expect(saved.status).toBe(204);

    const after = await request(app).get('/api/settings');
    expect(after.status).toBe(200);
    expect(after.body).toMatchObject(patch);
    expect(settingsAuditRows()).toEqual([
      { operation: 'settings.audit-retention-days', before_value: '365', after_value: '30' },
      { operation: 'settings.signup-mode', before_value: 'approval', after_value: 'open' },
      { operation: 'settings.trash-retention-days', before_value: '30', after_value: '7' },
    ]);
  });

  it('AC-4: rejects a same-total replacement and writes neither the patch nor its audit row', async () => {
    const first = trashDirectoryWithChild('first');
    const patch = { 'trash-retention-days': '7', 'signup-mode': 'open' };
    const previewResponse = await preview(patch);

    db.run('DELETE FROM trash_entry WHERE node_id = ?', [first.rootId]);
    trashDirectoryWithChild('replacement');

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', previewResponse.body.receipt)
      .set('X-Retention-Impact-Token', '2')
      .send(patch);

    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
    expectUnchanged();
  });

  it('AC-4: requires a receipt and exact positive total token for every destructive save', async () => {
    trashDirectoryWithChild();
    const patch = { 'trash-retention-days': '7' };
    const previewResponse = await preview(patch);

    const missing = await request(app).put('/api/settings').send(patch);
    expect(missing.status).toBe(409);
    expect(missing.body).toEqual({
      code: 'retention-confirmation-required',
    });
    const wrongToken = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', previewResponse.body.receipt)
      .set('X-Retention-Impact-Token', '02')
      .send(patch);
    expect(wrongToken.status).toBe(409);
    expect(wrongToken.body).toEqual({ code: 'retention-confirmation-stale' });
    expectUnchanged();
  });

  it('AC-5: preserves receiptless compatibility for expansions and finite-to-unlimited changes', async () => {
    expect((await request(app).put('/api/settings').send({ 'trash-retention-days': '60' })).status).toBe(204);
    expect((await request(app).put('/api/settings').send({ 'audit-retention-days': '0' })).status).toBe(204);
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('60');
    expect(readSetting(stores.settings, 'audit-retention-days')).toBe('0');
  });

  it('keeps preview superuser-only and rejects malformed or unknown patches before scanning', async () => {
    actingAs = ordinary;
    expect((await request(app).post('/api/settings/retention-impact').send({ patch: {} })).status).toBe(403);
    actingAs = undefined;
    expect((await request(app).post('/api/settings/retention-impact').send({ patch: {} })).status).toBe(401);
    actingAs = root;
    expect((await request(app).post('/api/settings/retention-impact').send({ patch: { unknown: '1' } })).status).toBe(400);
    expect((await request(app).post('/api/settings/retention-impact').send({ patch: { 'trash-retention-days': -1 } })).status).toBe(400);
  });
});

describe('FR-CONFIRM-024 — authoritative impact-set semantics', () => {
  it('deduplicates nested trash roots, finding references, and equal IDs across namespaces', async () => {
    const nested = trashDirectoryWithChild('nested');
    db.run(
      'INSERT INTO trash_entry (node_id, workspace_id, original_path, deleted_at, deleted_by) VALUES (?, ?, ?, ?, ?)',
      [nested.childId, workspaceId, 'nested/child.md', '2026-01-01T00:00:00.000Z', root.id],
    );
    appendOldAudit(nested.rootId);
    appendOldAudit('audit-second');
    appendFinding(nested.rootId, [nested.rootId, 'audit-second']);

    const response = await preview({ 'trash-retention-days': '7', 'audit-retention-days': '30' });

    expect(response.body.impact).toEqual({ trashNodes: 2, auditRows: 2, findings: 1, total: 5 });
    expect(JSON.stringify(response.body)).not.toContain(nested.rootId);
    expect(JSON.stringify(response.body)).not.toContain('audit-second');
  });

  it('uses trash <= millisecond cutoff, audit < UTC-second cutoff, and includes already-overdue items', async () => {
    trashDirectoryWithChild('trash-boundary', '2026-09-11T12:00:00.000Z');
    appendOldAudit('audit-boundary', '2026-09-11 12:00:00');
    appendOldAudit('audit-before', '2026-09-11 11:59:59');
    appendOldAudit('already-overdue', '2025-01-01 00:00:00');

    const response = await preview({ 'trash-retention-days': '7', 'audit-retention-days': '7' });

    expect(response.body.impact).toEqual({ trashNodes: 2, auditRows: 2, findings: 0, total: 4 });
  });

  it('computes each domain only when that domain shortens and leaves unchanged zero semantics alone', async () => {
    trashDirectoryWithChild();
    appendOldAudit('audit-old');

    const trashOnly = await preview({ 'trash-retention-days': '7' });
    const auditOnly = await preview({ 'audit-retention-days': '30' });
    const unchangedUnlimited = await preview({ 'trash-retention-days': '30', 'audit-retention-days': '365' });

    expect(trashOnly.body.impact).toEqual({ trashNodes: 2, auditRows: 0, findings: 0, total: 2 });
    expect(auditOnly.body.impact).toEqual({ trashNodes: 0, auditRows: 1, findings: 0, total: 1 });
    expect(unchangedUnlimited.body).toMatchObject({
      shortened: [],
      impact: { trashNodes: 0, auditRows: 0, findings: 0, total: 0 },
      grade: null,
      typingToken: null,
      receipt: null,
    });
  });

  it('treats unlimited-to-fractional finite retention as shortening using the full decimal value', async () => {
    stores.settings.set('trash-retention-days', '0');
    stores.settings.set('audit-retention-days', '0');
    trashDirectoryWithChild('fractional', '2026-09-17T23:59:59.999Z');

    const response = await preview({ 'trash-retention-days': '0.5', 'audit-retention-days': '0.5' });

    expect(response.body).toMatchObject({
      beforeRetention: { 'trash-retention-days': '0', 'audit-retention-days': '0' },
      proposedRetention: { 'trash-retention-days': '0.5', 'audit-retention-days': '0.5' },
      shortened: expect.arrayContaining(['trash-retention-days', 'audit-retention-days']),
      impact: { trashNodes: 2 },
    });
    expect(response.body.shortened).toHaveLength(2);
  });

  it('has zero persistence side effects and returns an exact confidential no-store response shape', async () => {
    const trashed = trashDirectoryWithChild();
    appendOldAudit('secret-audit-id');
    appendFinding('secret-finding-id', ['secret-audit-id']);
    const credentials = 'NeverExpose-credential-123';
    const beforeDatabase = databaseIdentity();
    const beforeFiles = await fileIdentity(join(dir, 'docs'));

    const response = await preview({ 'trash-retention-days': '7', 'audit-retention-days': '30' });

    expect(Object.keys(response.body).sort()).toEqual([
      'beforeRetention', 'computedAt', 'grade', 'impact', 'proposedRetention', 'receipt', 'shortened', 'typingToken',
    ].sort());
    expect(new Date(response.body.computedAt).toISOString()).toBe(response.body.computedAt);
    expect(response.headers['cache-control']).toContain('no-store');
    const serialized = JSON.stringify(response.body);
    for (const secret of [trashed.rootId, trashed.childId, 'secret-audit-id', 'secret-finding-id', root.id, credentials]) {
      expect(serialized).not.toContain(secret);
      expect(serialized).not.toContain(Buffer.from(secret).toString('base64'));
    }
    expect(databaseIdentity()).toEqual(beforeDatabase);
    expect(await fileIdentity(join(dir, 'docs'))).toEqual(beforeFiles);
  });
});

describe('FR-CONFIRM-024 — receipt binding and save-time revalidation', () => {
  it('accepts the exact positive L3 token and receipt, atomically saving the full patch and one audit row per changed field', async () => {
    trashDirectoryWithChild();
    const patch = {
      'trash-retention-days': '7',
      'audit-retention-days': '30',
      'signup-mode': 'open',
    };
    const response = await preview(patch);

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .set('X-Retention-Impact-Token', response.body.typingToken)
      .send(patch);

    expect(saved.status).toBe(204);
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('7');
    expect(readSetting(stores.settings, 'audit-retention-days')).toBe('30');
    expect(readSetting(stores.settings, 'signup-mode')).toBe('open');
    expect(settingsAuditRows()).toEqual([
      { operation: 'settings.audit-retention-days', before_value: '365', after_value: '30' },
      { operation: 'settings.signup-mode', before_value: 'approval', after_value: 'open' },
      { operation: 'settings.trash-retention-days', before_value: '30', after_value: '7' },
    ]);
  });

  it.each([
    ['forged receipt', async () => ({ receipt: 'forged', patch: { 'trash-retention-days': '7' } })],
    ['changed patch', async () => {
      const response = await preview({ 'trash-retention-days': '7' });
      return { receipt: response.body.receipt, patch: { 'trash-retention-days': '6' } };
    }],
    ['changed accompanying setting', async () => {
      const response = await preview({ 'trash-retention-days': '7', 'signup-mode': 'open' });
      return { receipt: response.body.receipt, patch: { 'trash-retention-days': '7', 'signup-mode': 'invite-only' } };
    }],
  ] as const)('rejects a %s with the exact stale contract and no mutation', async (_label, arrange) => {
    const arranged = await arrange();
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', arranged.receipt)
      .send(arranged.patch);
    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
    expectUnchanged();
  });

  it('binds a receipt to the actor and rechecks superuser privilege at save time', async () => {
    const response = await preview({ 'trash-retention-days': '7' });
    const otherRoot = superuserActor(stores, 'other-root');
    actingAs = otherRoot;
    const crossActor = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send({ 'trash-retention-days': '7' });
    expect(crossActor.status).toBe(409);
    expect(crossActor.body).toEqual({ code: 'retention-confirmation-stale' });

    actingAs = root;
    stores.principals.removeMember(SUPERUSER_GROUP_ID, root.id);
    const lostRole = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send({ 'trash-retention-days': '7' });
    expect(lostRole.status).toBe(403);
    expectUnchanged();
  });

  it('rejects a stale receipt even when a baseline change makes the submitted patch safe', async () => {
    const response = await preview({ 'trash-retention-days': '7' });
    stores.settings.set('trash-retention-days', '5');
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send({ 'trash-retention-days': '7' });
    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('5');
    expect(settingsAuditRows()).toEqual([]);
  });

  it.each(['trash subtree', 'audit identity', 'finding identity', 'finding reference'] as const)(
    'rejects same-total %s membership replacement',
    async (kind) => {
      const trash = trashDirectoryWithChild();
      appendOldAudit('audit-a');
      appendOldAudit('audit-b');
      appendFinding('finding-a', ['audit-a']);
      const patch = { 'trash-retention-days': '7', 'audit-retention-days': '30' };
      const response = await preview(patch);

      if (kind === 'trash subtree') {
        db.run('DELETE FROM node WHERE id = ?', [trash.childId]);
        createNode(stores, root, { workspaceId, parentId: trash.rootId, kind: 'file', name: 'replacement.md' });
      } else if (kind === 'audit identity') {
        db.run("DELETE FROM reconciliation_finding_audit_ref WHERE audit_log_id = 'audit-b'");
        db.run("DELETE FROM audit_log WHERE id = 'audit-b'");
        appendOldAudit('audit-c');
      } else if (kind === 'finding identity') {
        db.run("DELETE FROM reconciliation_finding WHERE id = 'finding-a'");
        appendFinding('finding-b', ['audit-a']);
      } else {
        db.run("DELETE FROM reconciliation_finding_audit_ref WHERE finding_id = 'finding-a'");
        db.run("INSERT INTO reconciliation_finding_audit_ref (finding_id, audit_log_id, ordinal) VALUES ('finding-a', 'audit-b', 0)");
      }

      const saved = await request(app)
        .put('/api/settings')
        .set('X-Retention-Impact-Receipt', response.body.receipt)
        .set('X-Retention-Impact-Token', response.body.typingToken)
        .send(patch);
      expect(saved.status).toBe(409);
      expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
      expectUnchanged();
    },
  );

  it('keeps a receipt valid across clock movement while membership is unchanged', async () => {
    trashDirectoryWithChild();
    const patch = { 'trash-retention-days': '7' };
    const response = await preview(patch);
    currentNow = new Date('2126-09-19T12:00:00.000Z');
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .set('X-Retention-Impact-Token', response.body.typingToken)
      .send(patch);
    expect(saved.status).toBe(204);
  });

  it.each([undefined, '', ' 2', '2 ', '2,000', '1', '99'])(
    'rejects missing, formatted, old, and arbitrary L3 token %j with no mutation',
    async (token) => {
      trashDirectoryWithChild();
      const patch = { 'trash-retention-days': '7' };
      const response = await preview(patch);
      const pending = request(app)
        .put('/api/settings')
        .set('X-Retention-Impact-Receipt', response.body.receipt);
      if (token !== undefined) pending.set('X-Retention-Impact-Token', token);
      const saved = await pending.send(patch);
      expect(saved.status).toBe(409);
      expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
      expectUnchanged();
    },
  );

  it('keeps a receipt valid after unrelated settings and out-of-impact records change', async () => {
    trashDirectoryWithChild();
    const patch = { 'trash-retention-days': '7' };
    const response = await preview(patch);
    stores.settings.set('upload-size-limit-bytes', '200000000');
    appendOldAudit('young-audit', '2026-09-18 11:59:59');
    appendFinding('unrelated-finding', ['young-audit']);
    createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name: 'active-outside-impact.md' });

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .set('X-Retention-Impact-Token', response.body.typingToken)
      .send(patch);
    expect(saved.status).toBe(204);
    expect(readSetting(stores.settings, 'upload-size-limit-bytes')).toBe('200000000');
  });

  it('reclassifies a receiptless safe patch as risky against the final baseline', async () => {
    stores.settings.set('trash-retention-days', '30');
    stores.settings.set('audit-retention-days', '365');
    stores.settings.set('trash-retention-days', '0');
    stores.settings.set('audit-retention-days', '0');
    const saved = await request(app).put('/api/settings').send({
      'trash-retention-days': '60',
      'audit-retention-days': '60',
    });
    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-required' });
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('0');
    expect(readSetting(stores.settings, 'audit-retention-days')).toBe('0');
    expect(settingsAuditRows()).toEqual([]);
  });

  it('rechecks a deterministic safe-to-risky race inside the final transaction after a second connection commits', async () => {
    const concurrent = openDatabase(join(dir, 'doculight.db'));
    let releaseBarrier = false;
    const barrierStores = Object.assign({}, stores, {
      metadata: db,
      transaction: <T,>(fn: () => T): T => {
        if (releaseBarrier) {
          concurrent.run(
            "INSERT INTO instance_setting (key, value) VALUES ('trash-retention-days', '0') ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          );
          concurrent.run(
            "INSERT INTO instance_setting (key, value) VALUES ('audit-retention-days', '0') ON CONFLICT (key) DO UPDATE SET value = excluded.value",
          );
          releaseBarrier = false;
        }
        return db.transaction(fn);
      },
    });
    const barrierApp = express();
    barrierApp.use(express.json());
    barrierApp.use('/api', workspaceApiRouter({ stores: barrierStores, actorOf: () => root }));
    releaseBarrier = true;
    try {
      const saved = await request(barrierApp).put('/api/settings').send({
        'trash-retention-days': '60',
        'audit-retention-days': '365',
      });
      expect(saved.status).toBe(409);
      expect(saved.body).toEqual({ code: 'retention-confirmation-required' });
      expect(readSetting(stores.settings, 'trash-retention-days')).toBe('0');
      expect(readSetting(stores.settings, 'audit-retention-days')).toBe('0');
      expect(settingsAuditRows()).toEqual([]);
    } finally {
      concurrent.close();
    }
  });

  it('returns retryable failure and all-zero writes under a real overlapping SQLite write lock', async () => {
    const patch = { 'trash-retention-days': '7' };
    const response = await preview(patch);
    const contender = openDatabase(join(dir, 'doculight.db'));
    try {
      db.run('PRAGMA busy_timeout = 1');
      contender.run('BEGIN IMMEDIATE');
      contender.run("UPDATE principal SET name = name WHERE id = ?", [root.id]);
      const saved = await request(app)
        .put('/api/settings')
        .set('X-Retention-Impact-Receipt', response.body.receipt)
        .send(patch);
      expect(saved.status).toBeGreaterThanOrEqual(500);
      expect(saved.status).toBeLessThan(600);
      expect(saved.headers['content-type']).toMatch(/application\/json/);
      expect(saved.headers['cache-control']).toContain('no-store');
      expect(Object.keys(saved.body)).toEqual(['code']);
      expect(saved.body.code).toMatch(/retry|unavailable|busy|contention/i);
      expect(readSetting(stores.settings, 'trash-retention-days')).toBe('30');
      expect(settingsAuditRows()).toEqual([]);
    } finally {
      contender.run('ROLLBACK');
      contender.close();
    }
  });

  it('rejects a receipt when clock movement crosses the cutoff and changes membership', async () => {
    trashDirectoryWithChild('near-cutoff', '2026-09-12T00:00:00.000Z');
    const patch = { 'trash-retention-days': '7' };
    const response = await preview(patch);
    expect(response.body.impact.total).toBe(0);
    currentNow = new Date('2026-09-20T12:00:00.000Z');
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send(patch);
    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
    expectUnchanged();
  });

  it('detects a baseline race committed through a second SQLite connection', async () => {
    const response = await preview({ 'trash-retention-days': '7' });
    const concurrent = openDatabase(join(dir, 'doculight.db'));
    try {
      concurrent.run(
        "INSERT INTO instance_setting (key, value) VALUES ('trash-retention-days', '20') ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      );
    } finally {
      concurrent.close();
    }
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send({ 'trash-retention-days': '7' });
    expect(saved.status).toBe(409);
    expect(saved.body).toEqual({ code: 'retention-confirmation-stale' });
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('20');
    expect(settingsAuditRows()).toEqual([]);
  });

  it('rolls back every setting and audit row when a later audit append fails', async () => {
    const patch = { 'trash-retention-days': '7', 'signup-mode': 'open' };
    const response = await preview(patch);
    db.run(`CREATE TRIGGER fail_second_settings_audit BEFORE INSERT ON audit_log
      WHEN NEW.operation = 'settings.signup-mode' BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END`);

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send(patch);

    expect(saved.status).toBe(500);
    expect(saved.headers['content-type']).toMatch(/application\/json/);
    expect(saved.headers['cache-control']).toContain('no-store');
    expect(Object.keys(saved.body)).toEqual(['code']);
    expect(typeof saved.body.code).toBe('string');
    expect(JSON.stringify(saved.body)).not.toMatch(/injected|audit|trigger|sqlite|trash|signup|root|password/i);
    expectUnchanged();
  });

  it('rolls back an earlier setting and audit row when a later setting write fails', async () => {
    const patch = { 'trash-retention-days': '7', 'signup-mode': 'open' };
    const response = await preview(patch);
    db.run(`CREATE TRIGGER fail_second_setting BEFORE INSERT ON instance_setting
      WHEN NEW.key = 'signup-mode' BEGIN SELECT RAISE(ABORT, 'injected setting failure'); END`);

    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send(patch);

    expect(saved.status).toBe(500);
    expect(saved.headers['content-type']).toMatch(/application\/json/);
    expect(saved.headers['cache-control']).toContain('no-store');
    expect(Object.keys(saved.body)).toEqual(['code']);
    expect(typeof saved.body.code).toBe('string');
    expect(JSON.stringify(saved.body)).not.toMatch(/injected|setting|trigger|sqlite|trash|signup|root|password/i);
    expectUnchanged();
  });
});

describe('FR-CONFIRM-024 — authorization, availability, and malformed input', () => {
  it('rejects a malformed stored raw retention baseline without silently substituting a default', async () => {
    stores.settings.set('trash-retention-days', 'corrupt-raw-baseline');
    const response = await request(app)
      .post('/api/settings/retention-impact')
      .send({ patch: { 'trash-retention-days': '7' } });
    expect(response.status).toBe(409);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(Object.keys(response.body)).toEqual(['code']);
    expect(typeof response.body.code).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain('corrupt-raw-baseline');
    expect(readSetting(stores.settings, 'trash-retention-days')).toBe('corrupt-raw-baseline');
    expect(settingsAuditRows()).toEqual([]);
  });

  it('returns 401/403 for preview and PUT and rejects a workspace administrator who is not a superuser', async () => {
    stores.acl.grant({ nodeId: workspaceId, principalId: ordinary.id, level: 'admin', grantedBy: root.id });
    const unauthorized = appWithForbiddenImpactScan(undefined);
    expect((await request(unauthorized.guardedApp).post('/api/settings/retention-impact').send({ patch: {} })).status).toBe(401);
    expect(unauthorized.scanCalls()).toBe(0);
    actingAs = undefined;
    expect((await request(app).put('/api/settings').send({ 'trash-retention-days': '7' })).status).toBe(401);
    const workspaceAdministrator = appWithForbiddenImpactScan(ordinary);
    expect((await request(workspaceAdministrator.guardedApp).post('/api/settings/retention-impact').send({ patch: {} })).status).toBe(403);
    expect(workspaceAdministrator.scanCalls()).toBe(0);
    actingAs = ordinary;
    expect((await request(app).put('/api/settings').send({ 'trash-retention-days': '7' })).status).toBe(403);
    expectUnchanged();
  });

  it('rejects a save when the authenticated session disappears after preview', async () => {
    const response = await preview({ 'trash-retention-days': '7' });
    actingAs = undefined;
    const saved = await request(app)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', response.body.receipt)
      .send({ 'trash-retention-days': '7' });
    expect(saved.status).toBe(401);
    expectUnchanged();
  });

  it.each([
    ['expired session', 401, (state: { sessionAlive: boolean }) => { state.sessionAlive = false; }],
    ['revoked session', 401, (state: { sessionAlive: boolean }) => { state.sessionAlive = false; }],
    ['suspended account', 401, (_state: { sessionAlive: boolean }) => { stores.principals.setStatus(root.id, 'suspended'); }],
    ['revoked superuser authority', 403, (_state: { sessionAlive: boolean }) => { stores.principals.removeMember(SUPERUSER_GROUP_ID, root.id); }],
  ] as const)('rechecks %s after route auth at the final transaction barrier', async (_label, status, revoke) => {
    trashDirectoryWithChild('auth-barrier');
    const patch = { 'trash-retention-days': '7' };
    const checked = await preview(patch);
    const state = { sessionAlive: true };
    let crossedBarrier = false;
    const guardedStores = Object.assign({}, stores, {
      metadata: db,
      transaction: <T,>(fn: () => T): T => {
        crossedBarrier = true;
        revoke(state);
        return db.transaction(fn);
      },
    });
    const guardedApp = express();
    guardedApp.use(express.json());
    guardedApp.use('/api', workspaceApiRouter({
      stores: guardedStores,
      actorOf: () => {
        const principal = stores.principals.findById(root.id);
        return state.sessionAlive && principal?.status === 'active'
          ? actorFor(stores.principals, root.id)
          : undefined;
      },
    }));

    const saved = await request(guardedApp)
      .put('/api/settings')
      .set('X-Retention-Impact-Receipt', checked.body.receipt)
      .set('X-Retention-Impact-Token', String(checked.body.impact.total))
      .send(patch);
    expect(crossedBarrier).toBe(true);
    expect(saved.status).toBe(status);
    expectUnchanged();
  });

  it.each([
    ['missing body', undefined],
    ['null body', null],
    ['array body', []],
    ['missing patch', {}],
    ['null patch', { patch: null }],
    ['array patch', { patch: [] }],
    ['unknown key', { patch: { unknown: '1' } }],
    ['numeric value', { patch: { 'trash-retention-days': 7 } }],
    ['blank value', { patch: { 'trash-retention-days': '' } }],
    ['negative value', { patch: { 'trash-retention-days': '-1' } }],
    ['NaN value', { patch: { 'trash-retention-days': 'NaN' } }],
    ['infinite value', { patch: { 'trash-retention-days': 'Infinity' } }],
    ['invalid pair', { patch: { 'trash-retention-days': '0', 'audit-retention-days': '30' } }],
  ] as const)('returns 400 with zero mutation for %s', async (_label, body) => {
    const malformed = appWithForbiddenImpactScan(root);
    const response = body === undefined
      ? await request(malformed.guardedApp).post('/api/settings/retention-impact')
      : await request(malformed.guardedApp).post('/api/settings/retention-impact').send(body as object);
    expect(response.status).toBe(400);
    expect(malformed.scanCalls()).toBe(0);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(Object.keys(response.body)).toEqual(['code']);
    expect(typeof response.body.code).toBe('string');
    expect(JSON.stringify(response.body)).not.toMatch(/ordinary|secret|password|audit-old/);
    expectUnchanged();
  });

  it.each([
    ['null body', null],
    ['array body', []],
    ['unknown key', { unknown: '1' }],
    ['numeric value', { 'trash-retention-days': 7 }],
    ['blank value', { 'trash-retention-days': '' }],
    ['negative value', { 'trash-retention-days': '-1' }],
    ['invalid pair', { 'trash-retention-days': '0', 'audit-retention-days': '30' }],
  ] as const)('returns 400 with zero mutation for malformed PUT %s', async (_label, body) => {
    const response = await request(app).put('/api/settings').send(body as object);
    expect(response.status).toBe(400);
    expectUnchanged();
  });

  it('returns a retryable non-success without mutation when authoritative storage cannot be scanned', async () => {
    const unavailableApp = express();
    unavailableApp.use(express.json());
    unavailableApp.use('/api', workspaceApiRouter({
      stores: Object.assign({}, stores, {
        metadata: {
          run: () => { throw new Error('storage offline'); },
          all: () => { throw new Error('storage offline'); },
          get: () => { throw new Error('storage offline'); },
          transaction: () => { throw new Error('storage offline'); },
        },
      }),
      actorOf: () => root,
    }));
    const response = await request(unavailableApp)
      .post('/api/settings/retention-impact')
      .send({ patch: { 'trash-retention-days': '7' } });
    expect(response.status).not.toBe(200);
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.status).toBeLessThan(600);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(Object.keys(response.body)).toEqual(['code']);
    expect(response.body.code).toMatch(/retry|unavailable|storage/i);
    expect(JSON.stringify(response.body)).not.toMatch(/storage offline|ordinary|secret|password/);
    expectUnchanged();
  });
});
