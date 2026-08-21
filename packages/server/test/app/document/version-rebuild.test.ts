import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../../../src/app/document/save-service.js';
import {
  beginEditSession,
  listVersions,
  rebuildVersionIndex,
} from '../../../src/app/document/version-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { versionSidecarName } from '../../../src/domain/document/version-layout.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { documentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: DocumentStores;
let root: Actor;
let ws: string;
let doc: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

async function editOnce(body: string): Promise<void> {
  const session = beginEditSession(stores, root, doc);
  const read = (await readDocument(stores, root, doc)) as { ok: true; hash: string };
  await saveDocument(stores, root, { nodeId: doc, body, baseHash: read.hash, session });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-vrebuild-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = documentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(doc)), '# 0판\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-STORAGE-005 — 사이드카가 정본이다', () => {
  it('AC-2: DB 인덱스를 비워도 사이드카만으로 목록과 순번을 되세운다', async () => {
    await editOnce('# 1\n');
    await editOnce('# 2\n');
    const before = listVersions(stores, root, doc).map((v) => v.seq);

    stores.versions.replaceAllOf(doc, []);
    expect(listVersions(stores, root, doc)).toEqual([]);

    await rebuildVersionIndex(stores, doc);

    expect(listVersions(stores, root, doc).map((v) => v.seq)).toEqual(before);
  });

  it('AC-2: 되세운 목록이 작성자와 시각까지 담는다', async () => {
    await editOnce('# 1\n');
    const [before] = listVersions(stores, root, doc);
    stores.versions.replaceAllOf(doc, []);

    await rebuildVersionIndex(stores, doc);

    const [after] = listVersions(stores, root, doc);
    expect(after).toMatchObject({ seq: before!.seq, author: before!.author, createdAt: before!.createdAt });
  });

  it('AC-3: 사이드카와 DB 가 어긋나면 사이드카가 이긴다', async () => {
    await editOnce('# 1\n');
    const [only] = listVersions(stores, root, doc);
    // DB 만 남의 손으로 고친다 — 캐시가 오염된 상태다.
    stores.versions.add({ ...only!, author: '엉뚱한사람' });
    expect(listVersions(stores, root, doc)[0]!.author).toBe('엉뚱한사람');

    await rebuildVersionIndex(stores, doc);

    const sidecar = JSON.parse(await readFile(versionSidecarName(only!.path), 'utf8'));
    expect(listVersions(stores, root, doc)[0]!.author).toBe(sidecar.author);
  });

  it('실체 없는 사이드카는 되세우지 않는다 — 목록에 유령이 섞인다', async () => {
    await editOnce('# 1\n');
    const [only] = listVersions(stores, root, doc);
    await rm(only!.path, { force: true });
    stores.versions.replaceAllOf(doc, []);

    await rebuildVersionIndex(stores, doc);

    expect(listVersions(stores, root, doc)).toEqual([]);
  });

  it('버전이 하나도 없던 문서는 되세워도 비어 있다', async () => {
    await rebuildVersionIndex(stores, doc);

    expect(listVersions(stores, root, doc)).toEqual([]);
  });
});
