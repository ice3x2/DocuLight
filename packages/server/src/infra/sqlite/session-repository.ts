import type { MetadataStore } from '../../domain/ports/metadata-store.js';
import type { SessionRecord, SessionRepository } from '../../domain/ports/session-repository.js';
import type { PrincipalId } from '../../domain/principal/principal.js';

interface Row {
  user_id: string;
  created_at: string;
  expires_at: string;
}

const toRecord = (row: Row): SessionRecord => ({
  userId: row.user_id,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

/** 세션 저장소의 SQLite 어댑터. 테이블은 `010_session_and_token.sql` 이 세웠다. */
export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly store: MetadataStore) {}

  create(tokenHash: string, session: SessionRecord): void {
    this.store.run(
      'INSERT INTO session (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [tokenHash, session.userId, session.createdAt, session.expiresAt],
    );
  }

  find(tokenHash: string): SessionRecord | undefined {
    const row = this.store.get<Row>(
      'SELECT user_id, created_at, expires_at FROM session WHERE token_hash = ?',
      [tokenHash],
    );
    return row === undefined ? undefined : toRecord(row);
  }

  remove(tokenHash: string): void {
    this.store.run('DELETE FROM session WHERE token_hash = ?', [tokenHash]);
  }

  removeAllFor(userId: PrincipalId): void {
    this.store.run('DELETE FROM session WHERE user_id = ?', [userId]);
  }
}
