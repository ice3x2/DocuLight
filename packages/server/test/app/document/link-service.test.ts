import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { linksOf } from '../../../src/app/document/link-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
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
