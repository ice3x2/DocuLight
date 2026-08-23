import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_GROUP_ID,
  SUPERUSER_GROUP_ID,
  isSystemGroup,
} from '../../../src/domain/principal/system-groups.js';
import {
  addGroupMember,
  removeGroup,
  renameGroup,
  setAccountStatus,
} from '../../../src/app/principal/principal-service.js';
import { isSuperuser, subjectIdsOf } from '../../../src/domain/principal/subject.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';

let dir: string;
let db: Database;
let principals: SqlitePrincipalRepository;

/** 상태 변경은 슈퍼유저 바닥 가드를 지나야 한다 — 우회 진입점을 두지 않는다. */
const guarded = () => ({ principals, sessions: new SqliteSessionRepository(db) });
/** 기록기. 이 시험의 관심사가 아니어도 인자는 필수다 (`OBS-AUDIT-003`). */
const 기록 = () => ({ audit: new SqliteAuditLog(db), actor: 'test:actor' });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-principal-'));
  db = openDatabase(join(dir, 'doculight.db'));
  principals = new SqlitePrincipalRepository(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-PRINCIPAL-001 — 슈퍼유저 여부는 슈퍼유저 그룹 소속 하나로만 판정한다', () => {
  it('AC-1: 판정이 슈퍼유저 그룹 멤버십 조회 하나로 이뤄진다', () => {
    const u = principals.createUser('한범');
    expect(isSuperuser(principals.groupsOf(u.id))).toBe(false);

    principals.addMember(SUPERUSER_GROUP_ID, u.id);
    expect(isSuperuser(principals.groupsOf(u.id))).toBe(true);
  });

  it('AC-2: 사용자 레코드에 등급 필드도 슈퍼유저 플래그 필드도 없다', () => {
    const columns = db
      .all<{ name: string }>('PRAGMA table_info(principal)')
      .map((c) => c.name.toLowerCase());

    // 플래그가 하나라도 있으면 판정의 정본이 둘이 되고, 그 둘은 반드시 갈린다.
    for (const forbidden of ['role', 'grade', 'rank', 'is_superuser', 'superuser', 'is_admin']) {
      expect(columns, `principal.${forbidden} 이 있으면 판정 정본이 둘이 된다`).not.toContain(
        forbidden,
      );
    }
  });

  it('AC-3: 멤버십을 빼면 즉시 슈퍼유저가 아니며 계정 쪽에 갱신할 값이 없다', () => {
    const u = principals.createUser('한범');
    principals.addMember(SUPERUSER_GROUP_ID, u.id);

    const before = principals.findById(u.id);
    principals.removeMember(SUPERUSER_GROUP_ID, u.id);
    const after = principals.findById(u.id);

    expect(isSuperuser(principals.groupsOf(u.id))).toBe(false);
    // 계정 행은 한 칸도 바뀌지 않는다 — 바뀔 칸이 있으면 그것이 두 번째 정본이다.
    expect(after).toEqual(before);
  });
});

describe('DR-PRINCIPAL-002 — 그룹은 사용자만을 멤버로 가지며 중첩되지 않는다', () => {
  it('AC-1: 그룹을 멤버로 지정하는 요청이 거부된다', () => {
    const outer = principals.createGroup('기획팀');
    const inner = principals.createGroup('기획팀-리드');

    expect(addGroupMember(principals, outer.id, inner.id, 기록())).toEqual({
      ok: false,
      rule: 'member-must-be-user',
    });
    expect(principals.membersOf(outer.id)).toEqual([]);
  });

  it('AC-2: 저장 구조 자체가 그룹을 멤버로 표현할 칸을 갖지 않는다', () => {
    const outer = principals.createGroup('기획팀');
    const inner = principals.createGroup('기획팀-리드');

    // 서비스 계층을 우회해 직접 밀어 넣어도 저장소가 거부한다 — 앱 계층의
    // 검사만으로는 "칸이 없다"가 아니라 "지금은 아무도 안 쓴다"에 그친다.
    expect(() => principals.addMember(outer.id, inner.id)).toThrow();
  });

  it('AC-3: 유효 권한 계산은 직접 소속 그룹까지만 따라간다', () => {
    const u = principals.createUser('한범');
    const team = principals.createGroup('기획팀');
    principals.addMember(team.id, u.id);

    // 주체 집합 = 자기 자신 + 직접 소속 그룹. 그룹→그룹 참조를 순회할 자리가 없다.
    expect(subjectIdsOf(u.id, principals.groupsOf(u.id)).sort()).toEqual(
      [u.id, team.id, DEFAULT_GROUP_ID].sort(),
    );
  });
});

