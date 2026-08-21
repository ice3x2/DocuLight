-- 첨부 소유 (DR-ATTACH-002).
--
-- **이 테이블은 캐시다.** 정본은 `.res/index.json` 이며, DB 를 비워도
-- `.res` 디렉토리만으로 소유 관계를 되세울 수 있어야 한다(REL-ATTACH-001).
--
-- `owner_node_id` 는 그 첨부를 **삽입한** 문서다. 참조하는 문서가 아니다 —
-- 참조로 권한이 옮겨가면 누구든 링크를 적어 남의 첨부를 열 수 있다
-- (SEC-ATTACH-002 AC-5).
--
-- 기본키가 (workspace_id, hash) 인 이유는 같은 내용이 두 워크스페이스에
-- 올라올 수 있고 그 둘은 서로 다른 권한 아래 있기 때문이다.
CREATE TABLE attachment (
  workspace_id   TEXT NOT NULL,
  hash           TEXT NOT NULL,
  owner_node_id  TEXT NOT NULL,
  extension      TEXT NOT NULL,
  size           INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, hash)
);

-- 소유 문서를 영구 삭제할 때 그 문서의 첨부를 훑는다.
CREATE INDEX attachment_by_owner ON attachment (owner_node_id);
