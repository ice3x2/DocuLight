import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { TAG_COUNT_BASIS, tagIndex } from '../../../src/app/document/tag-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 기획: string;
let 영업: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 워크스페이스 = async (name: string) =>
  (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, name)).id;

/** 그 본문을 담은 문서. 실체 파일까지 세운다 — 태그의 정본은 본문이다. */
const 문서 = async (workspaceId: string, name: string, body: string) => {
  const id = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));
  const at = join(docsRoot, workspaceId, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, body, 'utf8');
  return id;
};

const 사람 = (name: string) => stores.principals.createUser(name);
const 배우 = (id: string) => actorFor(stores.principals, id);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-tags-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  기획 = await 워크스페이스('기획팀');
  영업 = await 워크스페이스('영업팀');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-SHELL-009 — 태그 목록과 출현 문서 수', () => {
  it('AC-1: 접근 가능한 전 워크스페이스의 태그가 한 목록으로 온다', async () => {
    await 문서(기획, '가.md', '#회의 를 했다\n');
    await 문서(영업, '나.md', '#영업 을 했다\n');

    const 본것 = await tagIndex(stores, root, {});

    expect(본것.tags.map((one) => one.name)).toEqual(['영업', '회의']);
  });

  it('AC-2: 범위 선택기로 한 워크스페이스로 좁힐 수 있다', async () => {
    await 문서(기획, '가.md', '#회의\n');
    await 문서(영업, '나.md', '#영업\n');

    expect((await tagIndex(stores, root, { workspaceId: 기획 })).tags.map((one) => one.name)).toEqual([
      '회의',
    ]);
  });

  it('AC-3: 볼 수 있는 문서에 한 번도 없는 태그는 목록에 없다', async () => {
    await 문서(기획, '가.md', '#보이는것\n');
    await 문서(영업, '나.md', '#숨은것\n');
    const 한범 = 사람('한범');
    grantPermission(stores, root, { nodeId: 기획, principalId: 한범.id, level: 'view' });

    const 본것 = await tagIndex(stores, 배우(한범.id), {});

    // 개수만 거르면 이름이 남고, 그 이름이 곧 그 문서의 존재를 알린다.
    expect(본것.tags.map((one) => one.name)).toEqual(['보이는것']);
  });

  it('AC-4: 수치가 그 태그를 단 문서 중 볼 수 있는 것의 개수다', async () => {
    await 문서(기획, '가.md', '#공통\n');
    await 문서(기획, '나.md', '#공통\n');
    await 문서(영업, '다.md', '#공통\n');
    const 한범 = 사람('한범');
    grantPermission(stores, root, { nodeId: 기획, principalId: 한범.id, level: 'view' });

    const [공통] = (await tagIndex(stores, 배우(한범.id), {})).tags;

    expect(공통).toEqual({ name: '공통', documents: 2 });
  });

  it('AC-5: 한 문서에 같은 태그가 여러 번 나와도 1 로 센다', async () => {
    await 문서(기획, '가.md', '#회의 #회의 #회의\n');

    expect((await tagIndex(stores, root, {})).tags).toEqual([{ name: '회의', documents: 1 }]);
  });

  it('AC-6: 기준 문구가 숨은 항목의 유무와 무관하게 같다', async () => {
    await 문서(기획, '가.md', '#회의\n');
    await 문서(영업, '나.md', '#영업\n');
    const 한범 = 사람('한범');
    grantPermission(stores, root, { nodeId: 기획, principalId: 한범.id, level: 'view' });

    // 숨은 것이 있는 사람과 없는 사람이 같은 문구를 받는다 — 문구가 갈리면
    // 그 차이가 곧 숨은 항목의 존재를 알린다.
    expect((await tagIndex(stores, 배우(한범.id), {})).basis).toBe(TAG_COUNT_BASIS);
    expect((await tagIndex(stores, root, {})).basis).toBe(TAG_COUNT_BASIS);
  });

  it('AC-6: 기준 문구가 「출현 문서 수」이지 「출현 횟수」가 아니다', () => {
    expect(TAG_COUNT_BASIS).toContain('문서');
    expect(TAG_COUNT_BASIS).not.toContain('횟수');
  });
});

describe('FR-SHELL-011 — 목록은 이름순이다', () => {
  it('AC-1 · AC-2: 처음 열면 이름순이고 숫자를 인식한다', async () => {
    await 문서(기획, '가.md', '#회의10 #회의2 #회의1\n');

    expect((await tagIndex(stores, root, {})).tags.map((one) => one.name)).toEqual([
      '회의1',
      '회의2',
      '회의10',
    ]);
  });
});

describe('SEC-WORKSPACE-004 — 태그 표면의 권한 필터', () => {
  it('AC-5: 볼 수 없는 문서가 집계에 가산되지 않는다', async () => {
    await 문서(기획, '가.md', '#공통\n');
    await 문서(영업, '나.md', '#공통\n');
    const 한범 = 사람('한범');
    grantPermission(stores, root, { nodeId: 기획, principalId: 한범.id, level: 'view' });

    expect((await tagIndex(stores, 배우(한범.id), {})).tags).toEqual([{ name: '공통', documents: 1 }]);
  });

  it('AC-6: 권한을 잃으면 다음 조회부터 그 문서가 빠진다', async () => {
    const 문서id = await 문서(기획, '가.md', '#회의\n');
    const 한범 = 사람('한범');
    const 준것 = grantPermission(stores, root, {
      nodeId: 문서id,
      principalId: 한범.id,
      level: 'view',
    }) as { ok: true; entryId: string };

    expect((await tagIndex(stores, 배우(한범.id), {})).tags).toHaveLength(1);

    stores.acl.revoke(준것.entryId);

    // 표시 직전에 거르지 않고 어딘가에 캐시하면 여기서 그대로 남는다.
    expect((await tagIndex(stores, 배우(한범.id), {})).tags).toEqual([]);
  });

  it('아무것도 볼 수 없으면 빈 목록이다 — 빈 상태와 권한 없음이 같은 답이다', async () => {
    await 문서(기획, '가.md', '#회의\n');

    expect((await tagIndex(stores, 배우(사람('구경꾼').id), {})).tags).toEqual([]);
  });
});
