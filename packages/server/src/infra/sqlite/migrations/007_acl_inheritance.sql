-- SEC-ACL-003 — 노드마다 상속 플래그를 두고 기본값은 상속 유지다.
--
-- 플래그를 **노드**에 두고 ACL 항목에 두지 않는 것이 채택된 D안과 기각된
-- 대안들을 가르는 자리다. 항목마다 상속 범위를 달면(Windows ACL 의 ACE
-- 상속 플래그) 「이 폴더에만 적용」을 표현할 수 있게 되고, 그것은 하위에
-- 대한 거부이므로 CON-ACL-002 가 정면으로 금지한다. 노드에 두면 그 선택지가
-- 구조적으로 표현 불가능해진다(CON-ACL-003).
--
-- 기본값 1 = 상속 유지(AC-1). 기존 행도 이 값을 받는다 — 이 마이그레이션
-- 이전에 만들어진 노드가 갑자기 조상과 끊기면 그 노드에 부여된 적 없는
-- 사용자가 전부 접근을 잃는다.
--
-- 끊기 전환은 부모의 항목을 복사하지 않는다(AC-5). 복사할 자리가 이 칸에
-- 없다는 것이 그 규칙을 스키마로 못박은 방식이다 — 복사는 `부모 권한
-- 가져오기` 라는 **별개 버튼**의 일이다(AC-6).
ALTER TABLE node ADD COLUMN inherits_acl INTEGER NOT NULL DEFAULT 1
  CHECK (inherits_acl IN (0, 1));

-- 상속 끊김 노드 감사 목록(FR-ACL-005, 뒤 wave)이 훑을 축이다. 끊긴 것이
-- 소수이므로 부분 인덱스로 둔다.
CREATE INDEX node_inheritance_broken ON node (workspace_id) WHERE inherits_acl = 0;
