import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { linksOf, wikiTargets } from '../../../src/app/document/link-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { moveToTrash } from '../../../src/app/trash/trash-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 관문은 권한 **이전**에 선다 (`SEC-WORKSPACE-004` AC-2 · `SEC-STORAGE-004`·
 * `SEC-STORAGE-006`·`FR-STORAGE-005`).
 *
 * 「내보내도 되는가」는 두 질문의 곱이다 — 관문을 통과하는가와 권한이
 * 있는가. 링크 계열 표면이 권한만 보고 관문을 안 보면, **슈퍼유저에게조차
 * 거부되어야 할 것**이 자동완성 후보와 백링크로 나온다. 관문 셋은 권한 축이
 * 아니라 이름·상태 축이라 관리 권한으로 뚫리지 않는다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let ws: string;
let 정상: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

async function place(name: string, parentId: string | null = null): Promise<string> {
  const id = idOf(createNode(stores, root, { workspaceId: ws, parentId, kind: 'file', name }));
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(id)), `# ${name}\n`, 'utf8');
  return id;
}

/**
 * 점으로 시작하는 디렉토리 — **저장소로 직접 넣는다.**
 *
 * `createNode` 는 그 이름을 거부하므로(`SEC-STORAGE-004`) 이 자리를 통상
 * 경로로는 만들 수 없다. 그럼에도 재현하는 이유는 관문이 막으려는 것이
 * 「만들 수 있는가」가 아니라 「이미 있는 것을 내보내는가」이기 때문이다 —
 * 옛 볼트를 그대로 넣은 워크스페이스에는 그 노드가 실제로 선다.
 */
const reservedDirectory = (name: string) =>
  stores.nodes.create({ workspaceId: ws, parentId: null, kind: 'directory', name });

/** 그 아래의 문서. 부모가 점 이름이라 이쪽도 저장소로 직접 넣는다. */
async function placeUnder(parentId: string, name: string): Promise<string> {
  const id = stores.nodes.create({ workspaceId: ws, parentId, kind: 'file', name });
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(id)), `# ${name}\n`, 'utf8');
  return id;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-link-servable-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) },
      '기획팀',
    )
  ).id;
  정상 = await place('정상문서.md');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const targets = () => wikiTargets(stores, root, '').map((one) => one.label).sort();

describe('SEC-WORKSPACE-004 AC-2 — 관문이 링크 계열 표면에도 선다', () => {
  it('점으로 시작하는 예약 자리의 문서가 자동완성 후보에 나오지 않는다', async () => {
    // `.obsidian/` 은 제품이 자기 것으로 쓰는 자리다. 세그먼트 하나만 보면
    // 그 아래 문서가 그대로 나간다 — 조상까지 봐야 한다.
    const 예약 = reservedDirectory('.obsidian');
    await mkdir(join(docsRoot, ws, '.obsidian'), { recursive: true });
    await placeUnder(예약, 'workspace.md');

    expect(targets()).toEqual(['정상문서.md']);
  });

  it('휴지통에 든 문서가 자동완성 후보에 나오지 않는다', async () => {
    const 버릴것 = await place('버린문서.md');
    await moveToTrash(stores, root, 버릴것);

    expect(targets()).toEqual(['정상문서.md']);
  });

  it('아카이브 아래 문서가 자동완성 후보에 나오지 않는다', async () => {
    const 보관 = reservedDirectory('.archive');
    await mkdir(join(docsRoot, ws, '.archive'), { recursive: true });
    await placeUnder(보관, '묵은문서.md');

    expect(targets()).toEqual(['정상문서.md']);
  });

  it('실체가 사라진 문서(tombstone)가 자동완성 후보에 나오지 않는다', async () => {
    const 유실 = await place('유실문서.md');
    stores.nodes.markOrphaned(유실, new Date().toISOString());

    expect(targets()).toEqual(['정상문서.md']);
  });

  it('관문에 걸린 문서는 백링크에도 나오지 않는다', async () => {
    // 같은 관문이 두 표면에 함께 서야 한다 — 한쪽만 막으면 그 문서의
    // 존재가 다른 쪽으로 새고, 새는 쪽은 자기가 무엇을 빠뜨렸는지 모른다.
    const 버릴것 = await place('버린문서.md');
    await writeFile(
      join(docsRoot, ws, stores.nodes.pathOf(버릴것)),
      '이 문서는 [[정상문서]] 를 가리킨다\n',
      'utf8',
    );
    await moveToTrash(stores, root, 버릴것);

    const links = await linksOf(stores, root, 정상);

    expect(links?.backlinks.map((row) => row.name)).toEqual([]);
  });

  it('관문을 통과하는 문서의 백링크는 그대로 선다 — 관문이 전부를 닫지 않는다', async () => {
    const 가리키는것 = await place('가리키는문서.md');
    await writeFile(
      join(docsRoot, ws, stores.nodes.pathOf(가리키는것)),
      '[[정상문서]] 를 가리킨다\n',
      'utf8',
    );

    const links = await linksOf(stores, root, 정상);

    expect(links?.backlinks.map((row) => row.name)).toEqual(['가리키는문서.md']);
  });
});
