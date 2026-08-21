import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerAccount } from '../../../src/app/auth/account-service.js';
import type { Clock } from '../../../src/app/auth/login-service.js';
import {
  INSTALL_TOKEN_MINUTES,
  beginInstallSession,
  commitInstall,
  forgetInstallTokenForTest,
  isInstalled,
  mintInstallToken,
  verifyInstallToken,
  type InstallStores,
} from '../../../src/app/install/install-service.js';
import { permissionOf, actorFor } from '../../../src/app/acl/permission-service.js';
import { SUPERUSER_GROUP_ID, DEFAULT_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: InstallStores;
let now: Date;
let printed: string[];

const clock: Clock = () => now;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-install-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  now = new Date('2026-08-22T09:00:00.000Z');
  printed = [];
  forgetInstallTokenForTest();
  stores = {
    ...nodeStores(db),
    passwords: new BcryptPasswordHasher(),
    files: new FsWorkspaceFiles(docsRoot),
    clock,
    // 콘솔 출력을 함수 뒤로 민다 — 시험이 stdout 을 가로채면 다른 시험의
    // 출력까지 함께 잡힌다.
    announce: (line: string) => printed.push(line),
  };
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/**
 * 토큰으로 설치 세션을 연 뒤 커밋한다 — 마법사가 실제로 지나는 순서다
 * (`SEC-AUTH-015`). 토큰을 커밋에 그대로 넘기면 그 값이 한 번만 쓰이도록
 * 설계된 성질을 잃는다.
 */
const sessionFor = (token: string): string => {
  const begun = beginInstallSession(stores, token);
  return begun.ok ? begun.installSession : '';
};

const commit = (token: string, overrides: Partial<Parameters<typeof commitInstall>[2]> = {}) =>
  commitInstall(stores, sessionFor(token), {
    superuserName: '설치자',
    password: '올바른-말-네-개',
    workspaceName: '기획팀',
    defaultGroupLevel: 'edit',
    signupMode: 'approval',
    ...overrides,
  });

describe('SEC-AUTH-010 — 슈퍼유저 0명이면 설치를 강제한다', () => {
  it('AC-1: 슈퍼유저 그룹 멤버가 0명이면 설치되지 않은 상태다', () => {
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID)).toEqual([]);
    expect(isInstalled(stores)).toBe(false);
  });

  it('AC-3 · AC-4: 마법사가 만든 최초 슈퍼유저는 그룹 멤버이며 즉시 active 다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token);

    expect(done.ok).toBe(true);
    const superuserId = (done as { ok: true; superuserId: string }).superuserId;
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID)).toEqual([superuserId]);
    expect(stores.principals.findById(superuserId)?.status).toBe('active');
  });

  it('AC-5: 설치가 끝나면 다시 설치되지 않는다', async () => {
    const token = mintInstallToken(stores);
    await commit(token);

    expect(isInstalled(stores)).toBe(true);
  });

  it('AC-2: 이미 슈퍼유저가 있으면 마법사가 다시 통과하지 않는다', async () => {
    const token = mintInstallToken(stores);
    await commit(token);

    const second = mintInstallToken(stores);
    expect((await commit(second, { superuserName: '두번째' })).ok).toBe(false);
  });

  it('AC-1: 슈퍼유저가 있어도 그가 active 가 아니면 설치되지 않은 상태다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token);
    const superuserId = (done as { ok: true; superuserId: string }).superuserId;

    stores.principals.setStatus(superuserId, 'suspended');

    // 「멤버가 0명」이 아니라 「active 멤버가 0명」이 판정 기준이다 —
    // 정지된 슈퍼유저만 남으면 아무도 들어올 수 없는 인스턴스가 된다.
    expect(isInstalled(stores)).toBe(false);
  });
});

