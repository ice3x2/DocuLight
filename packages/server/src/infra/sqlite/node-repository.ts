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
}

const COLUMNS = 'id, workspace_id, parent_id, kind, name';

function toRecord(row: Row): NodeRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    parentId: row.parent_id,
    kind: row.kind,
    name: row.name,
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

  pathOf(id: NodeId): string {
    const segments: string[] = [];
    let cursor: string | null = id;

    while (cursor !== null) {
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
}
