-- 상대 노드가 비면 대상 역할도 비어야 한다 (`DR-AUDIT-002` AC-5).
--
-- 018 이 대상 역할의 **값**은 CHECK 로 닫았지만 두 칸의 **짝**은 응용
-- 계층에만 있었다. 같은 요구의 AC-3 에 이미 「응용 계층만 막으면 저장소를
-- 직접 만지는 경로가 남는다」는 잣대를 댔으므로 AC-5 에도 같은 잣대를 댄다.
--
-- 두 칸에 걸린 조건이라 테이블 수준 CHECK 가 필요한데, SQLite 의
-- `ALTER TABLE` 은 그것을 추가하지 못한다. 테이블을 다시 세우는 방법은
-- 여기서 쓸 수 없다 — `foreign_keys=ON` 인 채로 `audit_log` 를 가리키는
-- 두 테이블(`reconciliation_finding` 계열)이 있고, 재조립 절차는 마이그레이션
-- 트랜잭션 **밖에서** 그 PRAGMA 를 꺼야 한다.
--
-- 그래서 트리거다. 이 저장소가 이미 쓰는 방식이며(주체 종류 강제),
-- 감사 로그에는 추가 경로가 없다 — 쓰기는 삽입 하나뿐이고 수정·삭제
-- 메서드 자체를 두지 않는다(`OBS-AUDIT-002`).
CREATE TRIGGER audit_log_role_needs_counterpart
BEFORE INSERT ON audit_log
WHEN NEW.target_role IS NOT NULL AND NEW.counterpart_node_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'audit_log.target_role requires counterpart_node_id');
END;
