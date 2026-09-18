import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument } from '../../../src/app/document/save-service.js';
import { search } from '../../../src/app/document/search-service.js';
import { uploadNewVersion } from '../../../src/app/document/new-version.js';
import { TextIndexWorker, startTextIndexWorker } from '../../../src/app/search/text-index-worker.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteTextIndexRepository } from '../../../src/infra/sqlite/text-index-repository.js';
import { contentHash } from '../../../src/domain/document/content-hash.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string; let db: Database; let stores: ReturnType<typeof attachmentStores> & { textIndex: SqliteTextIndexRepository }; let root: ReturnType<typeof superuserActor>; let ws: string; let doc: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'text-worker-'));
  const docsRoot = join(dir, 'docs'); await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'db.sqlite'));
  stores = Object.assign(attachmentStores(db, docsRoot), { textIndex: new SqliteTextIndexRepository(db) });
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '신문 편집국')).id;
  doc = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '기사.md' }) as { ok: true; id: string }).id;
  const path = join(docsRoot, ws, stores.nodes.pathOf(doc)); await mkdir(dirname(path), { recursive: true }); await writeFile(path, '# 옛 기사\n', 'utf8');
});
afterEach(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });

describe('FR-STORAGE-010 AC-1~AC-4 — 실제 비동기 색인', () => {
  it('저장은 처리 완료를 기다리지 않고 durable pending을 남기며 검색은 처리 projection만 쓴다', async () => {
    const read = await readDocument(stores, root, doc);
    const saved = await saveDocument(stores, root, { nodeId: doc, body: '# 새 기사\n\n한글 색인어\n', baseHash: (read as { ok: true; hash: string }).hash });
    expect(saved.ok).toBe(true);
    expect(stores.textIndex.snapshot().items).toMatchObject([{ nodeId: doc, status: 'pending' }]);
    expect((await search(stores, root, { query: '색인어', axes: ['body'] })).documents).toEqual([]);

    const worker = new TextIndexWorker(stores);
    expect(await worker.processOne()).toBe(true);
    expect(stores.textIndex.snapshot().total).toBe(0);
    expect((await search(stores, root, { query: '색인어', axes: ['body'] })).documents[0]?.nodeId).toBe(doc);
  });

  it('읽기 실패는 safe failed로 남고 다음 변경이 최신 pending으로 되돌린다', async () => {
    const prepared = stores.textIndex.prepare(doc, 'not-current'); stores.textIndex.ready(doc, prepared.generation, 'not-current');
    const worker = new TextIndexWorker(stores);
    expect(await worker.processOne()).toBe(true);
    expect(stores.textIndex.snapshot().items[0]).toMatchObject({ status: 'failed', errorCode: 'read_failed' });

    const read = await readDocument(stores, root, doc);
    await saveDocument(stores, root, { nodeId: doc, body: '# 다음\n', baseHash: (read as { ok: true; hash: string }).hash });
    expect(stores.textIndex.snapshot().items[0]).toMatchObject({ status: 'pending' });
  });

  it('제품 loop는 startup recovery 뒤 pending을 처리하고 stop 뒤 새 claim을 만들지 않는다', async () => {
    const read = await readDocument(stores, root, doc);
    await saveDocument(stores, root, { nodeId: doc, body: '# loop 처리\n', baseHash: (read as { ok: true; hash: string }).hash });
    const loop = startTextIndexWorker(stores, { intervalMs: 5 });
    await vi.waitFor(() => expect(stores.textIndex.snapshot().total).toBe(0));
    await loop.stop();
    const later = stores.textIndex.prepare(doc, 'later'); stores.textIndex.ready(doc, later.generation, 'later');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(stores.textIndex.snapshot().total).toBe(1);
  });

  it('기동 시 projection이 없는 기존 검색 대상 문서를 backfill한다', async () => {
    const loop = startTextIndexWorker(stores, { intervalMs: 5 });
    await vi.waitFor(async () => expect((await search(stores, root, { query: '옛 기사', axes: ['body'] })).documents[0]?.nodeId).toBe(doc));
    await loop.stop();
  });

  it('source write 뒤 promotion 전에 중단된 prepared obligation을 기동 때 같은 fingerprint로 복구한다', async () => {
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(doc));
    const accepted = '# accepted before restart\n';
    await writeFile(path, accepted, 'utf8');
    stores.textIndex.prepare(doc, contentHash(accepted));

    const loop = startTextIndexWorker(stores, { intervalMs: 5 });
    await vi.waitFor(() => expect(stores.textIndex.projection(doc)?.body).toBe(accepted));
    await loop.stop();
    expect(stores.textIndex.snapshot().total).toBe(0);
  });

  it('projection 저장 실패는 read failure가 아닌 index_failed로 남긴다', async () => {
    const read = await readDocument(stores, root, doc);
    await saveDocument(stores, root, { nodeId: doc, body: '# index failure\n', baseHash: (read as { ok: true; hash: string }).hash });
    const complete = stores.textIndex.complete.bind(stores.textIndex);
    stores.textIndex.complete = (() => { throw new Error('injected projection write failure'); }) as typeof stores.textIndex.complete;

    await new TextIndexWorker(stores).processOne();

    stores.textIndex.complete = complete;
    expect(stores.textIndex.snapshot().items[0]).toMatchObject({ nodeId: doc, status: 'failed', errorCode: 'index_failed' });
  });

  it('PDF 추출 중 source가 바뀌면 이전 claim을 publish/fail하지 않고 최신 fingerprint를 pending으로 둔다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'race.pdf' }) as { ok: true; id: string }).id;
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(pdf));
    const before = Buffer.from('before');
    const after = Buffer.from('after');
    await writeFile(path, before);
    const firstFingerprint = createHash('sha256').update(before).digest('hex');
    const nextFingerprint = createHash('sha256').update(after).digest('hex');
    const job = stores.textIndex.prepare(pdf, firstFingerprint);
    stores.textIndex.ready(pdf, job.generation, firstFingerprint);

    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => {
      await writeFile(path, after);
      return { ok: true as const, pages: [{ page: 1, text: 'stale' }] };
    } } }).processOne();

    expect(stores.textIndex.projection(pdf)).toBeUndefined();
    expect(stores.textIndex.snapshot().items).toMatchObject([{ nodeId: pdf, status: 'pending' }]);
    expect(stores.textIndex.isCurrentOrQueued(pdf, nextFingerprint)).toBe(true);
  });

  it('추출 중 노드가 서빙 불가가 되면 claim과 projection을 제거한다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'gone.pdf' }) as { ok: true; id: string }).id;
    const bytes = Buffer.from('before');
    await writeFile(join(stores.docsRoot, ws, stores.nodes.pathOf(pdf)), bytes);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    const job = stores.textIndex.prepare(pdf, fingerprint);
    stores.textIndex.ready(pdf, job.generation, fingerprint);

    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => {
      stores.nodes.markOrphaned(pdf, new Date().toISOString());
      return { ok: true as const, pages: [{ page: 1, text: 'hidden' }] };
    } } }).processOne();

    expect(stores.textIndex.projection(pdf)).toBeUndefined();
    expect(stores.textIndex.snapshot().items).toEqual([]);
  });

  it('PDF parse 실패는 parse_failed이고 성공한 모든 페이지는 번호와 함께 한 번에 publish한다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '자료.pdf' }) as { ok: true; id: string }).id;
    const bytes = Buffer.from('pdf fixture'); await writeFile(join(stores.docsRoot, ws, stores.nodes.pathOf(pdf)), bytes);
    const fingerprint = createHash('sha256').update(bytes).digest('hex');
    let job = stores.textIndex.prepare(pdf, fingerprint); stores.textIndex.ready(pdf, job.generation, fingerprint);
    expect(await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => ({ ok: false as const, errorCode: 'parse_failed' as const }) } }).processOne()).toBe(true);
    expect(stores.textIndex.snapshot().items[0]).toMatchObject({ nodeId: pdf, status: 'failed', errorCode: 'parse_failed' });
    job = stores.textIndex.prepare(pdf, fingerprint); stores.textIndex.ready(pdf, job.generation, fingerprint);
    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => ({ ok: true as const, pages: [{ page: 1, text: '' }, { page: 2, text: '둘째 페이지' }] }) } }).processOne();
    expect(stores.textIndex.projection(pdf)?.pages).toEqual([{ page: 1, text: '' }, { page: 2, text: '둘째 페이지' }]);
  });

  it('새 버전 overwrite도 source write 전에 obligation을 만들고 pending으로 승격한다', async () => {
    expect((await uploadNewVersion(stores, root, { nodeId: doc, bytes: Buffer.from('# 새 버전\n') })).ok).toBe(true);
    expect(stores.textIndex.snapshot().items).toMatchObject([{ nodeId: doc, status: 'pending' }]);
  });

  it('비검색 확장자의 새 버전은 text queue를 만들지 않는다', async () => {
    const binary = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'image.png' }) as { ok: true; id: string }).id;
    await writeFile(join(stores.docsRoot, ws, stores.nodes.pathOf(binary)), Buffer.from('old'));

    expect((await uploadNewVersion(stores, root, { nodeId: binary, bytes: Buffer.from('new') })).ok).toBe(true);

    expect(stores.textIndex.snapshot().items.some((item) => item.nodeId === binary)).toBe(false);
  });

  it('비검색 확장자의 일반 save도 text queue를 만들지 않는다', async () => {
    const binary = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'notes.txt' }) as { ok: true; id: string }).id;
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(binary));
    await writeFile(path, 'old', 'utf8');
    const read = await readDocument(stores, root, binary);

    expect((await saveDocument(stores, root, { nodeId: binary, body: 'new', baseHash: (read as { ok: true; hash: string }).hash })).ok).toBe(true);

    expect(stores.textIndex.snapshot().items.some((item) => item.nodeId === binary)).toBe(false);
  });
  it('projection A 뒤 running B 추출 중 source가 A로 복귀하면 matching B claim만 정리한다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'revert.pdf' }) as { ok: true; id: string }).id;
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(pdf));
    const A = Buffer.from('A'); const B = Buffer.from('B');
    const hashA = createHash('sha256').update(A).digest('hex'); const hashB = createHash('sha256').update(B).digest('hex');
    let job = stores.textIndex.prepare(pdf, hashA); stores.textIndex.ready(pdf, job.generation, hashA);
    const claimA = stores.textIndex.claimNext('publish-A')!;
    stores.textIndex.complete(claimA, { body: '', tags: [], pages: [{ page: 1, text: 'projection A' }] });
    await writeFile(path, B); job = stores.textIndex.prepare(pdf, hashB); stores.textIndex.ready(pdf, job.generation, hashB);
    let claimB: ReturnType<typeof stores.textIndex.claimNext>;
    const claimNext = stores.textIndex.claimNext.bind(stores.textIndex);
    stores.textIndex.claimNext = ((claimId: string) => (claimB = claimNext(claimId))) as typeof stores.textIndex.claimNext;

    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => { await writeFile(path, A); return { ok: true as const, pages: [{ page: 1, text: 'stale B' }] }; } } }).processOne();

    expect(stores.textIndex.snapshot().total).toBe(0);
    expect(stores.textIndex.projection(pdf)?.pages).toEqual([{ page: 1, text: 'projection A' }]);
    expect(stores.textIndex.complete(claimB!, { body: '', tags: [], pages: [{ page: 1, text: 'late B' }] })).toBe(false);
  });

  it('running B 추출 뒤 actual C이면 claim-aware reconcile이 C pending을 만들고 stale B를 무효화한다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'replace.pdf' }) as { ok: true; id: string }).id;
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(pdf));
    const B = Buffer.from('B'); const C = Buffer.from('C');
    const hashB = createHash('sha256').update(B).digest('hex'); const hashC = createHash('sha256').update(C).digest('hex');
    await writeFile(path, B); const job = stores.textIndex.prepare(pdf, hashB); stores.textIndex.ready(pdf, job.generation, hashB);
    let claimB: ReturnType<typeof stores.textIndex.claimNext>; let reconciled = false;
    const claimNext = stores.textIndex.claimNext.bind(stores.textIndex);
    stores.textIndex.claimNext = ((claimId: string) => (claimB = claimNext(claimId))) as typeof stores.textIndex.claimNext;
    const repository = stores.textIndex as SqliteTextIndexRepository & { reconcileClaim?: (claim: NonNullable<typeof claimB>, actual: string) => boolean };
    const reconcile = repository.reconcileClaim?.bind(repository);
    repository.reconcileClaim = ((claim, actual) => { reconciled = true; return reconcile?.(claim, actual) ?? false; });

    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => { await writeFile(path, C); return { ok: true as const, pages: [{ page: 1, text: 'stale B' }] }; } } }).processOne();

    expect(reconciled).toBe(true);
    expect(stores.textIndex.snapshot().items).toMatchObject([{ nodeId: pdf, status: 'pending' }]);
    expect(stores.textIndex.isCurrentOrQueued(pdf, hashC)).toBe(true);
    expect(stores.textIndex.complete(claimB!, { body: '', tags: [], pages: [] })).toBe(false);
  });

  it('actual C read 뒤 concurrent newer D enqueue가 끼면 stale B reconcile은 완전한 no-op이다', async () => {
    const pdf = (createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: 'newer.pdf' }) as { ok: true; id: string }).id;
    const path = join(stores.docsRoot, ws, stores.nodes.pathOf(pdf));
    const B = Buffer.from('B'); const C = Buffer.from('C'); const D = Buffer.from('D');
    const hashB = createHash('sha256').update(B).digest('hex'); const hashC = createHash('sha256').update(C).digest('hex'); const hashD = createHash('sha256').update(D).digest('hex');
    await writeFile(path, B); const job = stores.textIndex.prepare(pdf, hashB); stores.textIndex.ready(pdf, job.generation, hashB);
    const enqueueD = () => { writeFileSync(path, D); const newer = stores.textIndex.prepare(pdf, hashD); stores.textIndex.ready(pdf, newer.generation, hashD); };
    const currentOrQueued = stores.textIndex.isCurrentOrQueued.bind(stores.textIndex); let injected = false;
    stores.textIndex.isCurrentOrQueued = ((nodeId: string, fingerprint: string) => { if (!injected && fingerprint === hashC) { injected = true; enqueueD(); return false; } return currentOrQueued(nodeId, fingerprint); }) as typeof stores.textIndex.isCurrentOrQueued;
    const repository = stores.textIndex as SqliteTextIndexRepository & { reconcileClaim?: (claim: NonNullable<ReturnType<typeof stores.textIndex.claimNext>>, actual: string) => boolean };
    const reconcile = repository.reconcileClaim?.bind(repository);
    repository.reconcileClaim = ((claim, actual) => { if (!injected) { injected = true; enqueueD(); } return reconcile?.(claim, actual) ?? false; });

    await new TextIndexWorker({ ...stores, pdf: { extractStrict: async () => { await writeFile(path, C); return { ok: true as const, pages: [{ page: 1, text: 'stale B' }] }; } } }).processOne();

    expect(stores.textIndex.isCurrentOrQueued(pdf, hashD)).toBe(true);
    expect(stores.textIndex.isCurrentOrQueued(pdf, hashC)).toBe(false);
    expect(stores.textIndex.snapshot().items).toMatchObject([{ nodeId: pdf, status: 'pending' }]);
  });
});
