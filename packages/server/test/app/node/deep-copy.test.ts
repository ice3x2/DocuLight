import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachToDocument } from '../../../src/app/attachment/attachment-service.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, permissionOf, type Actor } from '../../../src/app/acl/permission-service.js';
import { copyNode, createNode } from '../../../src/app/node/node-service.js';
import { moveToTrash } from '../../../src/app/trash/trash-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 복사는 **경계를 넘을 수 있는 유일한 조작**이고, 그래서 복사본이 대상
 * 워크스페이스의 권한 체계 안으로 온전히 들어와야 한다 (`FR-ACL-001`).
 *
 * 디렉토리 복사는 **요청자에게 보이는 것만** 복사한다 (`SEC-SHELL-003`).
 * 전부 복사하면 복사본이 대상 부모에서 상속해 권한 상승이 되고, 숨은
 * 노드가 있다고 거부하면 그 거부 자체가 존재 오라클이 된다.
 */

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let SRC: string;
let DST: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

async function place(name: string, parentId: string | null, workspaceId: string, body = ''):
  Promise<string> {
  const id = idOf(createNode(stores, root, { workspaceId, parentId, kind: 'file', name }));
  const path = join(docsRoot, workspaceId, stores.nodes.pathOf(id));
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body === '' ? `# ${name}\n` : body, 'utf8');
  return id;
}

const dirNode = (name: string, parentId: string | null, workspaceId: string) =>
  idOf(createNode(stores, root, { workspaceId, parentId, kind: 'directory', name }));

const user = (name: string): Actor =>
  actorFor(stores.principals, stores.principals.createUser(name).id);

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
  'hex',
);

/** 복사본의 실체 경로. */
const bodyPathOf = (id: string, workspaceId: string) =>
  join(docsRoot, workspaceId, stores.nodes.pathOf(id));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-deepcopy-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  const files = new FsWorkspaceFiles(docsRoot);
  SRC = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  DST = (await createWorkspace({ workspaces: stores.workspaces, files }, '인사팀')).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-ACL-001 — 복사본의 ACL·첨부·링크', () => {
  it('AC-1 · AC-3: 새 노드 ID 를 받고 복사한 사람이 편집권을 갖는다', async () => {
    const 원본 = await place('회의록.md', null, SRC);
    const 복사하는사람 = user('복사하는사람');
    grantPermission(stores, root, { nodeId: 원본, principalId: 복사하는사람.id, level: 'view' });
    grantPermission(stores, root, { nodeId: DST, principalId: 복사하는사람.id, level: 'edit' });

    const copied = await copyNode(stores, 복사하는사람, 원본, { workspaceId: DST });

    expect(copied.ok).toBe(true);
    const id = idOf(copied);
    expect(id).not.toBe(원본);
    expect(permissionOf(stores, 복사하는사람, id)).toBe('edit');
  });

  it('AC-2: 원본의 ACL 항목은 따라오지 않는다', async () => {
    // 원본 항목을 복제하면 복사 한 번으로 남의 권한이 새 경계 안에 생긴다.
    const 원본 = await place('회의록.md', null, SRC);
    const 남 = user('남');
    grantPermission(stores, root, { nodeId: 원본, principalId: 남.id, level: 'edit' });

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    expect(stores.acl.entriesOn(id).map((e) => e.principalId)).not.toContain(남.id);
    expect(permissionOf(stores, 남, id)).toBeNull();
  });

  it('AC-2: 복사본은 대상 부모에서 상속한다', async () => {
    const 대상디렉토리 = dirNode('인사자료', null, DST);
    const 한범 = user('한범');
    grantPermission(stores, root, { nodeId: 대상디렉토리, principalId: 한범.id, level: 'view' });
    const 원본 = await place('회의록.md', null, SRC);

    const id = idOf(await copyNode(stores, root, 원본, { parentId: 대상디렉토리 }));

    expect(permissionOf(stores, 한범, id)).toBe('view');
  });

  it('본문이 함께 복사된다 — 노드만 서면 빈 문서가 생긴다', async () => {
    const 원본 = await place('회의록.md', null, SRC, '# 회의록\n내용이 있다\n');

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    expect(await readFile(bodyPathOf(id, DST), 'utf8')).toBe('# 회의록\n내용이 있다\n');
  });

  it('AC-4 · AC-5 · AC-6: 첨부가 대상 워크스페이스로 복제되고 링크는 그대로 해석된다', async () => {
    const 원본 = await place('회의록.md', null, SRC);
    const attached = await attachToDocument(stores, root, {
      nodeId: 원본,
      fileName: '설계도.png',
      bytes: PNG,
    });
    const link = (attached as { ok: true; link: string }).link;
    await writeFile(bodyPathOf(원본, SRC), `# 회의록\n![](${link})\n`, 'utf8');

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    // AC-5 — 링크 문자열이 바뀌지 않는다. 워크스페이스 기준 절대경로이고
    // 이름이 내용 해시라 재작성할 것이 없다.
    expect(await readFile(bodyPathOf(id, DST), 'utf8')).toContain(link);
    // 그리고 그 링크가 대상 워크스페이스에서 **실제로 해석된다**.
    expect(await readFile(join(docsRoot, DST, link))).toEqual(PNG);
    // AC-6 — 원본은 그대로 남는다.
    expect(await readFile(join(docsRoot, SRC, link))).toEqual(PNG);
  });

  it('AC-6: 원본과 복사본이 각자의 첨부 소유 행을 갖는다', async () => {
    const 원본 = await place('회의록.md', null, SRC);
    await attachToDocument(stores, root, { nodeId: 원본, fileName: '설계도.png', bytes: PNG });

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    expect(stores.attachments.listOf(원본)).toHaveLength(1);
    expect(stores.attachments.listOf(id)).toHaveLength(1);
    expect(stores.attachments.listOf(id)[0]?.workspaceId).toBe(DST);
  });

  it('AC-6: 원본 파일명이 복사본에도 따라간다', async () => {
    const 원본 = await place('회의록.md', null, SRC);
    await attachToDocument(stores, root, { nodeId: 원본, fileName: '2026 설계도.png', bytes: PNG });

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    expect(stores.attachments.listOf(id)[0]?.originalName).toBe('2026 설계도.png');
  });

  it('AC-7: 문서 간 위키링크는 그대로 남는다', async () => {
    // 이름 기반 해석이고 링크는 경계를 넘으므로 재작성 대상이 아니다.
    const 원본 = await place('회의록.md', null, SRC, '[[다른문서]] 를 본다\n');

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: DST }));

    expect(await readFile(bodyPathOf(id, DST), 'utf8')).toContain('[[다른문서]]');
  });
});

