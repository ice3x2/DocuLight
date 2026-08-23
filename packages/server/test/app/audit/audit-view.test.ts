import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EXTERNAL_NODE, auditView } from '../../../src/app/audit/audit-view.js';
import { grantPermission } from '../../../src/app/acl/grant-service.js';
import { actorFor, type Actor } from '../../../src/app/acl/permission-service.js';
import { createNode } from '../../../src/app/node/node-service.js';
import { createWorkspace } from '../../../src/app/workspace/create-workspace.js';
import { FsWorkspaceFiles } from '../../../src/infra/fs/workspace-sidecar.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../../src/infra/sqlite/audit-log-repository.js';
import { nodeStores, superuserActor } from '../../support/acl-fixture.js';

let dir: string;
let docsRoot: string;
let db: Database;
let stores: ReturnType<typeof nodeStores> & { auditLog: SqliteAuditLog };
let root: Actor;
let 기획팀: string;
let 영업팀: string;
let 회의록: string;
let 남의문서: string;

const idOf = (r: unknown) => (r as { ok: true; id: string }).id;

const SERVER = existsSync(resolve(process.cwd(), 'src/main.ts'))
  ? process.cwd()
  : resolve(process.cwd(), 'packages/server');

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-view-'));
  docsRoot = join(dir, 'docs');
  await mkdir(docsRoot, { recursive: true });
  db = openDatabase(join(dir, 'doculight.db'));
  const base = nodeStores(db);
  stores = { ...base, auditLog: new SqliteAuditLog(db) };
  root = superuserActor(stores);

  const files = new FsWorkspaceFiles(docsRoot);
  기획팀 = (await createWorkspace({ workspaces: stores.workspaces, files }, '기획팀')).id;
  영업팀 = (await createWorkspace({ workspaces: stores.workspaces, files }, '영업팀')).id;
  회의록 = idOf(createNode(stores, root, { workspaceId: 기획팀, parentId: null, kind: 'file', name: '회의록.md' }));
  남의문서 = idOf(createNode(stores, root, { workspaceId: 영업팀, parentId: null, kind: 'file', name: '견적.md' }));
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 그 워크스페이스의 관리자. */
const 관리자 = (name: string, workspaceId: string): Actor => {
  const user = stores.principals.createUser(name);
  grantPermission(stores, root, { nodeId: workspaceId, principalId: user.id, level: 'admin' });
  return actorFor(stores.principals, user.id);
};

describe('SEC-AUDIT-010 — 열람 스코프', () => {
  it('AC-4: 인스턴스 스코프 행이 워크스페이스 관리자에게 보이지 않는다', () => {
    stores.auditLog.append({ operation: 'settings.change', actor: root.id });
    stores.auditLog.append({ operation: 'acl.grant', actor: root.id, nodeId: 회의록, workspaceId: 기획팀 });

    const 본것 = auditView(stores, 관리자('기획관리자', 기획팀))!;

    expect(본것.groups.flatMap((g) => g.rows).map((r) => r.operation)).toEqual(['acl.grant']);
  });

  it('AC-5: 슈퍼유저는 인스턴스 스코프까지 읽는다', () => {
    stores.auditLog.append({ operation: 'settings.change', actor: root.id });

    const 본것 = auditView(stores, root)!;

    expect(본것.groups.flatMap((g) => g.rows).map((r) => r.operation)).toContain('settings.change');
  });

  it('관리 워크스페이스가 없고 슈퍼유저도 아니면 볼 자격 자체가 없다', () => {
    const 구경꾼 = actorFor(stores.principals, stores.principals.createUser('구경꾼').id);

    expect(auditView(stores, 구경꾼)).toBeNull();
  });

  it('남의 워크스페이스 행은 오지 않는다', () => {
    stores.auditLog.append({ operation: 'acl.grant', actor: root.id, nodeId: 남의문서, workspaceId: 영업팀 });

    expect(auditView(stores, 관리자('기획관리자', 기획팀))!.groups).toEqual([]);
  });
});

