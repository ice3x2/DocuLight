import type { Database } from './database.js';

export type TextIndexErrorCode = 'read_failed' | 'parse_failed' | 'index_failed';
export type TextIndexStatus = 'pending' | 'running' | 'failed';

export interface TextIndexClaim {
  nodeId: string;
  generation: number;
  expectedFingerprint: string;
  claimId: string;
}

interface JobRow {
  node_id: string; generation: number; expected_fingerprint: string; requested_at: string;
  state: 'prepared' | TextIndexStatus; claim_id: string | null; error_code: TextIndexErrorCode | null;
}

export class SqliteTextIndexRepository {
  constructor(private readonly db: Database) {}

  transaction<T>(fn: () => T): T { return this.db.transaction(fn); }

  prepare(nodeId: string, expectedFingerprint: string, requestedAt = new Date().toISOString()) {
    const prior = this.db.get<{ generation: number }>('SELECT generation FROM text_index_job WHERE node_id = ?', [nodeId]);
    const generation = (prior?.generation ?? 0) + 1;
    this.db.run(`INSERT INTO text_index_job(node_id,generation,expected_fingerprint,requested_at,state,claim_id,error_code)
      VALUES(?,?,?,?, 'prepared',NULL,NULL)
      ON CONFLICT(node_id) DO UPDATE SET generation=excluded.generation,expected_fingerprint=excluded.expected_fingerprint,
      requested_at=excluded.requested_at,state='prepared',claim_id=NULL,error_code=NULL`, [nodeId, generation, expectedFingerprint, requestedAt]);
    return { nodeId, generation };
  }

  ready(nodeId: string, generation: number, actualFingerprint: string): boolean {
    const current = this.db.get<JobRow>('SELECT * FROM text_index_job WHERE node_id = ?', [nodeId]);
    if (current?.generation !== generation || current.expected_fingerprint !== actualFingerprint) return false;
    this.db.run("UPDATE text_index_job SET state='pending',claim_id=NULL,error_code=NULL WHERE node_id=? AND generation=?", [nodeId, generation]);
    return true;
  }

  reconcileClaim(claim: TextIndexClaim, actualFingerprint: string, requestedAt = new Date().toISOString()): boolean {
    return this.db.transaction(() => {
      const current = this.db.get<JobRow>('SELECT * FROM text_index_job WHERE node_id=?', [claim.nodeId]);
      if (current?.generation !== claim.generation || current.state !== 'running' || current.claim_id !== claim.claimId) return false;
      const projection = this.db.get<{ fingerprint: string }>('SELECT fingerprint FROM text_index_projection WHERE node_id=?', [claim.nodeId]);
      if (projection?.fingerprint === actualFingerprint) {
        this.db.run("DELETE FROM text_index_job WHERE node_id=? AND generation=? AND state='running' AND claim_id=?", [claim.nodeId, claim.generation, claim.claimId]);
        return true;
      }
      const next = this.prepare(claim.nodeId, actualFingerprint, requestedAt);
      this.ready(claim.nodeId, next.generation, actualFingerprint);
      return true;
    });
  }

  claimNext(claimId: string): TextIndexClaim | undefined {
    return this.db.transaction(() => {
      const row = this.db.get<JobRow>("SELECT * FROM text_index_job WHERE state='pending' ORDER BY requested_at,node_id LIMIT 1");
      if (row === undefined) return undefined;
      this.db.run("UPDATE text_index_job SET state='running',claim_id=? WHERE node_id=? AND generation=? AND state='pending'", [claimId, row.node_id, row.generation]);
      return { nodeId: row.node_id, generation: row.generation, expectedFingerprint: row.expected_fingerprint, claimId };
    });
  }

