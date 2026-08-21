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
      db.run("INSERT INTO group_member (group_id, user_id) VALUES ('g1', 'u1')");
      db.run(
        "INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES ('a0', 'n0', 'u2', 'view')",
      );
    });

    // 값만 확인하면 **전체를 다시 쓰는 저장소도 통과한다** — 이 요구가
    // 기각한 대안이 정확히 그것이다. 그래서 손대지 않은 행이 `rowid` 까지
    // 그대로인지를 함께 잰다. ACL 이 주체 행에 끼워 넣어져 있었다면
    // ACL 하나를 더하는 것만으로 주체 행이 다시 쓰인다.
    const snapshot = () => ({
      principal: db.all('SELECT rowid, * FROM principal ORDER BY rowid'),
      group_member: db.all('SELECT rowid, * FROM group_member ORDER BY rowid'),
      acl_entry: db.all('SELECT rowid, * FROM acl_entry ORDER BY rowid'),
    });
    const before = snapshot();

    // 「동시에」를 순차 실행으로 흉내 내지 않는다 — 별개 연결에서 서로
    // 엇갈려 쓴다. 한 조작이 다른 조작의 배치에 실려야만 반영된다면
    // 여기서 드러난다.
    const other = openDatabase(join(dir, 'doculight.db'));
    try {
      db.run("UPDATE principal SET status = 'active' WHERE id = 'u1'");
      other.run("INSERT INTO group_member (group_id, user_id) VALUES ('g1', 'u2')");
      db.run(
        "INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES ('a1', 'n1', 'u1', 'view')",
      );
    } finally {
      other.close();
    }

    const after = snapshot();

    // 셋이 각각 반영됐다.
    expect(db.all("SELECT status FROM principal WHERE id = 'u1'")).toEqual([{ status: 'active' }]);
    expect(after.group_member).toHaveLength(2);
    expect(after.acl_entry).toHaveLength(2);

    // 손대지 않은 행은 **한 칸도** 바뀌지 않았다.
    const untouched = (rows: Record<string, unknown>[], skip: (r: Record<string, unknown>) => boolean) =>
      rows.filter((r) => !skip(r));
    expect(untouched(after.principal, (r) => r.id === 'u1')).toEqual(
      untouched(before.principal, (r) => r.id === 'u1'),
    );
    expect(untouched(after.group_member, (r) => r.user_id === 'u2')).toEqual(before.group_member);
    expect(untouched(after.acl_entry, (r) => r.id === 'a1')).toEqual(before.acl_entry);

    // 바뀐 주체 행조차 자기 자리를 지킨다 — 지우고 다시 넣는 방식이면
    // `rowid` 가 움직인다.
    const changed = (rows: Record<string, unknown>[]) => rows.find((r) => r.id === 'u1');
    expect(changed(after.principal)?.rowid).toBe(changed(before.principal)?.rowid);
  });
});
