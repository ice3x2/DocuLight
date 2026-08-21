import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  actorFor,
  permissionOf,
  resolveNode,
  visibleChildrenOf,
  type Actor,
} from '../../../src/app/acl/permission-service.js';
import {
  breakInheritance,
  grantPermission,
  inheritFromParent,
  revokePermission,
} from '../../../src/app/acl/grant-service.js';
import { createNode, moveNode, renameNode, type NodeStores } from '../../../src/app/node/node-service.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import type { MetadataStore } from '../../../src/domain/ports/metadata-store.js';
import { SqliteAclRepository } from '../../../src/infra/sqlite/acl-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqlitePrincipalRepository } from '../../../src/infra/sqlite/principal-repository.js';

let dir: string;
let db: Database;
let stores: NodeStores;
let ws: string;
let root: Actor;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 아무 권한 없는 새 사용자로 actor 를 만든다. */
const newActor = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-permsvc-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));

  stores = nodeStores(db);
  root = superuserActor(stores);

  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  me = newActor('한범');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-ACL-011 — 노드 생성자에게 자동으로 편집 권한을 부여한다', () => {
  it('AC-1 · AC-2: 문서에도 디렉토리에도 생성자 앞으로 편집 항목이 생긴다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });

    for (const kind of ['file', 'directory'] as const) {
      const created = createNode(stores, me, {
        workspaceId: ws,
        parentId: null,
        kind,
        name: kind === 'file' ? '회의록.md' : '기획',
      });

      const entries = stores.acl.entriesOn(idOf(created));
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ principalId: me.id, level: 'edit' });
    }
  });

  it('AC-4: 부모의 상속이 나중에 끊겨도 생성자의 편집권이 직접 항목 1건으로 남는다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = idOf(createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));

    breakInheritance(stores, root, doc);

    expect(permissionOf(stores, me, doc)).toBe('edit');
    expect(stores.acl.entriesOn(doc)).toHaveLength(1);
  });

  it('AC-3: 워크스페이스 관리 권한자가 그 항목을 회수할 수 있다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = idOf(createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    const auto = stores.acl.entriesOn(doc)[0]!;

    expect(revokePermission(stores, root, auto.id)).toEqual({ ok: true });
    expect(stores.acl.entriesOn(doc)).toEqual([]);
  });
});

describe('SEC-ACL-012 — 조작이 필요한 권한 없이 수행되지 않는다', () => {
  it('AC-1: 부모에 편집이 없으면 생성이 거부된다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'view' });

    const result = createNode(stores, me, {
      workspaceId: ws,
      parentId: null,
      kind: 'file',
      name: '회의록.md',
    });

    expect(result.ok).toBe(false);
    expect(stores.nodes.allIn(ws)).toEqual([]);
  });

  it('AC-3 · AC-4: 대상에 편집이 없으면 개명이 거부된다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    expect(renameNode(stores, me, doc, '바뀐이름.md').ok).toBe(false);
    expect(stores.nodes.findById(doc)?.name).toBe('회의록.md');
  });

  it('AC-5: 이동은 대상과 목적지 둘 다의 편집을 요구한다', () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));

    // 대상만 편집 — 목적지가 비었으므로 거부.
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });
    expect(moveNode(stores, me, doc, folder).ok).toBe(false);

    grantPermission(stores, root, { nodeId: folder, principalId: me.id, level: 'edit' });
    expect(moveNode(stores, me, doc, folder).ok).toBe(true);
  });
});

