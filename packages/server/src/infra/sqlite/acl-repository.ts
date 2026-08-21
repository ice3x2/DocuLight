import type { AclEntry } from '../../domain/acl/acl-entry.js';
import type { PermissionLevel } from '../../domain/acl/level.js';
import { newOpaqueId } from '../../domain/identity/opaque-id.js';
import type { AclRepository } from '../../domain/ports/acl-repository.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

interface Row {
  id: string;
  node_id: string;
  principal_id: string;
  level: PermissionLevel;
  granted_by: string | null;
}

const COLUMNS = 'id, node_id, principal_id, level, granted_by';

const toEntry = (row: Row): AclEntry => ({
  id: row.id,
  nodeId: row.node_id,
  principalId: row.principal_id,
  level: row.level,
  grantedBy: row.granted_by,
});

/** `?, ?, ?` — 목록 파라미터를 안전하게 펼친다. */
const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

/**
 * ACL 저장소의 SQLite 어댑터.
 *
 * 테이블은 `001_init.sql` 이 세웠다 — 거부 칸도 만료 칸도 없다. 그 부재가
 * `CON-ACL-002` 와 `CON-PRINCIPAL-005` 를 스키마로 못박은 자리다.
 */
export class SqliteAclRepository implements AclRepository {
  constructor(private readonly store: MetadataStore) {}

  grant(grant: {
    nodeId: string;
    principalId: PrincipalId;
    level: PermissionLevel;
    grantedBy: PrincipalId | null;
  }): AclEntry {
    // `acl_entry_unique` 가 (노드, 주체, 레벨) 을 하나로 묶는다. 중복 부여는
    // 오류가 아니라 무동작이다 — 합집합 모델에서 같은 항목 둘은 결과를
    // 바꾸지 못하면서 회수만 두 번 하게 만든다.
    this.store.run(
      `INSERT INTO acl_entry (id, node_id, principal_id, level, granted_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (node_id, principal_id, level) DO NOTHING`,
      [newOpaqueId(), grant.nodeId, grant.principalId, grant.level, grant.grantedBy],
    );

    const row = this.store.get<Row>(
      `SELECT ${COLUMNS} FROM acl_entry WHERE node_id = ? AND principal_id = ? AND level = ?`,
      [grant.nodeId, grant.principalId, grant.level],
    );
    if (row === undefined) {
      throw new Error(`acl grant vanished for node ${grant.nodeId}`);
    }
    return toEntry(row);
  }

  revoke(entryId: string): void {
    this.store.run('DELETE FROM acl_entry WHERE id = ?', [entryId]);
  }

  entriesFor(nodeIds: readonly string[], subjectIds: readonly PrincipalId[]): AclEntry[] {
    if (nodeIds.length === 0 || subjectIds.length === 0) return [];

    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM acl_entry
         WHERE node_id IN (${placeholders(nodeIds.length)})
           AND principal_id IN (${placeholders(subjectIds.length)})`,
        [...nodeIds, ...subjectIds],
      )
      .map(toEntry);
  }

  findEntry(entryId: string): AclEntry | undefined {
    const row = this.store.get<Row>(`SELECT ${COLUMNS} FROM acl_entry WHERE id = ?`, [entryId]);
    return row === undefined ? undefined : toEntry(row);
  }

  entriesOnAny(nodeIds: readonly string[]): AclEntry[] {
    if (nodeIds.length === 0) return [];

    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM acl_entry
         WHERE node_id IN (${placeholders(nodeIds.length)})
         ORDER BY granted_at, id`,
        [...nodeIds],
      )
      .map(toEntry);
  }

  entriesOn(nodeId: string): AclEntry[] {
    return this.store
      .all<Row>(`SELECT ${COLUMNS} FROM acl_entry WHERE node_id = ? ORDER BY granted_at, id`, [
        nodeId,
      ])
      .map(toEntry);
  }

  grantedNodeIds(subjectIds: readonly PrincipalId[]): string[] {
    if (subjectIds.length === 0) return [];

    return this.store
      .all<{ node_id: string }>(
        `SELECT DISTINCT node_id FROM acl_entry
         WHERE principal_id IN (${placeholders(subjectIds.length)})`,
        [...subjectIds],
      )
      .map((r) => r.node_id);
  }
}
