import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { auditView } from '../../../src/app/audit/audit-view.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { queueView, scopeOf, type QueueStores } from '../../../src/app/reconciliation/queue-view.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FINDING_TYPE } from '../../../src/domain/reconciliation/vocabulary.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: QueueStores;
let root: Actor;
let 기획: string;
let 영업: string;
let 기획문서: string;
let 영업문서: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const 워크스페이스 = async (name: string) =>
  (await createWorkspace({ workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) }, name))
    .id;

const 문서 = (workspaceId: string, name: string) =>
  idOf(createNode(stores, root, { workspaceId, parentId: null, kind: 'file', name }));

/** 그 노드를 대상으로 하는 감사 행 1건. 대기열이 참조할 사실이다. */
const 감사 = (nodeId?: string, workspaceId?: string) =>
  stores.audit.append({
    operation: 'reconcile.create',
    actor: 'system:reconciler',
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
  });

/** 그 워크스페이스의 관리자. 노드에는 아무 항목도 갖지 않는다. */
const 관리자 = (workspaceId: string, name: string): Actor => {
  const user = stores.principals.createUser(name);
  grantPermission(stores, root, { nodeId: workspaceId, principalId: user.id, level: 'admin' });
  return actorFor(stores.principals, user.id);
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-queue-scope-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...nodeStores(db), queue: new SqliteFindingQueue(db) };
  root = superuserActor(stores);

  기획 = await 워크스페이스('기획팀');
  영업 = await 워크스페이스('영업팀');
  기획문서 = 문서(기획, '기획.md');
  영업문서 = 문서(영업, '영업.md');
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('SEC-AUDIT-007 — 대기열 항목의 스코프는 참조 감사 행에서 파생한다', () => {
  it('AC-1: 스코프가 참조 감사 행들의 대상 노드에서 나온다', () => {
    const id = stores.queue.open({
      type: FINDING_TYPE.unregisteredFile,
      auditRefs: [감사(기획문서)],
    });

    // 그 행에는 워크스페이스 칸이 없다 — 대상 노드만으로 파생해야 한다.
    expect(scopeOf(stores, id)).toEqual({ kind: 'workspace', workspaceId: 기획 });
  });

  it('AC-2: 대기열 테이블에 워크스페이스를 담는 칸이 없다', () => {
    const columns = db
      .all<{ name: string }>('PRAGMA table_info(reconciliation_finding)')
      .map((column) => column.name);

    expect(columns.sort()).toEqual(['id', 'resolution_audit_id', 'type']);
  });

  it('AC-3: 참조 행이 서로 다른 워크스페이스에 속하면 인스턴스 스코프로 격상된다', () => {
    const id = stores.queue.open({
      type: FINDING_TYPE.unregisteredFile,
      auditRefs: [감사(기획문서), 감사(영업문서)],
    });

    // 좁은 쪽이 아니라 위로 올린다 — 한쪽 워크스페이스 관리자에게 보이면
    // 그 항목의 존재가 다른 워크스페이스의 사실을 알린다.
    expect(scopeOf(stores, id)).toEqual({ kind: 'instance' });
  });

  it('AC-4: 어느 워크스페이스에도 귀속되지 않는 항목이 인스턴스 스코프로 격상된다', () => {
    const id = stores.queue.open({
      type: FINDING_TYPE.duplicateWorkspaceSidecar,
      auditRefs: [감사()],
    });

    expect(scopeOf(stores, id)).toEqual({ kind: 'instance' });
  });

  it('AC-5: 인스턴스 스코프 항목이 워크스페이스 관리 보유자에게 보이지 않는다', () => {
    const 경계넘음 = stores.queue.open({
      type: FINDING_TYPE.unregisteredFile,
      auditRefs: [감사(기획문서), 감사(영업문서)],
    });
    const 기획몫 = stores.queue.open({
      type: FINDING_TYPE.missingFile,
      auditRefs: [감사(기획문서)],
    });

    const 본것 = queueView(stores, 관리자(기획, '기획관리자'))!.items.map((item) => item.id);

    expect(본것).toEqual([기획몫]);
    expect(queueView(stores, root)!.items.map((item) => item.id).sort()).toEqual(
      [경계넘음, 기획몫].sort(),
    );
  });

  it('AC-6: 대기열 조회가 감사 로그와 같은 스코프 선택기를 쓴다', () => {
    stores.queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [감사(기획문서)] });

    const 편집자 = stores.principals.createUser('편집자');
    grantPermission(stores, root, { nodeId: 기획, principalId: 편집자.id, level: 'edit' });

    // 새 접근 규칙을 두지 않았다면 두 화면의 자격 판정이 사람마다 같이
    // 갈린다 — 한쪽만 열리는 사람이 있으면 규칙이 둘로 갈라진 것이다.
    for (const 사람 of [root, 관리자(기획, '기획관리자'), actorFor(stores.principals, 편집자.id)]) {
      expect(queueView(stores, 사람) === null).toBe(auditView(stores, 사람) === null);
    }
  });

  it('AC-2: 대기열 항목이 워크스페이스 칸을 응답에도 싣지 않는다', () => {
    const id = stores.queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [감사(기획문서)] });

    const [항목] = queueView(stores, root)!.items;

    expect(항목).toEqual({ id, type: FINDING_TYPE.missingFile });
  });
});
