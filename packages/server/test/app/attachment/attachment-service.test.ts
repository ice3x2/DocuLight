import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { grantPermission, revokePermission } from '../../../src/app/acl/grant-service.js';
import { createNode, moveNode } from '../../../src/app/node/node-service.js';
import {
  attachToDocument,
  openAttachment,
  rebuildAttachmentIndex,
  uploadLimitBytes,
} from '../../../src/app/attachment/attachment-service.js';
import { moveToTrash, purgeFromTrash } from '../../../src/app/trash/trash-service.js';
import type { AttachmentStores } from '../../../src/app/attachment/attachment-service.js';
import { writeSetting } from '../../../src/app/settings/instance-settings.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import {
  RESOURCE_DIRECTORY,
  RESOURCE_INDEX,
  resourcePathOf,
} from '../../../src/domain/attachment/resource-layout.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';
import type { TrashStores } from '../../../src/app/trash/trash-service.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: AttachmentStores & TrashStores;
let root: Actor;
let ws: string;
let doc: string;
let me: Actor;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const PNG = Buffer.from('\x89PNG\r\n\x1a\n fake image bytes', 'binary');

const attach = (actor: Actor, over: Partial<{ nodeId: string; name: string; bytes: Buffer }> = {}) =>
  attachToDocument(stores, actor, {
    nodeId: over.nodeId ?? doc,
    fileName: over.name ?? '그림.png',
    bytes: over.bytes ?? PNG,
  });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-attach-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  ws = (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')).id;
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  await writeFile(join(docsRoot, ws, stores.nodes.pathOf(doc)), '# 회의록\n', 'utf8');
  me = actorFor(stores.principals, stores.principals.createUser('한범').id);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-ATTACH-001 — .res 해시 저장 레이아웃', () => {
  it('AC-1 · AC-2 · AC-3: 워크스페이스 루트의 .res 아래 해시 이름으로, 앞 2글자를 서브디렉토리로 갖는다', async () => {
    const done = await attach(root);
    expect(done.ok).toBe(true);

    const { hash } = done as { ok: true; hash: string };
    const path = resourcePathOf(join(docsRoot, ws), hash, 'png');

    expect(path).toContain(`${RESOURCE_DIRECTORY}/${hash.slice(0, 2)}/`);
    expect(await readFile(path)).toEqual(PNG);
  });

  it('AC-2: 저장된 이름에 원본 파일명이 남지 않는다', async () => {
    const done = await attach(root, { name: '기밀-급여명세.png' });
    const { hash } = done as { ok: true; hash: string };

    // 파일명이 남으면 디렉토리 목록만으로 내용이 짐작된다.
    expect(resourcePathOf(join(docsRoot, ws), hash, 'png')).not.toContain('급여');
  });

  it('AC-4: 이미지가 아닌 바이너리도 같은 규칙이다', async () => {
    const done = await attach(root, { name: '설계.zip', bytes: Buffer.from('PK\x03\x04zip', 'binary') });
    const { hash } = done as { ok: true; hash: string };

    expect(await readFile(resourcePathOf(join(docsRoot, ws), hash, 'zip'))).toEqual(
      Buffer.from('PK\x03\x04zip', 'binary'),
    );
  });

  it('AC-5: 첨부가 소유 문서와 같은 디렉토리에 놓이지 않는다', async () => {
    const sub = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));
    const inner = idOf(createNode(stores, root, { workspaceId: ws, parentId: sub, kind: 'file', name: '안.md' }));
    await mkdir(join(docsRoot, ws, stores.nodes.pathOf(sub)), { recursive: true });
    await writeFile(join(docsRoot, ws, stores.nodes.pathOf(inner)), '# 안\n', 'utf8');

    const done = await attach(root, { nodeId: inner });
    const { hash } = done as { ok: true; hash: string };

    // 같은 자리에 두면 문서를 옮길 때 첨부도 따라 움직여야 하고, 그러면
    // 본문의 링크가 전부 낡는다.
    expect(resourcePathOf(join(docsRoot, ws), hash, 'png')).not.toContain('회의/');
  });

  it('같은 내용을 두 번 올리면 같은 자리를 쓴다 — 해시가 이름이라는 것이 그 뜻이다', async () => {
    const first = (await attach(root)) as { ok: true; hash: string };
    const second = (await attach(root)) as { ok: true; hash: string };

    expect(second.hash).toBe(first.hash);
  });
});

