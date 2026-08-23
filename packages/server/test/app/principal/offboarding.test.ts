import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { offboardingCard, revocationNotes } from '../../../src/app/principal/offboarding-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { setAccountStatus, removeFromGroup } from '../../../src/app/principal/principal-service.js';
import { issueToken, authenticateToken } from '../../../src/app/auth/token-service.js';
import { createWorkspaceAs } from '../../../src/app/workspace/create-workspace.js';
import { DEFAULT_GROUP_ID, SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { files: FsWorkspaceFiles };
let root: Actor;
let 떠나는이: { id: string; name: string };
let ws: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-offboard-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, docsRoot), files: new FsWorkspaceFiles(docsRoot) };
  root = superuserActor(stores);
  떠나는이 = stores.principals.createUser('떠나는이');
  ws = (
    (await createWorkspaceAs(stores, root, { name: '기획팀', administratorId: root.id })) as {
      ok: true;
      workspace: { id: string };
    }
  ).workspace.id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-PRINCIPAL-003 · CON-PRINCIPAL-004 — 오프보딩 카드는 파생이다', () => {
  it('AC-1: 네 단계가 순서대로 온다', () => {
    const 카드 = offboardingCard(stores, 떠나는이.id)!;

    expect(카드.steps.map((step) => step.id)).toEqual([
      'suspend',
      'tokens',
      'memberships',
      'acl',
    ]);
  });

  it('CON-PRINCIPAL-004 AC-4: 완료 여부를 매번 파생한다', () => {
    const 전 = offboardingCard(stores, 떠나는이.id)!;
    expect(전.steps[0]!.done).toBe(false);

    setAccountStatus({ principals: stores.principals, sessions: stores.sessions }, 떠나는이.id, 'suspended');

    // 저장된 진행 상태를 읽는다면 여기서 그대로 `false` 다.
    expect(offboardingCard(stores, 떠나는이.id)!.steps[0]!.done).toBe(true);
  });

  it('AC-2: PAT 무효화는 별도 조작 없이 계정 상태의 결과로 이뤄진다', () => {
    const tokens = new SqliteTokenRepository(db);
    const auth = { principals: stores.principals, tokens, audit: stores.audit, clock: () => new Date() };
    const 발급 = issueToken(auth, 떠나는이.id, {
      owner: 떠나는이.id,
      name: '내 토큰',
      scope: 'read-only',
      expiresInDays: 30,
    });
    const 평문 = (발급 as { ok: true; token: string }).token;
    expect(authenticateToken(auth, 평문)).toBeDefined();
    // **아직 안 됐다**는 것을 먼저 못박는다 — 안 그러면 이 단계를 항상
    // 완료로 두어도 시험이 살아남는다.
    expect(offboardingCard(stores, 떠나는이.id)!.steps[1]!.done).toBe(false);

    setAccountStatus({ principals: stores.principals, sessions: stores.sessions }, 떠나는이.id, 'suspended');

    // 토큰을 하나씩 폐기하지 않았는데도 닫힌다.
    expect(authenticateToken(auth, 평문)).toBeUndefined();
    expect(offboardingCard(stores, 떠나는이.id)!.steps[1]!.done).toBe(true);
  });

  it('AC-4: 멤버십이 남아 있으면 그 단계만 미완이다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(팀.id, 떠나는이.id);
    setAccountStatus({ principals: stores.principals, sessions: stores.sessions }, 떠나는이.id, 'suspended');

    const 카드 = offboardingCard(stores, 떠나는이.id)!;

    // 한 단계의 통과가 다른 단계의 통과를 대신하지 않는다 (AC-3).
    expect(카드.steps[0]!.done).toBe(true);
    expect(카드.steps[2]!.done).toBe(false);
  });

  it('AC-4: 멤버십을 걷으면 그 단계가 완료로 파생된다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(팀.id, 떠나는이.id);

    removeFromGroup({ principals: stores.principals, sessions: stores.sessions }, 팀.id, 떠나는이.id);

    expect(offboardingCard(stores, 떠나는이.id)!.steps[2]!.done).toBe(true);
  });

  it('AC-5: ACL 단계는 남은 항목 수만 갖고 영향 범위 표를 갖지 않는다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: 떠나는이.id, level: 'view' });

    const 단계 = offboardingCard(stores, 떠나는이.id)!.steps[3]!;

    // 카드가 표를 그리면 주체 일괄 회수 화면과 중복 구현이 된다 (AC-6).
    expect(Object.keys(단계).sort()).toEqual(['done', 'id', 'remaining']);
    expect(단계.remaining).toBe(1);
    expect(단계.done).toBe(false);
  });

  it('AC-3: 시스템 그룹 소속은 멤버십 단계를 막지 않는다', () => {
    // 시스템 그룹을 세면 이 단계가 영영 완료되지 않는다 — 그것은
    // 오프보딩이 걷는 대상이 아니고, 슈퍼유저 그룹은 별도 가드가 지킨다.
    stores.principals.addMember(SUPERUSER_GROUP_ID, 떠나는이.id);
    stores.principals.addMember(DEFAULT_GROUP_ID, 떠나는이.id);

    expect(offboardingCard(stores, 떠나는이.id)!.steps[2]!.done).toBe(true);
  });

  it('AC-3: 평범한 그룹 하나만 있어도 그 단계는 미완이다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');
    stores.principals.addMember(팀.id, 떠나는이.id);

    expect(offboardingCard(stores, 떠나는이.id)!.steps[2]!.done).toBe(false);
  });

  it('없는 계정에는 카드가 없다', () => {
    expect(offboardingCard(stores, '그런-사람-없음')).toBeNull();
  });
});

