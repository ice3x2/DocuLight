-- DR-STORAGE-002 — 사용자·그룹·ACL 메타데이터의 단일 저장소.
--
-- 본문은 여기 두지 않는다. 문서 본문의 SSOT 는 파일시스템이고(DR-STORAGE-001)
-- 이 DB 는 메타데이터만 갖는다. 두 축을 섞으면 R4 와 R20 이 같은 자리를
-- 두고 다투게 된다.

-- 노드 — 문서와 디렉토리. 경로가 아니라 ID 가 정본이다(DR-STORAGE-003).
-- 경로는 파생 캐시이므로 이동·개명이 ID 를 바꾸지 않는다.
CREATE TABLE node (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  parent_id     TEXT REFERENCES node (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('directory', 'file')),
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX node_by_parent ON node (parent_id, name);
CREATE INDEX node_by_workspace ON node (workspace_id);

-- 워크스페이스 — 표시 이름의 권위는 DB 다(R40-d).
-- 물리 디렉토리명은 해시 id 이고 .workspace.json 은 재구성용 사본이다.
CREATE TABLE workspace (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 주체 — 사용자와 그룹을 한 테이블에 둔다. ACL 이 둘을 구별하지 않고
-- 가리키므로(R14-c 허용 합집합) 참조 무결성이 한 자리에서 선다.
CREATE TABLE principal (
  id      TEXT PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('user', 'group')),
  name    TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'active', 'suspended', 'rejected'))
);

CREATE UNIQUE INDEX principal_name_per_kind ON principal (kind, name);

-- 그룹 멤버십 — 그룹은 사용자만을 멤버로 가지며 중첩되지 않는다(DR-PRINCIPAL-002).
CREATE TABLE group_member (
  group_id  TEXT NOT NULL REFERENCES principal (id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES principal (id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- ACL — 상속과 가산으로만 넓히고 거부 규칙을 두지 않는다(CON-ACL-002).
-- 그래서 deny 칸이 없다. 만료일도 두지 않는다(CON-PRINCIPAL-005).
CREATE TABLE acl_entry (
  id            TEXT PRIMARY KEY,
  node_id       TEXT NOT NULL,
  principal_id  TEXT NOT NULL REFERENCES principal (id) ON DELETE CASCADE,
  level         TEXT NOT NULL CHECK (level IN ('view', 'edit', 'admin')),
  granted_by    TEXT REFERENCES principal (id),
  granted_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX acl_entry_unique ON acl_entry (node_id, principal_id, level);
CREATE INDEX acl_entry_by_principal ON acl_entry (principal_id);
