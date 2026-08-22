import type { FavoriteRepository } from '../../domain/ports/favorite-repository.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { NodeId } from '../../domain/node/node-id.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

/**
 * 즐겨찾기의 SQLite 어댑터.
 *
 * **여기는 캐시가 아니라 정본이다.** 즐겨찾기에는 파일시스템 실체가
 * 없으므로 사이드카로 되세울 것도 없다 — 사람이 만든 목록이고 그 목록의
 * 출처는 이 표 하나다.
 */
export class SqliteFavoriteRepository implements FavoriteRepository {
  constructor(private readonly store: MetadataStore) {}

  add(subjectId: PrincipalId, nodeId: NodeId): void {
    // 이미 있으면 그대로 둔다 — 다시 넣으면 rowid 가 바뀌어 목록의
    // 순서가 조용히 흔들린다.
    this.store.run(
      'INSERT INTO favorite (subject_id, node_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
      [subjectId, nodeId],
    );
  }

  remove(subjectId: PrincipalId, nodeId: NodeId): void {
    this.store.run('DELETE FROM favorite WHERE subject_id = ? AND node_id = ?', [
      subjectId,
      nodeId,
    ]);
  }

  listOf(subjectId: PrincipalId): NodeId[] {
    return this.store
      .all<{ node_id: string }>(
        'SELECT node_id FROM favorite WHERE subject_id = ? ORDER BY rowid',
        [subjectId],
      )
      .map((row) => row.node_id);
  }
}
