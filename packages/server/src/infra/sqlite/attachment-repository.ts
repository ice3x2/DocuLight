import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type {
  AttachmentRecord,
  AttachmentRepository,
} from '../../domain/ports/attachment-repository.js';

interface Row {
  workspace_id: string;
  hash: string;
  owner_node_id: string;
  extension: string;
  size: number;
  created_at: string;
}

const COLUMNS = 'workspace_id, hash, owner_node_id, extension, size, created_at';

const toRecord = (row: Row): AttachmentRecord => ({
  workspaceId: row.workspace_id,
  hash: row.hash,
  ownerNodeId: row.owner_node_id,
  extension: row.extension,
  size: row.size,
  createdAt: row.created_at,
});

/** 첨부 소유의 SQLite 어댑터. 정본이 아니라 `.res/index.json` 의 캐시다. */
export class SqliteAttachmentRepository implements AttachmentRepository {
  constructor(private readonly store: MetadataStore) {}

  add(record: AttachmentRecord): void {
    this.store.run(
      `INSERT INTO attachment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspace_id, hash) DO UPDATE SET
         owner_node_id = excluded.owner_node_id,
         extension = excluded.extension,
         size = excluded.size,
         created_at = excluded.created_at`,
      [
        record.workspaceId,
        record.hash,
        record.ownerNodeId,
        record.extension,
        record.size,
        record.createdAt,
      ],
    );
  }

  find(workspaceId: string, hash: string): AttachmentRecord | undefined {
    const row = this.store.get<Row>(
      `SELECT ${COLUMNS} FROM attachment WHERE workspace_id = ? AND hash = ?`,
      [workspaceId, hash],
    );
    return row === undefined ? undefined : toRecord(row);
  }

  listOf(ownerNodeId: string): AttachmentRecord[] {
    return this.store
      .all<Row>(`SELECT ${COLUMNS} FROM attachment WHERE owner_node_id = ? ORDER BY created_at`, [
        ownerNodeId,
      ])
      .map(toRecord);
  }

  removeAllOf(ownerNodeId: string): void {
    this.store.run('DELETE FROM attachment WHERE owner_node_id = ?', [ownerNodeId]);
  }

  replaceAllIn(workspaceId: string, records: readonly AttachmentRecord[]): void {
    this.store.run('DELETE FROM attachment WHERE workspace_id = ?', [workspaceId]);
    for (const record of records) this.add(record);
  }
}
