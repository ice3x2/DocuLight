import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf } from '../../../src/app/acl/permission-service.js';
import { grantPermission, revokePermission } from '../../../src/app/acl/grant-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { authenticateSession, logIn, type AuthStores } from '../../../src/app/auth/login-service.js';
import { authenticateToken, issueToken, type TokenStores } from '../../../src/app/auth/token-service.js';
import {
  DEFAULT_GROUP_LEVEL,
  beginInstallSession,
  commitInstall,
  forgetInstallTokenForTest,
  mintInstallToken,
  requireInstallSession,
  type InstallStores,
} from '../../../src/app/install/install-service.js';
import type { NodeStores } from '../../../src/app/node/node-service.js';
import { blockedReason } from '../../../src/domain/auth/account-gate.js';
import { permittedUnderScope } from '../../../src/domain/auth/token-scope.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: AuthStores & TokenStores & InstallStores & NodeStores;
let now: Date;

const PASSWORD = 'x'.repeat(10);
const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-gaps3-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T09:00:00.000Z');
  forgetInstallTokenForTest();
  stores = {
    ...nodeStores(db),
    sessions: new SqliteSessionRepository(db),
    tokens: new SqliteTokenRepository(db),
    passwords: new BcryptPasswordHasher(),
    files: new FsWorkspaceFiles(docsRoot),
    clock: () => now,
    announce: () => {},
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-002 — 매 요청 principal 을 조회한다', () => {
  it('AC-2: 세션 인증이 계정 레코드를 실제로 다시 읽는다', async () => {
    const me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
    const token = ((await logIn(stores, { name: '한범', password: PASSWORD })) as {
      ok: true;
      sessionToken: string;
    }).sessionToken;

    // 저장소를 가로채 조회가 실제로 일어나는지 센다. 세션에 담아 뒀다면
    // 이 호출이 0 이다.
    let lookups = 0;
    const watched = {
      ...stores,
      principals: new Proxy(stores.principals, {
        get(target, key, receiver) {
          if (key === 'findById') {
            return (id: string) => {
              lookups += 1;
              return target.findById(id);
            };
          }
          return Reflect.get(target, key, receiver);
        },
      }),
    };

    expect(authenticateSession(watched, token)?.userId).toBe(me);
    expect(lookups, '세션 인증이 계정을 다시 읽지 않는다').toBeGreaterThan(0);
  });

  it('AC-4: 권한을 회수하면 같은 PAT 로 보낸 다음 요청부터 거부된다', async () => {
    const root = superuserActor(stores);
    const me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
    db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', ['ws-1', '기획팀']);
    const doc = stores.nodes.create({ workspaceId: 'ws-1', parentId: null, kind: 'file', name: '회의록.md' });

    const granted = grantPermission(stores, root, { nodeId: doc, principalId: me, level: 'edit' });
    const pat = issueToken(stores, me, { owner: me, name: '토큰', scope: 'read-write', expiresInDays: 30 }) as {
      ok: true;
      token: string;
    };

    const subject = authenticateToken(stores, pat.token);
    expect(subject?.userId).toBe(me);
    expect(permissionOf(stores, actorFor(stores.principals, subject!.userId), doc)).toBe('edit');

    revokePermission(stores, root, (granted as { ok: true; entryId: string }).entryId);

    // 같은 토큰이 여전히 인증은 되지만 **권한이 없다** — 토큰이 권한을
    // 담지 않기 때문이다. 재발급 없이 다음 요청부터 닫힌다.
    const again = authenticateToken(stores, pat.token);
    expect(again?.userId).toBe(me);
    expect(permissionOf(stores, actorFor(stores.principals, again!.userId), doc)).toBeNull();
  });

  it('AC-5: 권한을 주면 재로그인 없이 다음 요청부터 열린다', async () => {
    const root = superuserActor(stores);
    const me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
    db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', ['ws-1', '기획팀']);
    const doc = stores.nodes.create({ workspaceId: 'ws-1', parentId: null, kind: 'file', name: '회의록.md' });

    const session = ((await logIn(stores, { name: '한범', password: PASSWORD })) as {
      ok: true;
      sessionToken: string;
    }).sessionToken;
    expect(permissionOf(stores, actorFor(stores.principals, me), doc)).toBeNull();

    grantPermission(stores, root, { nodeId: doc, principalId: me, level: 'view' });

    const still = authenticateSession(stores, session);
    expect(still?.userId).toBe(me);
    expect(permissionOf(stores, actorFor(stores.principals, still!.userId), doc)).toBe('view');
  });
});

describe('SEC-AUTH-003 — rejected 는 별개 상태로 저장된다', () => {
  it('AC-4: 저장된 값이 suspended 와 다르고 거절 이력이 남는다', async () => {
    const id = idOf(await registerAccount(stores, { name: '거절된이', password: PASSWORD, status: 'rejected' }));

    const stored = db.get<{ status: string }>('SELECT status FROM principal WHERE id = ?', [id]);
    expect(stored?.status).toBe('rejected');
    expect(stored?.status).not.toBe('suspended');
    expect(blockedReason('rejected')).not.toBe(blockedReason('suspended'));
  });
});

