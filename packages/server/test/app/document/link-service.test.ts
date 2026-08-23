import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { linksOf } from '../../../src/app/document/link-service.js';
import { createNode, moveNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let me: Actor;
let ws: string;
let 회의록: string;
let 설계: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const write = (id: string, body: string) =>
  writeFile(join(docsRoot, ws, stores.nodes.pathOf(id)), body, 'utf8');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-link-'));
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
  회의록 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }),
  );
  설계 = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.md' }),
  );
  await write(회의록, '지난 [[설계]] 를 다시 본다\n');
  await write(설계, '아무것도 가리키지 않는다\n');
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('아웃고잉 링크 (`CON-EDITOR-002` AC-3)', () => {
  it('본문이 가리키는 문서를 노드로 풀어 준다', async () => {
    const links = (await linksOf(stores, root, 회의록))!;

    expect(links.outgoing).toEqual([
      { nodeId: 설계, name: '설계.md', workspaceName: '기획팀', resolved: true },
    ]);
  });

  it('없는 문서를 가리키면 이름만 남고 풀리지 않았다고 알린다', async () => {
    await write(회의록, '[[없는문서]] 를 가리킨다\n');

    const links = (await linksOf(stores, root, 회의록))!;

    expect(links.outgoing).toEqual([
      { nodeId: null, name: '없는문서', workspaceName: null, resolved: false },
    ]);
  });

  it('볼 수 없는 문서를 가리키면 풀리지 않은 것과 같은 답이 온다', async () => {
    grantPermission(stores, root, { nodeId: 회의록, principalId: me.id, level: 'view' });
    const mine = actorFor(stores.principals, me.id);

    const links = (await linksOf(stores, mine, 회의록))!;

    // 다른 답을 주면 그 차이가 「거기에 설계라는 문서가 있다」를 알린다.
    expect(links.outgoing).toEqual([
      { nodeId: null, name: '설계', workspaceName: null, resolved: false },
    ]);
  });
});

describe('백링크 (`CON-EDITOR-002` AC-2)', () => {
  it('이 문서를 가리키는 문서들이 온다', async () => {
    const links = (await linksOf(stores, root, 설계))!;

    expect(links.backlinks).toEqual([
      { nodeId: 회의록, name: '회의록.md', workspaceName: '기획팀', resolved: true },
    ]);
  });

  it('볼 수 없는 문서가 가리켜도 목록에 오지 않는다 — 오면 그 문서의 존재가 새어 나간다', async () => {
    grantPermission(stores, root, { nodeId: 설계, principalId: me.id, level: 'view' });
    const mine = actorFor(stores.principals, me.id);

    expect((await linksOf(stores, mine, 설계))!.backlinks).toEqual([]);
  });

  it('자기를 가리키는 문서가 없으면 빈 목록이다', async () => {
    expect((await linksOf(stores, root, 회의록))!.backlinks).toEqual([]);
  });

  it('볼 수 없는 문서의 링크는 물을 수 없다', async () => {
    const mine = actorFor(stores.principals, me.id);

    expect(await linksOf(stores, mine, 설계)).toBeNull();
  });
});