describe('CON-PRINCIPAL-001 — 권한 계층은 슈퍼유저와 일반 유저 2단계뿐이다', () => {
  it('AC-1: 인스턴스 전역 등급은 슈퍼유저 하나뿐이다', () => {
    // 전역 등급을 표현하는 자리는 시스템 그룹 열거 하나이며 그 안의 전역
    // 권한자는 슈퍼유저 하나다. default 는 전역 등급이 아니라 기본 소속이다.
    const systemGroups = principals
      .list('group')
      .filter((g) => isSystemGroup(g.id))
      .map((g) => g.id);

    expect(systemGroups.sort()).toEqual([DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID].sort());

    // AC-1 의 후반 — 「그 밖의 전역 등급은 존재하지 않는다」. 전역 등급을
    // 담을 수 있는 자리는 주체 테이블의 칸뿐이므로 그 칸들을 훑는다.
    //
    // 칸 목록을 통째로 고정하지 않는다 — 그러면 등급과 무관한 칸(자격증명
    // 해시 같은 것)이 늘 때마다 이 시험이 깨지고, 깨진 이유가 「등급이
    // 생겼다」인지 「다른 게 늘었다」인지 구별되지 않는다.
    const columns = db
      .all<{ name: string }>('PRAGMA table_info(principal)')
      .map((c) => c.name.toLowerCase());

    for (const column of columns) {
      expect(column, `principal.${column} 이 전역 등급으로 보인다`).not.toMatch(
        /role|grade|rank|tier|superuser|is_admin|privilege/,
      );
    }
  });

  it('AC-3: 사용자와 그룹이 같은 저장 구조를 쓴다 — 그룹 전용 권한 축이 없다', () => {
    const u = principals.createUser('한범');
    const g = principals.createGroup('기획팀');

    // 반환 객체의 키를 맞대면 **같은 팩토리가 만들었으니** 당연히 같다.
    // 재야 할 것은 저장 구조다 — 그룹만 갖는 칸이 있으면 거기서 갈린다.
    const row = (id: string) =>
      db.get<Record<string, unknown>>('SELECT * FROM principal WHERE id = ?', [id]);

    expect(Object.keys(row(u.id)!).sort()).toEqual(Object.keys(row(g.id)!).sort());
    // 그리고 그 칸들 중 어느 것도 권한을 담지 않는다.
    for (const column of Object.keys(row(g.id)!)) {
      expect(column, `주체 테이블에 권한 축으로 보이는 ${column} 이 있다`).not.toMatch(
        /level|permission|grant|scope|acl/i,
      );
    }
  });
});

describe('CON-PRINCIPAL-002 — 시스템 그룹은 삭제·개명할 수 없다', () => {
  it('AC-1: 슈퍼유저 그룹 삭제가 거부된다', () => {
    expect(removeGroup(principals, SUPERUSER_GROUP_ID)).toEqual({
      ok: false,
      rule: 'system-group-immutable',
    });
    expect(principals.findById(SUPERUSER_GROUP_ID)).toBeDefined();
  });

  it('AC-2: default 그룹 삭제가 거부된다', () => {
    expect(removeGroup(principals, DEFAULT_GROUP_ID)).toEqual({
      ok: false,
      rule: 'system-group-immutable',
    });
    expect(principals.findById(DEFAULT_GROUP_ID)).toBeDefined();
  });

  it('AC-3: 두 시스템 그룹의 개명이 거부된다', () => {
    for (const id of [SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID]) {
      const before = principals.findById(id);
      expect(renameGroup(principals, id, '아무거나')).toEqual({
        ok: false,
        rule: 'system-group-immutable',
      });
      expect(principals.findById(id)).toEqual(before);
    }
  });

  it('시스템 그룹이 아닌 그룹은 개명도 삭제도 된다 — 금지가 전체로 번지지 않는다', () => {
    const g = principals.createGroup('기획팀');
    expect(renameGroup(principals, g.id, '전략팀')).toEqual({ ok: true });
    expect(principals.findById(g.id)?.name).toBe('전략팀');
    expect(removeGroup(principals, g.id)).toEqual({ ok: true });
    expect(principals.findById(g.id)).toBeUndefined();
  });
});

