import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../../../src/app/document/save-service.js';
import { contentHash } from '../../../src/domain/document/content-hash.js';
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
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-save-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = documentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(doc), '# 처음\n', 'utf8');
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
  grantPermission(stores, root, { nodeId: ws, principalId: me.id, level: 'edit' });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-STORAGE-002 — 충돌 판정 근거는 읽은 시점의 내용 해시다', () => {
  it('AC-1 · AC-2: 읽을 때 받은 해시를 실어 저장하면 저장된다', async () => {
    const read = await readDocument(stores, root, doc);
    expect(read.ok).toBe(true);

    const saved = await saveDocument(stores, root, {
      nodeId: doc,
      body: '# 고침\n',
      baseHash: (read as { ok: true; hash: string }).hash,
    });

    expect(saved.ok).toBe(true);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 고침\n');
  });

  it('AC-3: 해시가 다르면 충돌이고 덮어쓰지 않는다', async () => {
    const stale = contentHash('# 처음\n');
    await writeFile(fileOf(doc), '# 남이 고침\n', 'utf8');

    const saved = await saveDocument(stores, root, { nodeId: doc, body: '# 내가 고침\n', baseHash: stale });

    expect(saved).toMatchObject({ ok: false, rule: 'conflict' });
    // 덮어쓰지 않는다는 것이 이 요구의 내용이다 — 거절만 하고 파일을
    // 건드리면 거절이 무의미해진다.
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 남이 고침\n');
  });

  it('AC-4: 서버에서 사람이 직접 고친 변경도 같은 경로로 잡힌다', async () => {
    const read = await readDocument(stores, root, doc);
    // 에디터를 거치지 않은 변경 — 파일시스템이 본문의 SSOT 이므로 이것도
    // 남의 저장과 구별되지 않아야 한다.
    await writeFile(fileOf(doc), '# 셸에서 고침\n', 'utf8');

    const saved = await saveDocument(stores, root, {
      nodeId: doc,
      body: '# 내가 고침\n',
      baseHash: (read as { ok: true; hash: string }).hash,
    });

    expect(saved).toMatchObject({ ok: false, rule: 'conflict' });
  });

  it('AC-5: 내용이 같으면 mtime 이 달라도 충돌이 아니다', async () => {
    const read = await readDocument(stores, root, doc);
    // 내용은 그대로 두고 시각만 민다 — mtime 을 근거로 쓰면 여기서 충돌이
    // 나고, 그것은 아무도 고치지 않은 문서에 대한 거짓 충돌이다.
    const later = new Date(Date.now() + 60_000);
    await utimes(fileOf(doc), later, later);

    const saved = await saveDocument(stores, root, {
      nodeId: doc,
      body: '# 고침\n',
      baseHash: (read as { ok: true; hash: string }).hash,
    });

    expect(saved.ok).toBe(true);
  });

  it('충돌 결과가 서버의 현재 본문을 함께 준다 — 머지 뷰가 그것 없이는 열리지 않는다', async () => {
    const stale = contentHash('# 처음\n');
    await writeFile(fileOf(doc), '# 남이 고침\n', 'utf8');

    const saved = await saveDocument(stores, root, { nodeId: doc, body: '# 내가\n', baseHash: stale });

    expect(saved).toMatchObject({ ok: false, rule: 'conflict', current: '# 남이 고침\n' });
  });
});

describe('SEC 저장 권한 — 편집 권한 없이 저장되지 않는다', () => {
  it('보기 권한만으로는 저장이 거절된다', async () => {
    const viewer = actorFor(stores.principals, stores.principals.createUser('보기').id);
    grantPermission(stores, root, { nodeId: doc, principalId: viewer.id, level: 'view' });
    const read = await readDocument(stores, actorFor(stores.principals, viewer.id), doc);

    const saved = await saveDocument(stores, actorFor(stores.principals, viewer.id), {
      nodeId: doc,
      body: '# 몰래\n',
      baseHash: (read as { ok: true; hash: string }).hash,
    });

    expect(saved).toMatchObject({ ok: false, rule: 'forbidden' });
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 처음\n');
  });

  it('권한이 없으면 읽기도 없는 문서와 같은 답이다', async () => {
    const outsider = actorFor(stores.principals, stores.principals.createUser('외부').id);

    const missing = await readDocument(stores, outsider, 'no-such-node');
    const forbidden = await readDocument(stores, outsider, doc);

    // 둘이 다르면 그 차이가 문서의 존재를 알린다.
    expect(forbidden).toEqual(missing);
  });
});