describe('SEC-ACL-006 — 권한 없는 노드의 응답을 존재하지 않는 노드와 구별 불가능하게 한다', () => {
  it('AC-1 · AC-2: 두 경우의 결과가 완전히 같다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '비밀.md' }));

    const forbidden = resolveNode(stores, me, doc);
    const missing = resolveNode(stores, me, 'no-such-node');

    expect(forbidden).toEqual(missing);
    expect(forbidden).toBeUndefined();
  });

  it('AC-3 · SEC-ACL-016 AC-1 · AC-2: 결과에 권한 부족을 뜻하는 값도 요청 표면도 없다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '비밀.md' }));

    // 값이 `undefined` 하나뿐이라 실을 자리가 없다 — 사유 코드도, 요청
    // 버튼을 그릴 근거가 될 `canRequestAccess` 도 담기지 않는다.
    expect(resolveNode(stores, me, doc)).toBeUndefined();
  });

  it('AC-3: 개명·이동 거부도 존재하지 않는 노드와 같은 사유를 쓴다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '비밀.md' }));

    const forbidden = renameNode(stores, me, doc, '새이름.md');
    const missing = renameNode(stores, me, 'no-such-node', '새이름.md');

    // 요청자가 **준 ID** 는 당연히 다르다. 그것 말고 다른 것이 하나라도
    // 다르면 그 차이가 존재 여부를 알려주므로, ID 를 지운 뒤 맞댄다.
    const erase = (result: unknown, id: string) =>
      JSON.parse(JSON.stringify(result).split(id).join('<id>'));

    expect(erase(forbidden, doc)).toEqual(erase(missing, 'no-such-node'));
  });
});

describe('SEC-ACL-004 · SEC-ACL-005 — 트리는 보이는 것과 경로만 담는다', () => {
  it('권한 없는 형제는 목록에 없고 경로상의 조상은 이름만 남는다', () => {
    const hq = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '본부' }));
    const plan = idOf(createNode(stores, root, { workspaceId: ws, parentId: hq, kind: 'directory', name: '기획팀' }));
    const hr = idOf(createNode(stores, root, { workspaceId: ws, parentId: hq, kind: 'directory', name: '인사팀' }));
    const minutes = idOf(createNode(stores, root, { workspaceId: ws, parentId: plan, kind: 'file', name: '회의록.md' }));

    grantPermission(stores, root, { nodeId: minutes, principalId: me.id, level: 'view' });

    const top = visibleChildrenOf(stores, me, { workspaceId: ws, parentId: null });
    expect(top).toEqual([{ node: expect.objectContaining({ id: hq }), visibility: 'pass-through' }]);

    const underHq = visibleChildrenOf(stores, me, { workspaceId: ws, parentId: hq });
    expect(underHq.map((c) => c.node.id)).toEqual([plan]);
    expect(underHq.map((c) => c.node.id)).not.toContain(hr);

    const underPlan = visibleChildrenOf(stores, me, { workspaceId: ws, parentId: plan });
    expect(underPlan).toEqual([
      { node: expect.objectContaining({ id: minutes }), visibility: 'full' },
    ]);
  });

  it('SEC-ACL-005 AC-3 · AC-4: pass-through 는 열 수도 없고 생성 부모도 되지 못한다', () => {
    const hq = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '본부' }));
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: hq, kind: 'file', name: '회의록.md' }));
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    // 이름은 트리에 있지만 열리지 않는다.
    expect(visibleChildrenOf(stores, me, { workspaceId: ws, parentId: null })[0]?.visibility).toBe(
      'pass-through',
    );
    expect(resolveNode(stores, me, hq)).toBeUndefined();

    // 그 아래에 만들 수도 없다 — 편집이 없으므로.
    expect(
      createNode(stores, me, { workspaceId: ws, parentId: hq, kind: 'file', name: '새문서.md' }).ok,
    ).toBe(false);
  });

  it('SEC-ACL-004 AC-4: 유효 권한이 다른 두 계정이 서로 다른 트리를 본다', () => {
    const mine = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '내것.md' }));
    const yours = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '네것.md' }));
    const you = newActor('다른이');

    grantPermission(stores, root, { nodeId: mine, principalId: me.id, level: 'view' });
    grantPermission(stores, root, { nodeId: yours, principalId: you.id, level: 'view' });

    expect(visibleChildrenOf(stores, me, { workspaceId: ws, parentId: null }).map((c) => c.node.id)).toEqual([mine]);
    expect(visibleChildrenOf(stores, you, { workspaceId: ws, parentId: null }).map((c) => c.node.id)).toEqual([yours]);
  });
});

