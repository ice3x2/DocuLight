import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../../../src/app/document/save-service.js';
import {
  beginEditSession,
  listVersions,
  restoreVersion,
  retainedVersionCount,
} from '../../../src/app/document/version-service.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
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
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));
const hashOf = async (id: string, actor: Actor) =>
  (((await readDocument(stores, actor, id)) as { ok: true; hash: string }).hash);

/** 한 편집 세션을 열고 그 안에서 여러 번 저장한다. */
async function editSession(actor: Actor, bodies: readonly string[]): Promise<string> {
  const session = beginEditSession(stores, actor, doc);
  for (const body of bodies) {
    await saveDocument(stores, actor, { nodeId: doc, body, baseHash: await hashOf(doc, actor), session });
  }
  return session;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-version-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = documentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(doc), '# 0판\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-STORAGE-003 — 버전 스냅샷은 편집 세션당 1회다', () => {
  it('AC-1: 한 세션에서 여러 번 저장해도 스냅샷은 하나다', async () => {
    await editSession(root, ['# 1\n', '# 2\n', '# 3\n']);

    expect(listVersions(stores, root, doc)).toHaveLength(1);
  });

  it('AC-2: 세션을 새로 열어 편집하면 스냅샷이 하나 더 생긴다', async () => {
    await editSession(root, ['# 1\n']);
    await editSession(root, ['# 2\n']);

    expect(listVersions(stores, root, doc)).toHaveLength(2);
  });

  it('AC-3: 스냅샷은 편집 직전의 본문을 담는다', async () => {
    await editSession(root, ['# 1\n', '# 2\n']);

    const [only] = listVersions(stores, root, doc);
    // 저장한 값이 아니라 저장 이전의 값이다 — 되돌릴 대상이 그것이다.
    expect(await readFile(only!.path, 'utf8')).toBe('# 0판\n');
  });

  it('AC-4: 실체는 파일이고 목록은 DB 인덱스다', async () => {
    await editSession(root, ['# 1\n']);
    const [only] = listVersions(stores, root, doc);

    expect(await readFile(only!.path, 'utf8')).toBe('# 0판\n');
    expect(only!.seq).toBe(1);
  });

  it('AC-5: md 가 아닌 파일에는 스냅샷이 생기지 않는다', async () => {
    const png = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '그림.png' }));
    await writeFile(fileOf(png), 'binary', 'utf8');

    const session = beginEditSession(stores, root, png);
    await saveDocument(stores, root, {
      nodeId: png,
      body: 'binary2',
      baseHash: await hashOf(png, root),
      session,
    });

    // 바이너리를 버전으로 쌓으면 보관 디렉토리가 그 파일 크기만큼 곱해진다.
    expect(listVersions(stores, root, png)).toEqual([]);
  });
});

describe('DR-STORAGE-005 — 버전 사이드카', () => {
  it('AC-1: 노드 ID·순번·생성 시각·작성자를 담은 사이드카가 함께 기록된다', async () => {
    await editSession(root, ['# 1\n']);
    const [only] = listVersions(stores, root, doc);

    const sidecar = JSON.parse(await readFile(versionSidecarName(only!.path), 'utf8'));

    expect(sidecar.nodeId).toBe(doc);
    expect(sidecar.seq).toBe(1);
    expect(typeof sidecar.createdAt).toBe('string');
    expect(sidecar.author).toBe(root.id);
  });

  it('AC-5: 사이드카의 작성자만으로 주체를 알 수 있다 — 감사 로그가 필요 없다', async () => {
    const other = actorFor(stores.principals, stores.principals.createUser('한범').id);
    grantPermission(stores, root, { nodeId: ws, principalId: other.id, level: 'edit' });

    await editSession(actorFor(stores.principals, other.id), ['# 1\n']);
    const [only] = listVersions(stores, root, doc);
    const sidecar = JSON.parse(await readFile(versionSidecarName(only!.path), 'utf8'));

    expect(sidecar.author).toBe(other.id);
  });

  it('AC-4: 폐기되면 사이드카도 함께 사라진다', async () => {
    writeSetting(stores.settings, 'retained-version-count', '1');
    await editSession(root, ['# 1\n']);
    const [first] = listVersions(stores, root, doc);
    const goneSidecar = versionSidecarName(first!.path);

    await editSession(root, ['# 2\n']);

    await expect(readFile(goneSidecar, 'utf8')).rejects.toThrow();
  });
});

describe('FR-STORAGE-004 — 보관 개수 초과 시 오래된 것부터 폐기한다', () => {
  it('AC-1 · AC-5: 보관 개수는 설정에서 오고 DB 에 남는다', async () => {
    expect(retainedVersionCount(stores)).toBe(20);

    writeSetting(stores.settings, 'retained-version-count', '3');

    expect(retainedVersionCount(stores)).toBe(3);
  });

  it('AC-2 · AC-3: 초과분은 가장 오래된 것부터 사라지고 최신은 남는다', async () => {
    writeSetting(stores.settings, 'retained-version-count', '2');

    await editSession(root, ['# 1\n']);
    await editSession(root, ['# 2\n']);
    await editSession(root, ['# 3\n']);

    const kept = listVersions(stores, root, doc);
    expect(kept.map((v) => v.seq)).toEqual([2, 3]);
  });

  it('AC-4: 폐기된 버전은 파일 실체와 인덱스 행이 함께 사라진다', async () => {
    writeSetting(stores.settings, 'retained-version-count', '1');
    await editSession(root, ['# 1\n']);
    const [first] = listVersions(stores, root, doc);

    await editSession(root, ['# 2\n']);

    expect(listVersions(stores, root, doc).map((v) => v.seq)).toEqual([2]);
    await expect(readFile(first!.path, 'utf8')).rejects.toThrow();
  });
});

