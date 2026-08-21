import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';

let dir: string;
let db: Database;
let principals: SqlitePrincipalRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-syslock-'));
  db = openDatabase(join(dir, 'doculight.db'));
  principals = new SqlitePrincipalRepository(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('CON-PRINCIPAL-002 — 시스템 그룹 잠금은 저장소가 지킨다', () => {
  it('AC-1 · AC-2: 저장소를 직접 불러도 시스템 그룹이 지워지지 않는다', () => {
    // 앱 계층 검사만으로는 「지금은 아무도 안 쓴다」에 그친다 —
    // `006` 이 「멤버는 사용자만」에 대해 스스로 적은 원칙과 같다.
    for (const id of [SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID]) {
      expect(() => principals.removeGroup(id), `${id} 가 저장소 경로로 지워진다`).toThrow();
      expect(principals.findById(id)).toBeDefined();
    }
  });

  it('AC-1 · AC-2: 원시 DELETE 도 막힌다', () => {
    for (const id of [SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID]) {
      expect(() => db.run('DELETE FROM principal WHERE id = ?', [id])).toThrow();
    }
    expect(db.all('SELECT id FROM principal')).toHaveLength(2);
  });

  it('AC-3: 저장소를 직접 불러도 개명되지 않는다', () => {
    for (const id of [SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID]) {
      const before = principals.findById(id);
      expect(() => principals.rename(id, '개명됨'), `${id} 가 저장소 경로로 개명된다`).toThrow();
      expect(principals.findById(id)).toEqual(before);
    }
  });

  it('삭제해도 슈퍼유저 판정이 죽지 않는다 — 잠금이 지키려는 것이 그것이다', () => {
    const u = principals.createUser('설치자');
    principals.addMember(SUPERUSER_GROUP_ID, u.id);

    expect(() => principals.removeGroup(SUPERUSER_GROUP_ID)).toThrow();
    expect(principals.groupsOf(u.id)).toContain(SUPERUSER_GROUP_ID);
  });

  it('시스템 그룹이 아닌 그룹은 그대로 지워지고 개명된다 — 잠금이 전체로 번지지 않는다', () => {
    const g = principals.createGroup('기획팀');

    expect(() => principals.rename(g.id, '전략팀')).not.toThrow();
    expect(() => principals.removeGroup(g.id)).not.toThrow();
    expect(principals.findById(g.id)).toBeUndefined();
  });

  it('사용자의 개명은 막히지 않는다', () => {
    const u = principals.createUser('한범');
    expect(() => principals.rename(u.id, '김한범')).not.toThrow();
    expect(principals.findById(u.id)?.name).toBe('김한범');
  });
});

describe('DR-PRINCIPAL-002 — 멤버인 사용자를 그룹으로 바꿀 수 없다', () => {
  it('AC-2: kind 를 뒤집어 중첩을 만드는 경로가 막힌다', () => {
    const outer = principals.createGroup('기획팀');
    const member = principals.createUser('한범');
    principals.addMember(outer.id, member.id);

    // 삽입 시점 트리거만으로는 부족하다 — 사용자로 넣은 뒤 그룹으로
    // 바꾸면 중첩이 성립한다.
    expect(
      () => db.run("UPDATE principal SET kind = 'group' WHERE id = ?", [member.id]),
      '멤버를 그룹으로 바꿔 중첩을 만들 수 있다',
    ).toThrow();

    expect(principals.findById(member.id)?.kind).toBe('user');
  });

  it('멤버가 아닌 사용자의 kind 변경은 이 규칙의 대상이 아니다', () => {
    const lonely = principals.createUser('무소속');

    // 아무 그룹에도 안 든 사용자는 바꿔도 중첩이 생기지 않는다.
    // 막을 이유가 없는 것까지 막으면 그것대로 다른 문제가 된다.
    expect(() => db.run("UPDATE principal SET kind = 'group' WHERE id = ?", [lonely.id])).not.toThrow();
  });
});