describe('SEC-ACL-007 — 보이지 않는 동명 노드와의 충돌은 자동 리네임으로 처리한다', () => {
  it('AC-1 · AC-2 · AC-3: 접미사가 붙고 오류도 안 나며 기존 노드가 그대로 남는다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const hidden = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    breakInheritance(stores, root, hidden);

    // 나에게는 보이지 않는다.
    expect(resolveNode(stores, me, hidden)).toBeUndefined();

    const created = createNode(stores, me, {
      workspaceId: ws,
      parentId: null,
      kind: 'file',
      name: '회의록.md',
    });

    expect(created.ok).toBe(true);
    expect((created as { ok: true; name: string }).name).not.toBe('회의록.md');
    // 덮어쓰지 않았다 — 기존 노드가 이름 그대로 살아 있다.
    expect(stores.nodes.findById(hidden)?.name).toBe('회의록.md');
  });

  it('AC-4: 충돌 상대가 보이는 경우와 보이지 않는 경우의 흐름이 같다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const visible = createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '보임.md' });
    const again = createNode(stores, me, { workspaceId: ws, parentId: null, kind: 'file', name: '보임.md' });

    // 보이는 상대와 겹칠 때도 오류가 아니라 접미사다 — 두 경우가 같다.
    expect(visible.ok).toBe(true);
    expect(again.ok).toBe(true);
    expect((again as { ok: true; name: string }).name).not.toBe('보임.md');
  });
});

describe('SEC-ACL-003 — 상속 끊기와 부모 권한 가져오기는 별개 조작이다', () => {
  it('AC-6: 부모 권한 가져오기가 상속 끊기와 다른 진입점이다', () => {
    grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));

    breakInheritance(stores, root, doc);
    // 끊기만으로는 복사되지 않는다 — 생성자 항목이 없으므로 root 것만 남는다.
    expect(stores.acl.entriesOn(doc).some((e) => e.principalId === me.id)).toBe(false);

    expect(inheritFromParent(stores, root, doc)).toEqual({ ok: true });
    expect(stores.acl.entriesOn(doc).some((e) => e.principalId === me.id)).toBe(true);
  });

  it('AC-7: 두 계정이 같은 서브트리에서 각자의 부여대로 다르게 본다', () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: '회의록.md' }));
    const you = newActor('다른이');

    grantPermission(stores, root, { nodeId: folder, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: doc, principalId: you.id, level: 'view' });

    expect(permissionOf(stores, me, doc)).toBe('edit');
    expect(permissionOf(stores, you, doc)).toBe('view');
    expect(permissionOf(stores, you, folder)).toBeNull();
  });
});

describe('SEC-WORKSPACE-003 — 워크스페이스 관리자는 그 워크스페이스 전체의 ACL 을 관장한다', () => {
  it('AC-1 · AC-2 · AC-4: 세 계층 어디서나 부여하고 회수한다', async () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: '회의록.md' }));
    const admin = newActor('관리인');
    grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });

    for (const target of [ws, folder, doc]) {
      const granted = grantPermission(stores, admin, {
        nodeId: target,
        principalId: me.id,
        level: 'view',
      });
      expect(granted.ok, `${target} 에 부여하지 못했다`).toBe(true);
      expect(revokePermission(stores, admin, (granted as { ok: true; entryId: string }).entryId)).toEqual({ ok: true });
    }
  });

  it('AC-3: 관리 레벨이 없는 다른 워크스페이스의 노드에는 미치지 않는다', async () => {
    const other = (
      await createWorkspace(
        { workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) },
        '인사팀',
      )
    ).id;
    const foreign = idOf(createNode(stores, root, { workspaceId: other, parentId: null, kind: 'file', name: '인사.md' }));
    const admin = newActor('관리인');
    grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });

    expect(permissionOf(stores, admin, foreign)).toBeNull();
    expect(
      grantPermission(stores, admin, { nodeId: foreign, principalId: me.id, level: 'view' }).ok,
    ).toBe(false);
  });
});

