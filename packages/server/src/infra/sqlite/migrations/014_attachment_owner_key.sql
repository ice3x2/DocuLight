-- 첨부 소유를 **문서마다 한 행**으로 바꾼다 (DR-ATTACH-002 · SEC-ATTACH-002).
--
-- 013 의 기본키 `(workspace_id, hash)` 는 같은 바이트를 두 문서에 올릴 수
-- 없다는 가정을 담고 있었다. 그 가정이 깨지면 마지막 업로더가 소유를
-- 덮어써서 ① 앞 문서에서 그 첨부가 열리지 않고 ② 뒤 문서를 영구 삭제하면
-- 살아 있는 앞 문서의 첨부 실체가 함께 사라진다.
--
-- 실체는 여전히 해시 하나만 남는다 — 내용이 같으면 같은 파일이다. 바뀌는
-- 것은 **누가 그것을 소유하는가**이며, 그것은 문서마다 다르다.
CREATE TABLE attachment_next (
  workspace_id   TEXT NOT NULL,
  hash           TEXT NOT NULL,
  owner_node_id  TEXT NOT NULL,
  extension      TEXT NOT NULL,
  size           INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, hash, owner_node_id)
);

INSERT INTO attachment_next (workspace_id, hash, owner_node_id, extension, size, created_at)
SELECT workspace_id, hash, owner_node_id, extension, size, created_at FROM attachment;

DROP TABLE attachment;
ALTER TABLE attachment_next RENAME TO attachment;

CREATE INDEX attachment_by_owner ON attachment (owner_node_id);
-- 실체를 걷을 때 「이 해시를 아직 소유한 문서가 있는가」를 묻는다.
CREATE INDEX attachment_by_hash ON attachment (workspace_id, hash);
