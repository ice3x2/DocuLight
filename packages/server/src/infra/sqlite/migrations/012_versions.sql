-- 버전 인덱스 (FR-STORAGE-003 AC-4 · DR-STORAGE-005).
--
-- **이 테이블은 캐시다.** 정본은 버전 실체 옆의 사이드카이며, DB 가
-- 손상돼도 파일시스템만으로 목록과 순번을 되세울 수 있어야 한다.
--
-- `author` 가 여기 있는 이유는 G28 판정이다 — 본문 저장은 감사 로그에
-- 남지 않으므로(자동 저장의 볼륨), 이 칸이 없으면 「누가 이 버전을
-- 만들었나」의 출처가 제품 어디에도 없다.
CREATE TABLE document_version (
  node_id     TEXT NOT NULL,
  seq         INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  author      TEXT NOT NULL,
  PRIMARY KEY (node_id, seq)
);

-- 목록은 문서 단위로 순번 순, 폐기는 가장 오래된 것부터 훑는다.
CREATE INDEX version_by_node ON document_version (node_id, seq);

-- 편집 세션 (FR-STORAGE-003 AC-1 · AC-2).
--
-- **세션당 스냅샷 1회**를 지키려면 「이 세션이 이미 찍었는가」를 저장해야
-- 한다. 프로세스 메모리에 두면 재기동으로 잊혀 같은 세션이 두 번 찍는다.
CREATE TABLE edit_session (
  id           TEXT PRIMARY KEY,
  node_id      TEXT NOT NULL,
  actor_id     TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  snapshot_seq INTEGER
);

CREATE INDEX session_by_node ON edit_session (node_id);
