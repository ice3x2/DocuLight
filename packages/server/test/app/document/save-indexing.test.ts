import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { readDocument, saveDocument, type DocumentStores } from '../../../src/app/document/save-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteVectorIndex } from '../../../src/infra/sqlite/vector-index-repository.js';
import { documentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 저장이 벡터 색인을 따라오는가 (`FR-ARCH-001` AC-4).
 *
 * `indexNode` 는 있었으나 **저장 경로가 그것을 부르지 않아** 1.0 이행이
 * 유일한 호출자였다 — 조립 방벽이 그 사실을 「아직 배선되지 않음」 허용목록에
 * 담고 있었다. 그동안 의미 검색은 이행한 문서만 찾을 수 있었고, 그 뒤에
 * 쓴 것은 아무리 고쳐도 색인에 없었다.
 */
let dir: string;
let docsRoot: string;
let db: Database;
let vectors: SqliteVectorIndex;
let stores: DocumentStores & { vectors: SqliteVectorIndex; docsRoot: string };
let root: Actor;
let ws: string;
let doc: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const fileOf = (id: string) => join(docsRoot, ws, stores.nodes.pathOf(id));

/** 이 노드에 대해 색인에 담긴 조각들. */
const 조각들 = (nodeId: string) => vectors.entriesOf(nodeId).map((one) => one.chunk);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-saveidx-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  vectors = new SqliteVectorIndex(db);
  stores = { ...documentStores(db, docsRoot), vectors, docsRoot };
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(fileOf(doc), '# 처음\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-ARCH-001 AC-4 — 저장한 본문이 색인에 든다', () => {
  const 저장한다 = async (body: string) => {
    const read = await readDocument(stores, root, doc);
    return saveDocument(stores, root, {
      nodeId: doc,
      body,
      baseHash: (read as { ok: true; hash: string }).hash,
    });
  };

  it('저장하면 그 본문이 색인에 선다', async () => {
    expect(조각들(doc)).toEqual([]);

    const saved = await 저장한다('# 회의를 했다\n\n의사록을 남긴다\n');

    expect(saved.ok).toBe(true);
    expect(조각들(doc).join(' ')).toContain('의사록');
  });

  it('다시 저장하면 옛 조각이 걷힌다 — 지운 문장이 검색으로 계속 나오면 안 된다', async () => {
    await 저장한다('# 첫 판\n\n지울 문장이다\n');
    expect(조각들(doc).join(' ')).toContain('지울 문장');

    await 저장한다('# 둘째 판\n\n남을 문장이다\n');

    expect(조각들(doc).join(' ')).not.toContain('지울 문장');
    expect(조각들(doc).join(' ')).toContain('남을 문장');
  });

  it('거절된 저장은 색인을 건드리지 않는다', async () => {
    await 저장한다('# 살아남을 판\n\n그대로 있어야 한다\n');

    // 낡은 해시로 저장을 시도한다 — 충돌로 거절된다.
    const 거절 = await saveDocument(stores, root, {
      nodeId: doc,
      body: '# 들어가면 안 되는 판\n',
      baseHash: 'stale',
    });

    expect(거절.ok).toBe(false);
    // 거절만 재면 「거절하고 색인은 갱신하는」 구현이 통과하고, 그러면
    // 검색 결과가 실제 문서에 없는 문장을 가리킨다.
    expect(조각들(doc).join(' ')).toContain('그대로 있어야 한다');
    expect(조각들(doc).join(' ')).not.toContain('들어가면 안 되는');
  });
});
