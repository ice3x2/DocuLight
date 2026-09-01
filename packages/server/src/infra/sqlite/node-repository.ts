import { newNodeId, type NodeId } from '../../domain/node/node-id.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type {
  NewNode,
  NodeKind,
  NodeRecord,
  NodeRepository,
} from '../../domain/ports/node-repository.js';

interface Row {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  kind: NodeKind;
  name: string;
  orphaned_at: string | null;
  inherits_acl: number;
  trashed_at: string | null;
}

// `trashed_at` 은 `node` 의 칸이 아니라 `trash_entry` 에서 조인해 온다 —
// 같은 사실을 두 곳에 적지 않기 위해서다. 그래서 SELECT 목록과 FROM 절이
// 함께 다녀야 하고, 둘을 한 상수로 묶어 둔다.
const NODE_SOURCE = `node LEFT JOIN trash_entry ON trash_entry.node_id = node.id`;
const COLUMNS =
  'node.id AS id, node.workspace_id AS workspace_id, node.parent_id AS parent_id, ' +
  'node.kind AS kind, node.name AS name, node.orphaned_at AS orphaned_at, ' +
  'node.inherits_acl AS inherits_acl, trash_entry.deleted_at AS trashed_at';

/**
 * 재귀 질의가 멈추는 깊이. 트리에는 고리가 없으므로 여기 닿는 것 자체가
 * 파손 신호이고, 상한이 없으면 그 파손이 프로세스를 멈춰 세운다.
 */
const MAX_DEPTH = 4096;

/** 재귀 CTE 안에서는 조인 없이 `node` 의 칸만 쓴다 — 조인은 바깥에서 한 번. */
const CHAIN_COLUMNS = 'id, workspace_id, parent_id, kind, name, orphaned_at, inherits_acl';

function toRecord(row: Row): NodeRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
    orphanedAt: row.orphaned_at,
    // SQLite 는 불리언이 없다 — 경계에서 한 번만 바꾼다. 위쪽이 0/1 을
    // 보게 두면 그 값이 어디까지 퍼졌는지 아무도 모르게 된다.
    inheritsAcl: row.inherits_acl === 1,
    trashedAt: row.trashed_at,
  };
}

/**
 * 노드 저장소의 SQLite 어댑터 (`DR-STORAGE-003` · `SEC-STORAGE-001`).
 *
 * 테이블은 `001_init.sql` 이 이미 세웠다 — `parent_id` 와 `name` 이 트리를
 * 담고 경로 칸은 없다. 그래서 경로는 저장되지 않고 파생될 뿐이며, 이동·개명이
 * 경로 사본을 어긋나게 만들 자리가 아예 없다.
 */
export class SqliteNodeRepository implements NodeRepository {
  constructor(private readonly store: MetadataStore) {}

  create(node: NewNode): NodeId {
    const id = newNodeId();
    this.store.run(
      'INSERT INTO node (id, workspace_id, parent_id, kind, name) VALUES (?, ?, ?, ?, ?)',
      [id, node.workspaceId, node.parentId, node.kind, node.name],
    );
    return id;
  }

  findById(id: string): NodeRecord | undefined {
    const row = this.store.get<Row>(`SELECT ${COLUMNS} FROM ${NODE_SOURCE} WHERE node.id = ?`, [id]);
    return row === undefined ? undefined : toRecord(row);
  }

