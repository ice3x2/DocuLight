import { newOpaqueId } from '../../domain/identity/opaque-id.js';
import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { PrincipalRepository } from '../../domain/ports/principal-repository.js';
import type {
  PrincipalId,
  PrincipalKind,
  PrincipalRecord,
  PrincipalStatus,
} from '../../domain/principal/principal.js';

const COLUMNS = 'id, kind, name, status';

/**
 * 주체 저장소의 SQLite 어댑터.
 *
 * 테이블은 `001_init.sql` 이, 시스템 그룹 두 개와 「멤버는 사용자만」
 * 트리거는 `006_principal_system_groups.sql` 이 세웠다.
 *
 * **사용자를 지우는 메서드가 없다** — 포트가 그 자리를 열지 않았고
 * (`CON-PRINCIPAL-003` AC-1), 어댑터가 포트에 없는 문을 새로 내지 않는다.
 */
export class SqlitePrincipalRepository implements PrincipalRepository {
  constructor(private readonly store: MetadataStore) {}

  private create(kind: PrincipalKind, name: string): PrincipalRecord {
    const id = newOpaqueId();
    this.store.run('INSERT INTO principal (id, kind, name, status) VALUES (?, ?, ?, ?)', [
      id,
      kind,
      name,
      'active',
    ]);
    return { id, kind, name, status: 'active' };
  }

  createUser(name: string): PrincipalRecord {
    return this.create('user', name);
  }

  createGroup(name: string): PrincipalRecord {
    return this.create('group', name);
  }

  findById(id: PrincipalId): PrincipalRecord | undefined {
    return this.store.get<PrincipalRecord>(`SELECT ${COLUMNS} FROM principal WHERE id = ?`, [id]);
  }

  list(kind: PrincipalKind): PrincipalRecord[] {
    return this.store.all<PrincipalRecord>(
      `SELECT ${COLUMNS} FROM principal WHERE kind = ? ORDER BY name`,
      [kind],
    );
  }

  rename(id: PrincipalId, name: string): void {
    this.store.run('UPDATE principal SET name = ? WHERE id = ?', [name, id]);
  }

  removeGroup(id: PrincipalId): void {
    this.store.run("DELETE FROM principal WHERE id = ? AND kind = 'group'", [id]);
  }

  setStatus(id: PrincipalId, status: PrincipalStatus): void {
    this.store.run('UPDATE principal SET status = ? WHERE id = ?', [status, id]);
  }

  addMember(groupId: PrincipalId, userId: PrincipalId): void {
    // 그룹을 넘기면 `006` 의 트리거가 던진다 — 검사를 여기 두면 저장소를
    // 만지는 두 번째 경로가 생기는 순간 무너진다.
    this.store.run('INSERT INTO group_member (group_id, user_id) VALUES (?, ?)', [groupId, userId]);
  }

  removeMember(groupId: PrincipalId, userId: PrincipalId): void {
    this.store.run('DELETE FROM group_member WHERE group_id = ? AND user_id = ?', [
      groupId,
      userId,
    ]);
  }

  groupsOf(userId: PrincipalId): PrincipalId[] {
    return this.store
      .all<{ group_id: string }>('SELECT group_id FROM group_member WHERE user_id = ?', [userId])
      .map((r) => r.group_id);
  }

  membersOf(groupId: PrincipalId): PrincipalId[] {
    return this.store
      .all<{ user_id: string }>('SELECT user_id FROM group_member WHERE group_id = ?', [groupId])
      .map((r) => r.user_id);
  }
}
