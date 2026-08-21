import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { uploadNewVersion, warnsIrreversible } from '../../../src/app/document/new-version.js';
import { listVersions } from '../../../src/app/document/version-service.js';
import type { DocumentStores } from '../../../src/app/document/save-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
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
let bin: string;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-newver-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = documentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;

  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(doc), '# 이전 본문\n', 'utf8');
  bin = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '설계.zip' }));
  await writeFile(fileOf(bin), 'old-binary', 'utf8');

  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-SHELL-008 — 덮어쓰기의 유일한 경로', () => {
  it('AC-2: 기존 파일을 골라 새 버전을 올리면 그 파일이 덮인다', async () => {
    const done = await uploadNewVersion(stores, root, { nodeId: doc, bytes: Buffer.from('# 새 본문\n') });

    expect(done.ok).toBe(true);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 새 본문\n');
  });

  it('AC-4: md 에 새 버전을 올리면 이전 본문이 버전으로 남는다', async () => {
    await uploadNewVersion(stores, root, { nodeId: doc, bytes: Buffer.from('# 새 본문\n') });

    const [only] = listVersions(stores, root, doc);
    expect(await readFile(only!.path, 'utf8')).toBe('# 이전 본문\n');
  });

  it('AC-4: 두 번 올리면 버전이 둘이다 — 새 버전 올리기는 매번 편집 세션이다', async () => {
    await uploadNewVersion(stores, root, { nodeId: doc, bytes: Buffer.from('# 2판\n') });
    await uploadNewVersion(stores, root, { nodeId: doc, bytes: Buffer.from('# 3판\n') });

    expect(listVersions(stores, root, doc)).toHaveLength(2);
  });

  it('AC-3: 편집 권한이 없으면 실행되지 않고 파일도 그대로다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    const done = await uploadNewVersion(stores, actorFor(stores.principals, me.id), {
      nodeId: doc,
      bytes: Buffer.from('# 몰래\n'),
    });

    expect(done).toMatchObject({ ok: false, rule: 'forbidden' });
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 이전 본문\n');
  });

  it('AC-5: 바이너리는 복구할 수 없다 — 그 사실을 경고로 알린다', async () => {
    expect(warnsIrreversible('설계.zip')).toBe(true);
    expect(warnsIrreversible('회의록.md')).toBe(false);
  });

  it('AC-5: 바이너리에 새 버전을 올리면 이전 것이 남지 않는다 — 경고가 참이다', async () => {
    await uploadNewVersion(stores, root, { nodeId: bin, bytes: Buffer.from('new-binary') });

    // 경고 문구가 사실과 어긋나면 사용자는 다음 경고도 믿지 않는다.
    expect(listVersions(stores, root, bin)).toEqual([]);
    expect(await readFile(fileOf(bin), 'utf8')).toBe('new-binary');
  });

  it('디렉토리에는 실행되지 않는다 — 파일 노드 전용 경로다', async () => {
    const folder = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));

    expect(await uploadNewVersion(stores, root, { nodeId: folder, bytes: Buffer.from('x') })).toMatchObject({
      ok: false,
      rule: 'not-a-file',
    });
  });

  it('없는 노드는 권한 없는 노드와 같은 답이다 — 다르면 그 차이가 존재를 알린다', async () => {
    const missing = await uploadNewVersion(stores, actorFor(stores.principals, me.id), {
      nodeId: 'no-such-node',
      bytes: Buffer.from('x'),
    });
    const forbidden = await uploadNewVersion(stores, actorFor(stores.principals, me.id), {
      nodeId: doc,
      bytes: Buffer.from('x'),
    });

    expect(forbidden).toEqual(missing);
  });
});
