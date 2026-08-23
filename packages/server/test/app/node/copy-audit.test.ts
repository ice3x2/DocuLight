import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NODE_COPY, copyNode, createNode } from '../../../src/app/node/node-service.js';
import { moveToTrash } from '../../../src/app/trash/trash-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { type Actor } from '../../../src/app/acl/permission-service.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof attachmentStores>;
let audit: SqliteAuditLog;
let root: Actor;
let 기획팀: string;
let 영업팀: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 워크스페이스 = async (name: string) =>
  (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, name)).id;

const 문서 = async (workspaceId: string, parentId: string | null, name: string) => {
  const id = idOf(createNode(stores, root, { workspaceId, parentId, kind: 'file', name }));
  const at = join(docsRoot, workspaceId, stores.nodes.pathOf(id));
  // 디렉토리 노드를 만들어도 실체 폴더는 서지 않는다 — 본문을 쓰려면 그
  // 자리를 여기서 마련한다.
  await mkdir(dirname(at), { recursive: true });
  await writeFile(at, '# 본문\n', 'utf8');
  return id;
};

const 방 = (workspaceId: string, parentId: string | null, name: string) =>
  idOf(createNode(stores, root, { workspaceId, parentId, kind: 'directory', name }));

const copyRows = (workspaceId: string) =>
  audit.inScope([workspaceId]).filter((row) => row.operation === NODE_COPY);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-copy-audit-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  audit = new SqliteAuditLog(db);
  root = superuserActor(stores);
  기획팀 = await 워크스페이스('기획팀');
  영업팀 = await 워크스페이스('영업팀');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('OBS-AUDIT-007 — 복사의 감사 행 수는 내부 1행 경계 2행이다', () => {
  it('AC-1 · AC-2: 내부 복사는 1행이고 그 행의 대상 역할이 사본이다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');
    const 상자 = 방(기획팀, null, '보관');

    await copyNode(stores, root, 원본, { parentId: 상자 });

    const rows = copyRows(기획팀);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetRole: 'copy', counterpartNodeId: 원본 });
    // 대상은 **사본**이지 원본이 아니다 — 뒤집히면 원본 노드의 이력에 사본
    // 생성이 쌓여 「이 노드가 무엇을 겪었나」가 어긋난다.
    expect(rows[0]!.nodeId).not.toBe(원본);
  });

  it('AC-6: 내부 복사가 같은 사실을 두 번 적지 않는다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');
    const 상자 = 방(기획팀, null, '보관');

    await copyNode(stores, root, 원본, { parentId: 상자 });

    // **먼저 남는다는 것부터 잰다** — 부재만 재면 `copyNode` 가 아무 행도
    // 남기지 않아도 통과한다.
    expect(copyRows(기획팀)).toHaveLength(1);
    expect(copyRows(기획팀)[0]).toMatchObject({ targetRole: 'copy' });
    // 원본 자리 행까지 만들면 같은 워크스페이스의 열람자가 복사 1건을
    // 2행으로 본다.
    expect(copyRows(기획팀).filter((row) => row.targetRole === 'origin')).toHaveLength(0);
  });

  it('AC-3 · AC-4 · AC-5: 경계를 넘는 복사는 2행이고 역할이 갈린다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');

    await copyNode(stores, root, 원본, { workspaceId: 영업팀 });

    const 원본쪽 = copyRows(기획팀);
    const 사본쪽 = copyRows(영업팀);
    expect(원본쪽).toHaveLength(1);
    expect(사본쪽).toHaveLength(1);
    expect(원본쪽[0]!.targetRole).toBe('origin');
    expect(사본쪽[0]!.targetRole).toBe('copy');
    // 한 행이 두 워크스페이스에 동시에 나타나지 않는다 (`SEC-AUDIT-001` AC-3).
    expect(원본쪽[0]!.id).not.toBe(사본쪽[0]!.id);
  });
});

