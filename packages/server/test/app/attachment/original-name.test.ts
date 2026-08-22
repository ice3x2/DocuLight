import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { attachToDocument } from '../../../src/app/attachment/attachment-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 원본 파일명은 업로드 시점에만 잡을 수 있다 (`DR-ATTACH-002` AC-4·AC-5 · 원장 `R149-g`).
 *
 * 디스크에 놓이는 이름은 해시라(`R50`) 그 자리에서 안 적으면 **어떤
 * 마이그레이션으로도 되살릴 수 없다.** 검색 기능이 아니라 데이터 소실
 * 방지이며, 그래서 검색 표면보다 먼저 선다.
 */

let dir: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let docsRoot: string;
let root: Actor;
let workspaceId: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 디스크에 실체가 있는 문서 하나. */
async function place(name: string): Promise<string> {
  const id = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));
  await mkdir(join(docsRoot, workspaceId), { recursive: true });
  await writeFile(join(docsRoot, workspaceId, stores.nodes.pathOf(id)), `# ${name}\n`, 'utf8');
  return id;
}

const rows = () =>
  db.all<{ owner_node_id: string; original_name: string }>(
    'SELECT owner_node_id, original_name FROM attachment ORDER BY owner_node_id',
  );

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-attach-name-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  workspaceId = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-ATTACH-002 AC-4 · AC-5 — 원본 파일명을 업로드 시점에 기록한다', () => {
  it('AC-4: 올린 사람이 준 이름이 그대로 남는다 — 해시도 확장자도 아니다', async () => {
    const doc = await place('회의록.md');

    await attachToDocument(stores, root, {
      nodeId: doc,
      fileName: '2026 상반기 결산.png',
      bytes: PNG,
    });

    expect(rows().map((r) => r.original_name)).toEqual(['2026 상반기 결산.png']);
  });

  it('AC-5: 같은 바이트를 다른 이름으로 두 문서에 올리면 각자의 이름이 남는다', async () => {
    // 같은 해시라 파일은 하나지만 소유 문서마다 행이 선다. 이름을 해시
    // 단위로 두면 볼 수 없는 문서가 붙인 이름이 볼 수 있는 문서 아래로
    // 새어 나온다.
    const first = await place('기획.md');
    const second = await place('인사.md');

    await attachToDocument(stores, root, { nodeId: first, fileName: '조직도.png', bytes: PNG });
    await attachToDocument(stores, root, { nodeId: second, fileName: '인사이동.png', bytes: PNG });

    expect(new Map(rows().map((r) => [r.owner_node_id, r.original_name]))).toEqual(
      new Map([
        [first, '조직도.png'],
        [second, '인사이동.png'],
      ]),
    );
  });

  it('확장자가 없는 이름도 그대로 남는다', async () => {
    const doc = await place('회의록.md');

    await attachToDocument(stores, root, { nodeId: doc, fileName: 'LICENSE', bytes: PNG });

    expect(rows().map((r) => r.original_name)).toEqual(['LICENSE']);
  });

  it('사이드카에도 같은 이름이 실린다 — 사이드카가 정본이다', async () => {
    const doc = await place('회의록.md');

    await attachToDocument(stores, root, { nodeId: doc, fileName: '설계도.png', bytes: PNG });

    const index = JSON.parse(
      await import('node:fs/promises').then((fs) =>
        fs.readFile(join(docsRoot, workspaceId, '.res', 'index.json'), 'utf8'),
      ),
    ) as Record<string, { originalNames?: Record<string, string> }>;

    expect(Object.values(index)[0]?.originalNames).toEqual({ [doc]: '설계도.png' });
  });
});
