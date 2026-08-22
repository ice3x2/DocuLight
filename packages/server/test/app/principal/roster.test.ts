import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { groupRoster, removeGroupWithGrants, userRoster } from '../../../src/app/principal/roster-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 남 : Actor;
let ws: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-roster-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  남 = actorFor(stores.principals, stores.principals.createUser('남').id);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-PRINCIPAL-001 · FR-PRINCIPAL-009 — 슈퍼유저 전용 사용자 명부', () => {
  const 계정 = (name: string, status: 'active' | 'pending' | 'suspended' | 'rejected') => {
    const made = stores.principals.createUser(name);
    stores.principals.setStatus(made.id, status);
    return made;
  };

  it('AC-1: 등록된 사용자와 그 계정 상태를 준다', () => {
    계정('활성이', 'active');

    const 명부 = userRoster(stores, root)!;

    expect(명부.map((row) => row.name)).toContain('활성이');
    expect(명부.find((row) => row.name === '활성이')?.status).toBe('active');
  });

  it('FR-PRINCIPAL-009 AC-1 · AC-2 · AC-3: 네 상태가 그대로 온다', () => {
    계정('활성이', 'active');
    계정('대기자', 'pending');
    계정('정지자', 'suspended');
    계정('거절자', 'rejected');

    const 상태 = new Map(userRoster(stores, root)!.map((row) => [row.name, row.status]));

    expect(상태.get('활성이')).toBe('active');
    expect(상태.get('대기자')).toBe('pending');
    expect(상태.get('정지자')).toBe('suspended');
    // 주체 검색은 이것을 뺀다 (`SEC-PRINCIPAL-002` AC-3). 그 규칙을 이
    // 명부에 옮겨 붙이면 슈퍼유저가 거절 이력을 운영할 수 없다.
    expect(상태.get('거절자')).toBe('rejected');
  });

  it('FR-PRINCIPAL-009 AC-4: 상태를 뭉치지 않는다 — 서로 다른 값 넷이 온다', () => {
    계정('활성이', 'active');
    계정('대기자', 'pending');
    계정('정지자', 'suspended');
    계정('거절자', 'rejected');

    const 값들 = new Set(userRoster(stores, root)!.map((row) => row.status));

    expect(값들.size).toBeGreaterThanOrEqual(4);
  });

  it('R163: 스무 건 상한이 걸리지 않는다 — 전수 명부다', () => {
    for (let n = 0; n < 25; n += 1) 계정(`사람${n}`, 'active');

    // 주체 검색의 상한을 여기 옮겨 붙이면 스물다섯 중 다섯이 안 보이고,
    // 그 다섯은 승인되지 않는다.
    expect(userRoster(stores, root)!.length).toBeGreaterThanOrEqual(25);
  });

  it('R163-a: 슈퍼유저가 아니면 명부가 없는 것과 같다', () => {
    expect(userRoster(stores, 남)).toBeNull();
    expect(groupRoster(stores, 남)).toBeNull();
  });

  it('AC-2: 그룹 목록과 각 그룹의 멤버를 준다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    const 사람 = stores.principals.createUser('사람');
    stores.principals.addMember(팀.id, 사람.id);

    const 그룹 = groupRoster(stores, root)!.find((row) => row.id === 팀.id)!;

    expect(그룹.name).toBe('기획팀원');
    expect(그룹.members.map((m) => m.name)).toEqual(['사람']);
  });

  it('AC-2: 시스템 그룹도 목록에 있고 그렇다고 표시된다', () => {
    const 시스템 = groupRoster(stores, root)!.filter((row) => row.system).map((row) => row.id);

    // 감추면 슈퍼유저가 그 그룹의 멤버를 볼 수 없고, 표시하지 않으면
    // 지우려다 거절당하는 이유를 알 수 없다.
    expect(시스템.sort()).toEqual([DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID].sort());
  });
});

describe('FR-PRINCIPAL-002 — 그룹 삭제는 그 그룹의 ACL 항목을 함께 걷는다', () => {
  it('AC-1 · AC-2: 삭제 뒤 그 그룹을 주체로 하는 항목이 하나도 없다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    grantPermission(stores, root, { nodeId: ws, principalId: 팀.id, level: 'edit' });
    expect(stores.acl.entriesOfPrincipal(팀.id)).toHaveLength(1);

    expect(removeGroupWithGrants(stores, root, 팀.id)).toEqual({ ok: true });

    expect(stores.principals.findById(팀.id)).toBeUndefined();
    expect(stores.acl.entriesOfPrincipal(팀.id)).toEqual([]);
  });

  it('AC-2: 걷힌 뒤 그 그룹으로 얻던 권한이 사라진다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    const 사람 = stores.principals.createUser('사람');
    stores.principals.addMember(팀.id, 사람.id);
    grantPermission(stores, root, { nodeId: ws, principalId: 팀.id, level: 'edit' });
    expect(permissionOf(stores, actorFor(stores.principals, 사람.id), ws)).toBe('edit');

    removeGroupWithGrants(stores, root, 팀.id);

    // 고아 항목이 남으면 여기서 여전히 `edit` 이 나온다.
    expect(permissionOf(stores, actorFor(stores.principals, 사람.id), ws)).toBeNull();
  });

  it('AC-3: 둘이 한 문장이라 한쪽만 반영된 상태가 표현되지 않는다', () => {
    // 앱 계층이 두 번 쓰지 않고 스키마의 `ON DELETE CASCADE` 가 회수를
    // 맡는다 — 그래서 원자성이 「조심해서 순서를 맞췄다」가 아니라
    // **한 문장**이라는 사실에서 나온다. 그 사실을 재는 자리가 여기다.
    const 선언 = db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'acl_entry'",
    )!.sql;
    const 켜짐 = db.get<Record<string, number>>('PRAGMA foreign_keys')!;

    expect(선언.replace(/\s+/g, ' ')).toContain('REFERENCES principal (id) ON DELETE CASCADE');
    // 선언이 있어도 pragma 가 꺼져 있으면 조용히 아무 일도 안 일어난다.
    expect(Object.values(켜짐)[0]).toBe(1);
  });

  it('AC-2: 고아 행이 실제로 남지 않는다 — 표를 직접 센다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    grantPermission(stores, root, { nodeId: ws, principalId: 팀.id, level: 'edit' });

    removeGroupWithGrants(stores, root, 팀.id);

    // 저장소 메서드가 아니라 표를 센다 — 조회 경로가 걸러 주는 것과
    // 행이 사라진 것은 다르고, AC-2 가 말하는 것은 후자다.
    const 남은것 = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM acl_entry WHERE principal_id = ?', [
      팀.id,
    ])!;
    expect(남은것.n).toBe(0);
  });

  it('시스템 그룹은 삭제되지 않고 그 항목도 그대로다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: DEFAULT_GROUP_ID, level: 'view' });

    expect(removeGroupWithGrants(stores, root, DEFAULT_GROUP_ID)).toEqual({
      ok: false,
      rule: 'system-group-immutable',
    });
    expect(stores.acl.entriesOfPrincipal(DEFAULT_GROUP_ID)).toHaveLength(1);
  });

  it('슈퍼유저가 아니면 그룹을 지울 수 없다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');

    expect(removeGroupWithGrants(stores, 남, 팀.id)).toEqual({ ok: false, rule: 'needs-superuser' });
    expect(stores.principals.findById(팀.id)).toBeDefined();
  });
});