describe('IR-STORAGE-001 — 복원', () => {
  it('AC-2: 고른 버전으로 복원하면 본문이 그 내용이 된다', async () => {
    await editSession(root, ['# 새 본문\n']);
    const [only] = listVersions(stores, root, doc);

    const restored = await restoreVersion(stores, root, { nodeId: doc, seq: only!.seq });

    expect(restored.ok).toBe(true);
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 0판\n');
  });

  it('AC-4: 복원이 노드 ID 를 바꾸지 않는다', async () => {
    await editSession(root, ['# 새 본문\n']);
    const [only] = listVersions(stores, root, doc);

    await restoreVersion(stores, root, { nodeId: doc, seq: only!.seq });

    // ID 가 바뀌면 그 문서를 가리키던 딥링크·ACL·첨부 소유가 모두 끊긴다.
    expect(stores.nodes.findById(doc)).toBeDefined();
  });

  it('복원 자체가 버전으로 남는다 — 복원을 되돌릴 길이 없으면 실수가 최종이 된다', async () => {
    await editSession(root, ['# 새 본문\n']);
    const [only] = listVersions(stores, root, doc);

    await restoreVersion(stores, root, { nodeId: doc, seq: only!.seq });

    expect(listVersions(stores, root, doc).length).toBeGreaterThan(1);
  });

  it('보기 권한만으로는 복원되지 않는다 — 복원은 본문을 바꾸는 일이다', async () => {
    await editSession(root, ['# 새 본문\n']);
    const [only] = listVersions(stores, root, doc);
    const viewer = actorFor(stores.principals, stores.principals.createUser('보기').id);
    grantPermission(stores, root, { nodeId: doc, principalId: viewer.id, level: 'view' });

    const restored = await restoreVersion(stores, actorFor(stores.principals, viewer.id), {
      nodeId: doc,
      seq: only!.seq,
    });

    expect(restored).toMatchObject({ ok: false });
    expect(await readFile(fileOf(doc), 'utf8')).toBe('# 새 본문\n');
  });
});

describe('FR-STORAGE-001 AC-4 — Ctrl+S 는 세션당 1회 규칙과 무관하게 스냅샷을 남긴다', () => {
  it('같은 세션에서 강제 저장을 두 번 하면 스냅샷이 둘이다', async () => {
    const session = beginEditSession(stores, root, doc);

    for (const body of ['# 1\n', '# 2\n']) {
      await saveDocument(stores, root, {
        nodeId: doc,
        body,
        baseHash: await hashOf(doc, root),
        session,
        forceSnapshot: true,
      });
    }

    // 「여기를 기억해 둬」라고 두 번 말했으면 두 지점이 남아야 한다.
    expect(listVersions(stores, root, doc)).toHaveLength(2);
  });

  it('강제 저장 사이의 자동 저장은 스냅샷을 늘리지 않는다', async () => {
    const session = beginEditSession(stores, root, doc);

    await saveDocument(stores, root, { nodeId: doc, body: '# 1\n', baseHash: await hashOf(doc, root), session, forceSnapshot: true });
    await saveDocument(stores, root, { nodeId: doc, body: '# 2\n', baseHash: await hashOf(doc, root), session });
    await saveDocument(stores, root, { nodeId: doc, body: '# 3\n', baseHash: await hashOf(doc, root), session });

    // 세션당 1회 규칙은 그대로다 — 강제만 예외다.
    expect(listVersions(stores, root, doc)).toHaveLength(1);
  });

  it('강제 스냅샷도 저장 직전의 본문을 담는다', async () => {
    const session = beginEditSession(stores, root, doc);
    await saveDocument(stores, root, { nodeId: doc, body: '# 1\n', baseHash: await hashOf(doc, root), session, forceSnapshot: true });
    await saveDocument(stores, root, { nodeId: doc, body: '# 2\n', baseHash: await hashOf(doc, root), session, forceSnapshot: true });

    const kept = listVersions(stores, root, doc);
    expect(await readFile(kept[1]!.path, 'utf8')).toBe('# 1\n');
  });

  it('md 가 아니면 강제해도 스냅샷이 없다 — 보관 대상이 아니다', async () => {
    const png = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '그림.png' }));
    await writeFile(fileOf(png), 'binary', 'utf8');
    const session = beginEditSession(stores, root, png);

    await saveDocument(stores, root, { nodeId: png, body: 'binary2', baseHash: await hashOf(png, root), session, forceSnapshot: true });

    expect(listVersions(stores, root, png)).toEqual([]);
  });
});