  complete(claim: TextIndexClaim, projection: { body: string; tags: readonly string[]; pages: readonly { page: number; text: string }[] }): boolean {
    return this.db.transaction(() => {
      const row = this.db.get<JobRow>('SELECT * FROM text_index_job WHERE node_id=?', [claim.nodeId]);
      if (row?.generation !== claim.generation || row.state !== 'running' || row.claim_id !== claim.claimId) return false;
      this.db.run(`INSERT INTO text_index_projection(node_id,generation,fingerprint,document_value,tags_json,pages_json) VALUES(?,?,?,?,?,?)
        ON CONFLICT(node_id) DO UPDATE SET generation=excluded.generation,fingerprint=excluded.fingerprint,document_value=excluded.document_value,tags_json=excluded.tags_json,pages_json=excluded.pages_json`,
      [claim.nodeId, claim.generation, claim.expectedFingerprint, projection.body, JSON.stringify(projection.tags), JSON.stringify(projection.pages)]);
      this.db.run('DELETE FROM text_index_job WHERE node_id=? AND generation=? AND claim_id=?', [claim.nodeId, claim.generation, claim.claimId]);
      return true;
    });
  }

  fail(nodeId: string, generation: number, claimId: string, errorCode: TextIndexErrorCode): boolean {
    const row = this.db.get<JobRow>('SELECT * FROM text_index_job WHERE node_id=?', [nodeId]);
    if (row?.generation !== generation || row.state !== 'running' || row.claim_id !== claimId) return false;
    this.db.run("UPDATE text_index_job SET state='failed',error_code=?,claim_id=NULL WHERE node_id=? AND generation=?", [errorCode, nodeId, generation]);
    return true;
  }

  recover(): void {
    this.db.run("UPDATE text_index_job SET state='pending',claim_id=NULL,error_code=NULL WHERE state IN ('running','failed')");
  }

  prepared(): readonly { nodeId: string; generation: number; expectedFingerprint: string }[] {
    return this.db.all<JobRow>("SELECT * FROM text_index_job WHERE state='prepared' ORDER BY requested_at,node_id")
      .map((row) => ({ nodeId: row.node_id, generation: row.generation, expectedFingerprint: row.expected_fingerprint }));
  }

  remove(nodeId: string): void {
    this.db.transaction(() => { this.db.run('DELETE FROM text_index_job WHERE node_id=?', [nodeId]); this.db.run('DELETE FROM text_index_projection WHERE node_id=?', [nodeId]); });
  }

  projection(nodeId: string): { body: string; tags: string[]; pages: { page: number; text: string }[] } | undefined {
    const row = this.db.get<{ document_value: string; tags_json: string; pages_json: string }>('SELECT document_value,tags_json,pages_json FROM text_index_projection WHERE node_id=?', [nodeId]);
    return row === undefined ? undefined : { body: row.document_value, tags: JSON.parse(row.tags_json) as string[], pages: JSON.parse(row.pages_json) as { page: number; text: string }[] };
  }

  isCurrentOrQueued(nodeId: string, fingerprint: string): boolean {
    const projection = this.db.get<{ fingerprint: string }>('SELECT fingerprint FROM text_index_projection WHERE node_id=?', [nodeId]);
    if (projection?.fingerprint === fingerprint) return true;
    const job = this.db.get<{ expected_fingerprint: string }>('SELECT expected_fingerprint FROM text_index_job WHERE node_id=?', [nodeId]);
    return job?.expected_fingerprint === fingerprint;
  }

  snapshot(limit = 100) {
    const rows = this.db.all<JobRow>("SELECT * FROM text_index_job WHERE state <> 'prepared' ORDER BY requested_at,node_id");
    const counts = { pending: 0, running: 0, failed: 0 };
    for (const row of rows) counts[row.state as TextIndexStatus] += 1;
    return { counts, total: rows.length, limit: 100 as const, items: rows.slice(0, limit).map((row) => ({ nodeId: row.node_id, status: row.state as TextIndexStatus, requestedAt: row.requested_at, ...(row.error_code === null ? {} : { errorCode: row.error_code }) })) };
  }
}
