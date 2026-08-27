import type { NodeId } from '../../domain/node/node-id.js';
import type { VectorEntry, VectorIndex } from '../../domain/ports/vector-index.js';
import type { Database } from './database.js';

/**
 * 벡터 인덱스의 SQLite 구현 (`SEC-STORAGE-007`).
 *
 * 노드 삭제에 기대어 엔트리가 저절로 사라지게 두지 **않는다** — 외래키
 * 연쇄 삭제로 두면 「같은 처리 안에서 지운다」가 데이터베이스 설정에
 * 달리게 되고, 그 설정이 꺼진 인스턴스에서는 조항이 조용히 성립하지
 * 않는다. 지우는 일을 코드가 명시적으로 한다.
 */
export class SqliteVectorIndex implements VectorIndex {
  // 스키마는 마이그레이션이 세운다(`021_vector_entry.sql`) — 저장소가 자기
  // 테이블을 만들면 스키마의 정의 지점이 둘이 되고, 그 둘이 갈릴 때
  // 어느 쪽이 실제인지는 실행 순서가 정한다.
  constructor(private readonly db: Database) {}

  put(entry: VectorEntry): void {
    this.db.run('INSERT INTO vector_entry (node_id, workspace_id, chunk) VALUES (?, ?, ?)', [
      entry.nodeId,
      entry.workspaceId,
      entry.chunk,
    ]);
  }

  removeNode(nodeId: NodeId): void {
    this.db.run('DELETE FROM vector_entry WHERE node_id = ?', [nodeId]);
  }

  relocate(nodeId: NodeId, workspaceId: string): void {
    this.db.run('UPDATE vector_entry SET workspace_id = ? WHERE node_id = ?', [
      workspaceId,
      nodeId,
    ]);
  }

  entriesOf(nodeId: NodeId): VectorEntry[] {
    return this.db
      .all<{ node_id: string; workspace_id: string; chunk: string }>(
        'SELECT node_id, workspace_id, chunk FROM vector_entry WHERE node_id = ?',
        [nodeId],
      )
      .map((row) => ({ nodeId: row.node_id, workspaceId: row.workspace_id, chunk: row.chunk }));
  }
}
