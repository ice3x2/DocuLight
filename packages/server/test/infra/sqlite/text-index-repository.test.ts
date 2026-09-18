import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteTextIndexRepository } from '../../../src/infra/sqlite/text-index-repository.js';

let dir: string;
let db: Database;
let repo: SqliteTextIndexRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-text-index-'));
  db = openDatabase(join(dir, 'db.sqlite'));
  repo = new SqliteTextIndexRepository(db);
});

afterEach(async () => { db.close(); await rm(dir, { recursive: true, force: true }); });

describe('FR-STORAGE-010 — 영속 텍스트 색인 대기열', () => {
  it('최신 세대만 한 행으로 합치고 오래된 claim은 최신 작업을 지우지 못한다', () => {
    const first = repo.prepare('node-1', 'hash-1', '2026-09-18T00:00:00.000Z');
    repo.ready('node-1', first.generation, 'hash-1');
    const claimed = repo.claimNext('run-1');
    expect(claimed?.generation).toBe(first.generation);

    const latest = repo.prepare('node-1', 'hash-2', '2026-09-18T00:01:00.000Z');
    repo.ready('node-1', latest.generation, 'hash-2');

    expect(repo.complete(claimed!, { body: 'old', tags: [], pages: [] })).toBe(false);
    expect(repo.snapshot().items).toMatchObject([{ nodeId: 'node-1', status: 'pending' }]);
  });

  it('prepared는 claim하지 않고 기동 복구가 running/failed를 pending으로 되돌린다', () => {
    repo.prepare('prepared', 'hash-p', '2026-09-18T00:00:00.000Z');
    const running = repo.prepare('running', 'hash-r', '2026-09-18T00:01:00.000Z');
    repo.ready('running', running.generation, 'hash-r');
    expect(repo.claimNext('run-1')?.nodeId).toBe('running');
    repo.fail('running', running.generation, 'run-1', 'read_failed');

    repo.recover();

    expect(repo.claimNext('run-2')?.nodeId).toBe('running');
    expect(repo.snapshot().items.some((row) => row.nodeId === 'prepared')).toBe(false);
  });

  it('스냅샷은 전체 건수와 요청시각/nodeId 순 최대 100행 및 안전한 오류 코드만 준다', () => {
    for (let index = 100; index >= 0; index -= 1) {
      const id = `node-${String(index).padStart(3, '0')}`;
      const prepared = repo.prepare(id, `hash-${index}`, '2026-09-18T00:00:00.000Z');
      repo.ready(id, prepared.generation, `hash-${index}`);
    }
    const snapshot = repo.snapshot();
    expect(snapshot).toMatchObject({ counts: { pending: 101, running: 0, failed: 0 }, total: 101, limit: 100 });
    expect(snapshot.items).toHaveLength(100);
    expect(snapshot.items[0]?.nodeId).toBe('node-000');
    expect(snapshot.items[99]?.nodeId).toBe('node-099');
  });
  it('claim tuple이 정확히 일치할 때만 projection 복귀/새 fingerprint를 reconcile한다', () => {
    const a = repo.prepare('node', 'A'); repo.ready('node', a.generation, 'A');
    const completedA = repo.claimNext('claim-A')!;
    repo.complete(completedA, { body: 'projection A', tags: [], pages: [] });
    const b = repo.prepare('node', 'B'); repo.ready('node', b.generation, 'B');
    const runningB = repo.claimNext('claim-B')!;

    expect(repo.reconcileClaim(runningB, 'A')).toBe(true);
    expect(repo.snapshot().total).toBe(0);
    expect(repo.projection('node')?.body).toBe('projection A');
    expect(repo.complete(runningB, { body: 'stale B', tags: [], pages: [] })).toBe(false);

    const nextB = repo.prepare('node', 'B'); repo.ready('node', nextB.generation, 'B');
    const claimB = repo.claimNext('claim-B2')!;
    expect(repo.reconcileClaim(claimB, 'C')).toBe(true);
    expect(repo.snapshot().items).toMatchObject([{ nodeId: 'node', status: 'pending' }]);
    expect(repo.isCurrentOrQueued('node', 'C')).toBe(true);
    expect(repo.complete(claimB, { body: 'stale B2', tags: [], pages: [] })).toBe(false);

    const claimC = repo.claimNext('claim-C')!;
    const newerD = repo.prepare('node', 'D'); repo.ready('node', newerD.generation, 'D');
    expect(repo.reconcileClaim(claimC, 'A')).toBe(false);
    expect(repo.isCurrentOrQueued('node', 'D')).toBe(true);
    expect(repo.projection('node')?.body).toBe('projection A');
  });});