describe('DR-ATTACH-002 — 소유 문서 메타데이터', () => {
  it('AC-1 · AC-2: 다섯 값이 채워지고 소유가 삽입한 문서다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    const [row] = stores.attachments.listOf(doc);

    expect(row).toMatchObject({ hash: done.hash, ownerNodeId: doc, workspaceId: ws });
    expect(row!.size).toBe(PNG.byteLength);
    expect(typeof row!.createdAt).toBe('string');
  });

  it('AC-3 · FR-STORAGE-008 AC-4: 소유 문서를 옮겨도 소유 노드 ID 가 그대로다', async () => {
    await attach(root);
    const other = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }));

    moveNode(stores, root, doc, other);

    expect(stores.attachments.listOf(doc).map((a) => a.ownerNodeId)).toEqual([doc]);
  });
});

describe('DR-ATTACH-003 — 본문 링크는 워크스페이스 기준 절대경로다', () => {
  it('AC-1: 삽입되는 링크가 워크스페이스 기준 절대경로다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string; link: string };

    expect(done.link.startsWith('/')).toBe(true);
    expect(done.link).toContain(RESOURCE_DIRECTORY);
    expect(done.link).toContain(done.hash);
  });

  it('AC-2 · FR-STORAGE-008 AC-2: 문서를 옮겨도 서버가 본문을 재작성하지 않는다', async () => {
    const done = (await attach(root)) as { ok: true; link: string };
    const body = `# 회의록\n\n![](${done.link})\n`;
    const before = join(docsRoot, ws, stores.nodes.pathOf(doc));
    await writeFile(before, body, 'utf8');
    const other = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '보관' }));

    moveNode(stores, root, doc, other);

    // 이동 전 자리의 바이트를 본다 — 실물 파일을 옮기는 축은 이 wave 의
    // 배정이 아니고, 이 AC 가 말하는 것은 「서버가 이동을 이유로 본문을
    // 고쳐 쓰지 않는다」이다.
    expect(await readFile(before, 'utf8')).toBe(body);
  });

  it('AC-2: 링크에 소유 문서의 경로가 없다 — 그래서 이동이 링크를 낡게 만들 수 없다', async () => {
    const sub = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '회의' }));
    const inner = idOf(createNode(stores, root, { workspaceId: ws, parentId: sub, kind: 'file', name: '안.md' }));
    await mkdir(join(docsRoot, ws, stores.nodes.pathOf(sub)), { recursive: true });
    await writeFile(join(docsRoot, ws, stores.nodes.pathOf(inner)), '# 안\n', 'utf8');

    const done = (await attach(root, { nodeId: inner })) as { ok: true; link: string };

    // 상대경로였다면 문서를 옮기는 순간 낡고, 낡은 사실은 그 문서를 열
    // 때까지 드러나지 않는다.
    expect(done.link).not.toContain('회의');
    expect(done.link).not.toContain('안.md');
  });
});

describe('SEC-ATTACH-001 · FR-ATTACH-004 — 업로드 권한', () => {
  it('AC-3: 디렉토리 편집 권한이 없어도 문서 편집 권한만으로 붙여넣기가 된다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'edit' });

    expect((await attach(actorFor(stores.principals, me.id))).ok).toBe(true);
  });

  it('AC-4: 대상 문서에 편집 권한이 없으면 거부된다', async () => {
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    expect(await attach(actorFor(stores.principals, me.id))).toMatchObject({ ok: false, rule: 'forbidden' });
  });

  it('권한 없는 요청자의 업로드는 실물도 남기지 않는다', async () => {
    const done = await attach(actorFor(stores.principals, me.id));

    expect(done.ok).toBe(false);
    await expect(readFile(join(docsRoot, ws, RESOURCE_DIRECTORY, RESOURCE_INDEX), 'utf8')).rejects.toThrow();
  });
});

describe('FR-ATTACH-006 — 크기 제한', () => {
  it('AC-1: 제한은 설정에서 온다', () => {
    expect(uploadLimitBytes(stores)).toBe(104857600);

    writeSetting(stores.settings, 'upload-size-limit-bytes', '10');

    expect(uploadLimitBytes(stores)).toBe(10);
  });

  it('AC-2: 초과분은 거부되고 파일이 생기지 않는다', async () => {
    writeSetting(stores.settings, 'upload-size-limit-bytes', '5');

    const done = await attach(root);

    expect(done).toMatchObject({ ok: false, rule: 'too-large' });
    expect(stores.attachments.listOf(doc)).toEqual([]);
  });

  it('AC-3: 제한 이하면 성공한다', async () => {
    writeSetting(stores.settings, 'upload-size-limit-bytes', String(PNG.byteLength));

    expect((await attach(root)).ok).toBe(true);
  });
});