describe('SEC-AUTH-012 — 설치 토큰은 콘솔에 출력되고 커밋 시점에 소진된다', () => {
  it('AC-1: 토큰이 콘솔에 출력된다', () => {
    const token = mintInstallToken(stores);

    expect(printed.join('\n')).toContain(token);
  });

  it('AC-2: 올바른 토큰 없이는 진행할 수 없다', async () => {
    mintInstallToken(stores);

    expect(verifyInstallToken(stores, '틀린-토큰')).toBe(false);
    expect((await commit('틀린-토큰')).ok).toBe(false);
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID)).toEqual([]);
  });

  it('AC-3 · AC-4: 잘못 입력하거나 중단해도 같은 토큰을 다시 쓸 수 있다', async () => {
    const token = mintInstallToken(stores);

    expect(verifyInstallToken(stores, '틀림')).toBe(false);
    expect((await commit('틀림')).ok).toBe(false);

    // 실패가 토큰을 태우지 않는다 — 태우면 오타 한 번에 서버를 재기동해야 한다.
    expect(verifyInstallToken(stores, token)).toBe(true);
    expect((await commit(token)).ok).toBe(true);
  });

  it('AC-5 · AC-6: 커밋 순간 소진되고 그 뒤로는 통하지 않는다', async () => {
    const token = mintInstallToken(stores);
    expect(verifyInstallToken(stores, token)).toBe(true);

    await commit(token);

    expect(verifyInstallToken(stores, token), '소진된 토큰이 살아 있다').toBe(false);
  });

  it('AC-5: 커밋이 실패하면 소진되지 않는다 — 소진 시점은 커밋되는 순간이다', async () => {
    const token = mintInstallToken(stores);

    // 비밀번호가 비어 커밋이 실패한다.
    expect((await commit(token, { password: '' })).ok).toBe(false);
    expect(verifyInstallToken(stores, token), '실패한 커밋이 토큰을 태웠다').toBe(true);
  });
});

describe('SEC-AUTH-013 — 토큰 수명은 30분이며 만료 시각을 절대시각으로 출력한다', () => {
  it('AC-1: 30분이 이 요구의 값이다', () => {
    expect(INSTALL_TOKEN_MINUTES).toBe(30);
  });

  it('AC-2: 30분이 지난 토큰은 거부된다', () => {
    const token = mintInstallToken(stores);

    now = new Date(now.getTime() + 30 * 60 * 1000 - 1);
    expect(verifyInstallToken(stores, token)).toBe(true);

    now = new Date(now.getTime() + 2);
    expect(verifyInstallToken(stores, token), '만료된 토큰이 통과한다').toBe(false);
  });

  it('AC-3: 만료 시각이 상대 시간이 아니라 절대시각으로 출력된다', () => {
    mintInstallToken(stores);
    const line = printed.join('\n');

    // 「30분 뒤」 같은 상대 표현은 언제 출력됐는지를 모르면 쓸모가 없다.
    expect(line).toContain(new Date(now.getTime() + 30 * 60 * 1000).toISOString());
    expect(line).not.toMatch(/30\s*분\s*(뒤|후|이내)/);
  });
});

describe('SEC-AUTH-014 — 재기동이 유일한 복구 경로다', () => {
  it('AC-1 · AC-2 · AC-3: 다시 발급하면 이전 값이 죽고 새 값이 나온다', () => {
    const first = mintInstallToken(stores);
    const second = mintInstallToken(stores);

    expect(second).not.toBe(first);
    expect(verifyInstallToken(stores, first), '이전 토큰이 살아 있다').toBe(false);
    expect(verifyInstallToken(stores, second)).toBe(true);
  });

  it('AC-6: 토큰이 디스크에 남지 않는다', () => {
    const token = mintInstallToken(stores);

    // DB 에도 없다 — 프로세스 메모리에만 산다. 그래서 재기동이 곧 무효화다.
    expect(JSON.stringify(db.all("SELECT * FROM instance_setting"))).not.toContain(token);
    for (const name of readdirSync(dir)) {
      expect(name, `${name} 이 토큰을 담은 파일로 보인다`).not.toMatch(/token/i);
    }
  });

  it('AC-4 · AC-5: 재발급 API·CLI 하위명령이 없다 — 발급은 기동이 부른다', () => {
    // `mintInstallToken` 은 기동 경로가 부르는 함수이며, 요청을 받아
    // 토큰을 다시 내주는 진입점은 어디에도 없다. 있으면 인증 없이
    // 설치를 다시 여는 문이 된다.
    const surface = Object.keys(stores);
    expect(surface.filter((k) => /reissue|regenerate|resetToken/i.test(k))).toEqual([]);
  });
});

