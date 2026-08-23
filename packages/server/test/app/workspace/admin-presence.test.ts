import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  adminlessWorkspaceIds,
  grantWarnings,
  isLastAdministrator,
} from '../../../src/app/workspace/admin-presence.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission, revokePermission } from '../../../src/app/acl/grant-service.js';
import { createWorkspaceAs } from '../../../src/app/workspace/create-workspace.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { DEFAULT_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { files: FsWorkspaceFiles };
let root: Actor;
let 관리자: { id: string; name: string };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-adminp-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, docsRoot), files: new FsWorkspaceFiles(docsRoot) };
  root = superuserActor(stores);
  관리자 = stores.principals.createUser('관리하는이');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const 만들기 = async (name: string, defaultGroupLevel?: 'none' | 'view' | 'edit') => {
  const made = await createWorkspaceAs(stores, root, {
    name,
    administratorId: 관리자.id,
    ...(defaultGroupLevel === undefined ? {} : { defaultGroupLevel }),
  });
  return (made as { ok: true; workspace: { id: string } }).workspace.id;
};

describe('FR-PRINCIPAL-005 — 마지막 관리 권한자 제거는 차단이 아니라 경고다', () => {
  it('AC-1: 마지막 한 명이어도 회수 요청이 거부되지 않는다', async () => {
    const ws = await 만들기('기획팀');
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;

    expect(revokePermission(stores, root, 항목.id)).toEqual({ ok: true });
    // 차단이 아니라 경고다 — 막으면 오프보딩이 그 자리에서 멈춘다.
    expect(permissionOf(stores, actorFor(stores.principals, 관리자.id), ws)).toBeNull();
  });

  it('AC-2: 회수 전에 그것이 마지막임을 서버가 알려 준다', async () => {
    const ws = await 만들기('기획팀');
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;

    // 화면이 스스로 세면 서버가 아는 것과 갈린다 — 갈리면 경고가 뜨지
    // 않는 회수가 생긴다.
    expect(isLastAdministrator(stores, 항목.id)).toBe(true);
  });

  it('AC-2: 둘이면 마지막이 아니다', async () => {
    const ws = await 만들기('기획팀');
    const 둘째 = stores.principals.createUser('둘째관리');
    grantPermission(stores, root, { nodeId: ws, principalId: 둘째.id, level: 'admin' });
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;

    expect(isLastAdministrator(stores, 항목.id)).toBe(false);
  });

  it('관리가 아닌 항목은 이 경고의 대상이 아니다', async () => {
    const ws = await 만들기('기획팀');
    const 보는이 = stores.principals.createUser('보는이');
    grantPermission(stores, root, { nodeId: ws, principalId: 보는이.id, level: 'view' });
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 보는이.id)!;

    expect(isLastAdministrator(stores, 항목.id)).toBe(false);
  });
});

describe('FR-PRINCIPAL-006 — 관리자 없는 워크스페이스', () => {
  it('AC-1: 관리 권한자가 0명인 워크스페이스가 지목된다', async () => {
    const ws = await 만들기('기획팀');
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;
    expect(adminlessWorkspaceIds(stores)).toEqual([]);

    revokePermission(stores, root, 항목.id);

    expect(adminlessWorkspaceIds(stores)).toEqual([ws]);
  });

  it('AC-1: 보기·편집 항목이 있어도 관리자가 없으면 지목된다', async () => {
    const ws = await 만들기('기획팀');
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;
    revokePermission(stores, root, 항목.id);
    const 보는이 = stores.principals.createUser('보는이');
    grantPermission(stores, root, { nodeId: ws, principalId: 보는이.id, level: 'view' });

    // 항목 수를 세면 여기서 「관리자 있음」이 된다 — 세는 것은 항목이
    // 아니라 **관리 레벨** 항목이다.
    expect(adminlessWorkspaceIds(stores)).toEqual([ws]);
  });

  it('슈퍼유저의 상방 게이트를 관리자 있음으로 세지 않는다', async () => {
    const ws = await 만들기('기획팀');
    const 항목 = stores.acl.entriesOn(ws).find((e) => e.principalId === 관리자.id)!;
    revokePermission(stores, root, 항목.id);

    // 슈퍼유저는 어느 워크스페이스에도 닿지만 그것은 지정된 관리자가
    // 아니다 — 그렇게 세면 배지가 영영 뜨지 않는다.
    expect(adminlessWorkspaceIds(stores)).toContain(ws);
  });
});

describe('FR-PRINCIPAL-007 — 생성 폼의 default 그룹 초기 권한', () => {
  it('AC-2 · AC-3: 기본값은 없음 이고 그때 default 항목이 만들어지지 않는다', async () => {
    const ws = await 만들기('기획팀');

    expect(stores.acl.entriesOn(ws).some((e) => e.principalId === DEFAULT_GROUP_ID)).toBe(false);
  });

  it('AC-4: 그래도 지정 관리자와 슈퍼유저는 접근한다', async () => {
    const ws = await 만들기('기획팀');

    expect(permissionOf(stores, actorFor(stores.principals, 관리자.id), ws)).toBe('admin');
    expect(permissionOf(stores, root, ws)).toBe('admin');
  });

  it('AC-1: 보기나 편집을 고르면 그 레벨의 default 항목이 생긴다', async () => {
    const 보기 = await 만들기('보기팀', 'view');
    const 편집 = await 만들기('편집팀', 'edit');

    expect(stores.acl.entriesOn(보기).find((e) => e.principalId === DEFAULT_GROUP_ID)?.level).toBe('view');
    expect(stores.acl.entriesOn(편집).find((e) => e.principalId === DEFAULT_GROUP_ID)?.level).toBe('edit');
  });

  it('AC-5: 자유 가입 인스턴스에서 편집을 고르면 경고가 나온다', async () => {
    writeSetting(stores.settings, 'signup-mode', 'open');

    // 자유 가입이면 아무나 계정을 만들 수 있고 그 계정이 곧 default 다 —
    // 초기 권한이 `편집` 이면 그 워크스페이스가 사실상 공개 쓰기가 된다.
    expect(grantWarnings(stores, { defaultGroupLevel: 'edit' })).toContain('open-signup-edit');
    expect(grantWarnings(stores, { defaultGroupLevel: 'view' })).toEqual([]);
  });

  it('AC-5: 승인 가입 인스턴스에서는 편집을 골라도 그 경고가 없다', async () => {
    writeSetting(stores.settings, 'signup-mode', 'approval');

    expect(grantWarnings(stores, { defaultGroupLevel: 'edit' })).toEqual([]);
  });
});

describe('FR-PRINCIPAL-008 — 비활성 계정에 부여할 때의 확인', () => {
  it('AC-1: 대상이 suspended 면 확인이 필요하다고 알린다', () => {
    const 정지된 = stores.principals.createUser('정지된이');
    stores.principals.setStatus(정지된.id, 'suspended');

    expect(grantWarnings(stores, { principalId: 정지된.id })).toContain('suspended-subject');
  });

  it('AC-3: active 계정에는 그 확인이 붙지 않는다', () => {
    const 멀쩡한 = stores.principals.createUser('멀쩡한이');

    expect(grantWarnings(stores, { principalId: 멀쩡한.id })).toEqual([]);
  });

  it('pending 계정에도 붙지 않는다 — 입사 전 사전 세팅이 실제 수요다', () => {
    const 대기 = stores.principals.createUser('대기자');
    stores.principals.setStatus(대기.id, 'pending');

    expect(grantWarnings(stores, { principalId: 대기.id })).toEqual([]);
  });
});
