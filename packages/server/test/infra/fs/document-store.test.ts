import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';

// 옵시디언이 실제로 쓰는 표기를 그대로 담는다 — 위키링크·프론트매터·표·
// 코드펜스·한글. 어느 하나라도 변형되면 R4 의 "원문 그대로" 가 깨진다.
const BODY = [
  '---',
  'tags: [설계, doculight]',
  '---',
  '',
  '# 제목',
  '',
  '[[다른 문서]] 로 가는 위키링크와 #태그 가 있다.',
  '',
  '| 열1 | 열2 |',
  '|---|---|',
  '| 값 | `코드` |',
  '',
  '```ts',
  'const x: number = 1;',
  '```',
  '',
  '  들여쓴 줄과 후행 공백  ',
].join('\n');

let dir: string;
let docsRoot: string;
let db: Database;
let store: FsDocumentStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-docs-'));
  docsRoot = join(dir, 'docs');
  db = openDatabase(join(dir, 'doculight.db'));
  store = new FsDocumentStore(docsRoot);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-STORAGE-001 — 문서 본문의 SSOT 는 파일시스템이다', () => {
  it('AC-1 — 문서를 저장하면 그 내용이 서버 로컬 파일시스템의 md 파일에 마크다운 원문 그대로 기록된다', async () => {
    await store.write('ws1', 'notes/설계.md', BODY);

    const onDisk = await readFile(join(docsRoot, 'ws1', 'notes', '설계.md'), 'utf8');
    expect(onDisk, 'written markdown differs from the file bytes').toBe(BODY);
  });

  it('AC-2 — 서버에서 md 파일을 직접 열어 읽은 내용과 화면에서 읽은 본문이 동일하다', async () => {
    await store.write('ws1', 'a.md', BODY);

    const throughStore = await store.read('ws1', 'a.md');
    const direct = await readFile(join(docsRoot, 'ws1', 'a.md'), 'utf8');
    expect(throughStore, 'read path body differs from the on-disk file').toBe(direct);
  });

  it('AC-3 — 문서 본문은 데이터베이스에 보관되지 않는다 — DB 를 비우고 재구성해도 본문은 그대로 남는다', async () => {
    await store.write('ws1', 'a.md', BODY);
    db.run("INSERT INTO node (id, workspace_id, kind, name) VALUES ('n1', 'ws1', 'file', 'a.md')");

    // DB 의 어느 칸에도 본문 조각이 없어야 한다.
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((r) => r.name);
    const needle = '위키링크';
    for (const table of tables) {
      const cols = db.all<{ name: string }>(`PRAGMA table_info(${table})`).map((r) => r.name);
      for (const col of cols) {
        const hit = db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE CAST(${col} AS TEXT) LIKE ?`,
          [`%${needle}%`],
        );
        expect(hit?.n ?? 0, `document body found in ${table}.${col}`).toBe(0);
      }
    }

    // DB 를 통째로 버려도 파일은 남는다.
    db.close();
    await rm(join(dir, 'doculight.db'), { force: true });
    expect(await readFile(join(docsRoot, 'ws1', 'a.md'), 'utf8')).toBe(BODY);
    db = openDatabase(join(dir, 'doculight.db'));
  });

  it('워크스페이스 밖으로 나가는 경로를 거부한다', async () => {
    // 경로 탈출은 fail-closed 다 — 저장소가 자기 루트 밖을 쓰면 그 위의
    // 어떤 권한 판정도 의미가 없어진다.
    await expect(store.write('ws1', '../escape.md', BODY)).rejects.toThrow(/outside/i);
    await expect(store.read('ws1', '../../etc/passwd')).rejects.toThrow(/outside/i);
  });

  it('서버 밖에서 만든 파일도 그대로 읽는다 (파일시스템이 본문의 정본이다)', async () => {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(docsRoot, 'ws1'), { recursive: true });
    await writeFile(join(docsRoot, 'ws1', 'external.md'), BODY, 'utf8');

    expect(await store.read('ws1', 'external.md')).toBe(BODY);
  });
});
