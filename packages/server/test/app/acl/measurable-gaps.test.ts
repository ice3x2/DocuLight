import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, permissionOf, visibleChildrenOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode, moveNode, type NodeStores } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import type { MetadataStore } from '../../../src/domain/ports/metadata-store.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { SqliteAclRepository } from '../../../src/infra/sqlite/acl-repository.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { documentsRouter } from '../../../src/http/routes/documents.js';
import { API_PREFIX, createHttpServer } from '../../../src/http/server.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: NodeStores;
let ws: string;
let root: Actor;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-gaps-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('CON-ACL-001 — 트리는 지연 로딩으로 조회한다', () => {
  it('AC-5: 한 요청이 접근 가능한 전 워크스페이스의 노드를 한꺼번에 적재하지 않는다', () => {
    // 깊은 트리를 세우고 **한 층만** 묻는다. 전량 적재라면 다른 가지의
    // 노드까지 읽히므로, 읽은 행 수로 그것이 드러난다.
    const top = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '본부' }));
    const asked = idOf(createNode(stores, root, { workspaceId: ws, parentId: top, kind: 'directory', name: '기획팀' }));
    const other = idOf(createNode(stores, root, { workspaceId: ws, parentId: top, kind: 'directory', name: '인사팀' }));

    const wanted: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      wanted.push(idOf(createNode(stores, root, { workspaceId: ws, parentId: asked, kind: 'file', name: `기획${i}.md` })));
    }
    // 묻지 않은 가지에 훨씬 많은 노드를 둔다.
    for (let i = 0; i < 30; i += 1) {
      createNode(stores, root, { workspaceId: ws, parentId: other, kind: 'file', name: `인사${i}.md` });
    }
    for (const id of wanted) grantPermission(stores, root, { nodeId: id, principalId: me.id, level: 'view' });

    let rowsRead = 0;
    const counting: MetadataStore = {
      run: (sql, params) => db.run(sql, params),
      all: <T,>(sql: string, params?: readonly unknown[]) => {
        const rows = db.all<T>(sql, params);
        rowsRead += rows.length;
        return rows;
      },
      get: <T,>(sql: string, params?: readonly unknown[]) => db.get<T>(sql, params),
      transaction: (fn) => db.transaction(fn),
    };
    const counted = {
      ...stores,
      nodes: new SqliteNodeRepository(counting),
      acl: new SqliteAclRepository(counting),
    };

    visibleChildrenOf(counted, actorFor(stores.principals, me.id), { workspaceId: ws, parentId: asked });

    // 워크스페이스에는 36개 노드가 있다. 한 층 조회가 그 전부를 읽으면
    // 지연 로딩이 아니다 — 그 위에서만 O(N) 비용 산정이 성립한다.
    expect(stores.nodes.allIn(ws).length).toBeGreaterThan(30);
    expect(rowsRead, `한 층 조회가 행 ${rowsRead} 개를 읽었다`).toBeLessThan(30);
  });
});

describe('SEC-ACL-004 — 트리의 모든 노드가 응답 전에 판정된다', () => {
  it('AC-3: 목록에 나온 노드마다 유효 권한이 실제로 계산돼 있다', () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const seen = idOf(createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: '보임.md' }));
    const hidden = idOf(createNode(stores, root, { workspaceId: ws, parentId: folder, kind: 'file', name: '숨김.md' }));
    grantPermission(stores, root, { nodeId: seen, principalId: me.id, level: 'view' });

    const fresh = actorFor(stores.principals, me.id);
    const listed = visibleChildrenOf(stores, fresh, { workspaceId: ws, parentId: folder });

    // 나온 것은 전부 판정을 통과했고, 안 나온 것은 전부 판정에서 떨어졌다.
    // 「판정하지 않고 통과」가 하나라도 있으면 그 노드는 permissionOf 가
    // null 인데도 목록에 있게 된다.
    for (const child of listed) {
      expect(permissionOf(stores, fresh, child.node.id), `${child.node.name} 이 판정 없이 목록에 있다`).not.toBeNull();
    }
    expect(listed.map((c) => c.node.id)).toEqual([seen]);
    expect(permissionOf(stores, fresh, hidden)).toBeNull();
  });
});

describe('CON-PRINCIPAL-001 — 일반 유저의 권한은 전부 노드 ACL 로 판정된다', () => {
  it('AC-2: 부여를 걷으면 남는 권한이 없다 — ACL 밖의 권한 원천이 없다', () => {
    const doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
    const granted = grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    const fresh = actorFor(stores.principals, me.id);
    expect(permissionOf(stores, fresh, doc)).toBe('edit');

    stores.acl.revoke((granted as { ok: true; entryId: string }).entryId);

    // 항목이 사라지자 권한도 사라진다. 계정 쪽에 남아 있던 두 번째 원천이
    // 있었다면 여기서 그것이 드러난다.
    expect(permissionOf(stores, actorFor(stores.principals, me.id), doc)).toBeNull();
    // 이 주체 앞으로는 아무 항목도 남지 않았다. 생성자 자동 부여
    // (`SEC-ACL-011`)로 생긴 root 의 항목은 다른 주체의 것이라 그대로 있다.
    expect(stores.acl.entriesOn(doc).filter((e) => e.principalId === me.id)).toEqual([]);
  });
});

