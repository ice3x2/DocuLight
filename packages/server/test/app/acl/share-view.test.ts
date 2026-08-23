import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { shareView } from '../../../src/app/acl/share-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let ws: string;
let 폴더: string;
let 문서: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-share-'));
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
  폴더 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '설계' }));
  문서 = idOf(createNode(stores, root, { workspaceId: ws, parentId: 폴더, kind: 'file', name: '회의록.md' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const 사람 = (name: string) => stores.principals.createUser(name);

/** 그 노드에 관리를 받은 사람 — 목록은 관리 전용이다 (`SEC-ACL-015` AC-1). */
const 관리자 = (name: string) => {
  const made = 사람(name);
  grantPermission(stores, root, { nodeId: ws, principalId: made.id, level: 'admin' });
  return actorFor(stores.principals, made.id);
};

describe('IR-ACL-002 — 공유 모달은 상속 항목을 출처와 함께 보인다', () => {
  it('AC-1: 직접 항목과 상속 항목이 함께 온다', () => {
    const 직접 = 사람('직접이');
    const 위 = 사람('위에서');
    grantPermission(stores, root, { nodeId: 문서, principalId: 직접.id, level: 'view' });
    grantPermission(stores, root, { nodeId: 폴더, principalId: 위.id, level: 'edit' });

    const 목록 = shareView(stores, 관리자('보는이'), 문서)!.rows!;

    expect(목록.map((row) => row.principalName)).toEqual(
      expect.arrayContaining(['직접이', '위에서']),
    );
  });

  it('AC-2: 상속 항목에 그 항목이 부여된 조상의 경로가 붙는다', () => {
    const 위 = 사람('위에서');
    grantPermission(stores, root, { nodeId: 폴더, principalId: 위.id, level: 'edit' });

    const 상속 = shareView(stores, 관리자('보는이'), 문서)!.rows!.find(
      (row) => row.principalName === '위에서',
    )!;

    expect(상속.inherited).toBe(true);
    // 경로가 없으면 관리자가 어디를 고쳐야 하는지 알 수 없다.
    expect(상속.source).toBe('설계');
  });

  it('AC-3 · AC-4: 직접 항목은 상속으로 표시되지 않고 회수할 항목 ID 를 갖는다', () => {
    const 직접 = 사람('직접이');
    grantPermission(stores, root, { nodeId: 문서, principalId: 직접.id, level: 'view' });

    const 행 = shareView(stores, 관리자('보는이'), 문서)!.rows!.find(
      (row) => row.principalName === '직접이',
    )!;

    expect(행.inherited).toBe(false);
    expect(행.source).toBeNull();
    // 상속 항목에는 이 값이 없다 — 없으면 화면이 회수 버튼을 그릴 수 없다.
    expect(typeof 행.entryId).toBe('string');
  });

  it('AC-3: 상속 항목에는 회수할 항목 ID 가 실리지 않는다', () => {
    const 위 = 사람('위에서');
    grantPermission(stores, root, { nodeId: 폴더, principalId: 위.id, level: 'edit' });

    const 상속 = shareView(stores, 관리자('보는이'), 문서)!.rows!.find(
      (row) => row.principalName === '위에서',
    )!;

    // 여기서 지우면 조상을 바꾸는 것인지 이 노드에서만 빼는 것인지가
    // 모호해지고, 후자는 거부 규칙이라 모델이 금지한다.
    expect(상속.entryId).toBeNull();
  });

  it('AC-5: 상속 항목이 있든 없든 같은 모양으로 온다', () => {
    const 위 = 사람('위에서');
    const 보는이 = 관리자('보는이');
    const 없을때 = shareView(stores, 보는이, 문서)!;
    grantPermission(stores, root, { nodeId: 폴더, principalId: 위.id, level: 'edit' });
    const 있을때 = shareView(stores, 보는이, 문서)!;

    // 구조가 같아야 화면이 두 경우에 다른 코드를 타지 않는다.
    expect(Object.keys(없을때).sort()).toEqual(Object.keys(있을때).sort());
    expect(없을때.rows!.some((row) => row.principalName === '위에서')).toBe(false);
    expect(
      있을때.rows!.some((row) => row.principalName === '위에서' && row.inherited && row.source === '설계'),
    ).toBe(true);
    expect(Object.keys(있을때.rows![0]!).sort()).toEqual(Object.keys(없을때.rows![0]!).sort());
  });

  it('상속을 끊으면 위쪽 항목이 목록에서 빠진다', () => {
    const 위 = 사람('위에서');
    grantPermission(stores, root, { nodeId: 폴더, principalId: 위.id, level: 'edit' });
    breakInheritance(stores, root, 문서);

    const 이름 = shareView(stores, 관리자('보는이'), 문서)!.rows!.map((row) => row.principalName);

    expect(이름).not.toContain('위에서');
  });
});

describe('SEC-ACL-015 — 목록은 관리 전용이고 수치는 편집까지', () => {
  it('AC-1: 편집 보유자에게는 목록이 오지 않는다', () => {
    const 편집자 = 사람('편집자');
    grantPermission(stores, root, { nodeId: 문서, principalId: 편집자.id, level: 'edit' });

    const 본 = shareView(stores, actorFor(stores.principals, 편집자.id), 문서)!;

    expect(본.rows).toBeNull();
  });

  it('AC-5: 편집 보유자에게도 수치는 온다', () => {
    const 편집자 = 사람('편집자');
    grantPermission(stores, root, { nodeId: 문서, principalId: 편집자.id, level: 'edit' });

    const 본 = shareView(stores, actorFor(stores.principals, 편집자.id), 문서)!;

    expect(본.metrics.reachable).toBeGreaterThan(0);
  });

  it('AC-6: 목록을 대신할 부분 목록도 주지 않는다', () => {
    const 편집자 = 사람('편집자');
    grantPermission(stores, root, { nodeId: 문서, principalId: 편집자.id, level: 'edit' });

    const 본 = shareView(stores, actorFor(stores.principals, 편집자.id), 문서)!;

    // 이니셜·아바타·상위 몇 건 같은 대체 표시를 실을 칸 자체를 두지 않는다.
    expect(Object.keys(본).sort()).toEqual(['level', 'metrics', 'rows']);
  });

  it('보기만 가진 사람에게는 모달 자체가 없는 것과 같다', () => {
    const 구경꾼 = 사람('구경꾼');
    grantPermission(stores, root, { nodeId: 문서, principalId: 구경꾼.id, level: 'view' });

    expect(shareView(stores, actorFor(stores.principals, 구경꾼.id), 문서)).toBeNull();
  });

  it('없는 노드는 권한 없는 노드와 같은 답을 받는다', () => {
    expect(shareView(stores, root, '그런-노드-없음')).toBeNull();
  });
});

describe('IR-ACL-003 AC-5 — 같은 지정 방식을 문서와 디렉토리 양쪽에 쓴다', () => {
  it('디렉토리에도 같은 모양이 온다', () => {
    const 본 = shareView(stores, 관리자('보는이'), 폴더)!;

    expect(Object.keys(본).sort()).toEqual(['level', 'metrics', 'rows']);
  });
});