describe('SEC-PRINCIPAL-001 — 슈퍼유저 그룹 멤버는 전 워크스페이스 관리 권한을 가진다', () => {
  it('AC-1: 부여 없이도 모든 워크스페이스에서 관리로 판정된다', async () => {
    const other = (
      await createWorkspace(
        { workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) },
        '인사팀',
      )
    ).id;

    expect(stores.acl.entriesOn(ws)).toEqual([]);
    expect(permissionOf(stores, root, ws)).toBe('admin');
    expect(permissionOf(stores, root, other)).toBe('admin');
  });
});

describe('CON-ACL-001 — 판정은 요청마다 계산되고 질의 두 번으로 끝난다', () => {
  it('AC-4: 판정이 대상 수에 비례해 질의를 늘리지 않는다', () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const ids: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      ids.push(idOf(createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: `문서${i}.md` })));
    }
    grantPermission(stores, root, { nodeId: ids[0]!, principalId: me.id, level: 'view' });

    // 질의를 세는 저장소로 갈아 끼운다 — 「2회」는 세지 않으면 지켜지지 않는다.
    let queries = 0;
    const counting: MetadataStore = {
      run: (sql, params) => db.run(sql, params),
      all: <T,>(sql: string, params?: readonly unknown[]) => {
        queries += 1;
        return db.all<T>(sql, params);
      },
      get: <T,>(sql: string, params?: readonly unknown[]) => {
        queries += 1;
        return db.get<T>(sql, params);
      },
      transaction: (fn) => db.transaction(fn),
    };
    const counted = {
      ...stores,
      nodes: new SqliteNodeRepository(counting),
      acl: new SqliteAclRepository(counting),
      principals: new SqlitePrincipalRepository(counting),
    };

    // ① 단일 노드 판정은 사슬 하나와 항목 하나로 끝난다.
    queries = 0;
    expect(permissionOf(counted, me, ids[0]!)).toBe('view');
    expect(queries, `단일 판정이 질의 ${queries} 회를 썼다`).toBeLessThanOrEqual(2);

    // ② 요청자를 세우는 것까지 포함한 「한 요청」도 상수여야 한다.
    queries = 0;
    permissionOf(counted, actorFor(counted.principals, me.id), ids[0]!);
    const oneRequest = queries;

    // ③ 트리 한 층. **이것이 이 AC 의 문면이다** — 「한 요청의 권한 판정」은
    //    노드 하나가 아니라 그 요청이 판정하는 전부를 말한다. 노드마다
    //    판정을 부르면 자식 수에 비례해 질의가 늘어난다.
    queries = 0;
    visibleChildrenOf(counted, me, { workspaceId: ws, parentId: folder });
    const layer = queries;

    expect(
      layer,
      `자식 20개인 층이 질의 ${layer} 회를 썼다 — 대상 수에 비례해 늘고 있다`,
    ).toBeLessThanOrEqual(oneRequest + 4);
  });

  it('AC-2: 그룹 멤버를 더하면 재계산 없이 다음 판정부터 반영된다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    const team = stores.principals.createGroup('기획팀원');
    grantPermission(stores, root, { nodeId: doc, principalId: team.id, level: 'edit' });

    expect(permissionOf(stores, me, doc)).toBeNull();

    stores.principals.addMember(team.id, me.id);
    // actor 를 다시 세우는 것이 「다음 요청」이다. 무효화 호출은 없다.
    expect(permissionOf(stores, actorFor(stores.principals, me.id), doc)).toBe('edit');
  });
});