describe('SEC-AUTH-015 — 토큰 검증이 설치 세션을 발급하고 이후 요청이 그것을 요구한다', () => {
  it('AC-3: 설치 세션 없이 커밋을 부르면 거부된다', async () => {
    mintInstallToken(stores);

    // 커밋은 토큰(=설치 세션의 근거)을 요구한다. 진입 시점에만 검사하고
    // 커밋을 열어 두면 클라이언트가 단계를 건너뛴다.
    expect((await commit('')).ok).toBe(false);
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID)).toEqual([]);
  });
});

describe('SEC-AUTH-017 — 기본 워크스페이스의 default 초기 권한을 마법사가 고른다', () => {
  it('AC-3: 고른 권한이 default 그룹 ACL 로 적용된다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { defaultGroupLevel: 'view' });

    const ws = (done as { ok: true; workspaceId: string }).workspaceId;
    const entries = stores.acl.entriesOn(ws).filter((e) => e.principalId === DEFAULT_GROUP_ID);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('view');
  });

  it('AC-1: 없음 을 고르면 default 그룹 항목이 아예 생기지 않는다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { defaultGroupLevel: 'none' });

    const ws = (done as { ok: true; workspaceId: string }).workspaceId;
    expect(stores.acl.entriesOn(ws).filter((e) => e.principalId === DEFAULT_GROUP_ID)).toEqual([]);
  });

  it('AC-3: 그 권한이 실제 판정에 반영된다 — 항목이 있다는 것만으로는 부족하다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { defaultGroupLevel: 'edit' });
    const ws = (done as { ok: true; workspaceId: string }).workspaceId;

    const newcomer = await registerAccount(stores, { name: '새사람', password: 'x'.repeat(8), status: 'active' });
    const id = (newcomer as { ok: true; id: string }).id;

    // default 소속은 불변식이라 멤버십 행 없이도 판정에 걸린다.
    expect(permissionOf(stores, actorFor(stores.principals, id), ws)).toBe('edit');
  });

  it('AC-4: 자유 가입 + 편집 조합에 경고가 붙는다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { signupMode: 'open', defaultGroupLevel: 'edit' });

    expect((done as { ok: true; warnings: string[] }).warnings).toHaveLength(1);
    expect((done as { ok: true; warnings: string[] }).warnings[0]).toMatch(/자유 가입/);
  });

  it('AC-4: 다른 조합에는 경고가 붙지 않는다 — 경고가 상시면 아무도 읽지 않는다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { signupMode: 'open', defaultGroupLevel: 'view' });

    expect((done as { ok: true; warnings: string[] }).warnings).toEqual([]);
  });
});

describe('SEC-AUTH-004 — default 소속은 active 전환 시점의 일이다', () => {
  it('AC-2 · AC-3: pending 계정은 그룹 ACL 로부터 권한을 얻지 않는다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { defaultGroupLevel: 'edit' });
    const ws = (done as { ok: true; workspaceId: string }).workspaceId;

    const waiting = await registerAccount(stores, { name: '대기자', password: 'x'.repeat(8), status: 'pending' });
    const id = (waiting as { ok: true; id: string }).id;

    // 상태 게이트가 주체 집합을 비우므로 default 그룹 ACL 도 걸리지 않는다.
    expect(permissionOf(stores, actorFor(stores.principals, id), ws)).toBeNull();
  });

  it('AC-1 · AC-4: active 로 전환되면 그 시점부터 default 그룹 권한을 얻는다', async () => {
    const token = mintInstallToken(stores);
    const done = await commit(token, { defaultGroupLevel: 'edit' });
    const ws = (done as { ok: true; workspaceId: string }).workspaceId;

    const waiting = await registerAccount(stores, { name: '대기자', password: 'x'.repeat(8), status: 'pending' });
    const id = (waiting as { ok: true; id: string }).id;
    expect(permissionOf(stores, actorFor(stores.principals, id), ws)).toBeNull();

    stores.principals.setStatus(id, 'active');

    expect(permissionOf(stores, actorFor(stores.principals, id), ws)).toBe('edit');
  });
});
