import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { copyNode, createNode, moveNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let a: string;
let b: string;
let bDir: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const ruleOf = (r: unknown) =>
  ((r as { violations?: { rule: string }[] }).violations ?? []).map((v) => v.rule);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-boundary-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  const files = new FsWorkspaceFiles(docsRoot);
  a = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  b = (await createWorkspace({ workspaces: stores.workspaces, files }, '인사팀')).id;
  bDir = idOf(createNode(stores, root, { workspaceId: b, parentId: null, kind: 'directory', name: '보관' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-WORKSPACE-003 — 노드는 부모의 워크스페이스를 벗어날 수 없다', () => {
  it('AC-3: 다른 워크스페이스의 노드를 부모로 삼는 생성이 거부된다', () => {
    // 통과하면 그 노드는 A 소속이면서 부모 사슬이 B 를 지난다 —
    // A 의 워크스페이스 ACL 이 B 의 디렉토리 아래 노드에 적용된다.
    const created = createNode(stores, root, {
      workspaceId: a,
      parentId: bDir,
      kind: 'file',
      name: '회의록.md',
    });

    expect(created.ok, '두 워크스페이스가 한 노드에서 섞였다').toBe(false);
    expect(ruleOf(created)).toContain('unknown-node');
    expect(stores.nodes.allIn(a)).toEqual([]);
  });

  it('AC-3: 그렇게 만들어진 노드가 없으므로 남의 워크스페이스 권한이 새지 않는다', () => {
    const outsider = actorFor(stores.principals, stores.principals.createUser('외부인').id);
    grantPermission(stores, root, { nodeId: a, principalId: outsider.id, level: 'view' });

    createNode(stores, root, { workspaceId: a, parentId: bDir, kind: 'file', name: '회의록.md' });

    // B 의 디렉토리 아래에는 아무것도 생기지 않았다.
    expect(stores.nodes.children({ workspaceId: b, parentId: bDir })).toEqual([]);
    expect(permissionOf(stores, outsider, bDir)).toBeNull();
  });

  it('SEC-ACL-007 AC-1: 같은 워크스페이스 안에서는 접미사가 그대로 붙는다', () => {
    const folder = idOf(createNode(stores, root, { workspaceId: a, parentId: null, kind: 'directory', name: '기획' }));
    createNode(stores, root, { workspaceId: a, parentId: folder, kind: 'file', name: '회의록.md' });
    const again = createNode(stores, root, { workspaceId: a, parentId: folder, kind: 'file', name: '회의록.md' });

    expect(again.ok).toBe(true);
    expect((again as { ok: true; name: string }).name).not.toBe('회의록.md');
  });
});

describe('SEC-ACL-006 · SEC-ACL-014 — 거부는 던지지 않고 값으로 돌려준다', () => {
  let doc: string;

  beforeEach(() => {
    doc = idOf(createNode(stores, root, { workspaceId: a, parentId: null, kind: 'file', name: '회의록.md' }));
  });

  it('SEC-ACL-014 AC-1: 목적지로 다른 워크스페이스 ID 를 줘도 예외가 아니라 값이다', () => {
    let outcome: unknown;
    expect(() => {
      outcome = moveNode(stores, root, doc, b);
    }, '워크스페이스 ID 목적지가 예외를 던진다').not.toThrow();

    expect((outcome as { ok: boolean }).ok).toBe(false);
    expect(stores.nodes.findById(doc)?.workspaceId).toBe(a);
  });

  it('SEC-ACL-006 AC-4: 없는 목적지도 예외가 아니라 값이다', () => {
    let outcome: unknown;
    expect(() => {
      outcome = moveNode(stores, root, doc, 'no-such-parent');
    }).not.toThrow();

    expect((outcome as { ok: boolean }).ok).toBe(false);
  });

  it('SEC-ACL-006 AC-4: 세 진입점이 같은 입력에 같은 사유를 쓴다', async () => {
    // 실행자 레벨이나 진입점에 따라 응답의 **종류**가 갈리면 그 차이가
    // 존재 여부를 알려준다.
    const moved = moveNode(stores, root, doc, 'no-such-parent');
    const copied = await copyNode(stores, root, doc, { parentId: 'no-such-parent' });
    const created = createNode(stores, root, {
      workspaceId: a,
      parentId: 'no-such-parent',
      kind: 'file',
      name: '새문서.md',
    });

    expect(ruleOf(moved)).toEqual(['unknown-node']);
    expect(ruleOf(copied)).toEqual(['unknown-node']);
    expect(ruleOf(created)).toEqual(['unknown-node']);
  });

  it('SEC-ACL-006 AC-4: 권한이 다른 두 실행자가 같은 사유를 받는다', () => {
    const me = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    const asSuperuser = moveNode(stores, root, doc, 'no-such-parent');
    const asEditor = moveNode(stores, actorFor(stores.principals, me.id), doc, 'no-such-parent');

    expect(ruleOf(asEditor)).toEqual(ruleOf(asSuperuser));
  });
});