describe('SEC-ATTACH-002 · SEC-ATTACH-003 — 열람은 소유 문서의 보기 권한이다', () => {
  it('AC-1: 소유 문서를 볼 수 있으면 첨부도 열린다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });

    const opened = await openAttachment(stores, actorFor(stores.principals, me.id), { workspaceId: ws, hash: done.hash });

    expect(opened.ok).toBe(true);
  });

  it('AC-2 · AC-3: 소유 문서를 볼 수 없으면 해시를 알아도 거부된다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };

    // 해시를 그대로 쥐여 준다 — 「추측 불가」를 통제 수단으로 삼지 않는다는
    // 것이 SEC-ATTACH-003 의 내용이다.
    const opened = await openAttachment(stores, actorFor(stores.principals, me.id), { workspaceId: ws, hash: done.hash });

    expect(opened.ok).toBe(false);
  });

  it('AC-5: 다른 문서가 링크로 참조해도 판정 기준은 원 소유 문서다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    const quoting = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '인용.md' }));
    grantPermission(stores, root, { nodeId: quoting, principalId: me.id, level: 'view' });

    const opened = await openAttachment(stores, actorFor(stores.principals, me.id), { workspaceId: ws, hash: done.hash });

    // 참조로 권한이 옮겨가면 누구든 링크를 적어 남의 첨부를 열 수 있다.
    expect(opened.ok).toBe(false);
  });

  it('SEC-ATTACH-003 AC-2: 권한을 잃으면 같은 URL 이 거부된다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    const granted = grantPermission(stores, root, { nodeId: doc, principalId: me.id, level: 'view' });
    expect(granted.ok).toBe(true);
    expect((await openAttachment(stores, actorFor(stores.principals, me.id), { workspaceId: ws, hash: done.hash })).ok).toBe(true);

    revokePermission(stores, root, (granted as { ok: true; entryId: string }).entryId);

    expect((await openAttachment(stores, actorFor(stores.principals, me.id), { workspaceId: ws, hash: done.hash })).ok).toBe(false);
  });
});

describe('FR-ATTACH-005 — 소유 문서 영구 삭제 시 동반 삭제', () => {
  it('AC-1 · AC-2: 문서를 영구 삭제하면 행과 실물이 함께 사라진다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    const path = resourcePathOf(join(docsRoot, ws), done.hash, 'png');
    await moveToTrash(stores, root, doc);

    // 함수를 직접 부르지 않고 **영구 삭제 경로**를 탄다 — 함수만 재면
    // 그 함수가 아무 데서도 불리지 않아도 시험이 통과한다.
    expect((await purgeFromTrash(stores, root, doc)).ok).toBe(true);

    expect(stores.attachments.listOf(doc)).toEqual([]);
    await expect(readFile(path)).rejects.toThrow();
  });

  it('AC-3: 휴지통으로 보내기만 하면 첨부는 남는다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    const path = resourcePathOf(join(docsRoot, ws), done.hash, 'png');

    await moveToTrash(stores, root, doc);

    // 복구할 수 있는 상태에서 첨부를 지우면 복구된 문서가 깨져서 돌아온다.
    expect(stores.attachments.listOf(doc).map((a) => a.hash)).toEqual([done.hash]);
    expect(await readFile(path)).toEqual(PNG);
  });
});

describe('REL-ATTACH-001 — .res/index.json 재구성 사이드카', () => {
  it('AC-1: 업로드가 성공하면 해시 → 소유 문서 항목이 더해진다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };

    const index = JSON.parse(await readFile(join(docsRoot, ws, RESOURCE_DIRECTORY, RESOURCE_INDEX), 'utf8'));

    expect(index[done.hash]).toMatchObject({ ownerNodeId: doc });
  });

  it('AC-2: DB 를 비워도 .res 만으로 소유 관계를 되세운다', async () => {
    const done = (await attach(root)) as { ok: true; hash: string };
    stores.attachments.removeAllOf(doc);
    expect(stores.attachments.listOf(doc)).toEqual([]);

    await rebuildAttachmentIndex(stores, ws);

    expect(stores.attachments.listOf(doc).map((a) => a.hash)).toEqual([done.hash]);
  });
});