describe('SEC-SHELL-003 — 디렉토리 복사는 보이는 것만 복사한다', () => {
  it('AC-1: 요청자가 볼 수 없는 하위는 복사되지 않는다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    await place('공개.md', 본부, SRC);
    const 비공개 = await place('비공개.md', 본부, SRC);
    const 요청자 = user('요청자');
    grantPermission(stores, root, { nodeId: 본부, principalId: 요청자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: DST, principalId: 요청자.id, level: 'edit' });
    // 비공개 문서만 상속을 끊어 요청자에게서 감춘다.
    stores.nodes.setInheritance(비공개, false);

    const copied = await copyNode(stores, 요청자, 본부, { workspaceId: DST });

    const names = stores.nodes.allIn(DST).map((n) => n.name).sort();
    expect(names).toEqual(['공개.md', '본부']);
    // AC-4 — 요청자가 볼 수 있던 것만 센다. 원본 하위 전체 수가 아니다.
    expect((copied as { copied: number }).copied).toBe(2);
  });

  it('AC-2: 결과에 누락을 알리는 자리가 없다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    const 비공개 = await place('비공개.md', 본부, SRC);
    const 요청자 = user('요청자');
    grantPermission(stores, root, { nodeId: 본부, principalId: 요청자.id, level: 'view' });
    grantPermission(stores, root, { nodeId: DST, principalId: 요청자.id, level: 'edit' });
    stores.nodes.setInheritance(비공개, false);

    const copied = await copyNode(stores, 요청자, 본부, { workspaceId: DST });

    // 「제외됨」·「숨은 항목 N개」 같은 칸을 두면 그 값이 곧 숨은 노드의
    // 개수가 되어 이 요구가 무너진다. 자리 자체가 없어야 한다.
    expect(Object.keys(copied).sort()).toEqual(['copied', 'id', 'name', 'ok']);
  });

  it('AC-4: 숨은 것이 없을 때도 같은 모양으로 개수를 낸다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    await place('가.md', 본부, SRC);
    await place('나.md', 본부, SRC);

    const copied = await copyNode(stores, root, 본부, { workspaceId: DST });

    expect((copied as { copied: number }).copied).toBe(3);
  });

  it('서브트리가 구조를 유지한 채 복사된다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    const 하위 = dirNode('하위', 본부, SRC);
    await place('깊은문서.md', 하위, SRC);

    const id = idOf(await copyNode(stores, root, 본부, { workspaceId: DST }));

    const paths = stores.nodes
      .allIn(DST)
      .map((n) => stores.nodes.pathOf(n.id))
      .sort();
    expect(paths).toEqual(['본부', '본부/하위', '본부/하위/깊은문서.md']);
    expect(stores.nodes.pathOf(id)).toBe('본부');
  });

  it('AC-1: 휴지통에 든 하위는 슈퍼유저가 복사해도 따라오지 않는다', async () => {
    // 휴지통 노드는 트리에 없다 — 「보이지 않는다」가 권한이 아니라
    // 상태로 정해지는 자리이고, 그래서 관리 권한으로 뚫리지 않는다.
    const 본부 = dirNode('본부', null, SRC);
    await place('정상.md', 본부, SRC);
    const 버릴것 = await place('버린것.md', 본부, SRC);
    await moveToTrash(stores, root, 버릴것);

    const copied = await copyNode(stores, root, 본부, { workspaceId: DST });

    expect(stores.nodes.allIn(DST).map((n) => n.name).sort()).toEqual(['본부', '정상.md']);
    expect((copied as { copied: number }).copied).toBe(2);
  });

  it('AC-1: 점으로 시작하는 예약 자리도 따라오지 않는다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    await place('정상.md', 본부, SRC);
    // `createNode` 가 그 이름을 거부하므로 저장소로 직접 넣는다 — 관문이
    // 막으려는 것은 「만들 수 있는가」가 아니라 「이미 있는 것을 데려가는가」다.
    stores.nodes.create({ workspaceId: SRC, parentId: 본부, kind: 'directory', name: '.obsidian' });

    await copyNode(stores, root, 본부, { workspaceId: DST });

    expect(stores.nodes.allIn(DST).map((n) => n.name).sort()).toEqual(['본부', '정상.md']);
  });

  it('실체가 사라진 노드(tombstone)는 트리에 서므로 따라온다 — 어느 요구도 이 축을 정하지 않았다', async () => {
    // `listChildren` 이 거르는 것은 휴지통과 점 이름뿐이고 tombstone 은
    // 트리에 남는다(재조정 대기열이 그것을 사람에게 보여야 하기 때문이다).
    // 그래서 복사도 그것을 데려간다. 복사본은 실체가 없는 채로 서고,
    // 대상 워크스페이스의 다음 재조정이 그것을 다시 tombstone 으로 잡아
    // 대기열에 올린다 — 조용히 사라지지 않는다.
    //
    // **이것을 막아야 하는지는 어느 AC 도 정하지 않았다.** 규칙을 여기서
    // 지어내지 않고 관측된 거동을 고정해 둔다 — 정하게 되면 이 시험이
    // 먼저 깨진다.
    const 본부 = dirNode('본부', null, SRC);
    await place('정상.md', 본부, SRC);
    const 유실 = await place('유실.md', 본부, SRC);
    stores.nodes.markOrphaned(유실, new Date().toISOString());

    await copyNode(stores, root, 본부, { workspaceId: DST });

    expect(stores.nodes.allIn(DST).map((n) => n.name).sort()).toEqual(
      ['본부', '유실.md', '정상.md'],
    );
  });
});

describe('복사 게이트는 그대로다', () => {
  it('목적지에 편집이 없으면 거부된다', async () => {
    const 원본 = await place('회의록.md', null, SRC);
    const 열람자 = user('열람자');
    grantPermission(stores, root, { nodeId: 원본, principalId: 열람자.id, level: 'view' });

    expect((await copyNode(stores, 열람자, 원본, { workspaceId: DST })).ok).toBe(false);
  });

  it('워크스페이스를 지정하지 않으면 원본의 것을 쓴다', async () => {
    const 원본 = await place('회의록.md', null, SRC);

    const id = idOf(await copyNode(stores, root, 원본, { workspaceId: SRC }));

    expect(stores.nodes.findById(id)?.workspaceId).toBe(SRC);
  });

  it('자기 하위로는 복사할 수 없다', async () => {
    const 본부 = dirNode('본부', null, SRC);
    const 하위 = dirNode('하위', 본부, SRC);

    expect((await copyNode(stores, root, 본부, { parentId: 하위 })).ok).toBe(false);
  });
});
