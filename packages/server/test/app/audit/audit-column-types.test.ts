import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { issueToken, revokeToken } from '../../../src/app/auth/token-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { writeSettings } from '../../../src/app/settings/instance-settings.js';
import type { AuditRow } from '../../../src/domain/ports/audit-sink.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

/**
 * 주체·레벨 두 칸의 **타입 규칙** (`DR-AUDIT-002` AC-8 · 원장 `R164`).
 *
 * 개정 전 문면은 「acl_entry 를 바꾸는 조작의 행에서만 채워진다」였고 그것은
 * 거짓이었다 — 그룹 멤버십·계정 상태처럼 값이 실제로 principal ID 인 조작도
 * 그 칸을 채운다. 병소는 조작이 아니라 **타입**이었다: 설정 키와 PAT 스코프가
 * 같은 칸에 들어가면 `WHERE subject = X` 가 조작마다 다른 의미의 값을 섞어
 * 돌려준다.
 */

let dir: string;
let db: Database;
let stores: ReturnType<typeof nodeStores> & {
  tokens: SqliteTokenRepository;
  passwords: BcryptPasswordHasher;
  clock: () => Date;
};
let 한범: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const 행들 = (): AuditRow[] => stores.auditLog.inScope([], { includeInstance: true });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-types-'));
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    tokens: new SqliteTokenRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => new Date('2026-08-24T09:00:00.000Z'),
  };
  한범 = idOf(
    await registerAccount(stores, { name: '한범', password: 'x'.repeat(8), status: 'active' }),
  );
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-AUDIT-002 AC-8 — 주체 칸은 principal ID 만 담는다', () => {
  it('설정 변경 행의 주체 칸이 비어 있다', () => {
    expect(
      writeSettings(
        stores.settings,
        { 'retained-version-count': '5' },
        { audit: stores.audit, actor: 한범 },
      ).ok,
    ).toBe(true);

    const 행 = 행들();

    // 행이 서는 것부터 잰다 — 「행이 아예 없다」도 `subjectId` 가
    // `undefined` 이므로, 개수를 먼저 고정하지 않으면 기록을 통째로
    // 없애는 뮤테이션이 이 단언을 그대로 통과한다.
    expect(행).toHaveLength(1);
    // 설정 키는 principal 이 아니다. 여기 들어가면 「주체=한범」으로 거른
    // 결과에 설정 키 행이 섞여 들어온다.
    expect(행[0]!.subjectId).toBeUndefined();
  });

  it('어느 설정이 바뀌었는지가 조작 값으로 남는다 — 키를 지우기만 하면 OBS-AUDIT-006 AC-2 가 죽는다', () => {
    writeSettings(
      stores.settings,
      { 'audit-retention-days': '30', 'trash-retention-days': '7' },
      { audit: stores.audit, actor: 한범 },
    );

    const 조작들 = 행들()
      .map((row) => row.operation)
      .sort();

    // 두 행이 같은 조작 값이면 「감사 보존 기간이 언제 줄었나」를 조작으로
    // 물을 수 없고, 이전값·이후값만으로는 어느 설정의 것인지 갈리지 않는다.
    expect(조작들).toEqual(['settings.audit-retention-days', 'settings.trash-retention-days']);
    expect(new Set(조작들).size).toBe(2);
  });
});

describe('DR-AUDIT-002 AC-8 — 레벨 칸은 ACL 레벨만 담는다', () => {
  it('PAT 발급 행의 레벨 칸이 비고 스코프는 이후값에 남는다', () => {
    const 발급 = issueToken(stores, 한범, {
      owner: 한범,
      name: '노트북',
      scope: 'read-only',
      expiresInDays: 30,
    });
    expect(발급.ok).toBe(true);

    const [row] = 행들();

    expect(row?.level).toBeUndefined();
    // 값 자체는 잃지 않는다 — 잃으면 「어떤 권한의 토큰이 발급됐나」를
    // 되짚을 수 없다. 발급은 없던 것이 생기는 조작이므로 이후값이다.
    expect(row?.afterValue).toBe('read-only');
    expect(row?.beforeValue).toBeUndefined();
  });

  it('PAT 회수 행의 레벨 칸이 비고 스코프는 이전값에 남는다', () => {
    const 발급 = issueToken(stores, 한범, {
      owner: 한범,
      name: '노트북',
      scope: 'read-write',
      expiresInDays: 30,
    });
    expect(revokeToken(stores, 한범, (발급 as { ok: true; id: string }).id).ok).toBe(true);

    const 회수 = 행들().find((row) => row.operation === 'pat.revoke');

    expect(회수?.level).toBeUndefined();
    // 회수는 있던 것이 사라지는 조작이라 방향이 반대다.
    expect(회수?.beforeValue).toBe('read-write');
    expect(회수?.afterValue).toBeUndefined();
  });

  it('주체 칸은 그대로 소유자를 담는다 — 타입이 맞는 값까지 비우면 역질의가 깨진다', () => {
    issueToken(stores, 한범, { owner: 한범, name: '노트북', scope: 'read-only', expiresInDays: 30 });

    expect(행들()[0]?.subjectId).toBe(한범);
  });
});
