-- 재조정 대기열 (`REL-AUDIT-001` · 원장 `R139` 계열 8행).
--
-- 세 축뿐이다 — 유형 · 참조 감사 행 1..N · 해소 감사 행.
--
-- **두지 않는 칸과 그 근거** (계약: docs/analysis/kiwi-planner-…/T-PH002-03-queue-contract.md)
--   occurred_at · node_id · actor  → R139  : 참조 감사 행에서 읽는다
--   resolved_at · resolver         → R139-c: 해소 감사 행에서 읽는다
--   workspace_id                   → R139-e: 참조 감사 행들의 대상 노드에서 파생한다
--   status / is_resolved           → R139  : 미해소는 resolution_audit_id 가 빈 상태다
--   path                           → R139-a: 경로를 자기 칸으로 갖지 않는 것이 R124 면제의 조건
--
-- 칸을 하나라도 더하면 같은 사실이 두 곳에 적히고, 그 순간 R139-a 가 든
-- R124 면제 근거("값이 갈릴 자리를 만들지 않는다")가 무너진다.
CREATE TABLE reconciliation_finding (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL,
  -- 이 행의 유일한 nullable 칸. 비어 있음이 곧 미해소다.
  resolution_audit_id  TEXT REFERENCES audit_log (id)
);

CREATE INDEX reconciliation_finding_unresolved
  ON reconciliation_finding (resolution_audit_id)
  WHERE resolution_audit_id IS NULL;

-- 참조는 1..N 이라 별도 테이블이다. 두 칸 모두 NOT NULL —
-- 비우면 시각·대상 노드·행위자의 유일한 출처가 사라진다.
--
-- 「1건 이상」은 스키마로 강제할 수 없으므로 삽입 경로가 지킨다
-- (`SqliteFindingQueue.open`).
CREATE TABLE reconciliation_finding_audit_ref (
  finding_id    TEXT NOT NULL REFERENCES reconciliation_finding (id) ON DELETE CASCADE,
  audit_log_id  TEXT NOT NULL REFERENCES audit_log (id),
  ordinal       INTEGER NOT NULL,
  PRIMARY KEY (finding_id, ordinal)
);

CREATE INDEX reconciliation_finding_audit_ref_by_audit
  ON reconciliation_finding_audit_ref (audit_log_id);