describe('SEC-AUTH-005 — 같은 도구를 다른 PAT 로 부르면 결과가 다르다', () => {
  it('AC-5: 두 사용자의 토큰이 각자의 유효 권한대로 답한다', async () => {
    const root = superuserActor(stores);
    const me = idOf(await registerAccount(stores, { name: '한범', password: PASSWORD, status: 'active' }));
    const you = idOf(await registerAccount(stores, { name: '다른이', password: PASSWORD, status: 'active' }));
    db.run('INSERT INTO workspace (id, name) VALUES (?, ?)', ['ws-1', '기획팀']);
    const doc = stores.nodes.create({ workspaceId: 'ws-1', parentId: null, kind: 'file', name: '회의록.md' });

    grantPermission(stores, root, { nodeId: doc, principalId: me, level: 'edit' });

    const mine = issueToken(stores, me, { owner: me, name: 'A', scope: 'read-write', expiresInDays: 30 }) as { ok: true; token: string };
    const yours = issueToken(stores, you, { owner: you, name: 'B', scope: 'read-write', expiresInDays: 30 }) as { ok: true; token: string };

    const levelVia = (plain: string) => {
      const subject = authenticateToken(stores, plain);
      return subject === undefined
        ? undefined
        : permissionOf(stores, actorFor(stores.principals, subject.userId), doc);
    };

    expect(levelVia(mine.token)).toBe('edit');
    expect(levelVia(yours.token)).toBeNull();
  });
});

describe('SEC-AUTH-008 — 스코프×레벨×조작 전 조합에서 상한을 넘지 않는다', () => {
  it('AC-4: 스코프가 유효 권한을 넘기는 조합이 하나도 없다', () => {
    const levels = [null, 'view', 'edit', 'admin'] as const;

    for (const scope of ['read-only', 'read-write'] as const) {
      for (const level of levels) {
        for (const action of ['read', 'write'] as const) {
          const allowed = permittedUnderScope(scope, level, action);
          if (!allowed) continue;

          // 통과했다면 유효 권한이 그 조작을 **혼자서도** 허용해야 한다.
          const needed = action === 'write' ? 'edit' : 'view';
          const rank = { view: 1, edit: 2, admin: 3 } as const;
          expect(level, `${scope}/${level}/${action} 이 권한 없이 통과한다`).not.toBeNull();
          expect(rank[level as 'view' | 'edit' | 'admin']).toBeGreaterThanOrEqual(rank[needed]);
          // 그리고 read-only 로는 쓰기가 통과하지 않는다.
          if (action === 'write') expect(scope).toBe('read-write');
        }
      }
    }
  });
});

describe('SEC-AUTH-015 — 토큰 검증이 설치 세션을 발급한다', () => {
  it('AC-1: 검증에 성공하면 설치 세션이 나온다', () => {
    const token = mintInstallToken(stores);

    const begun = beginInstallSession(stores, token);
    expect(begun.ok).toBe(true);
    expect((begun as { ok: true; installSession: string }).installSession).toBeTruthy();
  });

  it('AC-1: 틀린 토큰으로는 설치 세션이 나오지 않는다', () => {
    mintInstallToken(stores);

    expect(beginInstallSession(stores, '틀림')).toEqual({ ok: false, rule: 'bad-token' });
  });

  it('AC-2 · AC-4: 이후 요청이 설치 세션을 요구한다', async () => {
    const token = mintInstallToken(stores);
    const session = (beginInstallSession(stores, token) as { ok: true; installSession: string }).installSession;

    expect(requireInstallSession(stores, session)).toBe(true);
    expect(requireInstallSession(stores, '아무-값'), '아무 값이나 설치 세션으로 통한다').toBe(false);
    expect(requireInstallSession(stores, ''), '빈 값이 설치 세션으로 통한다').toBe(false);
  });

  it('AC-3: 설치 세션 없이 커밋하면 거부된다', async () => {
    const token = mintInstallToken(stores);
    beginInstallSession(stores, token);

    const refused = await commitInstall(stores, '', {
      superuserName: '설치자',
      password: PASSWORD,
      workspaceName: '기획팀',
      defaultGroupLevel: 'edit',
      signupMode: 'approval',
    });

    expect(refused.ok).toBe(false);
  });

  it('설치 세션도 토큰과 함께 소진된다 — 커밋 뒤에 남으면 그것이 두 번째 문이다', async () => {
    const token = mintInstallToken(stores);
    const session = (beginInstallSession(stores, token) as { ok: true; installSession: string }).installSession;

    await commitInstall(stores, session, {
      superuserName: '설치자',
      password: PASSWORD,
      workspaceName: '기획팀',
      defaultGroupLevel: 'edit',
      signupMode: 'approval',
    });

    expect(requireInstallSession(stores, session)).toBe(false);
  });
});

describe('SEC-AUTH-017 — default 초기 권한의 기본값은 편집이다', () => {
  it('AC-2: 기본값이 한 자리에 있고 그것이 편집이다', () => {
    expect(DEFAULT_GROUP_LEVEL).toBe('edit');
  });
});

describe('SEC-AUTH-014 — 재기동이 유일한 복구 경로다', () => {
  it('AC-7: 소진된 뒤 새 토큰을 얻는 길은 다시 발급하는 것뿐이다', async () => {
    const token = mintInstallToken(stores);
    const session = (beginInstallSession(stores, token) as { ok: true; installSession: string }).installSession;
    await commitInstall(stores, session, {
      superuserName: '설치자',
      password: PASSWORD,
      workspaceName: '기획팀',
      defaultGroupLevel: 'edit',
      signupMode: 'approval',
    });

    // 소진됐다. 같은 값도, 세션도 통하지 않는다.
    expect(beginInstallSession(stores, token)).toEqual({ ok: false, rule: 'bad-token' });
    expect(requireInstallSession(stores, session)).toBe(false);

    // 다시 발급하면 새 값이 나온다 — 그것이 기동이 하는 일이다.
    const fresh = mintInstallToken(stores);
    expect(fresh).not.toBe(token);
    expect(beginInstallSession(stores, fresh).ok).toBe(true);
  });
});