describe('SEC-AUDIT-002 · SEC-AUDIT-003 · SEC-AUDIT-008 — 노드 참조의 마스킹', () => {
  it('AC-2: 열람 워크스페이스 안의 노드는 경로로 풀린다', () => {
    stores.auditLog.append({ operation: 'node.trash', actor: root.id, nodeId: 회의록, workspaceId: 기획팀 });

    const [줄] = auditView(stores, 관리자('기획관리자', 기획팀))!.groups[0]!.rows;

    expect(줄!.target).toBe('회의록.md');
  });

  it('AC-3 · AC-4 · `SEC-AUDIT-003` AC-7: 밖의 노드는 어디로 갔든 같은 문구다', async () => {
    const files = new FsWorkspaceFiles(docsRoot);
    const 제3 = (await createWorkspace({ workspaces: stores.workspaces, files }, '지원팀')).id;
    const 제3문서 = idOf(
      createNode(stores, root, { workspaceId: 제3, parentId: null, kind: 'file', name: '지원.md' }),
    );

    for (const 상대 of [남의문서, 제3문서]) {
      stores.auditLog.append({
        operation: 'node.copy',
        actor: root.id,
        nodeId: 회의록,
        workspaceId: 기획팀,
        counterpartNodeId: 상대,
        targetRole: 'origin',
      });
    }

    const 상대들 = auditView(stores, 관리자('기획관리자', 기획팀))!
      .groups.flatMap((g) => g.rows)
      .map((r) => r.counterpart);

    // 두 목적지가 **완전히 같은 문자열**을 받는다 — 갈리면 그 차이가 곧
    // 목적지를 식별하는 축이 된다.
    expect(상대들).toEqual([EXTERNAL_NODE, EXTERNAL_NODE]);
  });

  it('`SEC-AUDIT-008` AC-3: 응답에 원시 노드 ID 가 실리지 않는다', () => {
    stores.auditLog.append({
      operation: 'node.copy',
      actor: root.id,
      nodeId: 회의록,
      workspaceId: 기획팀,
      counterpartNodeId: 남의문서,
      targetRole: 'origin',
    });

    const 본것 = JSON.stringify(auditView(stores, 관리자('기획관리자', 기획팀)));

    expect(본것).not.toContain(남의문서);
  });

  it('AC-5: 나중에 그 워크스페이스의 권한이 생기면 같은 행이 경로로 풀린다', () => {
    stores.auditLog.append({
      operation: 'node.copy',
      actor: root.id,
      nodeId: 회의록,
      workspaceId: 기획팀,
      counterpartNodeId: 남의문서,
      targetRole: 'origin',
    });
    const 사람 = 관리자('두곳관리자', 기획팀);
    expect(auditView(stores, 사람)!.groups[0]!.rows[0]!.counterpart).toBe(EXTERNAL_NODE);

    grantPermission(stores, root, { nodeId: 영업팀, principalId: 사람.id, level: 'admin' });

    // 저장된 값은 온전하다 — 가리는 것은 표시일 뿐이다.
    expect(auditView(stores, 사람)!.groups[0]!.rows[0]!.counterpart).toBe('견적.md');
  });
});

describe('IR-AUDIT-003 · SEC-AUDIT-011 — 저장은 낱행이고 표시는 묶음이다', () => {
  const 세줄 = () => {
    for (const node of [회의록, 회의록, 회의록]) {
      stores.auditLog.append({
        operation: 'acl.grant',
        actor: root.id,
        nodeId: node,
        workspaceId: 기획팀,
        subjectId: `p-${Math.random()}`,
      });
    }
  };

  it('AC-1 · AC-2 · AC-3: 낱행으로 저장되고 한 줄로 접히며 펼치면 다 보인다', () => {
    세줄();

    const 본것 = auditView(stores, 관리자('기획관리자', 기획팀))!;

    expect(stores.auditLog.inScope([기획팀])).toHaveLength(3);
    expect(본것.groups).toHaveLength(1);
    expect(본것.groups[0]!.rows).toHaveLength(3);
  });

  it('`SEC-AUDIT-011` AC-1: 묶음 건수가 열람자 스코프의 낱행 수와 같다', () => {
    세줄();
    stores.auditLog.append({ operation: 'acl.grant', actor: root.id, nodeId: 남의문서, workspaceId: 영업팀 });

    const 본것 = auditView(stores, 관리자('기획관리자', 기획팀))!;

    // 남의 워크스페이스 행이 건수에 섞이면 그 차이가 곧 스코프 밖 행의 수다.
    expect(본것.groups[0]!.rows).toHaveLength(3);
  });

  it('AC-5 · AC-6 · AC-7: 묶음 키가 응답 어디에도 없다', () => {
    세줄();

    const 묶음 = auditView(stores, 관리자('기획관리자', 기획팀))!.groups[0]!;

    // 키가 실리면 그것으로 거르는 필터가 곧 생기고, 기록에 없는 축으로
    // 감사를 가르게 된다.
    expect(Object.keys(묶음).sort()).toEqual(['actor', 'occurredAt', 'operation', 'rows']);
  });

  it('AC-4: 조작 필터가 낱행의 distinct 집합이고 정렬돼 온다', () => {
    // 알파벳 역순으로 넣는다 — 묶음(시각 역순)에서 뽑으면 이 순서가
    // 그대로 나오고, 낱행 질의에서 뽑으면 정렬돼 나온다.
    for (const 조작 of ['z.op', 'n.op', 'a.op']) {
      stores.auditLog.append({ operation: 조작, actor: root.id, nodeId: 회의록, workspaceId: 기획팀 });
    }

    const 본것 = auditView(stores, 관리자('기획관리자', 기획팀))!;

    expect(본것.operations).toEqual(['a.op', 'n.op', 'z.op']);
  });

  it('AC-4: 필터의 원천이 묶음이 아니라 저장소의 distinct 질의다', () => {
    // 두 원천은 같은 집합을 내므로 거동으로는 갈리지 않는다. 재는 것은
    // **어디서 뽑는가**이고, 그것이 이 AC 의 전부다 — 묶음에서 뽑기
    // 시작하면 나중에 묶음 규칙이 바뀔 때 필터가 조용히 따라 바뀐다.
    const code = readFileSync(
      join(SERVER, 'src', 'app', 'audit', 'audit-view.ts'),
      'utf8',
    );
    const 필터줄 = code
      .split(/\r?\n/)
      .filter((line) => line.includes('operations:'))
      .join(' ');

    expect(필터줄).toContain('operationsInScope');
    expect(필터줄).not.toContain('grouped(');
  });
});
