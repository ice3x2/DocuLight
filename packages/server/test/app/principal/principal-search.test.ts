import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MINIMUM_QUERY,
  RESULT_LIMIT,
  searchPrincipals,
  type PrincipalHit,
} from '../../../src/app/principal/principal-search-service.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';

let dir: string;
let db: Database;
let principals: SqlitePrincipalRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-principal-search-'));
  db = openDatabase(join(dir, 'doculight.db'));
  principals = new SqlitePrincipalRepository(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const named = (name: string) => principals.createUser(name);

describe('SEC-PRINCIPAL-003 — 최소 질의 길이 2자와 결과 상한 20건', () => {
  it('AC-1: 한 글자 질의는 검색하지 않는다', () => {
    named('한범');

    // 걸릴 이름이 있는데도 빈 목록이어야 한다 — 「없어서 비었다」와
    // 「짧아서 안 셌다」를 같은 입력으로 가르는 자리다.
    expect(searchPrincipals(principals, '한')).toEqual([]);
  });

  it('AC-1: 공백을 걷어내면 한 글자인 질의도 검색하지 않는다', () => {
    named('한범');

    expect(searchPrincipals(principals, '  한  ')).toEqual([]);
  });

  it('AC-2: 앞뒤 공백은 길이에도 일치에도 세지 않는다', () => {
    const found = named('한범');

    // 위 시험만으로는 공백 처리가 재어지지 않는다 — 공백을 안 걷어내도
    // 「길이 5 라 통과했으나 이름에 공백이 없어 안 걸린다」로 같은 빈
    // 목록이 나오기 때문이다. 걸려야 하는 쪽을 함께 재야 갈린다.
    expect(searchPrincipals(principals, '  한범  ').map((row) => row.id)).toEqual([found.id]);
  });

  it('대소문자를 무시한다 — 어느 AC 도 이 축을 정하지 않았고 관측 거동만 고정한다', () => {
    const found = named('Alice');

    expect(searchPrincipals(principals, 'ali').map((row) => row.id)).toEqual([found.id]);
    expect(searchPrincipals(principals, 'ALI').map((row) => row.id)).toEqual([found.id]);
  });

  it('AC-1: 빈 질의는 명부 전체를 주지 않는다', () => {
    named('한범');
    named('영희');

    // 빈 질의에 전원을 주면 상한이 있으나 마나다 — 스무 명씩 훑어 명부를
    // 복원할 수 있다.
    expect(searchPrincipals(principals, '')).toEqual([]);
  });

  it('AC-2: 두 글자 질의는 검색한다', () => {
    const found = named('한범');

    expect(searchPrincipals(principals, '한범')).toEqual([
      { id: found.id, name: '한범', kind: 'user', status: 'active' },
    ]);
  });

  it('AC-3: 스물다섯이 걸려도 스무 건까지만 준다', () => {
    for (let n = 0; n < 25; n += 1) named(`검색대상${n}`);

    expect(searchPrincipals(principals, '검색대상')).toHaveLength(RESULT_LIMIT);
  });

  it('AC-3: 상한은 사용자와 그룹을 합친 뒤에 걸린다', () => {
    for (let n = 0; n < 15; n += 1) named(`검색대상${n}`);
    for (let n = 0; n < 15; n += 1) principals.createGroup(`검색대상팀${n}`);

    // 종류마다 스무 건이면 한 질의로 마흔이 나간다 — 상한이 종류 수만큼
    // 곱해지면 상한이 아니다.
    expect(searchPrincipals(principals, '검색대상')).toHaveLength(RESULT_LIMIT);
  });

  it('AC-3: 잘라 낸 결과는 늘 같은 스무 건이다', () => {
    for (let n = 0; n < 25; n += 1) named(`검색대상${n}`);

    const twice = [searchPrincipals(principals, '검색대상'), searchPrincipals(principals, '검색대상')];

    // 무작위로 스무 건을 고르면 「더 보기」 없이도 새로고침만으로 나머지를
    // 긁을 수 있다.
    expect(twice[0]).toEqual(twice[1]);
  });

  it('AC-4: 값을 넘겨도 두 규칙이 그대로다', () => {
    for (let n = 0; n < 25; n += 1) named(`검색대상${n}`);

    // 선언 인자 수만 재면 **기본값 인자**가 그대로 빠져나간다
    // (`(p, q, limit = 20, min = 2)` 는 `Function.length` 가 2 다).
    // 그래서 넘겨 보고 값이 안 바뀌는 것을 잰다 — AC-4 가 금지한 것은
    // 시그니처의 모양이 아니라 덮어쓸 수 있는 **경로**다.
    const forced = searchPrincipals as unknown as (...args: unknown[]) => PrincipalHit[];

    expect(forced(principals, '검색대상', 100, 1)).toHaveLength(RESULT_LIMIT);
    expect(forced(principals, '검', 100, 1)).toEqual([]);
    expect(MINIMUM_QUERY).toBe(2);
    expect(RESULT_LIMIT).toBe(20);
  });

  it('AC-3: 상한에 걸리면 그룹이 먼저 잘린다 — 어느 AC 도 정하지 않은 축이다', () => {
    for (let n = 0; n < 20; n += 1) named(`검색대상${n}`);
    principals.createGroup('검색대상팀');

    // 우선순위를 정한 조항이 없으므로 규칙을 지어내지 않고 지금의 거동만
    // 못박는다. 정하는 조항이 생기면 이 시험이 먼저 깨진다.
    expect(searchPrincipals(principals, '검색대상').every((row) => row.kind === 'user')).toBe(true);
  });
});

describe('SEC-PRINCIPAL-002 — 검색 결과의 계정 노출 범위', () => {
  const withStatus = (name: string, status: 'pending' | 'suspended' | 'rejected') => {
    const made = named(name);
    principals.setStatus(made.id, status);
    return made;
  };

  it('AC-1: active 계정이 포함된다', () => {
    named('검색대상');

    expect(searchPrincipals(principals, '검색대상').map((row) => row.status)).toEqual(['active']);
  });

  it('AC-2: pending 계정이 포함된다', () => {
    withStatus('검색대상', 'pending');

    // 입사 전 사전 세팅이 실제 수요다 — 빠지면 그 부여 자체를 할 수 없다.
    expect(searchPrincipals(principals, '검색대상').map((row) => row.status)).toEqual(['pending']);
  });

  it('suspended 계정이 포함된다', () => {
    withStatus('검색대상', 'suspended');

    expect(searchPrincipals(principals, '검색대상').map((row) => row.status)).toEqual(['suspended']);
  });

  it('AC-3: rejected 계정은 포함되지 않는다', () => {
    withStatus('검색대상', 'rejected');

    expect(searchPrincipals(principals, '검색대상')).toEqual([]);
  });

  it('AC-4: 모든 행이 상태를 싣는다 — 배지를 화면이 지어내지 않는다', () => {
    named('검색대상활성');
    withStatus('검색대상대기', 'pending');
    withStatus('검색대상정지', 'suspended');

    const found = searchPrincipals(principals, '검색대상');

    expect(found).toHaveLength(3);
    expect(found.every((row) => row.status !== undefined)).toBe(true);
  });
});
