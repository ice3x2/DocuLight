import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { TrashRepository } from '../../domain/ports/trash-repository.js';
import type { TrashEntry } from '../../domain/trash/trash-entry.js';

interface Row {
  node_id: string;
  workspace_id: string;
  original_path: string;
  deleted_at: string;
  deleted_by: string;
}

const COLUMNS = 'node_id, workspace_id, original_path, deleted_at, deleted_by';

const toEntry = (row: Row): TrashEntry => ({
  nodeId: row.node_id,
  workspaceId: row.workspace_id,
  originalPath: row.original_path,
  deletedAt: row.deleted_at,
  deletedBy: row.deleted_by,
});

/** 휴지통 인덱스의 SQLite 어댑터. 정본이 아니라 사이드카의 캐시다. */
export class SqliteTrashRepository implements TrashRepository {
  constructor(private readonly store: MetadataStore) {}

  add(entry: TrashEntry): void {
    this.store.run(
      `INSERT INTO trash_entry (${COLUMNS}) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (node_id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         original_path = excluded.original_path,
         deleted_at = excluded.deleted_at,
         deleted_by = excluded.deleted_by`,
      [entry.nodeId, entry.workspaceId, entry.originalPath, entry.deletedAt, entry.deletedBy],
    );
  }

  find(nodeId: string): TrashEntry | undefined {
    const row = this.store.get<Row>(`SELECT ${COLUMNS} FROM trash_entry WHERE node_id = ?`, [nodeId]);
    return row === undefined ? undefined : toEntry(row);
  }

  listIn(workspaceId: string): TrashEntry[] {
    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM trash_entry WHERE workspace_id = ? ORDER BY deleted_at, node_id`,
        [workspaceId],
      )
      .map(toEntry);
  }

  listAll(): TrashEntry[] {
    return this.store
      .all<Row>(`SELECT ${COLUMNS} FROM trash_entry ORDER BY deleted_at, node_id`)
      .map(toEntry);
  }

  remove(nodeId: string): void {
    this.store.run('DELETE FROM trash_entry WHERE node_id = ?', [nodeId]);
  }

  replaceAll(workspaceId: string, entries: readonly TrashEntry[]): void {
    // 통째로 바꾼다 — 남은 행을 골라 지우면 사이드카에 없는 행이 조용히
    // 살아남고, 그 행이 곧 「실체 없는 목록 항목」이 된다.
    this.store.transaction(() => {
      this.store.run('DELETE FROM trash_entry WHERE workspace_id = ?', [workspaceId]);
      for (const entry of entries) this.add(entry);
    });
  }
}