describe('CON-PRINCIPAL-003 — 계정은 삭제하지 않고 suspended 로만 관리한다', () => {
  it('AC-1: 계정을 영구 삭제하는 조작이 저장소 경계에 존재하지 않는다', () => {
    // 있는 것을 안 쓰는 것과 없는 것은 다르다 — 있으면 언젠가 누가 부른다.
    const surface: string[] = [];
    for (
      let proto = Object.getPrototypeOf(principals);
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      surface.push(...Object.getOwnPropertyNames(proto));
    }

    // 미리 상상한 이름만 찾으면 `removePrincipal`·`deleteAccount` 를 놓친다.
    // 지우는 뜻의 동사를 **전부** 잡되, **계정이 아닌 대상을 이름에 명시한
    // 것**만 뺀다 — 이름이 대상을 밝히지 않는 삭제 메서드가 곧 위험한
    // 것이고, `removeGroup`(그룹)·`removeMember`(멤버십)는 밝혔다.
    const NOT_AN_ACCOUNT = ['removeGroup', 'removeMember'];
    const deleters = surface.filter(
      (m) => /^(remove|delete|drop|purge|destroy|erase|wipe)/i.test(m) && !NOT_AN_ACCOUNT.includes(m),
    );
    expect(deleters, `계정 삭제 경로가 열려 있다: ${deleters.join(', ')}`).toEqual([]);

    // 그 둘이 계정을 지우지 않는다는 것은 이름이 아니라 동작으로 잰다.
    const u = principals.createUser('한범');
    const g = principals.createGroup('기획팀');
    principals.addMember(g.id, u.id);
    principals.removeMember(g.id, u.id);
    principals.removeGroup(g.id);
    expect(principals.findById(u.id), '멤버십·그룹 삭제가 계정을 함께 지웠다').toBeDefined();
  });

  it('AC-2: 비활성화는 suspended 전환이며 레코드를 지우지 않는다', () => {
    const u = principals.createUser('한범');
    expect(setAccountStatus(guarded(), u.id, 'suspended', 기록())).toEqual({ ok: true });

    const after = principals.findById(u.id);
    expect(after?.status).toBe('suspended');
    expect(after?.name).toBe('한범');
  });

  it('AC-3: suspended 계정을 가리키는 감사 로그 행의 참조가 깨지지 않는다', () => {
    const u = principals.createUser('한범');
    db.run("INSERT INTO audit_log (id, operation, actor, node_id) VALUES ('a1', 'test', ?, 'n1')", [
      u.id,
    ]);

    setAccountStatus(guarded(), u.id, 'suspended', 기록());

    const rows = db.all<{ actor: string }>('SELECT actor FROM audit_log WHERE id = ?', ['a1']);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actor).toBe(u.id);
  });

  it('AC-4: suspended 계정 앞으로 부여된 acl_entry 가 그대로 남고 고아가 생기지 않는다', () => {
    const u = principals.createUser('한범');
    db.run(
      "INSERT INTO acl_entry (id, node_id, principal_id, level) VALUES ('e1', 'n1', ?, 'edit')",
      [u.id],
    );

    setAccountStatus(guarded(), u.id, 'suspended', 기록());

    const entries = db.all<{ principal_id: string }>('SELECT principal_id FROM acl_entry');
    expect(entries).toHaveLength(1);
    // 고아 = 가리키는 주체가 사라진 행. 주체가 남아 있으므로 고아가 아니다.
    expect(principals.findById(entries[0]!.principal_id)).toBeDefined();
  });
});