describe('SEC-ACL-008 — 워크스페이스 관리자는 그 워크스페이스의 모든 문서 본문을 연다', () => {
  let server: Server;
  let base: string;
  let caller: Actor | undefined;

  const BODY = '# 기밀\n';

  beforeEach(async () => {
    const app = createHttpServer({
      webRoot: join(dir, 'web'),
      api: documentsRouter({ stores, documents: new FsDocumentStore(docsRoot), actorOf: () => caller }),
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}${API_PREFIX}/documents/${ws}/`;
  });

  afterEach(() => {
    server.close();
  });

  it('AC-4: 그 문서에 부여받은 적 없는 관리자가 본문을 받는다', async () => {
    await writeFile(join(docsRoot, ws, '기밀.md'), BODY, 'utf8');
    const doc = stores.nodes.create({ workspaceId: ws, parentId: null, kind: 'file', name: '기밀.md' });

    const admin = actorFor(stores.principals, stores.principals.createUser('관리인').id);
    grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });

    // 그 문서에는 아무 항목도 걸려 있지 않다 — 우회가 항목 없이 성립한다.
    expect(stores.acl.entriesOn(doc)).toEqual([]);

    caller = actorFor(stores.principals, admin.id);
    const opened = await fetch(base + encodeURIComponent('기밀.md'));

    expect(opened.status).toBe(200);
    expect(await opened.text()).toBe(BODY);
  });

  it('AC-4: 관리 레벨이 없는 주체에게는 같은 문서가 열리지 않는다', async () => {
    await writeFile(join(docsRoot, ws, '기밀.md'), BODY, 'utf8');
    stores.nodes.create({ workspaceId: ws, parentId: null, kind: 'file', name: '기밀.md' });

    caller = actorFor(stores.principals, me.id);
    expect((await fetch(base + encodeURIComponent('기밀.md'))).status).toBe(404);
  });
});

describe('SEC-ACL-013 — 숨은 하위 탐지가 실제 노드 트리 위에서 돈다', () => {
  it('AC-1: 정책 표가 아니라 탐지기가 실 트리에서 숨은 하위를 찾는다', () => {
    // 정책 함수(`requirementFor`)가 옳은 값을 돌려주는 것과, 그 값을
    // 고르는 **탐지기**가 실제로 숨은 하위를 찾아내는 것은 다른 사실이다.
    // 전자만 재면 「선언은 있고 집행자는 없다」가 초록으로 통과한다.
    const source = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const destination = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }));
    const visible = idOf(createNode(stores, root, { workspaceId: ws, parentId: source, kind: 'file', name: '보임.md' }));
    const buried = idOf(createNode(stores, root, { workspaceId: ws, parentId: source, kind: 'file', name: '숨김.md' }));

    grantPermission(stores, root, { nodeId: source, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: destination, principalId: me.id, level: 'edit' });
    // 하위 하나만 상속을 끊어 요청자에게서 감춘다.
    breakInheritance(stores, root, buried);

    const editor = actorFor(stores.principals, me.id);
    expect(permissionOf(stores, editor, visible)).toBe('edit');
    expect(permissionOf(stores, editor, buried), '숨겨지지 않았다 — 이 시험의 전제가 성립하지 않는다').toBeNull();

    // 대상·목적지 둘 다 편집을 가졌는데도 거부된다. 숨은 하위가 요구를
    // 워크스페이스 관리로 올렸기 때문이다.
    const refused = moveNode(stores, editor, source, destination);
    expect(refused.ok, '숨은 하위가 있는데 편집만으로 옮겨졌다').toBe(false);
    expect(stores.nodes.findById(source)?.parentId).toBeNull();

    // AC-4 — 거부 안내가 숨은 노드의 개수·이름·경로를 드러내지 않는다.
    expect(JSON.stringify(refused)).not.toContain('숨김');
    expect(JSON.stringify(refused)).not.toMatch(/[0-9]+\s*(건|개)/);

    // AC-3 — 워크스페이스 관리 레벨이면 같은 조작이 수행된다.
    const admin = actorFor(stores.principals, stores.principals.createUser('관리인').id);
    grantPermission(stores, root, { nodeId: ws, principalId: admin.id, level: 'admin' });
    expect(moveNode(stores, actorFor(stores.principals, admin.id), source, destination).ok).toBe(true);
    expect(stores.nodes.findById(source)?.parentId).toBe(destination);
  });

  it('AC-5: 하위가 전부 보이면 편집 레벨로 그대로 수행된다', () => {
    const source = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '기획' }));
    const destination = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }));
    createNode(stores, root, { workspaceId: ws, parentId: source, kind: 'file', name: '보임.md' });

    grantPermission(stores, root, { nodeId: source, principalId: me.id, level: 'edit' });
    grantPermission(stores, root, { nodeId: destination, principalId: me.id, level: 'edit' });

    // 상속이 살아 있으므로 하위도 전부 보인다 — 거부가 전체로 번지지 않는다.
    expect(moveNode(stores, actorFor(stores.principals, me.id), source, destination).ok).toBe(true);
  });
});
