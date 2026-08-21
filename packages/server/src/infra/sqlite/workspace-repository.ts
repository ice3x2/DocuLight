import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { WorkspaceRepository } from '../../domain/ports/workspace-repository.js';
import { newWorkspaceId, type Workspace, type WorkspaceId } from '../../domain/workspace/workspace.js';

/**
 * 워크스페이스 저장소의 SQLite 어댑터.
 *
 * 테이블은 `001_init.sql` 이 이미 세웠다 — `id` 와 `name` 뿐이고 부모를
 * 담는 칸이 없다. 표시 이름의 권위가 DB 라는 것(`R40-d`)이 이 자리다.
 */
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly store: MetadataStore) {}

  create(name: string): WorkspaceId {
    const id = newWorkspaceId();
    this.store.run('INSERT INTO workspace (id, name) VALUES (?, ?)', [id, name]);
    return id;
  }

  findById(id: WorkspaceId): Workspace | undefined {
    return this.store.get<Workspace>('SELECT id, name FROM workspace WHERE id = ?', [id]);
  }

  rename(id: WorkspaceId, name: string): void {
    // 물리 경로는 ID 로 정해지므로 여기서 디렉토리를 옮기지 않는다.
    this.store.run('UPDATE workspace SET name = ? WHERE id = ?', [name, id]);
  }

  list(): Workspace[] {
    return this.store.all<Workspace>('SELECT id, name FROM workspace ORDER BY created_at, rowid');
  }
}
