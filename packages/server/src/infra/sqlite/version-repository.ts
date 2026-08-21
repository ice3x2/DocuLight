import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type {
  EditSessionRecord,
  VersionRecord,
  VersionRepository,
} from '../../domain/ports/version-repository.js';

interface VersionRow {
  node_id: string;
  seq: number;
  created_at: string;
  author: string;
}

interface SessionRow {
  id: string;
  node_id: string;
  actor_id: string;
  started_at: string;
  snapshot_seq: number | null;
}

const COLUMNS = 'node_id, seq, created_at, author';

const toRecord = (row: VersionRow): VersionRecord => ({
  nodeId: row.node_id,
  seq: row.seq,
  createdAt: row.created_at,
  author: row.author,
});

/** 버전 인덱스의 SQLite 어댑터. 정본이 아니라 사이드카의 캐시다. */
export class SqliteVersionRepository implements VersionRepository {
  constructor(private readonly store: MetadataStore) {}

  add(record: VersionRecord): void {
    this.store.run(
      `INSERT INTO document_version (${COLUMNS}) VALUES (?, ?, ?, ?)
       ON CONFLICT (node_id, seq) DO UPDATE SET
         created_at = excluded.created_at,
         author = excluded.author`,
      [record.nodeId, record.seq, record.createdAt, record.author],
    );
  }

  listOf(nodeId: string): VersionRecord[] {
    return this.store
      .all<VersionRow>(`SELECT ${COLUMNS} FROM document_version WHERE node_id = ? ORDER BY seq`, [nodeId])
      .map(toRecord);
  }

  remove(nodeId: string, seq: number): void {
    this.store.run('DELETE FROM document_version WHERE node_id = ? AND seq = ?', [nodeId, seq]);
  }

  nextSeq(nodeId: string): number {
    // 폐기된 순번을 다시 쓰지 않는다 — 같은 번호가 두 내용을 가리키면
    // 사이드카로 인덱스를 되세울 때 어느 쪽이 진짜인지 알 수 없다.
    const row = this.store.get<{ next: number }>(
      'SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM document_version WHERE node_id = ?',
      [nodeId],
    );
    return row?.next ?? 1;
  }

  replaceAllOf(nodeId: string, records: readonly VersionRecord[]): void {
    this.store.run('DELETE FROM document_version WHERE node_id = ?', [nodeId]);
    for (const record of records) this.add(record);
  }

  openSession(record: EditSessionRecord): void {
    this.store.run(
      'INSERT INTO edit_session (id, node_id, actor_id, started_at, snapshot_seq) VALUES (?, ?, ?, ?, ?)',
      [record.id, record.nodeId, record.actorId, record.startedAt, record.snapshotSeq],
    );
  }

  findSession(id: string): EditSessionRecord | undefined {
    const row = this.store.get<SessionRow>(
      'SELECT id, node_id, actor_id, started_at, snapshot_seq FROM edit_session WHERE id = ?',
      [id],
    );
    if (row === undefined) return undefined;

    return {
      id: row.id,
      nodeId: row.node_id,
      actorId: row.actor_id,
      startedAt: row.started_at,
      snapshotSeq: row.snapshot_seq,
    };
  }

  markSnapshot(id: string, seq: number): void {
    this.store.run('UPDATE edit_session SET snapshot_seq = ? WHERE id = ?', [seq, id]);
  }
}
