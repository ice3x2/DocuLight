import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type Database } from '../../src/infra/sqlite/database.js';
import { SqliteAuditLog } from '../../src/infra/sqlite/audit-log-repository.js';

let dir: string;
let db: Database;
let audit: SqliteAuditLog;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-audit-shape-'));
  db = openDatabase(join(dir, 'doculight.db'));
  audit = new SqliteAuditLog(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

const columns = () =>
  db
    .all<{ name: string }>('PRAGMA table_info(audit_log)')
    .map((c) => c.name)
    .sort();

describe('DR-AUDIT-002 — 감사 행의 칸 구성', () => {
  it('AC-7: 정본이 정한 열한 칸이 전부이고 그 밖의 칸이 없다', () => {
    // 개수만 재면 이름이 바뀐 칸을 못 잡고, 이름만 재면 몰래 붙은 칸을
    // 못 잡는다. 집합을 통째로 단언한다. `id` 는 행의 식별자이지 정본이
    // 열거한 의미 칸이 아니다.
    expect(columns()).toEqual(
      [
        'id',
        'occurred_at',
        'actor',
        'node_id',
        'operation',
        'before_value',
        'after_value',
        'counterpart_node_id',
        'target_role',
        'workspace_id',
        'subject_id',
        'level',
      ].sort(),
    );
  });

  it('AC-2 · AC-3: 상대 노드와 대상 역할이 값을 담고 비어 있을 수도 있다', () => {
    audit.append({
      operation: 'node.copy',
      actor: 'u1',
      nodeId: 'n-copy',
      workspaceId: 'ws1',
      counterpartNodeId: 'n-origin',
      targetRole: 'copy',
    });
    audit.append({ operation: 'node.move', actor: 'u1', nodeId: 'n1', workspaceId: 'ws1' });

    const rows = audit.inScope(['ws1']);
    const 복사 = rows.find((row) => row.operation === 'node.copy')!;
    const 이동 = rows.find((row) => row.operation === 'node.move')!;

    expect(복사).toMatchObject({ counterpartNodeId: 'n-origin', targetRole: 'copy' });
    expect(이동.counterpartNodeId).toBeUndefined();
    expect(이동.targetRole).toBeUndefined();
  });

  it('AC-3: 대상 역할은 두 값만 받는다 — 스키마가 막는다', () => {
    // 응용 계층만 막으면 저장소를 직접 만지는 경로가 남는다.
    expect(() =>
      db.run(
        "INSERT INTO audit_log (id, operation, actor, counterpart_node_id, target_role) VALUES ('x', 'node.copy', 'u1', 'n2', '원본도사본도아님')",
      ),
      // 사유를 고정한다 — 맨 `toThrow()` 는 오타 같은 무관한 SQL 오류로도
      // 통과해 「스키마가 막았다」는 결론을 뒷받침하지 못한다.
    ).toThrow(/CHECK constraint failed/i);
  });

  it('AC-5: 상대 노드가 비면 대상 역할도 함께 빈다 — 어긋난 행이 들어오지 않는다', () => {
    // 역할만 실어 보내도 저장되지 않는다. 저장되면 그 행은 「상대편이
    // 없는데 원본」이라는 뜻이 되어 읽는 쪽이 판정할 수 없다.
    audit.append({
      operation: 'node.move',
      actor: 'u1',
      nodeId: 'n1',
      workspaceId: 'ws1',
      targetRole: 'origin',
    });

    expect(audit.inScope(['ws1'])[0]!.targetRole).toBeUndefined();
  });

  it('AC-9: 워크스페이스가 기록 시점 스냅샷이라 노드가 사라져도 남는다', () => {
    audit.append({ operation: 'node.purge', actor: 'u1', nodeId: '사라진노드', workspaceId: 'ws1' });

    // 노드 테이블에 그 행이 아예 없다 — 조인으로 파생했다면 여기서 스코프를
    // 잃고 인스턴스 스코프로 격상돼 그 워크스페이스 관리자에게서 숨는다.
    expect(db.get('SELECT id FROM node WHERE id = ?', ['사라진노드'])).toBeUndefined();
    expect(audit.inScope(['ws1'])).toHaveLength(1);
  });
});

describe('SEC-AUDIT-010 — 스코프는 대상에서 파생한다', () => {
  it('AC-1 · AC-2: 상대 노드가 다른 워크스페이스여도 스코프는 대상 쪽이다', () => {
    audit.append({
      operation: 'node.copy',
      actor: 'u1',
      nodeId: 'n-origin',
      workspaceId: 'ws-원본',
      counterpartNodeId: 'n-copy',
      targetRole: 'origin',
    });

    expect(audit.inScope(['ws-원본'])).toHaveLength(1);
    // 상대편의 워크스페이스로는 잡히지 않는다 — 잡히면 반출 사실이 목적지
    // 관리자에게 새어 나간다.
    expect(audit.inScope(['ws-사본'])).toHaveLength(0);
  });

  it('AC-3 · AC-4 · AC-5: 귀속 없는 행은 인스턴스 스코프다', () => {
    audit.append({ operation: 'settings.change', actor: 'u1' });

    // 워크스페이스 관리자에게는 보이지 않는다.
    expect(audit.inScope(['ws1'])).toHaveLength(0);
    // 슈퍼유저만 그 문을 연다.
    expect(audit.inScope(['ws1'], { includeInstance: true })).toHaveLength(1);
  });

  it('워크스페이스가 하나도 없으면 아무 행도 오지 않는다 — 빈 목록이 전체 목록이 되면 안 된다', () => {
    audit.append({ operation: 'acl.grant', actor: 'u1', nodeId: 'n1', workspaceId: 'ws1' });

    expect(audit.inScope([])).toHaveLength(0);
  });
});

describe('IR-AUDIT-001 — 조작 필터는 실제 기록 값에서 파생한다', () => {
  it('AC-1 · AC-3: 기록된 값의 distinct 집합이 그대로 온다', () => {
    audit.append({ operation: 'acl.grant', actor: 'u1', nodeId: 'n1', workspaceId: 'ws1' });
    audit.append({ operation: 'acl.grant', actor: 'u2', nodeId: 'n2', workspaceId: 'ws1' });
    audit.append({ operation: 'node.purge', actor: 'u1', nodeId: 'n3', workspaceId: 'ws1' });

    expect(audit.operationsInScope(['ws1'])).toEqual(['acl.grant', 'node.purge']);

    // 새 조작이 처음 기록되면 배포 없이 나타난다.
    audit.append({ operation: '아직없던조작', actor: 'u1', nodeId: 'n4', workspaceId: 'ws1' });
    expect(audit.operationsInScope(['ws1'])).toContain('아직없던조작');
  });

  it('스코프 밖의 조작은 필터에도 없다 — 있으면 그 값이 곧 다른 워크스페이스의 활동 신호다', () => {
    audit.append({ operation: '남의조작', actor: 'u1', nodeId: 'n1', workspaceId: 'ws-남' });

    expect(audit.operationsInScope(['ws1'])).toEqual([]);
  });
});

describe('DR-AUDIT-002 AC-5 · IR-AUDIT-003 — 스키마와 순서가 저장 계층에서 닫힌다', () => {
  it('AC-5: 상대 노드 없이 대상 역할만 담는 행을 스키마가 거부한다', () => {
    // 응용 계층만 막으면 저장소를 직접 만지는 경로가 남는다 — AC-3 에
    // 이미 댄 잣대를 AC-5 에도 그대로 댄다.
    expect(() =>
      db.run(
        "INSERT INTO audit_log (id, operation, actor, target_role) VALUES ('x1', 'node.copy', 'u1', 'origin')",
      ),
    ).toThrow(/counterpart/i);
  });

  it('AC-5: 상대 노드가 있으면 대상 역할을 받는다', () => {
    // 거부 시험만 두면 아무것도 못 넣는 트리거가 통과한다.
    expect(() =>
      db.run(
        "INSERT INTO audit_log (id, operation, actor, counterpart_node_id, target_role) VALUES ('x2', 'node.copy', 'u1', 'n9', 'origin')",
      ),
    ).not.toThrow();
  });

  it('같은 초의 행들이 열 때마다 같은 순서로 온다', () => {
    const log = new SqliteAuditLog(db);
    const ids = ['a', 'b', 'c', 'd', 'e'].map((name) =>
      log.append({ operation: 'node.create', actor: 'u1', workspaceId: 'w1', nodeId: name }),
    );

    // 같은 자료를 두 번 열어 줄 순서가 달라지면 두 사람이 본 감사가
    // 서로 다른 목록이 된다 — id 가 무작위 UUID 라 그것으로 가르면
    // 삽입 순서와 무관한 순서가 나온다.
    const 한번 = log.inScope(['w1']).map((row) => row.id);
    expect(한번).toEqual([...ids].reverse());
    expect(log.inScope(['w1']).map((row) => row.id)).toEqual(한번);
  });
});