describe('같은 이름이 여러 워크스페이스에 있을 때', () => {
  it('가리킨 문서와 같은 워크스페이스의 것을 고른다 — 본문에 워크스페이스를 적을 문법이 없다', async () => {
    const other = (
      await createWorkspace(
        { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
        '인사팀',
      )
    ).id;
    const 남의회의록 = idOf(
      createNode(stores, root, {
        workspaceId: other,
        parentId: null,
        kind: 'file',
        name: '회의록.md',
      }),
    );
    const 남의설계 = idOf(
      createNode(stores, root, {
        workspaceId: other,
        parentId: null,
        kind: 'file',
        name: '설계.md',
      }),
    );
    const at = (ws: string, id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));
    await writeFile(at(other, 남의회의록), '지난 [[설계]] 를 다시 본다\n', 'utf8');
    await writeFile(at(other, 남의설계), '남의 것\n', 'utf8');

    // 먼저 훑히는 것은 기획팀의 `설계.md` 다. 이름만 보고 첫 일치를 고르면
    // 인사팀 문서가 남의 워크스페이스 문서를 가리키게 된다.
    const links = (await linksOf(stores, root, 남의회의록))!;

    expect(links.outgoing[0]).toMatchObject({ nodeId: 남의설계, workspaceName: '인사팀' });
  });

  it('같은 워크스페이스에 없으면 다른 곳의 것이라도 푼다 — 못 풀면 링크가 죽는다', async () => {
    const other = (
      await createWorkspace(
        { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
        '인사팀',
      )
    ).id;
    const 남의회의록 = idOf(
      createNode(stores, root, {
        workspaceId: other,
        parentId: null,
        kind: 'file',
        name: '주간.md',
      }),
    );
    await writeFile(
      join(docsRoot, other, stores.nodes.pathOf(남의회의록)),
      '지난 [[설계]] 를 다시 본다\n',
      'utf8',
    );

    const links = (await linksOf(stores, root, 남의회의록))!;

    expect(links.outgoing[0]).toMatchObject({ nodeId: 설계, workspaceName: '기획팀' });
  });
});

describe('CON-ACL-001 AC-4 — 질의가 문서 수에 비례해 늘지 않는다', () => {
  /** 문서 N 개를 만들고 링크를 한 번 물었을 때의 질의 횟수. */
  const cost = async (count: number): Promise<number> => {
    for (let n = 0; n < count; n += 1) {
      const id = idOf(
        createNode(stores, root, {
          workspaceId: ws,
          parentId: null,
          kind: 'file',
          name: `문서${n}.md`,
        }),
      );
      await write(id, '아무것도 가리키지 않는다\n');
    }

    let queries = 0;
    const count_ = <T,>(fn: T): T =>
      ((...args: unknown[]) => {
        queries += 1;
        return (fn as (...a: unknown[]) => unknown)(...args);
      }) as T;
    const original = { all: db.all.bind(db), get: db.get.bind(db) };
    db.all = count_(original.all);
    db.get = count_(original.get);

    await linksOf(stores, root, 회의록);

    db.all = original.all;
    db.get = original.get;
    return queries;
  };

  it('문서를 스무 개 더해도 질의가 스무 배로 늘지 않는다', async () => {
    const small = await cost(2);
    const large = await cost(20);

    // 노드마다 권한이나 경로를 다시 물으면 이 값이 문서 수를 따라 커진다 —
    // 그것이 `CON-ACL-001` AC-4 가 막으려던 것이다. 같아야 한다: 워크스페이스
    // 수에만 비례하고 그 안의 문서 수에는 비례하지 않는다.
    expect(large).toBe(small);
  });
});

describe('FR-STORAGE-009 — 위키링크는 경로가 아니라 이름으로 푼다', () => {
  const 방 = (name: string) =>
    idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name }));

  /** 그 노드로 옮기고 실체 파일도 그 자리로 옮긴다. */
  const 옮긴다 = async (nodeId: string, parentId: string) => {
    const 이전 = join(docsRoot, ws, stores.nodes.pathOf(nodeId));
    moveNode(stores, root, nodeId, parentId);
    const 이후 = join(docsRoot, ws, stores.nodes.pathOf(nodeId));
    await mkdir(dirname(이후), { recursive: true });
    await rename(이전, 이후);
  };

  it('AC-1: 본문에 경로가 없어도 이름만으로 대상이 풀린다', async () => {
    const 깊은곳 = 방('보관');
    await 옮긴다(설계, 깊은곳);

    // 본문은 `[[설계]]` 그대로다 — 경로를 적을 문법 자체가 없다.
    const [나간것] = (await linksOf(stores, root, 회의록))!.outgoing;
    expect(나간것).toMatchObject({ nodeId: 설계 });
  });

  it('AC-2: 대상 문서를 옮겨도 같은 문서로 해석된다', async () => {
    const 앞 = (await linksOf(stores, root, 회의록))!.outgoing.map((one) => one.nodeId);

    await 옮긴다(설계, 방('보관'));

    expect((await linksOf(stores, root, 회의록))!.outgoing.map((one) => one.nodeId)).toEqual(앞);
  });

  it('AC-3: 참조하는 문서를 옮겨도 해석 결과가 그대로다', async () => {
    const 앞 = (await linksOf(stores, root, 회의록))!.outgoing.map((one) => one.nodeId);

    await 옮긴다(회의록, 방('회의'));

    // 상대경로였다면 여기서 대상이 바뀌거나 사라진다.
    expect((await linksOf(stores, root, 회의록))!.outgoing.map((one) => one.nodeId)).toEqual(앞);
    expect((await linksOf(stores, root, 설계))!.backlinks.map((one) => one.nodeId)).toEqual([회의록]);
  });
});

describe('SEC-WORKSPACE-004 — 역참조 표면의 개수 힌트', () => {
  it('AC-7: 권한 없는 역참조가 통째로 빠지고 개수 힌트가 실리지 않는다', async () => {
    const 남의것 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '남의것.md' }),
    );
    await write(남의것, '[[설계]] 를 본다\n');
    grantPermission(stores, root, { nodeId: 설계, principalId: me.id, level: 'view' });

    const 본것 = (await linksOf(stores, me, 설계))!;

    // 「비공개 1건」 같은 값이 실리면 그 수가 곧 볼 수 없는 문서의 개수다.
    expect(본것.backlinks).toEqual([]);
    expect(Object.keys(본것).sort()).toEqual(['backlinks', 'outgoing']);
  });

  it('AC-8: 건수를 셀 값이 필터를 통과한 항목뿐이다', async () => {
    grantPermission(stores, root, { nodeId: 회의록, principalId: me.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 설계, principalId: me.id, level: 'view' });

    const 본것 = (await linksOf(stores, me, 설계))!;

    // 목록의 길이가 곧 건수다 — 따로 세는 값이 없으니 갈릴 자리도 없다.
    expect(본것.backlinks.map((one) => one.nodeId)).toEqual([회의록]);
  });
});
