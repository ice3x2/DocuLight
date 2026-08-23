import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  breakInheritance,
  grantPermission,
  restoreInheritance,
  revokePermission,
} from '../../../src/app/acl/grant-service.js';
import type { Actor } from '../../../src/app/acl/permission-service.js';
import { NODE_CREATE, NODE_MOVE, createNode, moveNode } from '../../../src/app/node/node-service.js';
import { addGroupMember, removeFromGroup, setAccountStatus } from '../../../src/app/principal/principal-service.js';
import { NODE_RESTORE, moveToTrash, restoreFromTrash } from '../../../src/app/trash/trash-service.js';
import { WORKSPACE_CREATE, createWorkspaceAs } from '../../../src/app/workspace/create-workspace.js';
import { issueToken, revokeToken } from '../../../src/app/auth/token-service.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { SqliteSessionRepository } from '../../../src/infra/sqlite/session-repository.js';
import { SqliteTokenRepository } from '../../../src/infra/sqlite/token-repository.js';
import { trashStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof trashStores> & {
  auditLog: SqliteAuditLog;
  tokens: SqliteTokenRepository;
  sessions: SqliteSessionRepository;
  files: FsWorkspaceFiles;
};
let root: Actor;
let ws: string;
let doc: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const wsIdOf = (r: unknown) => (r as { ok: true; workspace: { id: string } }).workspace.id;

/** 그 조작이 남긴 행들. 인스턴스 스코프까지 본다. */
const rowsOf = (operation: string) =>
  stores.auditLog.inScope([ws], { includeInstance: true }).filter((row) => row.operation === operation);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-recorded-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  const base = trashStores(db, docsRoot);
  stores = {
    ...base,
    auditLog: new SqliteAuditLog(db),
    tokens: new SqliteTokenRepository(db),
    sessions: new SqliteSessionRepository(db),
    files: new FsWorkspaceFiles(docsRoot),
  };
  root = superuserActor(stores);
  ws = wsIdOf(await createWorkspaceAs(stores, root, { name: '기획팀', administratorId: root.id }));
  doc = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '회의록.md' }));
  const at = join(docsRoot, ws, stores.nodes.pathOf(doc));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, '# 본문\n', 'utf8');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OBS-AUDIT-001 AC-2 — 원장이 예시로 든 조작들이 행을 남긴다', () => {
  it('ACL 부여와 회수', () => {
    const 한범 = stores.principals.createUser('한범');
    // 워크스페이스 생성 시점의 관리자 지정도 부여 행을 남기므로 증분으로
    // 잰다 — 절댓값으로 재면 그 행이 하나 늘 때마다 이 시험이 깨진다.
    const 전 = rowsOf('acl.grant').length;

    const 부여 = grantPermission(stores, root, { nodeId: doc, principalId: 한범.id, level: 'view' });
    expect(rowsOf('acl.grant')).toHaveLength(전 + 1);

    revokePermission(stores, root, (부여 as { ok: true; entryId: string }).entryId);
    expect(rowsOf('acl.revoke')).toHaveLength(1);
  });

  it('상속 끊기와 되돌리기', () => {
    const 방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '설계' }));

    breakInheritance(stores, root, 방);
    restoreInheritance(stores, root, 방);

    // 「누가 그 노드에 도달하는가」가 두 번 바뀌었다 — 기준 ② 다.
    expect(rowsOf('acl.break-inheritance')).toHaveLength(1);
    expect(rowsOf('acl.restore-inheritance')).toHaveLength(1);
  });

  it('그룹 멤버십 변경', () => {
    const 한범 = stores.principals.createUser('한범');
    const 기획 = stores.principals.createGroup('기획팀원');

    const 기록 = { audit: stores.audit, actor: root.id };
    addGroupMember(stores.principals, 기획.id, 한범.id, 기록);
    removeFromGroup(stores, 기획.id, 한범.id, 기록);

    expect(rowsOf('principal.member-add')).toHaveLength(1);
    expect(rowsOf('principal.member-remove')).toHaveLength(1);
  });

  it('계정 상태 전환 — 이전값과 이후값이 함께 남는다', () => {
    const 한범 = stores.principals.createUser('한범');

    setAccountStatus(stores, 한범.id, 'suspended', { audit: stores.audit, actor: root.id });

    const [행] = rowsOf('principal.status');
    expect(행).toMatchObject({ subjectId: 한범.id, beforeValue: 'active', afterValue: 'suspended' });
  });

  it('PAT 발급과 폐기', () => {
    const issued = issueToken(stores, root.id, {
      owner: root.id,
      name: '내 토큰',
      scope: 'read-only',
      expiresInDays: 30,
    });

    expect(rowsOf('pat.issue')).toHaveLength(1);

    revokeToken(stores, root.id, (issued as { ok: true; id: string }).id);
    expect(rowsOf('pat.revoke')).toHaveLength(1);
  });

  it('영구 삭제', async () => {
    await moveToTrash(stores, root, doc);
    const { purgeFromTrash } = await import('../../../src/app/trash/trash-service.js');

    await purgeFromTrash(stores, root, doc);

    expect(rowsOf('node.purge')).toHaveLength(1);
  });
});

