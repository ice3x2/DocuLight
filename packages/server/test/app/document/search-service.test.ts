import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachToDocument } from '../../../src/app/attachment/attachment-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { DEFAULT_AXES, SEARCH_AXES, search } from '../../../src/app/document/search-service.js';
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
let ws: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 문서 = async (name: string, body = '', workspaceId = ws) => {
  const id = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));
  const at = join(docsRoot, workspaceId, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, body, 'utf8');
  return id;
};

/** 모든 축을 켠 조회. 축별 시험은 각자 따로 켠다. */
const 전부 = async (query: string, actor: Actor = root) =>
  search(stores, actor, { query, axes: [...SEARCH_AXES] });

const 이름들 = (found: { documents: readonly { name: string }[] }) =>
  found.documents.map((one) => one.name);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-search-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-SHELL-013 — 검색의 네 대상', () => {
  it('AC-2: 이름에서만 일치하는 노드가 결과에 온다', async () => {
    await 문서('회의록.md', '아무 말도 없다\n');

    expect(이름들(await 전부('회의록'))).toEqual(['회의록.md']);
  });

  it('AC-2: 본문에서만 일치하는 문서가 결과에 온다', async () => {
    await 문서('가.md', '여기에 설계 이야기가 있다\n');

    expect(이름들(await 전부('설계'))).toEqual(['가.md']);
  });

  it('AC-2: 태그에서만 일치하는 문서가 결과에 온다', async () => {
    await 문서('나.md', '#긴급\n');

    // 본문 축을 끄고도 걸려야 태그가 **자기 축**이다.
    const 본것 = await search(stores, root, { query: '긴급', axes: ['tag'] });
    expect(이름들(본것)).toEqual(['나.md']);
  });

  it('AC-2: 첨부 이름에서만 일치하는 문서가 결과에 온다', async () => {
    const 소유 = await 문서('다.md', '본문에는 없다\n');
    await attachToDocument(stores, root, { nodeId: 소유, fileName: '예산안.xlsx', bytes: Buffer.from('x') });

    const 본것 = await search(stores, root, { query: '예산안', axes: ['attachment'] });
    expect(이름들(본것)).toEqual(['다.md']);
  });

  it('AC-3: 이름 축이 비-md 노드의 이름도 덮는다', async () => {
    await 문서('설계도.png', '');

    const 본것 = await search(stores, root, { query: '설계도', axes: ['name'] });
    expect(이름들(본것)).toEqual(['설계도.png']);
  });
});

describe('FR-SHELL-013 — 축 켜고 끄기', () => {
  it('AC-6: 기본 축은 `이름` 하나다', () => {
    expect(DEFAULT_AXES).toEqual(['name']);
  });

  it('AC-8: 축을 끄면 그 축에서만 일치하는 문서가 결과에서 빠진다', async () => {
    await 문서('가.md', '설계 이야기\n');

    expect(이름들(await search(stores, root, { query: '설계', axes: ['body'] }))).toEqual(['가.md']);
    expect(이름들(await search(stores, root, { query: '설계', axes: ['name'] }))).toEqual([]);
  });

  it('AC-8: 태그 축을 끄면 발췌에 태그 자리가 서지 않는다', async () => {
    // `#긴급` 은 본문 글자로도 걸리므로 문서가 빠지는지로는 갈리지 않는다 —
    // 갈리는 것은 **어느 축으로 걸렸는가** 이고, 그 값이 발췌에 실린다.
    await 문서('나.md', '#긴급 한 건\n');

    const [본문만] = (await search(stores, root, { query: '긴급', axes: ['body'] })).documents;
    expect(본문만?.excerpts.map((one) => one.axis)).not.toContain('tag');

    const [태그도] = (await search(stores, root, { query: '긴급', axes: ['body', 'tag'] })).documents;
    expect(태그도?.excerpts.map((one) => one.axis)).toContain('tag');
  });

  it('AC-8: 이름 축을 끄면 이름에서만 일치하는 문서가 빠진다', async () => {
    // 이름은 언제나 손에 있는 값이라 「끈 축」이 무시되기 가장 쉬운 자리다.
    await 문서('설계도.md', '본문에는 없다\n');

    expect(이름들(await search(stores, root, { query: '설계도', axes: ['name'] }))).toEqual([
      '설계도.md',
    ]);
    expect(이름들(await search(stores, root, { query: '설계도', axes: ['body'] }))).toEqual([]);
  });

  it('축이 하나도 켜지지 않으면 결과가 없다 — 전부 켠 것과 같지 않다', async () => {
    await 문서('회의록.md', '설계\n');

    expect(이름들(await search(stores, root, { query: '회의록', axes: [] }))).toEqual([]);
  });
});

