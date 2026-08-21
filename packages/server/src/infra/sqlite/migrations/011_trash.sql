-- 휴지통 인덱스 (FR-STORAGE-005 AC-3 · DR-STORAGE-004).
--
-- **이 테이블은 캐시다.** 정본은 파일시스템의 사이드카이며, 여기 있는
-- 같은 값들은 목록을 빠르게 훑기 위한 사본이다. 둘이 어긋나면 사이드카가
-- 이긴다(AC-3) — DB 가 손상돼도 파일시스템만으로 목록을 되세울 수 있어야
-- 하기 때문이며, 그래서 이 테이블을 통째로 비우고 다시 채우는 경로가 있다.
--
-- `node_id` 가 기본키다. 한 노드가 동시에 두 번 휴지통에 있을 수 없고,
-- 그 사실을 별도 제약으로 적을 필요가 없다.
--
-- `node` 에 외래키를 걸지 않는다. 노드 행은 삭제 시점에 남아 있지만
-- (FR-STORAGE-005 AC-5 — ACL 과 이력이 보존된다) 영구 삭제 때 순서가
-- 얽히면 한쪽이 다른 쪽을 막는다.
CREATE TABLE trash_entry (
  node_id        TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  original_path  TEXT NOT NULL,
  deleted_at     TEXT NOT NULL,
  deleted_by     TEXT NOT NULL
);

-- 목록은 워크스페이스 단위로, 청소는 삭제 시각 순으로 훑는다.
CREATE INDEX trash_by_workspace ON trash_entry (workspace_id, deleted_at);
CREATE INDEX trash_by_deleter ON trash_entry (deleted_by);