describe('OBS-AUDIT-005 — 기준으로 재도출된 조작들', () => {
  it('AC-1: 노드 생성', () => {
    createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'file', name: '새것.md' });

    // 앞선 `doc` 생성까지 두 건이다 — 생성마다 1행이라는 뜻이다.
    expect(rowsOf(NODE_CREATE).length).toBeGreaterThanOrEqual(2);
  });

  it('AC-3: 이동 — 위치 변화를 이전값·이후값이 담고 상대 노드는 빈다', () => {
    const 방 = idOf(createNode(stores, root, { workspaceId: ws, parentId: null, kind: 'directory', name: '설계' }));

    moveNode(stores, root, doc, 방);

    const [행] = rowsOf(NODE_MOVE);
    expect(행).toMatchObject({ nodeId: doc, beforeValue: '회의록.md', afterValue: '설계/회의록.md' });
    // 이동은 노드 ID 를 보존하는 1-노드 조작이다 (`DR-AUDIT-003` AC-2).
    expect(행!.counterpartNodeId).toBeUndefined();
    expect(행!.targetRole).toBeUndefined();
  });

  it('AC-4 · AC-5: 삭제와 휴지통 복구가 짝으로 남는다', async () => {
    await moveToTrash(stores, root, doc);
    await restoreFromTrash(stores, root, doc);

    expect(rowsOf('node.trash')).toHaveLength(1);
    const [복구] = rowsOf(NODE_RESTORE);
    // 복구도 노드 ID 를 보존한다 (`DR-AUDIT-003` AC-4).
    expect(복구).toMatchObject({ nodeId: doc });
    expect(복구!.counterpartNodeId).toBeUndefined();
  });

  it('AC-6: 업로드가 생성에 흡수되고 별도 조작명이 없다', () => {
    const 값들 = stores.auditLog.operationsInScope([ws], { includeInstance: true });

    expect(값들.filter((one) => one.includes('upload'))).toEqual([]);
  });

  it('AC-8: 워크스페이스 생성', () => {
    expect(rowsOf(WORKSPACE_CREATE)).toHaveLength(1);
  });

  it('AC-9: 생성 폼의 관리자 지정과 default 초기 권한이 각각 부여 행을 남긴다', async () => {
    const 관리자 = stores.principals.createUser('영업관리자');

    const 새워크스페이스 = wsIdOf(
      await createWorkspaceAs(stores, root, {
        name: '영업팀',
        administratorId: 관리자.id,
        defaultGroupLevel: 'view',
      }),
    );

    const 부여 = stores.auditLog
      .inScope([새워크스페이스])
      .filter((row) => row.operation === 'acl.grant');
    // 관리자 지정 1건 + default 초기 권한 1건. 묶어서 1행으로 남기면 어느
    // 주체가 무엇을 받았는지 담을 수 없다.
    expect(부여).toHaveLength(2);
    expect(부여.map((row) => row.level).sort()).toEqual(['admin', 'view']);
  });
});

describe('OBS-AUDIT-009 — 동반 삭제되는 첨부는 행을 만들지 않는다', () => {
  it('AC-1 · AC-2 · AC-5: 영구 삭제 1행이 전부다', async () => {
    const { purgeFromTrash } = await import('../../../src/app/trash/trash-service.js');
    await moveToTrash(stores, root, doc);

    await purgeFromTrash(stores, root, doc);

    expect(rowsOf('node.purge')).toHaveLength(1);
    // 첨부 해시 같은 노드 아닌 값이 대상 칸에 오지 않는다.
    expect(rowsOf('node.purge')[0]!.nodeId).toBe(doc);
    expect(stores.auditLog.operationsInScope([ws]).filter((one) => one.includes('attach'))).toEqual([]);
  });
});
