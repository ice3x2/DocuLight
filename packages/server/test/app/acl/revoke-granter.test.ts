import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACL_REVOKE, revokePermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 회수 감사 행이 **그 항목을 준 사람**을 담는다 (`OBS-AUDIT-008` AC-3 ·
 * `SEC-ACL-010` AC-3).
 *
 * 부여자는 항목에만 살고 회수와 함께 사라진다. 회수 행이 그것을 옮겨 적지
 * 않으면 「누가 준 권한이 없어졌나」를 그 뒤로는 되짚을 수 없다.
 *
 * 담는 자리는 **이전값**이다. `subjectId` 는 권한을 받은 쪽이 이미 쓰고
 * 있고, `level` 은 ACL 레벨만 담으며(`DR-AUDIT-002` AC-8), 새 의미 칸을
 * 만드는 것은 AC-7 이 막는다. 이전값의 뜻과도 맞는다 — 회수로 사라지는 것이
 * 그 항목이고, 그 항목이 갖고 있던 사실이 부여자다.
 */

let dir: string;
let db: Database;
let docsRoot: string;
let stores: ReturnType<typeof nodeStores>;
let root: Actor;
let 기획: string;
let 회의록: string;
let 한범: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 회수행 = () =>
  stores.auditLog.inScope([기획], { includeInstance: true }).filter((row) => row.operation === ACL_REVOKE);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-revoke-granter-'));
  docsRoot = join(dir, 'docs');
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  기획 = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;
  회의록 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '회의록.md' }));
  한범 = stores.principals.createUser('한범').id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OBS-AUDIT-008 AC-3 — 회수 행이 부여자를 담는다', () => {
  it('부여자가 다른 두 항목의 회수가 서로 다른 부여자를 담은 2행을 남긴다', () => {
    const 선희 = stores.principals.createUser('선희').id;
    const 도윤 = stores.principals.createUser('도윤').id;

    // 같은 주체·같은 노드에 부여자가 다른 두 항목. `acl_entry_unique` 가
    // (노드·주체·레벨) 을 묶으므로 레벨이 갈려야 둘이 공존한다.
    const 읽기 = stores.acl.grant({ nodeId: 회의록, principalId: 한범, level: 'view', grantedBy: 선희 });
    const 편집 = stores.acl.grant({ nodeId: 회의록, principalId: 한범, level: 'edit', grantedBy: 도윤 });

    expect(revokePermission(stores, root, 읽기.id).ok).toBe(true);
    expect(revokePermission(stores, root, 편집.id).ok).toBe(true);

    const 행 = 회수행();

    // 1행으로 접으면 「선희가 준 것인가 도윤이 준 것인가」가 사라진다.
    expect(행).toHaveLength(2);
    expect(행.map((row) => row.beforeValue).sort()).toEqual([선희, 도윤].sort());
  });

  it('시스템이 준 항목의 회수 행은 부여자 자리가 빈다 — 사람 이름을 지어내지 않는다', () => {
    // 생성자 자동 부여는 `grantedBy` 가 `null` 이다 (`SEC-ACL-011` AC-3).
    const 시스템것 = stores.acl.grant({
      nodeId: 회의록,
      principalId: 한범,
      level: 'view',
      grantedBy: null,
    });

    expect(revokePermission(stores, root, 시스템것.id).ok).toBe(true);

    expect(회수행()[0]!.beforeValue).toBeUndefined();
  });

  it('회수한 사람과 준 사람이 갈린다 — 한 칸에 담으면 그 둘이 섞인다', () => {
    const 선희 = stores.principals.createUser('선희').id;
    const 항목 = stores.acl.grant({ nodeId: 회의록, principalId: 한범, level: 'view', grantedBy: 선희 });

    revokePermission(stores, root, 항목.id);

    const [행] = 회수행();

    expect(행!.actor).toBe(root.id);
    expect(행!.beforeValue).toBe(선희);
    // 받은 쪽은 그대로 주체 칸이다 — 셋이 서로 다른 축이다.
    expect(행!.subjectId).toBe(한범);
  });

  it('AC-6: 노드·주체로 좁힌 역질의가 낱행 하나로 답해진다', () => {
    // 앞 시험은 세 축이 서로 다른 칸에 남는지를 잰다. 이쪽이 재는 것은
    // **질의 가능성**이다 — 노드와 주체로 좁혔을 때 다른 노드의 회수가
    // 섞여 오지 않아야 한 사람이 어느 노드의 권한을 잃었는지 답이 된다.
    const 선희 = stores.principals.createUser('선희').id;
    const 다른문서 = idOf(
      createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '초안.md' }),
    );
    for (const node of [회의록, 다른문서]) {
      const 항목 = stores.acl.grant({ nodeId: node, principalId: 한범, level: 'view', grantedBy: 선희 });
      revokePermission(stores, actorFor(stores.principals, root.id), 항목.id);
    }

    const 역질의 = 회수행().filter((row) => row.nodeId === 회의록 && row.subjectId === 한범);

    expect(역질의).toHaveLength(1);
    expect(역질의[0]!.actor).toBe(root.id);
    expect(역질의[0]!.beforeValue).toBe(선희);
  });
});