  children(where: { workspaceId: string; parentId: NodeId | null; except?: NodeId }): NodeRecord[] {
    // `IS` 는 SQLite 의 널 안전 등가 비교다. `=` 로 쓰면 루트 형제(부모가
    // NULL)가 한 건도 걸리지 않아 충돌이 조용히 통과한다.
    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM ${NODE_SOURCE} WHERE node.workspace_id = ? AND node.parent_id IS ? AND node.id IS NOT ? ORDER BY node.rowid`,
        [where.workspaceId, where.parentId, where.except ?? null],
      )
      .map(toRecord);
  }

  /**
   * 자기 자신부터 루트까지의 부모 사슬. 없는 노드면 빈 배열.
   *
   * **질의 한 번**이다. 부모를 하나씩 따라가면 깊이만큼 질의가 늘어나
   * 판정 하나가 쓰는 질의를 2회로 묶은 `CON-ACL-001` AC-4 가 깨진다.
   *
   * 경로도 조상 목록도 이 하나에서 나온다 — 순회를 둘로 두면 한쪽만
   * 무결성 방어를 갖게 된다.
   */
  chainOf(id: NodeId): NodeRecord[] {
    const rows = this.store.all<Row & { depth: number }>(
      `WITH RECURSIVE chain(id, workspace_id, parent_id, kind, name, orphaned_at, inherits_acl, depth) AS (
         SELECT ${CHAIN_COLUMNS}, 0 FROM node WHERE id = ?
         UNION ALL
         SELECT n.id, n.workspace_id, n.parent_id, n.kind, n.name, n.orphaned_at, n.inherits_acl, c.depth + 1
           FROM node n JOIN chain c ON n.id = c.parent_id
          WHERE c.depth < ${MAX_DEPTH}
       )
       SELECT chain.*, trash_entry.deleted_at AS trashed_at
         FROM chain LEFT JOIN trash_entry ON trash_entry.node_id = chain.id
        ORDER BY depth`,
      [id],
    );

    if (rows.length === 0) return [];

    // 사슬은 루트에서 끝나야 한다. 끝나지 않았다면 고리이거나 중간이 끊긴
    // 것이고, 둘 다 정상 분기가 아니라 무결성 파손이다 — 그때는 잘린 사슬을
    // 돌려주는 것보다 멈추는 편이 낫다. 잘린 사슬은 조상의 ACL 항목을
    // 조용히 빠뜨려 권한을 실제보다 좁게 판정한다.
    const last = rows[rows.length - 1]!;
    if (last.parent_id !== null) {
      const seen = new Set<string>();
      for (const row of rows) {
        if (seen.has(row.id)) {
          throw new Error(`node ${id} sits on a parent cycle through ${row.id}`);
        }
        seen.add(row.id);
      }
      throw new Error(`node ${last.parent_id} is missing while resolving the chain of ${id}`);
    }

    return rows.map(toRecord);
  }

  chainsOf(ids: readonly NodeId[]): NodeRecord[] {
    if (ids.length === 0) return [];

    // 여러 사슬을 **한 번에** 뽑는다. 노드마다 `chainOf` 를 부르면 대상
    // 수에 비례해 질의가 늘어 `CON-ACL-001` AC-4 가 깨진다 — 그 AC 가
    // 말하는 O(N) 은 질의가 아니라 **메모리 순회**다.
    //
    // 합집합이라 어느 사슬의 것인지는 여기서 구별되지 않는다. 각 행이
    // `parent_id` 를 갖고 있으므로 호출자가 메모리에서 다시 엮는다.
    const placeholders = Array.from({ length: ids.length }, () => '?').join(', ');

    return this.store
      .all<Row>(
        `WITH RECURSIVE chain(id, workspace_id, parent_id, kind, name, orphaned_at, inherits_acl, depth) AS (
           SELECT ${CHAIN_COLUMNS}, 0 FROM node WHERE id IN (${placeholders})
           UNION
           SELECT n.id, n.workspace_id, n.parent_id, n.kind, n.name, n.orphaned_at, n.inherits_acl, c.depth + 1
             FROM node n JOIN chain c ON n.id = c.parent_id
            WHERE c.depth < ${MAX_DEPTH}
         )
         SELECT chain.*, trash_entry.deleted_at AS trashed_at
           FROM chain LEFT JOIN trash_entry ON trash_entry.node_id = chain.id`,
        [...ids],
      )
      .map(toRecord);
  }

  pathOf(id: NodeId): string {
    const chain = this.chainOf(id);
    if (chain.length === 0) {
      throw new Error(`node ${id} is missing while resolving its path`);
    }
    return chain
      .map((node) => node.name)
      .reverse()
      .join('/');
  }

  pathsIn(workspaceId: string): ReadonlyMap<NodeId, string> {
    // **질의는 한 번이다.** 워크스페이스의 노드를 통째로 받아 부모 사슬을
    // 메모리에서 따라간다 — `pathOf` 는 노드마다 재귀 CTE 를 돌리므로,
    // 1,300 개짜리 볼트에서 그 수만큼 질의가 난다.
    const all = this.allIn(workspaceId);
    const byId = new Map(all.map((node) => [node.id, node]));
    const paths = new Map<NodeId, string>();

    const 판다 = (id: NodeId, 보던것: Set<NodeId>): string => {
      const 이미 = paths.get(id);
      if (이미 !== undefined) return 이미;

      const node = byId.get(id);
      // 부모가 이 워크스페이스에 없다 — 사슬이 끊겼다. `chainOf` 는 이때
      // 던지는데 여기서 던지면 볼트 하나의 파손이 회차 전체를 멈춘다.
      // 이름만으로 접어 두고, 그 자리가 어긋난 사실은 재조정이 자기
      // 대기열로 드러낸다.
      if (node === undefined) return '';

      // 고리는 무결성 파손이다. `chainOf` 와 같은 판정을 여기서도 든다 —
      // 접어 두면 무한 재귀로 회차가 끝나지 않는다.
      if (보던것.has(id)) {
        throw new Error(`node ${id} sits on a parent cycle`);
      }
      보던것.add(id);

      const 위 = node.parentId === null ? '' : 판다(node.parentId, 보던것);
      const 경로 = 위 === '' ? node.name : `${위}/${node.name}`;
      paths.set(id, 경로);
      return 경로;
    };

    for (const node of all) 판다(node.id, new Set());
    return paths;
  }

  setInheritance(id: NodeId, inherits: boolean): void {
    this.store.run(
      "UPDATE node SET inherits_acl = ?, updated_at = datetime('now') WHERE id = ?",
      [inherits ? 1 : 0, id],
    );
  }

  relocate(id: NodeId, to: { parentId: NodeId | null; name: string }): void {
    // 한 문장이다. 자리와 이름이 함께 서거나 함께 서지 않는다 — 나누면
    // 그 사이에서 실패했을 때 새 부모 아래에 옛 이름이 남는다.
    this.store.run(
      "UPDATE node SET parent_id = ?, name = ?, updated_at = datetime('now') WHERE id = ?",
      [to.parentId, to.name, id],
    );
  }

  allIn(workspaceId: string): NodeRecord[] {
    return this.store
      .all<Row>(`SELECT ${COLUMNS} FROM ${NODE_SOURCE} WHERE node.workspace_id = ? ORDER BY node.rowid`, [workspaceId])
      .map(toRecord);
  }

  markOrphaned(id: NodeId, at: string): void {
    this.store.run('UPDATE node SET orphaned_at = ? WHERE id = ?', [at, id]);
  }

  clearOrphan(id: NodeId): void {
    this.store.run('UPDATE node SET orphaned_at = NULL WHERE id = ?', [id]);
  }

  remove(id: NodeId): void {
    // 지운 노드 앞으로 걸린 ACL 항목을 **함께** 걷는다.
    //
    // `acl_entry.node_id` 에는 외래키가 없다 — 그 칸이 워크스페이스 ID 도
    // 받기 때문이며(`001_init.sql`), 그래서 DB 가 대신 걷어 주지 않는다.
    // 남기면 그 ID 가 판정에서 되살아난다: 같은 ID 를 가리키는 호출자에게
    // 주인 없는 권한을 준다.
    //
    // 노드와 항목이 함께 사라지거나 함께 남는다 — 나누면 그 사이에서
    // 실패했을 때 주인 없는 권한이 영구히 남는다.
    this.store.transaction(() => {
      const doomed = this.store.all<{ id: string }>(
        `WITH RECURSIVE doomed(id, depth) AS (
           SELECT id, 0 FROM node WHERE id = ?
           UNION
           SELECT n.id, d.depth + 1 FROM node n JOIN doomed d ON n.parent_id = d.id
            WHERE d.depth < ${MAX_DEPTH}
         )
         SELECT id FROM doomed`,
        [id],
      );

      if (doomed.length > 0) {
        const placeholders = Array.from({ length: doomed.length }, () => '?').join(', ');
        this.store.run(`DELETE FROM acl_entry WHERE node_id IN (${placeholders})`, [
          ...doomed.map((row) => row.id),
        ]);
      }

      // 하위 노드는 `parent_id` 의 ON DELETE CASCADE 가 함께 지운다.
      this.store.run('DELETE FROM node WHERE id = ?', [id]);
    });
  }
}
