-- 벡터 인덱스 엔트리 (`SEC-STORAGE-007`).
--
-- 노드에 외래키를 걸어 연쇄 삭제로 두지 **않는다.** 그렇게 두면 「삭제와
-- 같은 처리 안에서 지운다」가 데이터베이스 설정(`PRAGMA foreign_keys`)에
-- 달리게 되고, 그 설정이 꺼진 인스턴스에서는 조항이 조용히 성립하지 않는다.
-- 지우는 일은 응용 계층이 명시적으로 한다.
--
-- 조각의 내용과 벡터 표현은 이 테이블이 정하지 않는다 — 무엇을 색인하는지는
-- 의미 검색 쪽이 소유한다.
CREATE TABLE IF NOT EXISTS vector_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  chunk TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS vector_entry_node ON vector_entry (node_id);
