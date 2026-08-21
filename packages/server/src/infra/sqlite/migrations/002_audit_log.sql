-- 감사 로그의 **최소형**. 재조정이 쓰기에 필요한 만큼만 연다.
--
-- 전체 스키마는 `R84` 계열(AUDIT scope)이 소유하며 뒤 wave 가 확정한다.
-- 여기서 그 형태를 못박으면 그 wave 가 자기 조항을 구현할 때 이미 굳은
-- 스키마와 다투게 되므로, 확장 가능한 최소형만 둔다.
--
-- 행은 기록된 뒤 수정·삭제되지 않는다(`R84-a`). 그 불변성은 스키마가 아니라
-- 접근 경로가 지킨다 — UPDATE·DELETE 를 여는 저장소 메서드를 만들지 않는다.
CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
  operation    TEXT NOT NULL,
  actor        TEXT NOT NULL,
  node_id      TEXT
);

CREATE INDEX audit_log_by_node ON audit_log (node_id, occurred_at);
CREATE INDEX audit_log_by_actor ON audit_log (actor, occurred_at);
