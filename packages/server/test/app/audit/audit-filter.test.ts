import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { auditView } from '../../../src/app/audit/audit-view.js';
import { NODE_COPY, NODE_CREATE, copyNode, createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { RECONCILE_OPERATION } from '../../../src/domain/reconciliation/vocabulary.js';
import { SYSTEM_RECONCILER } from '../../../src/domain/principal/system-principals.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 조작 필터가 **실제로 거르는가** (`SEC-AUDIT-005` AC-4 · `DR-AUDIT-001`
 * AC-8 · `IR-AUDIT-001`).
 *
 * 「필터가 없으니 놓칠 것도 없다」는 구조적 담보가 아니다 — 컨트롤이 죽어
 * 있으면 그 위의 모든 AC 가 공짜로 참이 된다.
 */

let dir: string;
let db: Database;
let docsRoot: string;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 기획: string;
let 영업: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 워크스페이스 = async (name: string) =>
  (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, name)).id;

/** 목적지 디렉토리. */
const 방 = (workspaceId: string, name: string) =>
  idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'directory', name }));

/** 실체 파일까지 갖춘 문서 — 복사가 본문을 옮기므로 자리가 있어야 한다. */
const 문서 = async (workspaceId: string, name: string) => {
  const id = idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));
  const at = join(docsRoot, workspaceId, stores.nodes.pathOf(id));
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, '# 본문\n', 'utf8');
  return id;
};

const 조작들 = (view: { groups: readonly { operation: string }[] }) =>
  [...new Set(view.groups.map((group) => group.operation))].sort();

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-filter-'));
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

describe('SEC-AUDIT-005 — 조작=복사 필터가 두 경우를 모두 잡는다', () => {
  it('AC-4: 내부 복사와 경계를 넘는 복사가 같은 필터에 걸린다', async () => {
    const 안 = await 문서(기획, '안.md');
    const 밖 = await 문서(기획, '밖.md');

    expect((await copyNode(stores, root, 안, { parentId: 방(기획, '보관') })).ok).toBe(true);
    expect((await copyNode(stores, root, 밖, { workspaceId: 영업 })).ok).toBe(true);

    const 걸린것 = auditView(stores, root, { operation: NODE_COPY })!;

    // 경계를 넘는 복사는 두 행(원본 자리·사본 자리)이고 내부 복사는 한
    // 행이다 — 필터가 절반만 잡으면 그 수가 줄어든다.
    expect(조작들(걸린것)).toEqual([NODE_COPY]);
    expect(걸린것.groups.flatMap((group) => group.rows)).toHaveLength(3);
  });

  it('AC-4: 필터를 걸어도 선택지 목록은 줄지 않는다', async () => {
    const 회의록 = await 문서(기획, '회의록.md');
    await copyNode(stores, root, 회의록, { parentId: 방(기획, '보관') });

    const 전체 = auditView(stores, root)!.operations;
    const 걸린것 = auditView(stores, root, { operation: NODE_COPY })!;

    // 선택지가 결과에서 오면 하나를 고른 순간 나머지가 사라져 되돌아갈
    // 수 없다 — 선택지는 언제나 낱행 전체의 distinct 집합이다.
    expect([...걸린것.operations].sort()).toEqual([...전체].sort());
    expect(전체.length).toBeGreaterThan(1);
  });

  it('AC-4: 선택지 질의에 조작 조건 자체를 넘기지 않는다', () => {
    // 위 시험은 지금의 저장소가 그 인자를 무시하기 때문에도 통과한다.
    // 여기서 재는 것은 **넘기는가** 다 — 저장소가 나중에 그 인자를
    // 존중하게 되는 순간 선택지가 조용히 줄어든다.
    const 받은것: unknown[] = [];
    const 원래 = stores.auditLog.operationsInScope.bind(stores.auditLog);
    stores.auditLog.operationsInScope = (ids, options) => {
      받은것.push(options);
      return 원래(ids, options);
    };

    auditView(stores, root, { operation: NODE_COPY });

    expect(받은것).toHaveLength(1);
    expect(Object.keys(받은것[0] as object)).toEqual(['includeInstance']);
  });
});

describe('DR-AUDIT-001 — 조작=생성 필터가 재조정이 만든 노드를 놓치지 않는다', () => {
  it('AC-8: 재조정이 쓰는 생성 조작명이 사람이 만든 것과 같은 값이다', () => {
    // 값이 갈리면 「생성」 필터가 둘 중 하나만 잡고, 어느 쪽을 놓쳤는지는
    // 필터를 두 번 걸어 본 사람만 안다.
    expect(RECONCILE_OPERATION.create).toBe(NODE_CREATE);
  });

  it('AC-8: 사람이 만든 노드와 재조정이 만든 노드가 한 필터에 함께 걸린다', () => {
    createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '사람.md' });
    stores.audit.append({
      operation: RECONCILE_OPERATION.create,
      actor: SYSTEM_RECONCILER,
      workspaceId: 기획,
    });

    const 걸린것 = auditView(stores, root, { operation: NODE_CREATE })!;

    expect(new Set(걸린것.groups.flatMap((group) => group.rows).map((row) => row.actor))).toEqual(
      new Set([root.id, SYSTEM_RECONCILER]),
    );
  });
});

describe('IR-AUDIT-001 — 필터는 스코프를 넓히지 않는다', () => {
  it('AC-1: 거른 결과도 열람 스코프 안의 행만 담는다', () => {
    const 영업문서 = idOf(
      createNode(stores, root, { workspaceId: 영업, parentId: null, kind: 'file', name: '영업.md' }),
    );
    createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '기획.md' });

    const 사람 = stores.principals.createUser('기획관리자');
    grantPermission(stores, root, { nodeId: 기획, principalId: 사람.id, level: 'admin' });
    const 관리자 = actorFor(stores.principals, 사람.id);

    const 걸린것 = auditView(stores, 관리자, { operation: NODE_CREATE })!;

    expect(걸린것.groups.flatMap((group) => group.rows).map((row) => row.target)).not.toContain(
      stores.nodes.pathOf(영업문서),
    );
  });
});
