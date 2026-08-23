import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { breakInheritance, grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { GATED_READ, readDocument } from '../../../src/app/document/save-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { SUPERUSER_GROUP_ID } from '../../../src/domain/principal/system-groups.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteVersionRepository } from '../../../src/infra/sqlite/version-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof nodeStores> & {
  auditLog: SqliteAuditLog;
  versions: SqliteVersionRepository;
  clock: () => Date;
  docsRoot: string;
};
let root: Actor;
let ws: string;
let 이어진방: string;
let 끊긴방: string;
let 이어진문서: string;
let 끊긴문서: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 문서 = async (parentId: string, name: string) => {
  const id = idOf(createNode(stores, root, { workspaceId: ws, parentId, kind: 'file', name }));
  const at = join(docsRoot, ws, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, '# 본문\n', 'utf8');
  return id;
};

const 열람행 = () => stores.auditLog.inScope([ws]).filter((row) => row.operation === GATED_READ);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-gated-read-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = {
    ...nodeStores(db),
    auditLog: new SqliteAuditLog(db),
    versions: new SqliteVersionRepository(db),
    clock: () => new Date(),
    docsRoot,
  };
  root = superuserActor(stores);
  ws = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;

  이어진방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '이어진방' }));
  끊긴방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '끊긴방' }));
  이어진문서 = await 문서(이어진방, '이어진.md');
  끊긴문서 = await 문서(끊긴방, '끊긴.md');
  breakInheritance(stores, root, 끊긴방);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 그 워크스페이스의 관리자. 노드에는 아무 항목도 갖지 않는다. */
const 관리자 = (name: string): Actor => {
  const user = stores.principals.createUser(name);
  grantPermission(stores, root, { nodeId: ws, principalId: user.id, level: 'admin' });
  return actorFor(stores.principals, user.id);
};

describe('OBS-ACL-001 — 관리 권한에 의한 열람을 남긴다', () => {
  it('AC-1: 상속이 이어진 노드도 끊긴 노드도 모두 대상이다', async () => {
    const 사람 = 관리자('기획관리자');

    await readDocument(stores, 사람, 이어진문서);
    await readDocument(stores, 사람, 끊긴문서);

    // 끊긴 노드로 한정하면 상속이 이어진 통상 경로 전체에서 이 기록이
    // 무발화한다 — 그것이 이 AC 가 한정을 걷어낸 이유다.
    expect(열람행().map((row) => row.nodeId).sort()).toEqual([이어진문서, 끊긴문서].sort());
  });

  it('AC-4: 슈퍼유저의 열람과 워크스페이스 관리자의 열람이 모두 남는다', async () => {
    const 감사자 = stores.principals.createUser('감사자');
    stores.principals.addMember(SUPERUSER_GROUP_ID, 감사자.id);

    await readDocument(stores, actorFor(stores.principals, 감사자.id), 이어진문서);
    await readDocument(stores, 관리자('기획관리자'), 이어진문서);

    expect(열람행()).toHaveLength(2);
    expect(new Set(열람행().map((row) => row.actor)).size).toBe(2);
  });

  it('AC-5: 자기 ACL 로 닿는 일반 열람은 남지 않는다', async () => {
    const 한범 = stores.principals.createUser('한범');
    grantPermission(stores, root, { nodeId: 이어진방, principalId: 한범.id, level: 'view' });

    await readDocument(stores, actorFor(stores.principals, 한범.id), 이어진문서);

    expect(열람행()).toHaveLength(0);
  });

  it('AC-5: 관리자라도 자기 항목으로 닿으면 그 열람은 남지 않는다', async () => {
    // 관리 권한을 **근거로 삼지 않은** 열람이다 — 그 사람은 편집 항목으로
    // 이미 닿으므로 게이트를 쓰지 않았다.
    const 사람 = 관리자('두겹관리자');
    grantPermission(stores, root, { nodeId: 이어진방, principalId: 사람.id, level: 'edit' });

    await readDocument(stores, 사람, 이어진문서);

    expect(열람행()).toHaveLength(0);
  });

  it('AC-2: 별도 저장소를 만들지 않고 감사 로그의 공통 스키마를 그대로 쓴다', async () => {
    await readDocument(stores, 관리자('기획관리자'), 이어진문서);

    const [행] = 열람행();
    // 공통 스키마의 칸으로만 이뤄진다 — 이 요구만의 칸이 붙지 않는다.
    // `id` 와 `correlationId` 는 모든 행이 갖는 기반 칸이며 조회 응답으로는
    // 나가지 않는다 (`DR-AUDIT-002` AC-7).
    expect(Object.keys(행!).sort()).toEqual(
      ['actor', 'correlationId', 'id', 'nodeId', 'occurredAt', 'operation', 'workspaceId'].sort(),
    );
  });

  it('AC-3: 볼 수 없는 사람의 시도는 열람이 아니므로 남지 않는다', async () => {
    const 구경꾼 = stores.principals.createUser('구경꾼');

    const 결과 = await readDocument(stores, actorFor(stores.principals, 구경꾼.id), 이어진문서);

    expect(결과.ok).toBe(false);
    expect(열람행()).toHaveLength(0);
  });
});
