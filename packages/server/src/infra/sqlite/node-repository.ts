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
}

const COLUMNS = 'id, workspace_id, parent_id, kind, name, orphaned_at';

function toRecord(row: Row): NodeRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
    orphanedAt: row.orphaned_at,
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
    const row = this.store.get<Row>(`SELECT ${COLUMNS} FROM node WHERE id = ?`, [id]);
    return row === undefined ? undefined : toRecord(row);
  }

  children(where: { workspaceId: string; parentId: NodeId | null; except?: NodeId }): NodeRecord[] {
    // `IS` 는 SQLite 의 널 안전 등가 비교다. `=` 로 쓰면 루트 형제(부모가
    // NULL)가 한 건도 걸리지 않아 충돌이 조용히 통과한다.
    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM node WHERE workspace_id = ? AND parent_id IS ? AND id IS NOT ? ORDER BY rowid`,
        [where.workspaceId, where.parentId, where.except ?? null],
      )
      .map(toRecord);
  }

  pathOf(id: NodeId): string {
    const segments: string[] = [];
    const visited = new Set<string>();
    let cursor: string | null = id;

    while (cursor !== null) {
      // 부모 사슬은 트리라 고리가 있을 수 없다 — 그러나 없다고 **가정**하면
      // 고리가 한 번 생겼을 때 이 루프가 돌아오지 않아 프로세스가 죽는다.
      // 응용 계층이 고리를 막고(`node-service`), 여기서 한 번 더 확인한다.
      if (visited.has(cursor)) {
        throw new Error(`node ${id} sits on a parent cycle through ${cursor}`);
      }
      visited.add(cursor);

      const row: Row | undefined = this.store.get<Row>(
        `SELECT ${COLUMNS} FROM node WHERE id = ?`,
        [cursor],
      );
      if (row === undefined) {
        // 사슬 중간이 끊긴 것은 정상 분기가 아니라 무결성 파손이다.
        // 외래키가 켜져 있으므로(`database.ts`) 여기 닿으려면 스키마 밖에서
        // 손댄 것뿐이며, 그때는 빈 문자열보다 멈추는 편이 낫다.
        throw new Error(`node ${cursor} is missing while resolving the path of ${id}`);
      }
      segments.unshift(row.name);
      cursor = row.parent_id;
    }

    return segments.join('/');
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
      .all<Row>(`SELECT ${COLUMNS} FROM node WHERE workspace_id = ? ORDER BY rowid`, [workspaceId])
      .map(toRecord);
  }

  markOrphaned(id: NodeId, at: string): void {
    this.store.run('UPDATE node SET orphaned_at = ? WHERE id = ?', [at, id]);
  }

  clearOrphan(id: NodeId): void {
    this.store.run('UPDATE node SET orphaned_at = NULL WHERE id = ?', [id]);
  }

  remove(id: NodeId): void {
    // 하위는 `parent_id` 의 ON DELETE CASCADE 가 함께 지운다.
    this.store.run('DELETE FROM node WHERE id = ?', [id]);
  }
}
