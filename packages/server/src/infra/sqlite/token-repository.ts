import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { TokenRecord, TokenRepository } from '../../domain/ports/token-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';
import type { TokenScope } from '../../domain/auth/token-scope.js';

interface Row {
  id: string;
  user_id: string;
  name: string;
  scope: TokenScope;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

// `token_hash` 는 이 목록에 없다 — 밖으로 나가는 레코드에 실을 이유가 없고,
// 실리면 목록 응답에 섞인다.
const COLUMNS = 'id, user_id, name, scope, created_at, expires_at, last_used_at, revoked_at';

const toRecord = (row: Row): TokenRecord => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  scope: row.scope,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

/** PAT 저장소의 SQLite 어댑터. 테이블은 `010_session_and_token.sql` 이 세웠다. */
export class SqliteTokenRepository implements TokenRepository {
  constructor(private readonly store: MetadataStore) {}

  issue(tokenHash: string, token: Omit<TokenRecord, 'lastUsedAt' | 'revokedAt'>): void {
    this.store.run(
      `INSERT INTO personal_access_token
         (id, token_hash, user_id, name, scope, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        token.id,
        tokenHash,
        token.userId,
        token.name,
        token.scope,
        token.createdAt,
        token.expiresAt,
      ],
    );
  }

  findByHash(tokenHash: string): TokenRecord | undefined {
    const row = this.store.get<Row>(
      `SELECT ${COLUMNS} FROM personal_access_token WHERE token_hash = ?`,
      [tokenHash],
    );
    return row === undefined ? undefined : toRecord(row);
  }

  findById(id: string): TokenRecord | undefined {
    const row = this.store.get<Row>(`SELECT ${COLUMNS} FROM personal_access_token WHERE id = ?`, [
      id,
    ]);
    return row === undefined ? undefined : toRecord(row);
  }

  listFor(userId: PrincipalId): TokenRecord[] {
    return this.store
      .all<Row>(
        `SELECT ${COLUMNS} FROM personal_access_token WHERE user_id = ? ORDER BY created_at, id`,
        [userId],
      )
      .map(toRecord);
  }

  touch(id: string, at: string): void {
    this.store.run('UPDATE personal_access_token SET last_used_at = ? WHERE id = ?', [at, id]);
  }

  revoke(id: string, at: string): void {
    // 이미 폐기된 것을 다시 폐기해도 **첫 시각이 남는다** — 나중 시각으로
    // 덮으면 언제 닫혔는지가 사라진다.
    this.store.run(
      'UPDATE personal_access_token SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
      [at, id],
    );
  }
}
