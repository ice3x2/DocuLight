import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import {
  resolveByManualLink,
  resolutionOf,
  type QueueStores,
} from '../../../src/app/reconciliation/queue-view.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import {
  FINDING_TYPE,
  RESOLUTION_OPERATION,
} from '../../../src/domain/reconciliation/vocabulary.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteFindingQueue } from '../../../src/infra/sqlite/finding-queue-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let db: Database;
let stores: QueueStores;
let root: Actor;
let 기획: string;
let 기획문서: string;
let 원행: string;
let 항목: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;
const 전체행 = () => db.all<{ id: string }>('SELECT id FROM audit_log').map((row) => row.id);

/** 그 워크스페이스의 관리자. */
const 관리자 = (workspaceId: string, name: string): Actor => {
  const user = stores.principals.createUser(name);
  grantPermission(stores, root, { nodeId: workspaceId, principalId: user.id, level: 'admin' });
  return actorFor(stores.principals, user.id);
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-resolve-finding-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  stores = { ...nodeStores(db), queue: new SqliteFindingQueue(db) };
  root = superuserActor(stores);

  기획 = (
    await createWorkspace(
      { workspaces: stores.workspaces, files: new FsWorkspaceFiles(join(dir, 'docs')) },
      '기획팀',
    )
  ).id;
  기획문서 = idOf(createNode(stores, root, { workspaceId: 기획, parentId: null, kind: 'file', name: '기획.md' }));
  원행 = stores.audit.append({
    operation: 'reconcile.orphan',
    actor: 'system:reconciler',
    nodeId: 기획문서,
  });
  항목 = stores.queue.open({ type: FINDING_TYPE.missingFile, auditRefs: [원행] });
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('REL-AUDIT-002 — 해소는 새 감사 행 추가로만 한다', () => {
  it('AC-1: 해소해도 참조하던 감사 행의 값이 바뀌지 않는다', () => {
    const 이전 = db.all<Record<string, unknown>>('SELECT * FROM audit_log WHERE id = ?', [원행]);

    resolveByManualLink(stores, 관리자(기획, '기획관리자'), 항목);

    expect(db.all<Record<string, unknown>>('SELECT * FROM audit_log WHERE id = ?', [원행])).toEqual(
      이전,
    );
  });

  it('AC-2: 해소 행위가 새 감사 행을 1건 남긴다', () => {
    // 관리 권한 부여 자체가 감사 행을 남기므로 창 **밖**에서 세운다.
    const 사람 = 관리자(기획, '기획관리자');
    const 이전 = 전체행();

    resolveByManualLink(stores, 사람, 항목);

    expect(전체행()).toHaveLength(이전.length + 1);
  });

  it('AC-3: 항목의 해소 감사 행이 그 새 감사 행을 가리킨다', () => {
    const 사람 = 관리자(기획, '기획관리자');
    const 이전 = new Set(전체행());

    resolveByManualLink(stores, 사람, 항목);

    const 새행 = 전체행().filter((id) => !이전.has(id));
    expect(새행).toHaveLength(1);
    expect(stores.queue.find(항목)?.resolutionAuditId).toBe(새행[0]);
  });

  it('AC-3: 해소한 항목이 미해소 목록에서 빠진다', () => {
    resolveByManualLink(stores, 관리자(기획, '기획관리자'), 항목);

    expect(stores.queue.unresolved()).toHaveLength(0);
  });

  it('AC-4: 수동 연결이 해소 경로이고 그 조작명으로 남는다', () => {
    resolveByManualLink(stores, 관리자(기획, '기획관리자'), 항목);

    const 해소행 = stores.auditLog.byIds([stores.queue.find(항목)!.resolutionAuditId!])[0]!;
    expect(해소행.operation).toBe(RESOLUTION_OPERATION.manualLink);
  });

  it('AC-5: 해소 시각과 해소자를 대기열이 아니라 해소 감사 행에서 읽는다', () => {
    const 사람 = 관리자(기획, '기획관리자');

    resolveByManualLink(stores, 사람, 항목);

    const 해소행 = stores.auditLog.byIds([stores.queue.find(항목)!.resolutionAuditId!])[0]!;
    expect(resolutionOf(stores, 항목)).toEqual({
      actor: 해소행.actor,
      occurredAt: 해소행.occurredAt,
    });
    // 대기열이 자기 칸으로 들면 같은 사실이 두 곳에 적히고 한쪽만 고쳐진다.
    expect(사람.id).toBe(해소행.actor);
    expect(
      db
        .all<{ name: string }>('PRAGMA table_info(reconciliation_finding)')
        .map((column) => column.name)
        .filter((name) => /resolved_at|resolver|actor|occurred/.test(name)),
    ).toEqual([]);
  });

  it('AC-6: 해소 뒤에도 판정 실패 사실이 원 감사 행으로 남는다', () => {
    resolveByManualLink(stores, 관리자(기획, '기획관리자'), 항목);

    const 원 = stores.auditLog.byIds([원행])[0]!;
    expect(원.operation).toBe('reconcile.orphan');
    expect(원.nodeId).toBe(기획문서);
  });

  it('`SEC-AUDIT-007` AC-5: 스코프 밖의 사람은 그 항목을 해소하지 못한다', () => {
    const 구경꾼 = stores.principals.createUser('구경꾼');

    const 결과 = resolveByManualLink(stores, actorFor(stores.principals, 구경꾼.id), 항목);

    expect(결과.ok).toBe(false);
    expect(stores.queue.unresolved()).toHaveLength(1);
  });

  it('해소되지 않은 항목의 해소 감사 행은 없다', () => {
    expect(resolutionOf(stores, 항목)).toBeNull();
  });
});
