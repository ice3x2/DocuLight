import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Actor } from '../../../src/app/acl/permission-service.js';
import { auditView } from '../../../src/app/audit/audit-view.js';
import { NODE_COPY, NODE_CREATE, copyNode, createNode } from '../../../src/app/node/node-service.js';
import { NODE_TRASH, moveToTrash, sweepExpiredTrash } from '../../../src/app/trash/trash-service.js';
import { revokeAllFor } from '../../../src/app/acl/bulk-revoke-service.js';
import { ACL_GRANT, ACL_REVOKE } from '../../../src/app/acl/grant-service.js';
import { createWorkspaceAs } from '../../../src/app/workspace/create-workspace.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import type { AuditQuery, AuditRow } from '../../../src/domain/ports/audit-sink.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { attachmentStores, superuserActor } from '../../support/acl-fixture.js';

/**
 * 묶음 경계가 **기록 시점**에 정해진다 (`IR-AUDIT-003` AC-8 · AC-9 · 원장
 * `R164-c`).
 *
 * 개정 전 키는 「같은 초 · 같은 조작 · 같은 행위자」였다. `occurred_at` 이
 * 초 단위라 한 사람이 같은 초에 문서를 둘 만들면 그 둘이 한 줄로 접혀,
 * 열람자가 조작 하나가 일어난 것으로 읽는다. 정밀도를 올리는 것은 충돌
 * 확률만 낮추고 「경계가 시간에 종속된다」는 구조를 남긴다.
 */

let dir: string;
let db: Database;
let docsRoot: string;
let stores: ReturnType<typeof attachmentStores>;
let root: Actor;
let 기획: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

/** 상관 키만 다른 두 낱행을 만드는 가짜 조회 경계. 시각을 마음대로 가른다. */
const 가짜조회 = (rows: readonly AuditRow[]): AuditQuery => ({
  inScope: () => [...rows],
  operationsInScope: () => [...new Set(rows.map((row) => row.operation))],
  byIds: (ids) => rows.filter((row) => ids.includes(row.id)),
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-group-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = attachmentStores(db, docsRoot);
  root = superuserActor(stores);
  기획 = (
    await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(docsRoot) }, '기획팀')
  ).id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('IR-AUDIT-003 AC-8 — 같은 순간의 서로 다른 두 조작은 갈린다', () => {
  it('한 사람이 같은 초에 문서를 둘 만들면 두 묶음이다', () => {
    idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '가.md' }));
    idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '나.md' }));

    const 생성 = auditView(stores, root, { operation: NODE_CREATE })!.groups;

    // 한 줄로 접히면 열람자는 「생성 1건」으로 읽는다 — 실제로는 둘이다.
    expect(생성).toHaveLength(2);
    expect(생성.every((group) => group.rows.length === 1)).toBe(true);
  });
});

describe('IR-AUDIT-003 AC-9 — 한 조작이 낸 행들은 시각이 갈려도 함께 접힌다', () => {
  it('상관 키가 같으면 초가 달라도 한 묶음이다', () => {
    const 공통 = 'corr-1';
    const 낱행 = (id: string, occurredAt: string): AuditRow => ({
      id,
      occurredAt,
      operation: 'node.trash',
      actor: root.id,
      correlationId: 공통,
    });

    const view = auditView(
      { ...stores, auditLog: 가짜조회([낱행('a', '2026-08-24 09:00:00'), 낱행('b', '2026-08-24 09:00:01')]) },
      root,
    )!;

    // 초 경계를 넘어가는 서브트리 삭제가 두 줄로 갈리면, 그 조작이 두 번
    // 일어난 것처럼 보인다.
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]!.rows).toHaveLength(2);
  });

  it('상관 키가 다르면 초가 같아도 갈린다', () => {
    const 낱행 = (id: string, correlationId: string): AuditRow => ({
      id,
      occurredAt: '2026-08-24 09:00:00',
      operation: 'node.trash',
      actor: root.id,
      correlationId,
    });

    const view = auditView(
      { ...stores, auditLog: 가짜조회([낱행('a', 'corr-1'), 낱행('b', 'corr-2')]) },
      root,
    )!;

    expect(view.groups).toHaveLength(2);
  });
});

describe('IR-AUDIT-003 AC-5 · AC-6 — 상관 키는 저장하되 내보내지 않는다', () => {
  it('묶음에도 낱행 응답에도 상관 키가 없다', () => {
    idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '가.md' }));

    const view = auditView(stores, root)!;
    const [group] = view.groups;

    expect(Object.keys(group!).sort()).toEqual(['actor', 'occurredAt', 'operation', 'rows']);
    // 낱행에도 실리지 않는다 — 묶음에서만 빼면 낱행을 통해 그대로 샌다.
    for (const row of group!.rows) {
      expect(Object.keys(row)).not.toContain('correlationId');
    }
  });

  it('저장소에는 남는다 — 저장하지 않으면 시각 종속으로 되돌아간다', () => {
    idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '가.md' }));

    const [row] = stores.auditLog.inScope([기획], {});

    expect(typeof row?.correlationId).toBe('string');
    expect(row?.correlationId).not.toBe('');
  });
});

