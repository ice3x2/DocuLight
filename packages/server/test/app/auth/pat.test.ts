import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import type { AuthStores } from '../../../src/app/auth/login-service.js';
import {
  authenticateToken,
  issueToken,
  listTokens,
  revokeToken,
  type TokenStores,
} from '../../../src/app/auth/token-service.js';
import { permittedUnderScope } from '../../../src/domain/auth/token-scope.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: TokenStores & AuthStores;
let now: Date;
let me: string;
let you: string;

const PASSWORD = '올바른-말-네-개';
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-pat-'));
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T09:00:00.000Z');
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    tokens: new SqliteTokenRepository(db),
    passwords: new BcryptPasswordHasher(),
    clock: () => now,
  };
  me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
  you = idOf(await registerAccount(stores, { name: '다른이', password: PASSWORD, status: 'active' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const issue = (owner = me, scope: 'read-only' | 'read-write' = 'read-write') =>
  issueToken(stores, owner, { owner, name: '내 토큰', scope, expiresInDays: 30 });

describe('SEC-AUTH-006 — PAT 는 해시로 저장하고 평문은 1회만 노출한다', () => {
  it('AC-1: 평문이 DB 어디에도 남지 않는다', () => {
    const issued = issue() as { ok: true; token: string; id: string };

    expect(issued.token).toBeTruthy();
    expect(JSON.stringify(db.all('SELECT * FROM personal_access_token'))).not.toContain(issued.token);
  });

  it('AC-2: 발급 뒤에는 어느 경로로도 평문을 다시 얻을 수 없다', () => {
    const issued = issue() as { ok: true; token: string };

    // 목록에 평문을 실어 주는 자리가 있으면 「1회 노출」이 성립하지 않는다.
    const listed = listTokens(stores, me, me) as { ok: true; tokens: unknown[] };
    expect(JSON.stringify(listed.tokens)).not.toContain(issued.token);

    // 저장소 경계에도 평문을 돌려주는 메서드가 없다.
    const surface: string[] = [];
    for (let p = Object.getPrototypeOf(stores.tokens); p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      surface.push(...Object.getOwnPropertyNames(p));
    }
    expect(surface.filter((m) => /plain|reveal|secret|raw/i.test(m))).toEqual([]);
  });

  it('AC-3 · AC-4: 만료일이 기록되고 지난 토큰은 인증되지 않는다', () => {
    const issued = issue() as { ok: true; token: string };
    expect(authenticateToken(stores, issued.token)?.userId).toBe(me);

    now = new Date('2026-09-22T09:00:01.000Z');
    expect(authenticateToken(stores, issued.token), '만료된 토큰이 통과한다').toBeUndefined();
  });

  it('AC-5: 인증에 성공할 때마다 마지막 사용 시각이 갱신된다', () => {
    const issued = issue() as { ok: true; id: string; token: string };

    const before = (listTokens(stores, me, me) as { ok: true; tokens: { id: string; lastUsedAt: string | null }[] }).tokens.find((t) => t.id === issued.id);
    expect(before?.lastUsedAt).toBeNull();

    now = new Date('2026-08-22T10:00:00.000Z');
    authenticateToken(stores, issued.token);

    const after = (listTokens(stores, me, me) as { ok: true; tokens: { id: string; lastUsedAt: string | null }[] }).tokens.find((t) => t.id === issued.id);
    expect(after?.lastUsedAt).toBe(now.toISOString());
  });

  it('AC-6: 폐기된 토큰은 인증 단계에서 거부된다', () => {
    const issued = issue() as { ok: true; id: string; token: string };

    expect(revokeToken(stores, me, issued.id)).toEqual({ ok: true });
    expect(authenticateToken(stores, issued.token)).toBeUndefined();
  });
});

describe('SEC-AUTH-005 — 전역 API Key 없이 PAT 만으로 주체가 선다', () => {
  it('AC-3: PAT 로 인증된 요청은 그 토큰의 소유자를 주체로 갖는다', () => {
    const mine = issue(me) as { ok: true; token: string };
    const yours = issue(you) as { ok: true; token: string };

    expect(authenticateToken(stores, mine.token)?.userId).toBe(me);
    expect(authenticateToken(stores, yours.token)?.userId).toBe(you);
  });

  it('AC-4: 주체를 식별할 수 없는 자격증명은 권한 판정 이전에 거부된다', () => {
    expect(authenticateToken(stores, '아무-값')).toBeUndefined();
    expect(authenticateToken(stores, '')).toBeUndefined();
  });

  it('AC-1 · AC-2: 전역 API Key 를 담거나 발급하는 자리가 없다', () => {
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((t) => t.name.toLowerCase());

    for (const t of tables) {
      expect(t, `전역 키 저장소로 보이는 ${t} 가 있다`).not.toMatch(/api_key|apikey|global_key/);
    }
    // 모든 토큰이 소유자를 가리킨다 — 주인 없는 자격증명이 존재할 수 없다.
    const columns = db.all<{ name: string; notnull: number }>('PRAGMA table_info(personal_access_token)');
    const owner = columns.find((c) => c.name === 'user_id');
    expect(owner?.notnull, 'PAT 가 소유자 없이 존재할 수 있다').toBe(1);
  });
});

describe('SEC-AUTH-007 — PAT 발급·폐기는 본인만 한다', () => {
  it('AC-1 · AC-2: 본인은 자기 토큰을 발급하고 폐기한다', () => {
    const issued = issue(me) as { ok: true; id: string };
    expect(revokeToken(stores, me, issued.id)).toEqual({ ok: true });
  });

  it('AC-3: 슈퍼유저를 포함해 누구도 타인의 토큰을 발급하지 못한다', () => {
    const superuser = stores.principals.createUser('설치자');
    stores.principals.addMember('system-superuser', superuser.id);

    expect(
      issueToken(stores, superuser.id, { owner: me, name: '남의 토큰', scope: 'read-only', expiresInDays: 30 }),
    ).toEqual({ ok: false, rule: 'self-only' });
    expect(
      issueToken(stores, you, { owner: me, name: '남의 토큰', scope: 'read-only', expiresInDays: 30 }),
    ).toEqual({ ok: false, rule: 'self-only' });
  });

  it('AC-4: 슈퍼유저를 포함해 누구도 타인의 토큰을 폐기하지 못한다', () => {
    const issued = issue(me) as { ok: true; id: string; token: string };
    const superuser = stores.principals.createUser('설치자');
    stores.principals.addMember('system-superuser', superuser.id);

    expect(revokeToken(stores, superuser.id, issued.id)).toEqual({ ok: false, rule: 'self-only' });
    expect(revokeToken(stores, you, issued.id)).toEqual({ ok: false, rule: 'self-only' });
    // 그리고 실제로 살아 있다.
    expect(authenticateToken(stores, issued.token)).toBeDefined();
  });

  it('AC-5: 발급과 폐기가 감사 로그에 남는다', () => {
    const issued = issue(me) as { ok: true; id: string };
    revokeToken(stores, me, issued.id);

    const rows = db.all<{ operation: string; actor: string }>(
      "SELECT operation, actor FROM audit_log WHERE operation LIKE 'pat.%' ORDER BY rowid",
    );
    expect(rows.map((r) => r.operation)).toEqual(['pat.issue', 'pat.revoke']);
    expect(new Set(rows.map((r) => r.actor))).toEqual(new Set([me]));
  });

  it('남의 토큰 목록도 볼 수 없다 — 목록이 열리면 폐기 대상 ID 가 새어 나간다', () => {
    issue(me);
    expect(listTokens(stores, you, me)).toEqual({ ok: false, rule: 'self-only' });
  });
});

describe('SEC-AUTH-009 — 계정이 active 가 아니면 모든 PAT 가 즉시 무효다', () => {
  it('AC-1 · AC-2: 세 상태 전부에서 다음 요청부터 거부된다', () => {
    for (const status of ['suspended', 'pending', 'rejected'] as const) {
      const issued = issue(me) as { ok: true; token: string };
      expect(authenticateToken(stores, issued.token)).toBeDefined();

      stores.principals.setStatus(me, status);
      expect(authenticateToken(stores, issued.token), `${status} 계정의 PAT 가 통과한다`).toBeUndefined();

      stores.principals.setStatus(me, 'active');
    }
  });

  it('AC-3: 무효화를 위해 토큰을 하나씩 폐기할 필요가 없다', () => {
    const first = issue(me) as { ok: true; token: string };
    const second = issue(me) as { ok: true; token: string };

    stores.principals.setStatus(me, 'suspended');

    // 폐기 조작 없이 둘 다 닫힌다.
    expect(authenticateToken(stores, first.token)).toBeUndefined();
    expect(authenticateToken(stores, second.token)).toBeUndefined();
    // 행은 그대로 남아 있다 — 상태가 돌아오면 다시 산다.
    expect(db.all("SELECT id FROM personal_access_token WHERE revoked_at IS NULL")).toHaveLength(2);
  });

  it('AC-4: 판정이 토큰에 담긴 값이 아니라 요청 시점 계정 조회로 이뤄진다', () => {
    const issued = issue(me) as { ok: true; token: string };
    stores.principals.setStatus(me, 'suspended');
    expect(authenticateToken(stores, issued.token)).toBeUndefined();

    // 계정이 돌아오면 같은 토큰이 다시 산다. 토큰에 상태가 박혀 있었다면
    // 재발급 없이는 돌아오지 못한다.
    stores.principals.setStatus(me, 'active');
    expect(authenticateToken(stores, issued.token)?.userId).toBe(me);
  });
});

describe('SEC-AUTH-008 — 스코프는 상한만 낮추고 유효 권한을 넘기지 못한다', () => {
  it('AC-1: 발급 시 두 스코프 중 하나를 고른다', () => {
    expect((issue(me, 'read-only') as { ok: true }).ok).toBe(true);
    expect((issue(me, 'read-write') as { ok: true }).ok).toBe(true);
  });

  it('AC-2: 읽기 전용 PAT 는 편집 권한이 있어도 쓰기를 통과시키지 않는다', () => {
    expect(permittedUnderScope('read-only', 'edit', 'write')).toBe(false);
    expect(permittedUnderScope('read-only', 'admin', 'write')).toBe(false);
    // 읽기는 그대로 된다 — 스코프가 전체를 닫지 않는다.
    expect(permittedUnderScope('read-only', 'view', 'read')).toBe(true);
  });

  it('AC-3: 읽기+쓰기 PAT 도 실시간 유효 권한이 보기면 쓰기가 거부된다', () => {
    expect(permittedUnderScope('read-write', 'view', 'write')).toBe(false);
    expect(permittedUnderScope('read-write', 'edit', 'write')).toBe(true);
  });

  it('AC-4: 스코프는 유효 권한을 넘어서는 권한을 어느 경우에도 주지 않는다', () => {
    // 권한이 없으면 어떤 스코프로도 아무것도 못 한다 — 교집합의 성질이다.
    for (const scope of ['read-only', 'read-write'] as const) {
      for (const action of ['read', 'write'] as const) {
        expect(permittedUnderScope(scope, null, action), `${scope}/${action} 이 무권한을 통과시킨다`).toBe(false);
      }
    }
  });
});
