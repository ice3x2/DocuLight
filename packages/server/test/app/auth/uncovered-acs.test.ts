import { readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission, revokePermission } from '../../../src/app/acl/grant-service.js';
import { authenticateSession, logIn } from '../../../src/app/auth/login-service.js';
import { registerAccount } from '../../../src/app/auth/account-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { BcryptPasswordHasher } from '../../../src/infra/crypto/bcrypt-hasher.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

const SRC = fileURLToPath(new URL('../../../src', import.meta.url));

function sourceFiles(at: string): string[] {
  return readdirSync(at).flatMap((name) => {
    const full = join(at, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

/** 주석을 걷어낸 코드만. 규칙을 설명하려면 금지된 낱말을 인용할 수밖에 없다. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let sessions: SqliteSessionRepository;
let root: Actor;
let ws: string;
let doc: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-uncovered-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  sessions = new SqliteSessionRepository(db);
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUTH-002 AC-3 — 권한 회수는 같은 세션의 다음 요청부터 닫힌다', () => {
  it('회수 뒤 그 세션으로 계산한 유효 권한이 사라진다', async () => {
    const auth = { ...stores, sessions, passwords: new BcryptPasswordHasher(), clock: () => new Date() };
    const 계정 = await registerAccount(auth, { name: '한범', password: '올바른-말-네-개', status: 'active' });
    const 한범 = (계정 as { ok: true; id: string }).id;
    const 부여 = grantPermission(stores, root, { nodeId: doc, principalId: 한범, level: 'edit' });
    const 항목 = (부여 as { ok: true; entryId: string }).entryId;

    const 로그인 = await logIn(auth, { name: '한범', password: '올바른-말-네-개' });
    const 세션 = (로그인 as { ok: true; sessionToken: string }).sessionToken;

    // 회수 **전에** 그 세션이 실제로 열려 있었다는 것을 먼저 못박는다 —
    // 안 그러면 처음부터 닫혀 있던 세션으로도 이 시험이 통과한다.
    const 전 = authenticateSession(auth, 세션)!;
    expect(permissionOf(stores, actorFor(stores.principals, 전.userId), doc)).toBe('edit');

    revokePermission(stores, root, 항목);

    // 재로그인 없이 같은 세션 토큰으로 다시 판정한다 — 세션이 권한을
    // 담고 있었다면 여기서 여전히 `edit` 이 나온다.
    const 후 = authenticateSession(auth, 세션)!;
    expect(permissionOf(stores, actorFor(stores.principals, 후.userId), doc)).toBeNull();
  });
});

describe('SEC-AUTH-004 AC-2 — pending 계정은 default 그룹의 멤버가 아니다', () => {
  it('판정에 쓰이는 주체 집합에 default 그룹이 들지 않는다', () => {
    const 대기 = stores.principals.createUser('대기자');
    stores.principals.setStatus(대기.id, 'pending');

    const actor = actorFor(stores.principals, 대기.id);

    // 「권한이 안 나온다」만 재면 그것은 AC-3 이다. AC-2 는 **멤버십**을
    // 말하므로 주체 집합 자체를 본다.
    expect(actor.requester.subjectIds).not.toContain(DEFAULT_GROUP_ID);
    expect(actor.requester.subjectIds).toEqual([]);
  });

  it('active 로 전환되면 그때 든다', () => {
    const 대기 = stores.principals.createUser('대기자');
    stores.principals.setStatus(대기.id, 'pending');
    stores.principals.setStatus(대기.id, 'active');

    expect(actorFor(stores.principals, 대기.id).requester.subjectIds).toContain(DEFAULT_GROUP_ID);
  });
});

describe('SEC-AUTH-005 AC-1 · AC-2 — 전역 API Key 가 제품에 없다', () => {
  it('자격증명을 세우는 코드에 전역 키 축이 없다', () => {
    // 스키마에 표가 없다는 것만으로는 「지금은 아무도 안 쓴다」에 그친다.
    // 자격증명을 읽는 코드 전량을 훑어 그 축의 **식별자 자체**가 없음을
    // 잰다 — 있으면 언젠가 그 경로로 요청이 성립한다.
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const code = codeOf(readFileSync(file, 'utf8'));
      if (/\bapiKey\b|\bapi_key\b|\bglobalKey\b|\bglobal_key\b|\bmasterKey\b/i.test(code)) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('자격증명을 받아 주체를 세우는 함수가 둘뿐이다', () => {
    const defined = new Set<string>();

    for (const file of sourceFiles(SRC)) {
      for (const found of codeOf(readFileSync(file, 'utf8')).matchAll(
        /export function (authenticate\w+)/g,
      )) {
        defined.add(found[1]!);
      }
    }

    // 셋째 경로가 생기면 이 시험이 먼저 깨진다 — 전역 키가 들어온다면
    // 그것도 결국 이 형태의 함수 하나로 나타난다.
    expect([...defined].sort()).toEqual(['authenticateSession', 'authenticateToken']);
  });
});

describe('SEC-AUTH-010 AC-2 — 마법사 밖에서 최초 슈퍼유저를 만들 수 없다', () => {
  it('슈퍼유저 그룹에 사람을 넣는 소스 자리가 둘뿐이다', () => {
    const 자리 = sourceFiles(SRC)
      .filter((file) => {
        const code = codeOf(readFileSync(file, 'utf8'));
        // 저장소를 직접 부르는 `addMember` 와 서비스를 지나는
        // `addGroupMember` 를 함께 본다 — 하나만 보면 다른 하나로 옮기는
        // 것만으로 이 시험이 조용히 통과한다.
        return code.includes('SUPERUSER_GROUP_ID') && /add(Group)?Member\s*\(/.test(code);
      })
      .map((file) => file.slice(SRC.length + 1))
      .sort();

    // 셋째 자리가 생기면 그것이 곧 마법사를 우회하는 경로다.
    expect(자리).toEqual([
      join('app', 'install', 'install-service.ts'),
      join('app', 'principal', 'principal-service.ts'),
    ]);
  });

  it('그 둘째 자리로 가는 라우트는 전부 슈퍼유저를 요구한다', () => {
    // 마법사가 아닌 자리(그룹 멤버십 서비스)는 **이미 슈퍼유저가 있는**
    // 인스턴스에서 슈퍼유저가 쓰는 조작이다. 그러니 그 라우트가 슈퍼유저를
    // 요구하는 한 최초 슈퍼유저를 만드는 경로는 여전히 마법사뿐이다 —
    // 슈퍼유저가 0명이면 그 관문을 지날 사람이 없다.
    //
    // 관문이 실제로 거절하는지는 `test/http/workspace-api.test.ts` 의
    // 「슈퍼유저만 멤버십을 바꾼다」가 요청으로 잰다. 여기서는 관문 **없이**
    // 그 서비스를 부르는 라우트 파일이 생기는 것을 막는다.
    const 관문없이 = sourceFiles(join(SRC, 'http'))
      .map((file) => ({ file, code: codeOf(readFileSync(file, 'utf8')) }))
      .filter(({ code }) => /addGroupMember|addMember\s*\(/.test(code))
      .filter(({ code }) => !code.includes('isSuperuser'))
      .map(({ file }) => file.slice(SRC.length + 1));

    expect(관문없이).toEqual([]);
  });

  it('마법사는 슈퍼유저가 이미 있으면 두 번째로 통과하지 않는다', () => {
    expect(stores.principals.membersOf(SUPERUSER_GROUP_ID).length).toBeGreaterThan(0);
  });
});

describe('SEC-AUTH-014 AC-4 · AC-5 — 재발급 표면이 없다', () => {
  it('설치 토큰을 재발급하는 라우트가 없다', () => {
    const routes = join(SRC, 'http');

    const offenders = sourceFiles(routes)
      .filter((file) => {
        const code = codeOf(readFileSync(file, 'utf8'));
        return /reissue|regenerate|resetToken|mintInstallToken/i.test(code);
      })
      .map((file) => file.slice(SRC.length + 1));

    // 시험이 만든 객체의 키를 보는 것으로는 라우트 표면을 재지 못한다 —
    // HTTP 계층 소스 전량을 훑는다.
    expect(offenders).toEqual([]);
  });

  it('CLI 진입점에 그 하위명령이 없다', () => {
    const cli = codeOf(readFileSync(join(SRC, 'main.ts'), 'utf8'));

    expect(/reissue|regenerate|reset-token|재발급/i.test(cli)).toBe(false);
  });
});