describe('FR-SHELL-013 — 결과의 모양', () => {
  it('AC-9 · AC-10: 문서마다 머리행 하나에 발췌가 여러 줄로 쌓인다', async () => {
    await 문서('가.md', '설계 이야기\n다른 줄\n설계 이야기 또\n');

    const [문서하나] = (await search(stores, root, { query: '설계', axes: ['body'] })).documents;

    expect(문서하나?.name).toBe('가.md');
    expect(문서하나?.excerpts.length).toBeGreaterThan(1);
  });

  it('AC-9: 발췌가 일치 지점의 글자를 담는다', async () => {
    await 문서('가.md', '앞말 설계 뒷말\n');

    const [문서하나] = (await search(stores, root, { query: '설계', axes: ['body'] })).documents;

    expect(문서하나?.excerpts[0]?.text).toContain('설계');
  });

  it('AC-11: 거르기 전 개수나 분모를 함께 주지 않는다', async () => {
    await 문서('가.md', '설계\n');

    const 본것 = await search(stores, root, { query: '설계', axes: ['body'] });

    // 그 값이 있으면 그 차액이 곧 볼 수 없는 문서의 개수다.
    expect(Object.keys(본것).sort()).toEqual(['documents']);
  });

  it('빈 질의는 아무것도 찾지 않는다 — 전 문서 나열이 아니다', async () => {
    await 문서('가.md', '설계\n');

    expect(이름들(await 전부(''))).toEqual([]);
  });
});

describe('SEC-WORKSPACE-004 — 검색 결과의 권한 필터', () => {
  it('AC-3: 볼 수 없는 문서가 결과에 나타나지 않는다', async () => {
    const 다른곳 = (
      await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '영업팀')
    ).id;
    await 문서('보이는것.md', '설계\n');
    await 문서('숨은것.md', '설계\n', 다른곳);
    const 한범 = stores.principals.createUser('한범');
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });

    const 본것 = await search(stores, actorFor(stores.principals, 한범.id), {
      query: '설계',
      axes: ['body'],
    });

    expect(이름들(본것)).toEqual(['보이는것.md']);
  });

  it('AC-3: **같은 워크스페이스 안에서도** 볼 수 없는 문서가 빠진다', async () => {
    // 워크스페이스 단위로만 거르면 이 시험이 죽는다 — 노드 단위 판정이
    // 없으면 같은 방 안의 닫힌 문서가 그대로 결과에 선다.
    await 문서('열린것.md', '설계\n');
    const 닫힌것 = await 문서('닫힌것.md', '설계\n');
    const 한범 = stores.principals.createUser('한범');
    grantPermission(stores, root, { nodeId: ws, principalId: 한범.id, level: 'view' });
    breakInheritance(stores, root, 닫힌것);

    const 본것 = await search(stores, actorFor(stores.principals, 한범.id), {
      query: '설계',
      axes: ['body'],
    });

    expect(이름들(본것)).toEqual(['열린것.md']);
  });

  it('AC-8: 건수를 셀 값이 필터를 통과한 항목뿐이다', async () => {
    await 문서('가.md', '설계\n');
    const 구경꾼 = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);

    const 본것 = await search(stores, 구경꾼, { query: '설계', axes: ['body'] });

    expect(본것.documents).toEqual([]);
  });
});
