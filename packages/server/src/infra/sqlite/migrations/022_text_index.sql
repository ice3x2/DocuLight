CREATE TABLE text_index_job (
  node_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  expected_fingerprint TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('prepared', 'pending', 'running', 'failed')),
  claim_id TEXT,
  error_code TEXT CHECK (error_code IN ('read_failed', 'parse_failed', 'index_failed'))
);

CREATE TABLE text_index_projection (
  node_id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  document_value TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  pages_json TEXT NOT NULL
);
