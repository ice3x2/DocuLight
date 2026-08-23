import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reachedDescendants } from '../../../src/app/confirm/reach-service.js';
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

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const 문서 = (parentId: string | null, name: string) =>
  idOf(createNode(stores, root, { workspaceId: ws, parentId, kind: 'file', name }));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-reach-'));
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
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('FR-CONFIRM-012 — 적용 하위 노드 수', () => {
  it('AC-1 · AC-2: 상속으로 도달하는 하위만 센다', () => {
    문서(폴더, '가.md');
    문서(폴더, '나.md');

    expect(reachedDescendants(stores, root, 폴더)).toBe(2);
  });

  it('AC-3: 상속이 끊긴 하위는 세지 않는다', () => {
    문서(폴더, '가.md');
    const 끊긴것 = 문서(폴더, '나.md');
    breakInheritance(stores, root, 끊긴것);

    // 그 노드에는 이 부여가 상속으로 닿지 않는다 — 세면 실행자가 실제보다
    // 넓은 영향을 보고 판단한다.
    expect(reachedDescendants(stores, root, 폴더)).toBe(1);
  });

  it('AC-3: 끊긴 노드의 하위도 함께 빠진다', () => {
    const 끊긴폴더 = idOf(
      createNode(stores, root, { workspaceId: ws, parentId: 폴더, kind: 'directory', name: '내부' }),
    );
    문서(끊긴폴더, '깊은.md');
    breakInheritance(stores, root, 끊긴폴더);

    expect(reachedDescendants(stores, root, 폴더)).toBe(0);
  });

  it('AC-4: 요청자가 볼 수 없는 노드는 세지 않는다', () => {
    문서(폴더, '가.md');
    문서(폴더, '나.md');
    const 남 = stores.principals.createUser('남');
    grantPermission(stores, root, { nodeId: 폴더, principalId: 남.id, level: 'edit' });
    const 남의것 = actorFor(stores.principals, 남.id);

    // 생성자 자동 부여로 root 만 두 문서를 직접 갖지만, 남은 폴더 편집으로
    // 상속받아 둘 다 본다 — 그래서 여기서는 둘이다.
    expect(reachedDescendants(stores, 남의것, 폴더)).toBe(2);
  });

  it('AC-4: 볼 수 없는 하위가 있으면 그만큼 줄어든다', () => {
    문서(폴더, '가.md');
    const 숨은것 = 문서(폴더, '나.md');
    breakInheritance(stores, root, 숨은것);
    const 남 = stores.principals.createUser('남');
    grantPermission(stores, root, { nodeId: 폴더, principalId: 남.id, level: 'edit' });

    // 끊긴 노드는 남에게 보이지 않고 이 부여도 닿지 않는다 — 두 사유가
    // 같은 답을 낸다.
    expect(reachedDescendants(stores, actorFor(stores.principals, 남.id), 폴더)).toBe(1);
  });

  it('워크스페이스도 컨테이너다 — 같은 방식으로 센다', () => {
    문서(null, '루트.md');
    문서(폴더, '가.md');

    // 폴더 자신과 두 문서.
    expect(reachedDescendants(stores, root, ws)).toBe(3);
  });

  it('문서 노드에는 하위가 없다', () => {
    const 하나 = 문서(폴더, '가.md');

    expect(reachedDescendants(stores, root, 하나)).toBe(0);
  });

  it('SEC-CONFIRM-003: 분모나 미도달 건수를 함께 주지 않는다', () => {
    문서(폴더, '가.md');
    const 끊긴것 = 문서(폴더, '나.md');
    breakInheritance(stores, root, 끊긴것);

    // 값이 수 하나다 — 분모를 실을 자리가 없으면 「24 / 30」도
    // 「적용되지 않는 항목 N개」도 만들 수 없다.
    expect(typeof reachedDescendants(stores, root, 폴더)).toBe('number');
  });
});