describe('IR-AUDIT-003 AC-9 — 한 조작이 낸 행들은 실제 조작에서도 함께 접힌다', () => {
  /** 실체 파일까지 갖춘 문서 — 복사가 본문을 옮기므로 자리가 있어야 한다. */
  const 문서 = async (parentId: string | null, name: string) => {
    const id = idOf(createNode(stores, root, { workspaceId: 기획, parentId, kind: 'file', name }));
    const at = join(docsRoot, 기획, stores.nodes.pathOf(id));
    await mkdir(dirname(at), { recursive: true });
    await writeFile(at, '# 본문\n', 'utf8');
    return id;
  };

  it('서브트리 삭제의 낱행들이 한 묶음이다', async () => {
    const 방 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'directory', name: '보관' }));
    await 문서(방, '가.md');
    await 문서(방, '나.md');

    expect((await moveToTrash(stores, root, 방)).ok).toBe(true);

    const 삭제 = auditView(stores, root, { operation: NODE_TRASH })!.groups;

    // 세 노드가 세 줄로 갈리면 열람자는 삭제가 세 번 일어난 것으로 읽는다.
    expect(삭제).toHaveLength(1);
    expect(삭제[0]!.rows).toHaveLength(3);
  });

  it('서브트리 복사가 낸 복사 행과 생성 행이 각각 한 묶음이다', async () => {
    const 방 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'directory', name: '원본' }));
    await 문서(방, '가.md');
    const 목적지 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'directory', name: '사본자리' }));

    expect((await copyNode(stores, root, 방, { parentId: 목적지 })).ok).toBe(true);

    const 복사 = auditView(stores, root, { operation: NODE_COPY })!.groups;
    expect(복사).toHaveLength(1);
    expect(복사[0]!.rows).toHaveLength(2);

    // 복사가 만든 생성 행도 한 조작의 산물이다 — 갈리면 복사 한 번이
    // 생성 여러 건으로 보인다. 앞서 손으로 만든 세 노드는 각자 별개다.
    const 생성 = auditView(stores, root, { operation: NODE_CREATE })!.groups;
    expect(생성.filter((group) => group.rows.length > 1)).toHaveLength(1);
    expect(생성.filter((group) => group.rows.length > 1)[0]!.rows).toHaveLength(2);

    // 거르지 않고 봐도 그 둘은 **서로 다른 묶음**이다 — 한 번의 호출이
    // 두 조작을 남기므로, 조작을 키에서 빼면 넷이 한 줄로 접히고 그 줄의
    // 조작 값은 둘 중 하나만 대표하게 된다.
    const 접힌것 = auditView(stores, root)!.groups.filter((group) => group.rows.length > 1);
    expect(접힌것.map((group) => group.operation).sort()).toEqual([NODE_COPY, NODE_CREATE].sort());
  });
});

describe('IR-AUDIT-003 AC-9 — 여러 행을 남기는 나머지 조작들도 한 묶음이다', () => {
  const 묶음 = (operation: string) =>
    auditView(stores, root, { operation })!.groups.filter((group) => group.rows.length > 1);

  it('일괄 회수가 항목 수만큼의 낱행을 한 묶음으로 남긴다', () => {
    const 한범 = stores.principals.createUser('한범').id;
    const 가 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '가.md' }));
    const 나 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '나.md' }));
    for (const node of [가, 나]) {
      stores.acl.grant({ nodeId: node, principalId: 한범, level: 'view', grantedBy: root.id });
    }

    expect(revokeAllFor(stores, root, 한범)!.rows).toHaveLength(2);

    // `OBS-AUDIT-008` AC-5 는 이 행 수를 타이핑 토큰과 묶는다 — 128 건을
    // 걷은 일이 128 줄로 갈리면 그 화면이 곧 못 쓰게 된다.
    expect(묶음(ACL_REVOKE)).toHaveLength(1);
    expect(묶음(ACL_REVOKE)[0]!.rows).toHaveLength(2);
  });

  it('워크스페이스 생성의 두 부여가 한 묶음이다', async () => {
    await createWorkspaceAs({ ...stores, files: new FsWorkspaceFiles(docsRoot) }, root, {
      name: '영업팀',
      administratorId: root.id,
      defaultGroupLevel: 'view',
    });

    expect(묶음(ACL_GRANT)).toHaveLength(1);
    expect(묶음(ACL_GRANT)[0]!.rows).toHaveLength(2);
  });

  it('보존 만료 일소가 한 묶음이다', async () => {
    for (const name of ['가.md', '나.md']) {
      const id = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name }));
      const at = join(docsRoot, 기획, stores.nodes.pathOf(id));
      await mkdir(dirname(at), { recursive: true });
      await writeFile(at, '# 본문\n', 'utf8');
      await moveToTrash(stores, root, id);
    }

    // `0` 은 무제한이므로(`FR-STORAGE-007` AC-4) 하루를 두고 시계를 민다.
    stores.settings.set('trash-retention-days', '1');
    stores.clock = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    expect((await sweepExpiredTrash(stores)).purged).toBe(2);

    expect(묶음('node.purge')).toHaveLength(1);
    expect(묶음('node.purge')[0]!.rows).toHaveLength(2);
  });
});
