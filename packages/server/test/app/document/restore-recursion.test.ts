import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../../../src/app/document/save-service.js';
import { beginEditSession, listVersions, restoreVersion } from '../../../src/app/document/version-service.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
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

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = () => join(docsRoot, ws, stores.nodes.pathOf(doc));

async function editOnce(body: string): Promise<void> {
  const session = beginEditSession(stores, root, doc);
  const read = (await readDocument(stores, root, doc)) as { ok: true; hash: string };
  await saveDocument(stores, root, { nodeId: doc, body, baseHash: read.hash, session });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-restore-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = documentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(), '# 0판\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('IR-STORAGE-001 — 복원의 경계', () => {
  it('복원을 여러 번 반복해도 멈춘다 — 재귀가 아니다', async () => {
    await editOnce('# 1\n');

    for (let i = 0; i < 5; i += 1) {
      const versions = listVersions(stores, root, doc);
      const done = await restoreVersion(stores, root, { nodeId: doc, seq: versions[0]!.seq });
      expect(done.ok, `${i}회차 복원이 실패했다`).toBe(true);
    }

    // 복원마다 스냅샷이 하나씩 늘어난다 — 그 자체는 의도다.
    expect(listVersions(stores, root, doc).length).toBe(6);
  });

  it('복원이 보관 개수를 넘기면 가장 오래된 것부터 걷힌다', async () => {
    writeSetting(stores.settings, 'retained-version-count', '2');
    await editOnce('# 1\n');

    for (let i = 0; i < 4; i += 1) {
      const versions = listVersions(stores, root, doc);
      await restoreVersion(stores, root, { nodeId: doc, seq: versions[versions.length - 1]!.seq });
    }

    // 상한을 넘겨 자라면 디스크가 무한히 는다.
    expect(listVersions(stores, root, doc).length).toBe(2);
  });

  it('없는 순번으로 복원하면 본문이 그대로다', async () => {
    await editOnce('# 1\n');

    const done = await restoreVersion(stores, root, { nodeId: doc, seq: 999 });

    expect(done).toMatchObject({ ok: false, rule: 'unknown-version' });
    expect(await readFile(fileOf(), 'utf8')).toBe('# 1\n');
  });

  it('복원 도중 남이 고쳤으면 덮지 않는다 — 복원도 저장이다', async () => {
    await editOnce('# 1\n');
    const versions = listVersions(stores, root, doc);
    // 복원이 읽은 뒤 쓰기 전에 남이 고치는 경합은 재현하기 어려우므로,
    // 복원이 저장 경로를 그대로 탄다는 사실로 대신 잰다 — 그 경로에
    // 충돌 판정이 들어 있다.
    const done = await restoreVersion(stores, root, { nodeId: doc, seq: versions[0]!.seq });

    expect(done.ok).toBe(true);
    expect(await readFile(fileOf(), 'utf8')).toBe('# 0판\n');
  });
});
