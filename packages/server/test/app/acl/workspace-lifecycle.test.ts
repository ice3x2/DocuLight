import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createWorkspaceAs } from '../../../src/app/workspace/create-workspace.js';
import { copyNode, createNode, moveNode } from '../../../src/app/node/node-service.js';
import { setAccountStatus } from '../../../src/app/principal/principal-service.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let files: FsWorkspaceFiles;
let root: Actor;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const newActor = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-wslife-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  files = new FsWorkspaceFiles(docsRoot);
  root = superuserActor(stores);
  me = newActor('한범');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-WORKSPACE-001 — 워크스페이스 생성은 관리자 지정 단계를 포함한다', () => {
  it('AC-4: 생성 절차가 관리자 지정을 포함하고 그 주체가 관리로 판정된다', async () => {
    const created = await createWorkspaceAs({ ...stores, files }, root, {
      name: '기획팀',
      administratorId: me.id,
    });

    expect(created.ok).toBe(true);
    const ws = (created as { ok: true; workspace: { id: string } }).workspace.id;
    expect(permissionOf(stores, me, ws)).toBe('admin');
  });

  it('AC-5: 관리자를 지정하지 않으면 생성이 완료되지 않는다', async () => {
    const created = await createWorkspaceAs({ ...stores, files }, root, {
      name: '기획팀',
      administratorId: 'no-such-principal',
    });

    expect(created).toEqual({ ok: false, rule: 'unknown-administrator' });
    // 절반만 선 워크스페이스가 남지 않는다 — 레코드도 디렉토리도 없다.
    expect(stores.workspaces.list()).toEqual([]);
  });

  it('AC-1: 워크스페이스의 판정에 상위로부터 상속된 항목이 없다', async () => {
    const first = await createWorkspaceAs({ ...stores, files }, root, {
      name: '기획팀',
      administratorId: me.id,
    });
    const second = await createWorkspaceAs({ ...stores, files }, root, {
      name: '인사팀',
      administratorId: (stores.principals.createUser('다른관리인')).id,
    });

    const a = (first as { ok: true; workspace: { id: string } }).workspace.id;
    const b = (second as { ok: true; workspace: { id: string } }).workspace.id;

    // 한쪽의 관리가 다른 쪽으로 넘어가지 않는다 — 루트 위에 공통 조상이 없다.
    expect(permissionOf(stores, me, a)).toBe('admin');
    expect(permissionOf(stores, me, b)).toBeNull();
  });
});

describe('SEC-PRINCIPAL-001 — 슈퍼유저는 워크스페이스 수명주기 권한을 가진다', () => {
  it('AC-2: 슈퍼유저가 워크스페이스를 만든다', async () => {
    const created = await createWorkspaceAs({ ...stores, files }, root, {
      name: '기획팀',
      administratorId: me.id,
    });
    expect(created.ok).toBe(true);
  });

  it('AC-2: 슈퍼유저가 아니면 워크스페이스를 만들지 못한다', async () => {
    const created = await createWorkspaceAs({ ...stores, files }, me, {
      name: '기획팀',
      administratorId: me.id,
    });

    expect(created).toEqual({ ok: false, rule: 'needs-superuser' });
    expect(stores.workspaces.list()).toEqual([]);
  });
});

describe('SEC-ACL-014 — 워크스페이스 경계를 넘는 이동은 차단하고 복사만 허용한다', () => {
  let a: string;
  let b: string;
  let doc: string;
  let bRoot: string;

  beforeEach(async () => {
    a = (
      (await createWorkspaceAs({ ...stores, files }, root, { name: '기획팀', administratorId: me.id })) as {
        ok: true;
        workspace: { id: string };
      }
    ).workspace.id;
    b = (
      (await createWorkspaceAs({ ...stores, files }, root, { name: '인사팀', administratorId: me.id })) as {
        ok: true;
        workspace: { id: string };
      }
    ).workspace.id;
    doc = idOf(createNode(stores, me, { workspaceId: a, parentId: null, kind: 'file', name: '회의록.md' }));
    bRoot = idOf(createNode(stores, me, { workspaceId: b, parentId: null, kind: 'directory', name: '보관' }));
  });

  it('AC-1: 다른 워크스페이스를 목적지로 지정한 이동이 거부된다', () => {
    expect(moveNode(stores, me, doc, bRoot).ok).toBe(false);
    // 원본은 제자리다.
    expect(stores.nodes.findById(doc)?.workspaceId).toBe(a);
  });

  it('AC-2 · AC-3: 다른 워크스페이스로의 복사는 허용된다', async () => {
    const copied = await copyNode(stores, me, doc, { parentId: bRoot });

    expect(copied.ok).toBe(true);
    expect(stores.nodes.findById(idOf(copied))?.workspaceId).toBe(b);
    // 원본이 그대로 남는다 — 이동이 아니다.
    expect(stores.nodes.findById(doc)).toBeDefined();
  });

  it('AC-3: 복사는 원본의 보기와 대상 디렉토리의 편집을 요구한다', async () => {
    const you = newActor('다른이');
    // 원본만 보기 — 목적지가 비었으므로 거부.
    grantPermission(stores, root, { nodeId: doc, principalId: you.id, level: 'view' });
    expect((await copyNode(stores, you, doc, { parentId: bRoot })).ok).toBe(false);

    grantPermission(stores, root, { nodeId: bRoot, principalId: you.id, level: 'edit' });
    expect((await copyNode(stores, you, doc, { parentId: bRoot })).ok).toBe(true);
  });

  it('AC-4: 워크스페이스 내부 복사도 같은 권한 규칙을 따른다', async () => {
    const inner = idOf(createNode(stores, me, { workspaceId: a, parentId: null, kind: 'directory', name: '보관' }));
    const you = newActor('다른이');

    expect((await copyNode(stores, you, doc, { parentId: inner })).ok).toBe(false);
    grantPermission(stores, root, { nodeId: doc, principalId: you.id, level: 'view' });
    grantPermission(stores, root, { nodeId: inner, principalId: you.id, level: 'edit' });
    expect((await copyNode(stores, you, doc, { parentId: inner })).ok).toBe(true);
  });

  it('SEC-ACL-011 AC-5: 복사본의 생성자는 복사를 실행한 사용자다', async () => {
    const you = newActor('다른이');
    grantPermission(stores, root, { nodeId: doc, principalId: you.id, level: 'view' });
    grantPermission(stores, root, { nodeId: bRoot, principalId: you.id, level: 'edit' });

    const copied = await copyNode(stores, you, doc, { parentId: bRoot });
    const entries = stores.acl.entriesOn(idOf(copied));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ principalId: you.id, level: 'edit' });
  });
});

