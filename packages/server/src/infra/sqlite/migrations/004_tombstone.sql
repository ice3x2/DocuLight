-- REL-STORAGE-001 — 대응 파일이 사라진 노드의 tombstone.
--
-- 노드를 **지우지 않는** 것이 이 칸의 존재 이유다. 삭제는 되돌릴 수 없고,
-- 파일이 잠시 없었을 뿐인 경우에도 그 노드 앞으로 부여된 권한이 영구히
-- 사라진다. 비어 있음 = 살아 있음이므로 별도의 상태 칸을 두지 않는다.
ALTER TABLE node ADD COLUMN orphaned_at TEXT;

-- 미해소 tombstone 을 훑는 것이 재조정의 주 질의다.
CREATE INDEX node_orphaned ON node (orphaned_at) WHERE orphaned_at IS NOT NULL;
