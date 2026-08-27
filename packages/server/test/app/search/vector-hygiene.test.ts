import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Actor } from '../../../src/app/acl/permission-service.js';
import { moveNode } from '../../../src/app/node/node-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { searchVectors } from '../../../src/app/search/vector-search.js';
import { moveToTrash, purgeFromTrash } from '../../../src/app/trash/trash-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteVectorIndex } from '../../../src/infra/sqlite/vector-index-repository.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 벡터 인덱스의 위생 (`SEC-STORAGE-007`).
 *
 * 방어가 둘인 것은 의도다 — 삭제·이동과 **같은 처리 안에서** 갱신하고,
 * 그것이 한 번 실패하더라도 조회 시점에 대상 노드의 존재를 다시 확인한다.
 * 앞의 것만 있으면 갱신이 한 번 어긋난 순간부터 유출이 열린다.
 *
 * 무엇을 색인하는가는 이 요구가 소유하지 않는다. 그래서 이 시험도 조각의
 * 내용을 정하지 않고 **엔트리가 남는지 사라지는지**만 본다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { vectors: SqliteVectorIndex };
let root: Actor;
let ws: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 노드와 실제 파일을 함께 만든다 — 휴지통 이동이 파일을 옮기기 때문이다. */
const 문서 = async (name: string, parentId: string | null = null) => {
  const id = idOf(createNode(stores, root, { workspaceId: ws, parentId, kind: 'file', name }));
  const at = join(docsRoot, ws, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, '본문\n', 'utf8');
  return id;
};

const 색인 = (nodeId: string, chunk: string) =>
  stores.vectors.put({ nodeId, workspaceId: ws, chunk });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'vector-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(':memory:');
  stores = { ...attachmentStores(db, docsRoot), vectors: new SqliteVectorIndex(db) };
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('벡터 인덱스는 노드를 따라간다', () => {
  it('AC-1: 노드를 영구 삭제하면 같은 처리 안에서 엔트리가 사라진다', async () => {
    const 노드 = await 문서('예산.md');
    색인(노드, '기밀 예산 수치');

    await moveToTrash(stores, root, 노드);
    await purgeFromTrash(stores, root, 노드);

    expect(stores.vectors.entriesOf(노드), '노드가 사라졌는데 엔트리가 남았다').toEqual([]);
  });

  it('AC-2: 노드를 옮기면 같은 처리 안에서 엔트리가 갱신된다', async () => {
    const 폴더 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }));
    const 노드 = await 문서('예산.md');
    색인(노드, '예산 수치');

    moveNode(stores, root, 노드, 폴더);

    const 남은것 = stores.vectors.entriesOf(노드);
    expect(남은것, '이동으로 엔트리가 사라졌다').toHaveLength(1);
    expect(남은것[0]!.workspaceId).toBe(ws);
  });

  /**
   * **둘째 방어다.** 위 갱신이 한 번 실패한 상태를 만들어 놓고, 조회가
   * 그것을 걸러 내는지 본다. 인덱스에 엔트리를 남긴 채 노드만 지운다 —
   * 동기 갱신이 어긋났을 때 실제로 벌어지는 모습이다.
   */
  it('AC-4: 인덱스에 남았어도 노드가 없으면 결과에 서지 않는다', async () => {
    const 노드 = await 문서('예산.md');
    색인(노드, '기밀 예산 수치');
    // 갱신을 건너뛰고 노드만 지운다.
    stores.nodes.remove(노드);

    const 본것 = searchVectors(stores, root, { nodeIds: [노드] });

    expect(본것, '없는 노드의 엔트리가 결과에 섰다').toEqual([]);
  });

  it('AC-5: 삭제된 문서의 조각이 결과 어디에도 실리지 않는다', async () => {
    const 노드 = await 문서('예산.md');
    색인(노드, '대외비 원가 구조');
    stores.nodes.remove(노드);

    const 본것 = searchVectors(stores, root, { nodeIds: [노드] });

    expect(JSON.stringify(본것), '삭제된 문서의 본문 조각이 새어 나왔다').not.toContain('대외비');
  });

  it('살아 있는 노드의 엔트리는 그대로 선다 — 거르기가 전부를 지우지 않는다', async () => {
    const 노드 = await 문서('예산.md');
    색인(노드, '살아 있는 조각');

    expect(searchVectors(stores, root, { nodeIds: [노드] })).toHaveLength(1);
  });
});