describe('SEC-AUDIT-001 — 경계를 넘는 복사의 유출 감사', () => {
  it('AC-1 · AC-2: 각 워크스페이스가 자기 쪽 행을 본다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');

    await copyNode(stores, root, 원본, { workspaceId: 영업팀 });

    expect(copyRows(기획팀)[0]!.nodeId).toBe(원본);
    expect(copyRows(영업팀)[0]!.nodeId).not.toBe(원본);
  });

  it('AC-4 · AC-5: 두 행 모두에 복사 실행자가 남는다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');

    await copyNode(stores, root, 원본, { workspaceId: 영업팀 });

    expect(copyRows(기획팀)[0]!.actor).toBe(root.id);
    expect(copyRows(영업팀)[0]!.actor).toBe(root.id);
  });

  it('AC-3: 원본 쪽 행이 사본 워크스페이스의 목록에 섞이지 않는다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');

    await copyNode(stores, root, 원본, { workspaceId: 영업팀 });

    expect(copyRows(영업팀).map((row) => row.targetRole)).toEqual(['copy']);
  });
});

describe('SEC-AUDIT-005 · SEC-AUDIT-009 — 조작 값은 언제나 복사 하나다', () => {
  it('AC-1 · AC-2 · AC-3: 경계를 넘든 안 넘든 같은 값이다', async () => {
    const 안쪽 = await 문서(기획팀, null, '안쪽.md');
    const 바깥 = await 문서(기획팀, null, '바깥.md');
    const 상자 = 방(기획팀, null, '보관');

    await copyNode(stores, root, 안쪽, { parentId: 상자 });
    await copyNode(stores, root, 바깥, { workspaceId: 영업팀 });

    const 값들 = [
      ...audit.operationsInScope([기획팀]),
      ...audit.operationsInScope([영업팀]),
    ];
    // 「반출」·「외부 복사」 같은 경계를 드러내는 값이 없다 — 있으면 그 값의
    // 존재 자체가 경계를 넘은 복사가 있었다는 신호가 된다.
    expect(값들.filter((one) => one !== NODE_COPY && one.includes('copy'))).toEqual([]);
    expect(값들).toContain(NODE_COPY);
  });

  it('`SEC-AUDIT-009` AC-1: 역할이 조작 값에 결합되지 않는다', async () => {
    const 원본 = await 문서(기획팀, null, '회의록.md');
    await copyNode(stores, root, 원본, { workspaceId: 영업팀 });

    for (const 값 of [...audit.operationsInScope([기획팀]), ...audit.operationsInScope([영업팀])]) {
      expect(값).not.toContain('origin');
      expect(값).not.toContain('copy)');
    }
  });
});

describe('OBS-AUDIT-010 — 서브트리는 하위 노드마다 1행이다', () => {
  it('AC-2 · AC-3 · AC-4: 디렉토리 복사가 노드마다 행을 남기고 각 행이 출처를 담는다', async () => {
    const 상자 = 방(기획팀, null, '설계');
    const 하나 = await 문서(기획팀, 상자, '하나.md');
    const 둘 = await 문서(기획팀, 상자, '둘.md');
    const 받는곳 = 방(기획팀, null, '보관');

    await copyNode(stores, root, 상자, { parentId: 받는곳 });

    // 디렉토리 자신 + 하위 둘 = 3행. 1행으로 접히면 어느 문서가 어디서
    // 왔는지 노드 단위로 답할 수 없다.
    const rows = copyRows(기획팀);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.counterpartNodeId).sort()).toEqual([상자, 하나, 둘].sort());
  });

  it('AC-1 · AC-6: 디렉토리 삭제가 하위 노드마다 행을 남긴다', async () => {
    const 상자 = 방(기획팀, null, '설계');
    await 문서(기획팀, 상자, '하나.md');
    await 문서(기획팀, 상자, '둘.md');

    await moveToTrash(stores, root, 상자);

    const 삭제 = audit.inScope([기획팀]).filter((row) => row.operation === 'node.trash');
    // 서브트리 조작이 1행으로 접히면 「그 문서가 언제 누구에 의해 지워졌나」를
    // 문서 단위로 답할 수 없다.
    expect(삭제).toHaveLength(3);
  });
});
