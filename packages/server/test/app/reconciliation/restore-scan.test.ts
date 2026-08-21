import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ServerConfig } from '../../../src/config/config.js';
import { bootstrap } from '../../../src/main.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

let dir: string;
let config: ServerConfig;

/** 기동이 남긴 것을 **기동이 끝난 뒤** 별도 연결로 읽는다. */
async function inspect<T>(read: (db: Database) => T): Promise<T> {
  const db = openDatabase(config.databaseFile);
  try {
    return read(db);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-restore-'));
  config = {
    docsRoot: join(dir, 'docs'),
    databaseFile: join(dir, 'data', 'doculight.db'),
    port: 3400,
    // 이 시험은 기동 절차만 본다 — 리스너를 열지 않으므로 정적 루트는
    // 쓰이지 않는다.
    webRoot: join(dir, 'web'),
  };
  await mkdir(config.docsRoot, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('OPS-STORAGE-001 — 복원의 안전망은 기동 시 자동 재조정이다', () => {
  it('OPS-STORAGE-001 AC-2 — 복원 직후에는 재조정 스캔이 사람의 조작 없이 실행된다.', async () => {
    // 첫 기동이 기본 워크스페이스를 세운다.
    const first = await bootstrap(config);
    await first.close();

    const ws = await inspect((db) => new SqliteWorkspaceRepository(db).list()[0]!.id);

    // 복원된 백업에 서버가 모르는 파일이 들어 있는 상황.
    await new FsDocumentStore(config.docsRoot).write(ws, '복원된 문서.md', '# 본문');

    // 사람이 하는 조작은 기동뿐이다 — 스캔을 따로 부르지 않는다.
    const second = await bootstrap(config);
    await second.close();

    const registered = await inspect((db) =>
      new SqliteNodeRepository(db)
        .allIn(ws)
        .filter((n) => n.kind === 'file')
        .map((n) => n.name),
    );
    expect(registered).toEqual(['복원된 문서.md']);
  });

  it('OPS-STORAGE-001 AC-3 — 시점이 어긋난 백업으로 복원해도 파일시스템과 DB 의 차이가 재조정 대기열에 기재된다.', async () => {
    const first = await bootstrap(config);
    await first.close();

    const ws = await inspect((db) => new SqliteWorkspaceRepository(db).list()[0]!.id);
    const documents = new FsDocumentStore(config.docsRoot);

    await documents.write(ws, '양쪽에 있는 문서.md', '# 본문');
    const second = await bootstrap(config);
    await second.close();

    // 여기서 시점이 어긋난다 — DB 는 과거의 것, 파일시스템은 현재의 것.
    // ① DB 만 아는 노드(파일이 사라짐)
    await rm(join(config.docsRoot, ws, '양쪽에 있는 문서.md'));
    // ② 파일시스템만 아는 파일(노드가 없음)
    await documents.write(ws, '나중에 생긴 문서.md', '# 본문');

    const third = await bootstrap(config);
    await third.close();

    const unresolved = await inspect((db) => {
      const queue = new SqliteFindingQueue(db);
      return queue.unresolved().map((f) => ({ type: f.type, refs: queue.auditRefsOf(f.id).length }));
    });

    // 두 방향의 차이가 모두 남는다. 한쪽만 남으면 운영자가 복원이
    // 어긋났다는 사실의 절반만 본다.
    const types = new Set(unresolved.map((f) => f.type));
    expect(types.size).toBeGreaterThanOrEqual(2);
    // 항목마다 참조 감사 행이 있다 — 비면 시각의 유일한 출처가 사라진다.
    expect(unresolved.every((f) => f.refs > 0)).toBe(true);

    // 사라진 파일의 노드는 지워지지 않고 tombstone 으로 남는다.
    const orphaned = await inspect((db) =>
      new SqliteNodeRepository(db).allIn(ws).filter((n) => n.orphanedAt !== null).map((n) => n.name),
    );
    expect(orphaned).toEqual(['양쪽에 있는 문서.md']);
  });

  it('OPS-STORAGE-001 — 안전망을 새로 만들지 않고 기존 재조정을 재사용한다.', async () => {
    // 복원 전용 스캔 경로를 따로 두면 두 경로가 갈리고, 한쪽만 고쳐진
    // 채로 남는다(`CON-ARCH-008`).
    const runtime = await bootstrap(config);
    expect(runtime.reconciliation).toBeDefined();
    await runtime.close();
  });
});
