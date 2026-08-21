import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newNodeId } from '../../../src/domain/node/node-id.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';

/** UUIDv4 — 13번째 니블이 `4`, 17번째가 `8|9|a|b`. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const WORKSPACE = 'ws-0000';

let dir: string;
let db: Database;
let nodes: SqliteNodeRepository;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-node-'));
  db = openDatabase(join(dir, 'doculight.db'));
  nodes = new SqliteNodeRepository(db);
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

describe('DR-STORAGE-003 · SEC-STORAGE-001 — 노드 ID 는 경로 독립이고 추측 불가하다', () => {
  it('DR-STORAGE-003 AC-1 — 노드를 생성하면 경로와 독립적인 안정 ID 가 부여된다.', () => {
    const parent = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'directory',
      name: '기획',
    });
    const child = nodes.create({
      workspaceId: WORKSPACE,
      parentId: parent,
      kind: 'file',
      name: '회의록.md',
    });

    // 경로 독립의 실질은 두 가지다. ① ID 가 경로를 담지 않는다 —
    // 담으면 경로가 바뀔 때 ID 도 바뀌어야 한다.
    expect(child).not.toContain('회의록');
    expect(child).not.toContain('기획');
    expect(child).not.toContain('/');

    // ② 같은 이름이 다른 자리에 있어도 서로 다른 ID 다. ID 가 경로의
    // 함수라면 이 둘은 경로가 다르므로 구별되겠지만, 반대로 경로가 같아지면
    // 같아진다 — 그것이 R76 이 막으려는 사고다.
    const sameNameElsewhere = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'file',
      name: '회의록.md',
    });
    expect(sameNameElsewhere).not.toBe(child);

    // 부여된 ID 로 그 노드에 도달한다 — 안정 ID 라는 말의 최소 조건.
    expect(nodes.findById(child)).toMatchObject({
      id: child,
      parentId: parent,
      name: '회의록.md',
      kind: 'file',
    });

    // 경로는 저장된 것이 아니라 부모 사슬에서 파생된다.
    expect(nodes.pathOf(child)).toBe('기획/회의록.md');
  });

  it('SEC-STORAGE-001 AC-1 — 새로 부여되는 노드 ID 는 순차 정수가 아니며 연속해서 생성한 두 노드의 ID 로부터 다음 ID 를 예측할 수 없다.', () => {
    const issued = Array.from({ length: 64 }, (_, i) =>
      nodes.create({
        workspaceId: WORKSPACE,
        parentId: null,
        kind: 'file',
        name: `n${i}.md`,
      }),
    );

    // 순차 정수가 아니다 — 정수로 읽히는 ID 는 그 자체로 열거 오라클이다.
    expect(issued.filter((id) => /^\d+$/.test(id))).toEqual([]);

    // 전부 다르다. 겹치면 다음 값을 셀 수 있다는 뜻이다.
    expect(new Set(issued).size).toBe(issued.length);

    // 예측 불가의 관측 가능한 대용물 — 연속한 두 ID 의 차이가 일정하지 않다.
    // 등차수열이면 두 개만 보고 다음을 계산할 수 있다.
    const asBigInt = (id: string) => BigInt(`0x${id.replace(/-/g, '')}`);
    const deltas = issued.slice(1).map((id, i) => asBigInt(id) - asBigInt(issued[i]!));
    expect(new Set(deltas.map(String)).size).toBe(deltas.length);

    // 단조 증가·감소도 아니다 — 방향이 고정이면 범위를 좁힐 수 있다.
    const increasing = deltas.filter((d) => d > 0n).length;
    expect(increasing).toBeGreaterThan(0);
    expect(increasing).toBeLessThan(deltas.length);
  });

  it('SEC-STORAGE-001 AC-2 — 노드 ID 는 UUIDv4 에 준하는 엔트로피를 갖는다.', () => {
    expect(newNodeId()).toMatch(UUID_V4);

    const drawn = new Set(Array.from({ length: 2000 }, () => newNodeId()));
    // 2000 번 뽑아 한 번도 겹치지 않는다. 엔트로피가 낮으면 여기서 무너진다.
    expect(drawn.size).toBe(2000);
    for (const id of drawn) {
      expect(id).toMatch(UUID_V4);
    }

    // 저장소가 발급하는 ID 도 같은 규칙을 따른다 — 발급 지점이 둘이면
    // 한쪽만 고쳐지고 다른 쪽이 조용히 어긋난다.
    const stored = nodes.create({
      workspaceId: WORKSPACE,
      parentId: null,
      kind: 'file',
      name: 'a.md',
    });
    expect(stored).toMatch(UUID_V4);
  });

  it('SEC-STORAGE-001 AC-3 — 연속된 정수를 대입하는 방식으로 URL 을 훑어 다른 노드에 도달하거나 노드를 열거할 수 없다.', () => {
    // 노드가 실재하는 상태에서 훑는다. 비어 있는 저장소에서 못 찾는 것은
    // 아무것도 증명하지 않는다.
    const real = Array.from({ length: 32 }, (_, i) =>
      nodes.create({
        workspaceId: WORKSPACE,
        parentId: null,
        kind: 'file',
        name: `doc${i}.md`,
      }),
    );
    expect(real).toHaveLength(32);

    const reached = Array.from({ length: 1000 }, (_, i) => String(i)).filter(
      (probe) => nodes.findById(probe) !== undefined,
    );
    expect(reached, `연속 정수 대입으로 도달한 노드: ${reached.join(', ')}`).toEqual([]);

    // rowid 는 SQLite 가 자동으로 부여하는 정수다. 그것이 조회 키로 새면
    // 위 훑기가 그대로 통한다.
    expect(nodes.findById('1')).toBeUndefined();
    expect(nodes.findById('rowid:1')).toBeUndefined();
  });
});
