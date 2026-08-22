import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { maySearchFor, parseScope } from '../../../src/app/principal/search-scope.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 편집자: Actor;
let 구경꾼: Actor;
let ws: string;
let doc: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-scope-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));

  편집자 = actorFor(stores.principals, stores.principals.createUser('편집자').id);
  구경꾼 = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);
  grantPermission(stores, root, { nodeId: doc, principalId: 편집자.id, level: 'edit' });
  grantPermission(stores, root, { nodeId: doc, principalId: 구경꾼.id, level: 'view' });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('R162 — 스코프 해석', () => {
  it('세 종류만 해석된다', () => {
    expect(parseScope('node:n1')).toEqual({ kind: 'node', nodeId: 'n1' });
    expect(parseScope('workspace:w1')).toEqual({ kind: 'workspace', workspaceId: 'w1' });
    expect(parseScope('group:g1')).toEqual({ kind: 'group', groupId: 'g1' });
  });

  it('없거나 모르는 형태면 스코프가 서지 않는다', () => {
    // 기본값을 「전역 검색」으로 두면 안전한 쪽이 명시적 선택이 된다 —
    // 빠뜨린 호출이 명부를 연다.
    expect(parseScope(undefined)).toBeNull();
    expect(parseScope('')).toBeNull();
    expect(parseScope('n1')).toBeNull();
    expect(parseScope('everything:x')).toBeNull();
  });
});

describe('R162 — 검색 자격은 부여 자격에서 파생한다', () => {
  it('노드 부여는 그 노드의 편집 이상을 요구한다', () => {
    expect(maySearchFor(stores, 편집자, { kind: 'node', nodeId: doc })).toBe(true);
    // 보기만 가진 사람은 그 노드에 아무것도 부여할 수 없다 (`R70-a`).
    expect(maySearchFor(stores, 구경꾼, { kind: 'node', nodeId: doc })).toBe(false);
  });

  it('없는 노드는 권한 없는 노드와 같은 답을 받는다', () => {
    expect(maySearchFor(stores, 편집자, { kind: 'node', nodeId: '그런-노드-없음' })).toBe(false);
  });

  it('워크스페이스 관리자 지정은 그 워크스페이스의 관리를 요구한다', () => {
    // **워크스페이스에** 편집을 주고 잰다. 문서에만 준 사람으로 재면
    // 워크스페이스 레벨이 애초에 `null` 이라 문턱을 낮춰도 시험이 살아남는다
    // — 이웃 시험이 그렇게 통과하고 있었다.
    const 워크편집 = actorFor(stores.principals, stores.principals.createUser('워크편집').id);
    const 워크보기 = actorFor(stores.principals, stores.principals.createUser('워크보기').id);
    grantPermission(stores, root, { nodeId: ws, principalId: 워크편집.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: ws, principalId: 워크보기.id, level: 'view' });

    expect(maySearchFor(stores, root, { kind: 'workspace', workspaceId: ws })).toBe(true);
    expect(maySearchFor(stores, 워크편집, { kind: 'workspace', workspaceId: ws })).toBe(false);
    expect(maySearchFor(stores, 워크보기, { kind: 'workspace', workspaceId: ws })).toBe(false);
    // 문서 편집권은 워크스페이스 관리와 다른 축이다.
    expect(maySearchFor(stores, 편집자, { kind: 'workspace', workspaceId: ws })).toBe(false);
  });

  it('그룹 멤버 추가는 슈퍼유저를 요구한다', () => {
    const 팀 = stores.principals.createGroup('기획팀원');

    expect(maySearchFor(stores, root, { kind: 'group', groupId: 팀.id })).toBe(true);
    expect(maySearchFor(stores, 편집자, { kind: 'group', groupId: 팀.id })).toBe(false);
  });

  it('없는 그룹은 슈퍼유저에게도 열리지 않는다', () => {
    // 열어 두면 「그런 그룹이 없다」와 「있는데 못 본다」가 갈린다.
    expect(maySearchFor(stores, root, { kind: 'group', groupId: '그런-그룹-없음' })).toBe(false);
  });

  it('슈퍼유저는 상방 게이트로 노드·워크스페이스 스코프를 지난다', () => {
    const 슈퍼 = actorFor(stores.principals, stores.principals.createUser('둘째').id);
    stores.principals.addMember(SUPERUSER_GROUP_ID, 슈퍼.id);

    const 다시 = actorFor(stores.principals, 슈퍼.id);
    expect(maySearchFor(stores, 다시, { kind: 'node', nodeId: doc })).toBe(true);
    expect(maySearchFor(stores, 다시, { kind: 'workspace', workspaceId: ws })).toBe(true);
  });
});
