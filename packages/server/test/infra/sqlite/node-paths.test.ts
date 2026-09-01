import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { MetadataStore } from '../../../src/domain/ports/metadata-store.js';
import { openDatabase, type Database } from '../../../src/infra/sqlite/database.js';
import { SqliteNodeRepository } from '../../../src/infra/sqlite/node-repository.js';
import { SqliteWorkspaceRepository } from '../../../src/infra/sqlite/workspace-repository.js';

/**
 * 워크스페이스 전체의 경로를 얻는 데 드는 **질의 수** (`CON-ACL-001` AC-4).
 *
 * 그 조항이 말하는 O(N) 은 질의가 아니라 메모리 순회다. `chainsOf` 의 주석이
 * 이미 그것을 적어 두었는데, 재조정은 노드마다 `pathOf` 를 불러 그 규칙 밖에
 * 있었다 — 노드 1,300 개면 재귀 CTE 가 1,300 번 돌고, 그것이 합성 볼트 시험을
 * 34 초로 늘렸다(2026-09-01 실측).
 *
 * **시간이 아니라 질의 수를 잰다.** 시간은 기계와 부하에 따라 흔들리므로
 * 상한을 어디에 두어도 거짓 실패이거나 무의미한 여유가 된다.
 */
let dir: string;
let db: Database;
/** 이 저장소를 지나간 질의 수. */
let 질의수: number;
let nodes: SqliteNodeRepository;
let ws: string;

/** 질의를 세는 껍데기. 실제 저장소에 그대로 위임하고 개수만 기록한다. */
const 세는저장소 = (inner: MetadataStore): MetadataStore => ({
  run: (sql, params) => inner.run(sql, params),
  all: (sql, params) => {
    질의수 += 1;
    return inner.all(sql, params);
  },
  get: (sql, params) => {
    질의수 += 1;
    return inner.get(sql, params);
  },
  transaction: (fn) => inner.transaction(fn),
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'doculight-paths-'));
  db = openDatabase(join(dir, 'doculight.db'));
  질의수 = 0;
  nodes = new SqliteNodeRepository(세는저장소(db));

  ws = new SqliteWorkspaceRepository(db).create('볼트').id;
});

afterEach(async () => {
  db.close();
  await rm(dir, { recursive: true, force: true });
});

/** 세 겹 트리를 만든다. 반환값은 파일 노드의 id 와 그 기대 경로다. */
const 트리를세운다 = (fileCount: number) => {
  const 만든것: { id: string; path: string }[] = [];
  const 폴더 = nodes.create({ workspaceId: ws, parentId: null, kind: 'directory', name: '연구' });
  const 안쪽 = nodes.create({ workspaceId: ws, parentId: 폴더, kind: 'directory', name: '2026' });

  for (let i = 0; i < fileCount; i += 1) {
    const name = `문서-${String(i).padStart(4, '0')}.md`;
    만든것.push({
      id: nodes.create({ workspaceId: ws, parentId: 안쪽, kind: 'file', name }),
      path: `연구/2026/${name}`,
    });
  }
  return 만든것;
};

describe('CON-ACL-001 AC-4 — 경로 전부를 얻는 데 드는 질의가 노드 수에 비례하지 않는다', () => {
  it('`pathsIn` 이 `pathOf` 와 같은 답을 준다', () => {
    const 만든것 = 트리를세운다(5);

    const 전부 = nodes.pathsIn(ws);

    // 정확성을 먼저 못박는다 — 빠르지만 틀린 답은 느리고 맞는 답보다 나쁘다.
    for (const one of 만든것) {
      expect([one.id, 전부.get(one.id)]).toEqual([one.id, nodes.pathOf(one.id)]);
      expect(전부.get(one.id)).toBe(one.path);
    }
    // 디렉토리도 함께 담는다 — 재조정의 `ensurePath` 가 중간 자리를 찾는다.
    expect([...전부.values()]).toContain('연구/2026');
  });

  it('노드가 열 배로 늘어도 질의 수가 그대로다', () => {
    트리를세운다(20);
    질의수 = 0;
    nodes.pathsIn(ws);
    const 적을때 = 질의수;

    // 같은 저장소에 이어 붙인다 — 새로 세우면 앞의 트리가 사라져 비교가
    // 성립하지 않는다.
    트리를세운다(200);
    질의수 = 0;
    nodes.pathsIn(ws);
    const 많을때 = 질의수;

    expect([적을때, 많을때]).toEqual([적을때, 적을때]);
    // 상수라는 것만으로는 부족하다 — 0 이면 아무것도 묻지 않은 것이고,
    // 그러면 답이 비어 있어도 이 항이 통과한다.
    expect(적을때).toBeGreaterThan(0);
    expect(적을때).toBeLessThan(5);
  });

  it('`pathOf` 를 노드마다 부르면 질의가 그만큼 늘어난다 — 이 함수가 있는 이유다', () => {
    const 만든것 = 트리를세운다(20);

    질의수 = 0;
    for (const one of 만든것) nodes.pathOf(one.id);
    const 낱개로 = 질의수;

    질의수 = 0;
    nodes.pathsIn(ws);
    const 한번에 = 질의수;

    expect(낱개로).toBeGreaterThanOrEqual(만든것.length);
    expect(한번에).toBeLessThan(낱개로);
  });
});