describe('CON-ACL-002 — 계정 정지는 ACL 이 아니라 주체 레벨 게이트다', () => {
  it('AC-4: 정지된 계정의 ACL 항목은 그대로 남고 판정만 닫힌다', async () => {
    const ws = (
      (await createWorkspaceAs({ ...stores, files }, root, { name: '기획팀', administratorId: me.id })) as {
        ok: true;
        workspace: { id: string };
      }
    ).workspace.id;
    const doc = idOf(createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));

    const you = newActor('나갈이');
    grantPermission(stores, root, { nodeId: doc, principalId: you.id, level: 'edit' });
    expect(permissionOf(stores, you, doc)).toBe('edit');

    setAccountStatus({ ...stores, sessions: new SqliteSessionRepository(db) }, you.id, 'suspended');

    // 항목은 남는다 — 정지를 거부 항목으로 만들면 합집합 모델이 깨진다.
    expect(stores.acl.entriesOn(doc).some((e) => e.principalId === you.id)).toBe(true);
    // 다시 세운 actor 는 닫혀 있다.
    expect(permissionOf(stores, actorFor(stores.principals, you.id), doc)).toBeNull();
  });

  it('AC-4: 정지는 슈퍼유저의 우회보다도 앞선다', () => {
    // 마지막 active 슈퍼유저는 정지시킬 수 없으므로(`SEC-AUTH-016`) 둘째를
    // 세운 뒤에 잰다. 그 가드가 없으면 이 시험은 아무도 못 들어오는
    // 인스턴스를 만들어 놓고 그것을 「통과」로 셌을 것이다.
    const spare = superuserActor(stores, '예비');
    expect(spare.requester.superuser).toBe(true);

    expect(
      setAccountStatus({ ...stores, sessions: new SqliteSessionRepository(db) }, root.id, 'suspended'),
    ).toEqual({ ok: true });

    expect(actorFor(stores.principals, root.id).requester.superuser).toBe(false);
  });
});

describe('SEC-ACL-010 — 전파로 생긴 부여가 감사 로그에 부여자와 함께 남는다', () => {
  it('AC-3: 부여 한 건이 감사 행 한 건과 부여자를 남긴다', async () => {
    const ws = (
      (await createWorkspaceAs({ ...stores, files }, root, { name: '기획팀', administratorId: me.id })) as {
        ok: true;
        workspace: { id: string };
      }
    ).workspace.id;
    const doc = idOf(createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    const you = newActor('받는이');

    grantPermission(stores, me, { nodeId: doc, principalId: you.id, level: 'edit' });

    const grantRows = () =>
      db.all<{ actor: string }>(
        "SELECT actor FROM audit_log WHERE node_id = ? AND operation = 'acl.grant' ORDER BY rowid",
        [doc],
      );

    expect(grantRows()).toHaveLength(1);
    expect(grantRows()[0]?.actor).toBe(me.id);

    // 전파 — 받은 편집자가 다시 부여하면 그 행도 자기 이름으로 남는다.
    grantPermission(stores, actorFor(stores.principals, you.id), {
      nodeId: doc,
      principalId: newActor('세번째').id,
      level: 'edit',
    });

    expect(grantRows()).toHaveLength(2);
    expect(grantRows().map((r) => r.actor)).toContain(you.id);
  });
});
