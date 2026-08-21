import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';

let dir: string;
let db: Database;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-sqlite-'));
  db = openDatabase(join(dir, 'doculight.db'));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-STORAGE-002 — 메타데이터의 단일 SQLite 저장소', () => {
  it('AC-1 — 사용자·그룹·ACL 메타데이터는 SQLite 데이터베이스 한 곳에만 저장되며 같은 사실을 담은 별도의 파일 저장소가 존재하지 않는다', async () => {
    db.transaction(() => {
      db.run("INSERT INTO principal (id, kind, name) VALUES ('u1', 'user', 'alice')");
      db.run("INSERT INTO principal (id, kind, name) VALUES ('g1', 'group', 'default')");
      db.run("INSERT INTO group_member (group_id, user_id) VALUES ('g1', 'u1')");
    });

    // 같은 사실이 두 곳에 있으면 한 곳이 뒤처진다. DB 파일과 그 저널 외에
    // 메타데이터를 담은 산출물이 생겨서는 안 된다.
    const produced = (await readdir(dir)).filter((n) => !n.startsWith('doculight.db'));
    expect(
      produced,
      `metadata found outside the single sqlite store: ${produced.join(', ')}`,
    ).toEqual([]);

    expect(db.all("SELECT id FROM principal ORDER BY id")).toEqual([{ id: 'g1' }, { id: 'u1' }]);
  });

  it('AC-2 — 사용자 생성과 default 그룹 배정처럼 둘 이상을 함께 바꾸는 조작은 하나의 트랜잭션으로 처리되어 일부만 반영된 상태가 남지 않는다', () => {
    db.run("INSERT INTO principal (id, kind, name) VALUES ('g1', 'group', 'default')");

    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO principal (id, kind, name) VALUES ('u1', 'user', 'alice')");
        db.run("INSERT INTO group_member (group_id, user_id) VALUES ('g1', 'u1')");
        throw new Error('boom — 조작 도중 실패');
      }),
    ).toThrow('boom');

    const users = db.all("SELECT id FROM principal WHERE kind = 'user'");
    const members = db.all('SELECT user_id FROM group_member');
    const partial = users.length + members.length;
    expect(partial, `rolled back transaction left ${partial} partial row(s)`).toBe(0);
  });

  it('AC-3 — 가입 승인·그룹 변경·ACL 변경이 동시에 일어나도 전체 재기록 없이 각각이 반영된다', () => {
    db.transaction(() => {
      db.run("INSERT INTO principal (id, kind, name) VALUES ('g1', 'group', 'default')");
      db.run("INSERT INTO principal (id, kind, name) VALUES ('u1', 'user', 'alice')");
      db.run("INSERT INTO principal (id, kind, name) VALUES ('u2', 'user', 'bob')");
    });

    // 셋을 각각 독립으로 바꾼다. 하나가 다른 둘을 다시 쓰게 만들면 안 된다.
    db.run("UPDATE principal SET status = 'active' WHERE id = 'u1'");
    db.run("INSERT INTO group_member (group_id, user_id) VALUES ('g1', 'u2')");
    db.run(
      "INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES ('a1', 'n1', 'u1', 'view')",
    );

    expect(db.all("SELECT status FROM principal WHERE id = 'u1'")).toEqual([{ status: 'active' }]);
    expect(db.all('SELECT user_id FROM group_member')).toEqual([{ user_id: 'u2' }]);
    expect(db.all('SELECT principal_id FROM acl_entry')).toEqual([{ principal_id: 'u1' }]);
  });
});
