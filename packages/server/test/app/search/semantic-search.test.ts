import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { indexNode } from '../../../src/app/search/index-node.js';
import { semanticSearch } from '../../../src/app/search/semantic-search.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteVectorIndex } from '../../../src/infra/sqlite/vector-index-repository.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 의미 검색 (`FR-ARCH-001` AC-4 · `SEC-ARCH-002` AC-2 · AC-3).
 *
 * 1.0 의 `smart_search` semantic 경로는 실제로 동작한 적이 없으므로(`R21-a`)
 * 재현할 결과가 없다. 그래서 이 축은 계약을 물려받는 것이 아니라 신규
 * 작성물이며, 재는 것도 1.0 과의 일치가 아니라 **조항 자체**다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores> & { vectors: SqliteVectorIndex };
let root: Actor;
let ws: string;
let 공개문서: string;
let 비밀문서: string;
let 보기만: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

async function 문서(name: string, body: string): Promise<string> {
  const id = idOf(
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name }),
  );
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(id)), body, 'utf8');
  return id;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-sem-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...attachmentStores(db, docsRoot), vectors: new SqliteVectorIndex(db) };
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;

  공개문서 = await 문서(
    '분기계획.md',
    '# 분기 계획\n다음 분기의 매출 목표와 채용 계획을 정리한다.\n',
  );
  비밀문서 = await 문서(
    '연봉표.md',
    '# 연봉표\n임원 연봉과 성과급 지급 기준을 정리한다.\n',
  );

  보기만 = actorFor(stores.principals, stores.principals.createUser('보기만').id);
  grantPermission(stores, root, {
    nodeId: 공개문서,
    principalId: 보기만.id,
    level: 'view',
  });

  await indexNode(stores, 공개문서);
  await indexNode(stores, 비밀문서);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('의미 검색은 질의에 가까운 조각을 돌려준다 (`FR-ARCH-001` AC-4)', () => {
  /**
   * **가까운 것이 먼 것보다 앞에 선다.**
   *
   * 순위를 재지 않으면 「전부 돌려준다」로도 통과한다. 두 문서를 함께 넣고
   * 한쪽 주제로 물어 그쪽이 앞에 오는지를 본다.
   */
  it('질의에 가까운 문서가 먼 문서보다 앞에 선다', async () => {
    const 결과 = await semanticSearch(stores, root, { query: '매출 목표와 채용', limit: 5 });

    expect(결과.length, '아무것도 찾지 못했다').toBeGreaterThan(0);
    expect(결과[0]?.nodeId, '질의와 가까운 문서가 첫 자리가 아니다').toBe(공개문서);
  });

  it('색인되지 않은 노드는 결과에 서지 않는다', async () => {
    const 새문서 = await 문서('미색인.md', '# 미색인\n매출 목표 이야기가 여기도 있다.\n');

    const 결과 = await semanticSearch(stores, root, { query: '매출 목표', limit: 10 });

    expect(
      결과.map((one) => one.nodeId),
      '색인하지 않은 노드가 결과에 섰다',
    ).not.toContain(새문서);
  });
});

describe('벡터검색 결과는 호출자의 ACL 로 걸러진다 (`SEC-ARCH-002`)', () => {
  /**
   * **볼 수 없는 노드는 결과에 없다** (AC-2).
   *
   * 슈퍼유저에게는 두 문서가 모두 서고 권한이 좁은 쪽에는 하나만 서는 것을
   * 함께 재야 한다. 한쪽만 재면 「아무것도 안 나온다」와 「자기 것만 나온다」가
   * 갈리지 않는다.
   */
  it('AC-2: 볼 수 없는 노드의 항목이 결과에 포함되지 않는다', async () => {
    const 슈퍼 = await semanticSearch(stores, root, { query: '연봉과 성과급', limit: 10 });
    const 낮은쪽 = await semanticSearch(stores, 보기만, { query: '연봉과 성과급', limit: 10 });

    expect(
      슈퍼.map((one) => one.nodeId),
      '슈퍼유저에게 연봉표가 안 보여 이 항이 공허하다',
    ).toContain(비밀문서);
    expect(
      낮은쪽.map((one) => one.nodeId),
      '권한 없는 노드가 결과에 섰다',
    ).not.toContain(비밀문서);
  });

  /**
   * **본문 조각도 새지 않는다** (AC-3).
   *
   * 노드 ID 만 거르고 조각을 그대로 실으면, 결과 목록에서는 사라졌는데
   * 발췌 텍스트에는 남아 있는 상태가 된다. 색인된 조각이 곧 본문이므로
   * 그 자리가 실제 유출 지점이다.
   */
  it('AC-3: 볼 수 없는 노드의 본문이 발췌에 실리지 않는다', async () => {
    const 낮은쪽 = await semanticSearch(stores, 보기만, { query: '연봉과 성과급', limit: 10 });

    const 전문 = 낮은쪽.map((one) => one.chunk).join('\n');
    expect(전문, '권한 없는 문서의 본문이 발췌로 샜다').not.toContain('성과급');
    expect(전문, '권한 없는 문서의 제목이 발췌로 샜다').not.toContain('연봉표');
  });

  /**
   * 걸러진 사실도 남지 않는다 (AC-4 와 같은 축).
   *
   * 자리표시로 남기면 「여기 뭔가 있었다」가 드러나고, 그것이 곧 존재를
   * 알려 주는 신호다.
   */
  it('걸러진 자리에 자리표시가 남지 않는다', async () => {
    const 낮은쪽 = await semanticSearch(stores, 보기만, { query: '연봉과 성과급', limit: 10 });

    for (const one of 낮은쪽) {
      expect(one.chunk.length, '빈 자리표시가 결과에 섰다').toBeGreaterThan(0);
      expect(one.nodeId, '노드 없는 항목이 결과에 섰다').toBeTruthy();
    }
  });
});