describe('FR-PRINCIPAL-011 — 시스템 그룹 일괄 회수의 안내', () => {
  it('AC-2: 슈퍼유저 그룹을 고르면 그 회수가 접근을 줄이지 못한다고 알린다', () => {
    expect(revocationNotes(SUPERUSER_GROUP_ID)).toContain('superuser-revocation-ineffective');
  });

  it('AC-1: default 그룹은 확인 등급이 필요한 조작이라고 알린다', () => {
    expect(revocationNotes(DEFAULT_GROUP_ID)).toContain('default-group-wide-effect');
  });

  it('평범한 그룹에는 그 안내가 붙지 않는다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');

    expect(revocationNotes(팀.id)).toEqual([]);
  });

  it('AC-3: 슈퍼유저 그룹의 항목을 걷어도 그 멤버는 계속 도달한다', () => {
    const 슈퍼 = stores.principals.createUser('슈퍼');
    stores.principals.addMember(SUPERUSER_GROUP_ID, 슈퍼.id);

    // 슈퍼유저는 ACL 이 아니라 상방 게이트로 닿는다 — 그래서 그 그룹
    // 앞으로 부여된 항목을 전부 걷어도 접근이 줄지 않는다.
    expect(stores.acl.entriesOfPrincipal(SUPERUSER_GROUP_ID)).toEqual([]);
    expect(permissionOf(stores, actorFor(stores.principals, 슈퍼.id), ws)).toBe('admin');
  });
});

describe('FR-CONFIRM-009 — 멤버십 단계는 제거될 그룹 이름을 모두 싣는다', () => {
  it('AC-2: 이름이 빠짐 없이 온다', () => {
    const 한범 = stores.principals.createUser('한범');
    const 기획 = stores.principals.createGroup('기획팀원');
    const 설계 = stores.principals.createGroup('설계팀원');
    stores.principals.addMember(기획.id, 한범.id);
    stores.principals.addMember(설계.id, 한범.id);
    stores.principals.addMember(DEFAULT_GROUP_ID, 한범.id);

    const step = offboardingCard(stores, 한범.id)!.steps.find((one) => one.id === 'memberships')!;

    // 카드가 진행 상태를 저장하지 않으므로(`R101-d`) 실행취소 토스트가
    // 사라지면 어느 그룹에 속했는지 복원할 정보가 남지 않는다 — 실행 전에
    // 보여주는 것이 유일한 기회다. 그래서 개수가 아니라 이름이다.
    expect(step.groups).toEqual(['기획팀원', '설계팀원']);
  });

  it('시스템 그룹은 그 목록에 없다 — 제거 대상이 아니다', () => {
    const 한범 = stores.principals.createUser('한범');
    stores.principals.addMember(DEFAULT_GROUP_ID, 한범.id);

    const step = offboardingCard(stores, 한범.id)!.steps.find((one) => one.id === 'memberships')!;

    expect(step.groups).toEqual([]);
    expect(step.done).toBe(true);
  });

  it('다른 단계에는 그 칸이 없다 — 있으면 화면이 아무 단계에나 이름을 그린다', () => {
    const 한범 = stores.principals.createUser('한범');

    const steps = offboardingCard(stores, 한범.id)!.steps;

    for (const step of steps.filter((one) => one.id !== 'memberships')) {
      expect(step.groups).toBeUndefined();
    }
  });
});
