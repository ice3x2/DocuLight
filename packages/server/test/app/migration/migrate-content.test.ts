import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { migrateContent } from '../../../src/app/migration/migrate-content.js';
import { semanticSearch } from '../../../src/app/search/semantic-search.js';
import { bootstrapDefaultWorkspace } from '../../../src/app/workspace/bootstrap-default-workspace.js';
import { FsLegacyContentImporter } from '../../../src/infra/fs/legacy-content-importer.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { FsDocumentStore } from '../../../src/infra/fs/document-store.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { workspaceDirectory } from '../../../src/infra/fs/workspace-layout.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteVectorIndex } from '../../../src/infra/sqlite/vector-index-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 1.0 콘텐츠와 벡터 인덱스의 이행 (`MIG-AUTH-001` AC-3 · AC-4 · AC-5).
 *
 * AC-1(1.0 편집 거부)과 AC-2(읽기 전용 열람)는 여기서 재지 않는다 — 제약
 * C-02 가 1.0 저장소의 수정을 금지하고 C-03 이 동결의 수단을 운영 절차
 * 선언으로 확정했으므로, 그 둘은 코드가 아니라 절차 문서가 성립시킨다
 * (`waves.jsonl` 결정 `D-W4-02`).
 */

/** 비-md 파일이 바이트 그대로 오는지 재기 위한 값. PNG 시그니처다. */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]);

let dir: string;
let docsRoot: string;
let legacyDocsRoot: string;
let db: Database;
let stores: ReturnType<typeof nodeStores> & {
  documents: FsDocumentStore;
  files: FsWorkspaceFiles;
  queue: SqliteFindingQueue;
  vectors: SqliteVectorIndex;
  legacy: FsLegacyContentImporter;
  docsRoot: string;
  transaction: <T>(fn: () => T) => T;
};
let workspaceId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-content-'));
  docsRoot = join(dir, 'docs');
  legacyDocsRoot = join(dir, 'legacy-docs');
  await mkdir(docsRoot, { recursive: true });
  await mkdir(join(legacyDocsRoot, '회의록'), { recursive: true });

  // 1.0 볼트의 모양 — 최상위 md, 하위 디렉토리의 md, 그리고 비-md.
  await writeFile(join(legacyDocsRoot, '안내.md'), '# 안내\n\n분기 매출 보고 절차를 적는다.\n');
  await writeFile(join(legacyDocsRoot, '회의록', '8월.md'), '# 8월 회의\n\n예산을 확정했다.\n');
  await writeFile(join(legacyDocsRoot, '회의록', '도표.png'), PNG_BYTES);

  db = openDatabase(join(dir, 'doculight.db'));
  const base = nodeStores(db);
  stores = {
    ...base,
    documents: new FsDocumentStore(docsRoot),
    files: new FsWorkspaceFiles(docsRoot),
    queue: new SqliteFindingQueue(db),
    // 회차를 한 트랜잭션으로 묶는다 (`DR-STORAGE-002` AC-2).
    transaction: <T,>(fn: () => T): T => db.transaction(fn),
    vectors: new SqliteVectorIndex(db),
    legacy: new FsLegacyContentImporter(docsRoot),
    docsRoot,
  };

  const workspace = await bootstrapDefaultWorkspace({
    workspaces: stores.workspaces,
    files: stores.files,
  });
  expect(workspace).toBeDefined();
  workspaceId = workspace!.id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

it('AC-3: 1.0 docsRoot 전체가 기본 워크스페이스의 노드로 선다', async () => {
  await migrateContent(stores, { legacyDocsRoot, workspaceId });

  // 노드로 섰는가를 잰다 — 파일만 복사되고 노드가 없으면 그 문서는 트리에도
  // 권한 판정에도 없고, 「기본 워크스페이스로 복사한다」가 성립하지 않는다.
  const paths = stores.nodes
    .children({ workspaceId, parentId: null })
    .map((one) => stores.nodes.pathOf(one.id));

  expect(paths).toEqual(expect.arrayContaining(['안내.md', '회의록']));

  const 회의록 = stores.nodes.children({ workspaceId, parentId: null }).find((one) => one.name === '회의록');
  expect(회의록).toBeDefined();
  expect(
    stores.nodes.children({ workspaceId, parentId: 회의록!.id }).map((one) => one.name),
  ).toEqual(expect.arrayContaining(['8월.md', '도표.png']));
});

it('AC-4: 비-md 파일이 바이트 그대로 복사된다', async () => {
  await migrateContent(stores, { legacyDocsRoot, workspaceId });

  const copied = await readFile(join(workspaceDirectory(docsRoot, workspaceId), '회의록', '도표.png'));
  expect(copied.equals(PNG_BYTES), 'png 바이트가 이행에서 변형됐다').toBe(true);
});

it('AC-5: 벡터 인덱스를 1.0 에서 옮기지 않고 2.0 에서 다시 세운다', async () => {
  // 1.0 은 자기 인덱스를 data/vector 에 둔다(실측). 그 디렉토리를 만들어
  // 두어도 이행이 그것을 읽지 않는다는 것이 이 항의 절반이다.
  await mkdir(join(dir, 'legacy-data', 'vector'), { recursive: true });
  await writeFile(join(dir, 'legacy-data', 'vector', 'hnswlib.index'), '1.0 인덱스 원본');

  await migrateContent(stores, { legacyDocsRoot, workspaceId });

  const hits = await semanticSearch(stores, superuserActor(stores), { query: '분기 매출 보고' });
  expect(hits.length, '이행 뒤 의미 검색이 1.0 문서를 찾지 못했다').toBeGreaterThan(0);
  expect(hits.some((one) => one.chunk.includes('분기 매출 보고'))).toBe(true);
});
