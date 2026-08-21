-- 감사 로그의 대상 축에 워크스페이스를 더한다.
--
-- 002 가 연 최소형은 노드만 가리킬 수 있어, 워크스페이스 단위로 일어난
-- 일(중복 사이드카 격리 — `DR-WORKSPACE-002` AC-6)을 적을 자리가 없다.
-- `node_id` 에 워크스페이스를 넣지 않는 이유는 한 칸이 두 사실을 담게
-- 되어 읽는 쪽이 어느 쪽인지 판정할 수 없기 때문이다.
--
-- 002 와 같은 원칙이다 — 전체 스키마는 `R84` 계열이 소유하며 뒤 wave 가
-- 확정한다. 여기서는 wave-1 이 실제로 적어야 하는 사실만큼만 연다.
ALTER TABLE audit_log ADD COLUMN workspace_id TEXT;

CREATE INDEX audit_log_by_workspace ON audit_log (workspace_id, occurred_at);
