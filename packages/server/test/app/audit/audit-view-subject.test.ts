import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditView } from '../../../src/app/audit/audit-view.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 감사 낱행의 **주체를 서버가 이름으로 푼다** (`IR-AUDIT-004` AC-3 · AC-5).
 *
 * 저장은 principal ID 다 (`DR-AUDIT-002` AC-8). 그 값을 그대로 응답에 실으면
 * 화면이 그릴 수 있는 것이 식별자뿐이고, 식별자를 이름으로 바꾸려면 낱행마다
 * 명부를 조회해야 한다 — `fetchPrincipals` 는 부여 대상 스코프를 반드시
 * 요구하므로(`R162`) 그 조회는 스코프 없는 명부 경로를 새로 여는 일이 된다.
 *
 * 그래서 푸는 자리가 서버다. 노드 참조를 경로로 푸는 `resolve` 가 같은
 * 함수 안에 이미 있고, 주체도 같은 규칙을 지난다.
 */

let dir: string;
let db: Database;
let stores: ReturnType<typeof nodeStores>;
let root: Actor;
let 기획팀: string;
let 회의록: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 이 시험이 넣은 조작만 골라 본다 — 준비가 남긴 행이 함께 있다. */
const 행 = (operation: string) =>
  auditView(stores, root)!.groups.flatMap((group) => group.rows).filter((row) => row.operation === operation);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-subject-'));
  const docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = nodeStores(db);
  root = superuserActor(stores);
  기획팀 = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;
  회의록 = idOf(createNode(stores, root, { workspaceId: 기획팀, parentId: null, kind: 'file', name: '회의록.md' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('IR-AUDIT-004 — 주체를 서버가 이름으로 푼다', () => {
  it('AC-3: 부여 낱행의 주체가 식별자가 아니라 이름으로 온다', () => {
    const 한범 = stores.principals.createUser('한범');

    grantPermission(stores, root, { nodeId: 회의록, principalId: 한범.id, level: 'view' });

    const [부여] = 행('acl.grant');

    expect(부여!.subject).toBe('한범');
    // 식별자가 그대로 새어 나오면 화면이 그것을 그리게 된다.
    expect(부여!.subject).not.toBe(한범.id);
  });

  it('AC-3: 그룹도 이름으로 풀린다 — 사람만 푸는 것이 아니다', () => {
    const 개발팀 = stores.principals.createGroup('개발팀');

    grantPermission(stores, root, { nodeId: 회의록, principalId: 개발팀.id, level: 'edit' });

    expect(행('acl.grant')[0]!.subject).toBe('개발팀');
  });

  it('AC-5: 이름을 풀 수 없는 주체는 저장된 식별자가 그대로 온다', () => {
    // 그룹은 지워질 수 있다 (`removeGroup`). 그때 그 그룹을 가리키는 옛
    // 감사 행이 남고, 이름은 더 이상 풀리지 않는다.
    const 사라진팀 = stores.principals.createGroup('사라질팀');
    grantPermission(stores, root, { nodeId: 회의록, principalId: 사라진팀.id, level: 'view' });
    stores.principals.removeGroup(사라진팀.id);

    // 지어낸 이름도, 고정 문구도 아니다 — 남은 사실은 식별자뿐이다.
    expect(행('acl.grant')[0]!.subject).toBe(사라진팀.id);
  });

  it('AC-6: 주체가 없는 조작의 낱행은 그 칸이 비어 있다', () => {
    // 노드 생성에는 「받은 사람」이 없다. 빈 칸을 자리표로 채우면 화면이
    // 없는 사실을 그리게 된다.
    expect(행('node.create')[0]!.subject).toBeUndefined();
  });

  it('레벨은 저장된 값 그대로 온다 — 이름 붙이기는 화면의 일이다', () => {
    const 한범 = stores.principals.createUser('한범');

    grantPermission(stores, root, { nodeId: 회의록, principalId: 한범.id, level: 'edit' });

    // 서버가 「편집」으로 바꿔 보내면 화면이 레벨로 판정할 수 없게 된다.
    expect(행('acl.grant')[0]!.level).toBe('edit');
  });
});
